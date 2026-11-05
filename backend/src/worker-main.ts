import { writeFile } from 'node:fs/promises';
import { loadConfig } from './config/index.js';
import { createPool } from './db/index.js';
import { createMockProviders } from './integrations/index.js';
import { pollOutbox, type OutboxHandler } from './worker/index.js';
import { assertOutboxHandlers } from './worker/topics.js';
import { createLogger, Metrics, poolMetrics, sampleQueue } from './observability/index.js';
import { createRoyaltyImportObjectStore } from './royalties/store.js';
import { createRoyaltyImportCleanupProcessor, createRoyaltyImportJobProcessor } from './royalties/jobs.js';
import { runFinanceReconciliation } from './reconciliation/index.js';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const metrics = new Metrics();
let nextMetricsAt = 0;
const pool = createPool({ connectionString: config.DATABASE_URL });
const reconciliationPool = createPool({ connectionString: config.AUDIT_DATABASE_URL, max: 2 });
const migrated = await pool.query("SELECT to_regclass('soundpub.schema_migrations') AS name");
if (!migrated.rows[0]?.name) throw new Error('Database migration required before worker boot');
pool.on('error', () => { console.error(JSON.stringify({ level: 'error', message: 'database idle connection failed' })); });
reconciliationPool.on('error', () => { console.error(JSON.stringify({ level: 'error', message: 'reconciliation database idle connection failed' })); });
const royaltyImportStore = await createRoyaltyImportObjectStore(pool, {
  environment: config.NODE_ENV === 'test' ? 'test' : 'development',
  endpoint: `${config.OBJECT_STORAGE_USE_SSL ? 'https' : 'http'}://${config.OBJECT_STORAGE_ENDPOINT}:${config.OBJECT_STORAGE_PORT}`,
  publicEndpoint: config.OBJECT_STORAGE_PUBLIC_ENDPOINT,
  credentials: { accessKeyId: config.OBJECT_STORAGE_ACCESS_KEY, secretAccessKey: config.OBJECT_STORAGE_SECRET_KEY },
  bucket: config.OBJECT_STORAGE_BUCKET,
});
const royaltyJobs = createRoyaltyImportJobProcessor(pool, royaltyImportStore);
const royaltyCleanup = createRoyaltyImportCleanupProcessor(pool, royaltyImportStore);
const providers = createMockProviders();
const handlers: Record<string, OutboxHandler> = {
  'notification.requested': async event => { await providers.email.execute({ idempotencyKey: event.idempotency_key, operation: 'send-notification', payload: event.payload }); },
  'audit.notification': async event => { await providers.email.execute({ idempotencyKey: event.idempotency_key, operation: 'send-audit-notification', payload: event.payload }); },
  'webhook.received': async event => { await providers.analytics.execute({ idempotencyKey: event.idempotency_key, operation: 'record-webhook', payload: event.payload }); },
  'finance.event': async event => { await providers.analytics.execute({ idempotencyKey: event.idempotency_key, operation: 'record-finance-event', payload: event.payload }); },
  'royalty.changed': async event => { await providers.analytics.execute({ idempotencyKey: event.idempotency_key, operation: 'record-royalty-change', payload: event.payload }); },
  'payout.changed': async event => { await providers.analytics.execute({ idempotencyKey: event.idempotency_key, operation: 'record-payout-change', payload: event.payload }); },
  'payout.readiness': async event => { await providers.analytics.execute({ idempotencyKey: event.idempotency_key, operation: 'record-payout-readiness', payload: event.payload }); },
  'finance.reconciliation': async event => { await providers.analytics.execute({ idempotencyKey: event.idempotency_key, operation: 'record-finance-reconciliation', payload: event.payload }); },
};
assertOutboxHandlers(handlers);
let stopping = false;
let nextFinanceReconciliationAt = 0;
await pool.query('SELECT 1');
await writeFile('/tmp/worker-ready', new Date().toISOString(), 'utf8');
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
while (!stopping) {
  const started = performance.now();
  try {
    const royaltyOutcome = await royaltyJobs.poll();
    metrics.increment(`royalty.${royaltyOutcome}`);
    const cleanupOutcome = royaltyOutcome === 'idle' ? await royaltyCleanup.poll() : 'idle';
    metrics.increment(`royaltyCleanup.${cleanupOutcome}`);
    const outcome = royaltyOutcome === 'idle' && cleanupOutcome === 'idle' ? await pollOutbox(pool, handlers) : 'idle';
    metrics.increment(`poll.${outcome}`);
    if (Date.now() >= nextFinanceReconciliationAt) {
      nextFinanceReconciliationAt = Date.now() + config.FINANCE_RECONCILIATION_INTERVAL_MS;
      const reconciliation = await runFinanceReconciliation(reconciliationPool, { runner: 'worker',
        issueLimit: config.FINANCE_RECONCILIATION_ISSUE_LIMIT,
        minimumIntervalMs: config.FINANCE_RECONCILIATION_INTERVAL_MS,
        timeoutMs: config.FINANCE_RECONCILIATION_TIMEOUT_MS });
      metrics.increment(`financeReconciliation.${reconciliation.outcome}`);
      if (reconciliation.outcome === 'recorded' && reconciliation.changed && reconciliation.run.status === 'FAIL') {
        logger.warn({ runId: reconciliation.run.id, issueCount: reconciliation.run.issue_count,
          snapshotChecksum: reconciliation.run.snapshot_checksum }, 'finance reconciliation failed');
      }
    }
    await writeFile('/tmp/worker-ready', new Date().toISOString(), 'utf8');
    if (outcome !== 'idle') console.log(JSON.stringify({ level: 'info', message: 'worker delivery', outcome }));
  } catch { metrics.increment('poll.error'); logger.error('worker poll failed'); }
  metrics.observe('pollMs', performance.now() - started);
  if (Date.now() >= nextMetricsAt) {
    nextMetricsAt = Date.now() + 30_000;
    try {
      logger.info({ metrics: metrics.snapshot(), dbPool: poolMetrics(pool), queue: await sampleQueue(pool) }, 'worker metrics');
    } catch { metrics.increment('metrics.error'); logger.warn('queue metrics unavailable'); }
  }
  await new Promise(resolve => setTimeout(resolve, config.WORKER_POLL_MS));
}
royaltyImportStore.close();
await Promise.all([pool.end(), reconciliationPool.end()]);


