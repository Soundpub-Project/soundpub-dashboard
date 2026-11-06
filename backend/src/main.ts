import { createHash, randomUUID } from 'node:crypto';
import { buildApp, ApiError } from './api/index.js';
import { instrumentApi } from './observability/index.js';
import { loadConfig } from './config/index.js';
import { createPool, createRepositories, withTransaction } from './db/index.js';
import { createBalanceService } from './finance/service.js';
import { createPgPayoutFinance } from './payouts/finance.js';
import { createPayoutsService } from './payouts/index.js';
import { databasePayoutPolicy } from './payouts/policy.js';
import { createRoyaltiesService } from './royalties/index.js';
import { createRoyaltyImportObjectStore } from './royalties/store.js';
import { createPaymentsService, paymentSubmissionDependency } from './payments/index.js';
import { createUsersService } from './users/index.js';
import { createArtistsService } from './artists/index.js';
import { createLabelsService } from './labels/index.js';
import { createLabelCustomService } from './label-custom/index.js';
import { createReleasesService } from './releases/index.js';
import { createTakedownsService } from './takedowns/index.js';
import { createTracksService } from './tracks/index.js';
import { createSubmissionService, MockSubmissionProvider } from './submissions/index.js';
import { createNotificationsService } from './notifications/index.js';
import { createMediaObjectStore, createMediaReadinessAdapter, createMediaService } from './media/index.js';
import { createAuditSettingsService } from './audit-settings/index.js';
import { createPublicCatalogService } from './public-catalog/index.js';
import { createConfiguredIdentityProvider, createIdentityAuthenticator } from './auth/providers.js';
import { createLocalAuthService } from './local-auth/index.js';
import { createFinanceReconciliationService } from './reconciliation/index.js';
import { createComposerRoyaltiesService } from './composer-royalties/index.js';
import { createCopyrightRegistrationsService } from './copyright-registrations/index.js';
import { createSharedRateLimiter } from './api/rate-limiter.js';

const config = loadConfig();
const identityProvider = createConfiguredIdentityProvider(process.env);
const pool = createPool({ connectionString: config.DATABASE_URL });
const reconciliationPool = createPool({ connectionString: config.RECONCILIATION_DATABASE_URL });
const migrated = await pool.query("SELECT to_regclass('soundpub.schema_migrations') AS name");
if (!migrated.rows[0]?.name) throw new Error('Database migration required before API boot');
const releaseMigration = await pool.query(`SELECT to_regclass('soundpub.releases') AS releases,
  to_regclass('soundpub.tracks') AS tracks, to_regclass('soundpub.media_objects') AS media,
  to_regclass('soundpub.notifications') AS notifications,
  to_regclass('soundpub.application_settings') AS settings,
  to_regclass('soundpub.finance_events') AS finance,
  to_regclass('soundpub.royalty_import_batches') AS royalties,
  to_regclass('soundpub.royalty_import_sessions') AS royalty_files,
  to_regclass('soundpub.payout_requests') AS payouts,
  to_regclass('soundpub.payment_invoices') AS payments,
  to_regclass('soundpub.copyright_registrations') AS copyright_registrations`);
if (Object.values(releaseMigration.rows[0] ?? {}).some(value => !value)) throw new Error('Phase 3E database migration required before API boot');
const repositories = createRepositories(pool);
const users = createUsersService(pool);
const localAuth = createLocalAuthService(pool, { deliverySecret: config.AUTH_DELIVERY_SECRET });
const artists = createArtistsService(pool);
const labels = createLabelsService(pool);
const labelCustom = createLabelCustomService(pool);
const releases = createReleasesService(pool);
const takedowns = createTakedownsService(pool);
const tracks = createTracksService(pool);
const payments = createPaymentsService(pool, { callbackSecret: config.WEBHOOK_MOCK_SECRET });
const payouts = createPayoutsService(pool, createPgPayoutFinance(databasePayoutPolicy));
const mediaStore = await createMediaObjectStore(pool, {
  environment: config.NODE_ENV === 'test' ? 'test' : 'development',
  endpoint: `${config.OBJECT_STORAGE_USE_SSL ? 'https' : 'http'}://${config.OBJECT_STORAGE_ENDPOINT}:${config.OBJECT_STORAGE_PORT}`,
  publicEndpoint: config.OBJECT_STORAGE_PUBLIC_ENDPOINT,
  credentials: { accessKeyId: config.OBJECT_STORAGE_ACCESS_KEY, secretAccessKey: config.OBJECT_STORAGE_SECRET_KEY },
  bucket: config.OBJECT_STORAGE_BUCKET,
  allowedOrigins: config.OBJECT_STORAGE_BROWSER_ORIGINS,
});
const media = createMediaService(pool, mediaStore);
const auditSettings = createAuditSettingsService(pool);
const royaltyImportStore = await createRoyaltyImportObjectStore(pool, {
  environment: config.NODE_ENV === 'test' ? 'test' : 'development',
  endpoint: `${config.OBJECT_STORAGE_USE_SSL ? 'https' : 'http'}://${config.OBJECT_STORAGE_ENDPOINT}:${config.OBJECT_STORAGE_PORT}`,
  publicEndpoint: config.OBJECT_STORAGE_PUBLIC_ENDPOINT,
  credentials: { accessKeyId: config.OBJECT_STORAGE_ACCESS_KEY, secretAccessKey: config.OBJECT_STORAGE_SECRET_KEY },
  bucket: config.OBJECT_STORAGE_BUCKET,
});
pool.on('error', () => { console.error(JSON.stringify({ level: 'error', message: 'database idle connection failed' })); });

const app = buildApp({
  publicCatalog: createPublicCatalogService(pool),
  localAuth,
  users, artists, labels, labelCustom, releases, tracks, takedowns,
  balance: createBalanceService(pool), royalties: createRoyaltiesService(pool, royaltyImportStore, reconciliationPool), payouts, payments,
  financeReconciliation: createFinanceReconciliationService(pool),
  composerRoyalties: createComposerRoyaltiesService(pool),
  copyrightRegistrations: createCopyrightRegistrationsService(pool, {
    environment: config.NODE_ENV, callbackSecret: config.WEBHOOK_MOCK_SECRET,
  }),
  submissions: createSubmissionService(pool, { media: createMediaReadinessAdapter(), payment: paymentSubmissionDependency, provider: new MockSubmissionProvider() }),
  notifications: createNotificationsService(pool),
  media,
  auditSettings,
  maintenance: { isEnabled: () => auditSettings.isMaintenanceEnabled() },
  auth: createIdentityAuthenticator(identityProvider, repositories.principals),
  readiness: { async check() { await pool.query('SELECT 1'); return (await mediaStore.isReady()) && (await royaltyImportStore.isReady()); } },
  rateLimiter: createSharedRateLimiter(pool),
  admin: {
    async suspendUser({ userId, reason, actor, requestId }) {
      await users.setStatus(actor, userId, { status: 'suspended' }, requestId, reason);
    },
  },
  asyncActions: {
    async enqueue(actor, idempotencyKey) {
      return withTransaction(pool, async db => {
        const scope = `notification:${actor.id}`;
        const key = idempotencyKey;
        const repository = createRepositories(db);
        const requestHash = createHash('sha256').update(`notification.requested:${actor.id}`).digest('hex');
        const claim = await repository.idempotency.begin({ scope, key, requestHash, expiresAt: new Date(Date.now() + 86_400_000) });
        if (claim.state === 'completed') return (claim.responseBody as { eventId: string }).eventId;
        if (claim.state !== 'new') throw new ApiError(409, 'CONFLICT');
        const id = await repository.outbox.enqueue({ topic: 'notification.requested', payload: { actorId: actor.id }, idempotencyKey: `${scope}:${key}:${randomUUID()}` });
        if (!id) throw new ApiError(409, 'CONFLICT');
        if (!await repository.idempotency.complete({ scope, key, responseStatus: 200, responseBody: { eventId: id } })) {
          throw new ApiError(409, 'CONFLICT');
        }
        return id;
      });
    },
  },
  webhooks: {
    async receive({ body, signature }) {
      const parsed = /^t=(\d{1,12}),id=([A-Za-z0-9_:-]{1,200}),v1=([a-fA-F0-9]{64})$/.exec(signature);
      if (!parsed) return false;
      try {
        await payments.callback({ provider: 'mock-payment', timestamp: parsed[1]!, eventId: parsed[2]!, signature: parsed[3]!, rawBody: body });
        return true;
      } catch { return false; }
    },
  },
});

const shutdown = async () => { await app.close(); mediaStore.close(); royaltyImportStore.close();
  await Promise.all([pool.end(), reconciliationPool.end()]); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
instrumentApi(app, pool);
await app.listen({ host: config.HOST, port: config.PORT });
