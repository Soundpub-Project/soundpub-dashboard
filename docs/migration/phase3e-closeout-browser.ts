import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const output = process.argv[2];
if (!output || !isAbsolute(output)) throw new Error('Absolute disposable evidence directory required');
mkdirSync(output, { recursive: true });
const load = async (path: string) => import(pathToFileURL(join(root, path)).href);
const require = createRequire(join(root, 'package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const { chromium } = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON ??
  'C:/Users/bimok/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/package.json')('playwright');
const { concurrencyPostgres } = await load('backend/test/support/concurrency-postgres.ts');
const { buildApp } = await load('backend/src/api/index.ts');
const { createRepositories } = await load('backend/src/db/index.ts');
const { createBalanceService } = await load('backend/src/finance/service.ts');
const { createPgPayoutFinance } = await load('backend/src/payouts/finance.ts');
const { databasePayoutPolicy } = await load('backend/src/payouts/policy.ts');
const { createPayoutsService } = await load('backend/src/payouts/index.ts');
const { createRoyaltiesService } = await load('backend/src/royalties/index.ts');
const { createPaymentsService, paymentSubmissionDependency } = await load('backend/src/payments/index.ts');
const { createSubmissionService } = await load('backend/src/submissions/index.ts');
const persisted: unknown[] = [];
const secret = 'synthetic-browser-callback-secret-32-characters';
const { webhookSignature } = await load('backend/src/integrations/webhook.ts');
const { postEvent, getBalance } = await load('backend/src/finance/index.ts');
const events: { viewport: string; check: string; result: string; detail?: string }[] = [];
const network: { viewport: string; method: string; path: string; status: number }[] = [];
const unexpected: string[] = [];
const blockedPresentation: string[] = [];
const financialEgress: string[] = [];
const ids = { label: randomUUID(), artist: randomUUID(), admin: randomUUID(), release: randomUUID(), track: randomUUID() };
let database: Awaited<ReturnType<typeof concurrencyPostgres>> | undefined;
let app: ReturnType<typeof buildApp> | undefined;
let frontend: Awaited<ReturnType<typeof createServer>> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const saved = { ...process.env };
try {
  const docker = (...args: string[]) => execFileSync('docker', ['--context', 'desktop-linux', ...args], { encoding: 'utf8' }).trim();
  assert.match(JSON.parse(docker('context', 'inspect', 'desktop-linux'))[0].Endpoints.docker.Host, /^npipe:\/\//);
  database = await concurrencyPostgres();
  for (const [role, id] of Object.entries(ids).filter(([role]) => role !== 'release' && role !== 'track')) {
    await database.owner.query("INSERT INTO soundpub.backend_users(id,status,email_verified_at) VALUES($1,'active',now())", [id]);
    await database.owner.query('INSERT INTO soundpub.profiles(id,full_name,parent_label_id) VALUES($1,$2,$3)',
      [id, role, role === 'artist' ? ids.label : null]);
    await database.owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,$2,now())',
      [id, role === 'admin' ? 'superadmin' : role]);
    await database.owner.query("INSERT INTO soundpub.external_identities(application_user_id,provider,issuer,subject,verified_at) VALUES($1,'mock','qa-local',$2,now())", [id,id]);
  }
  await database.owner.query("INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at) VALUES($1,$2,'Artist',now())", [ids.label,ids.artist]);
  await database.owner.query("INSERT INTO soundpub.releases(id,label_id,artist_user_id,title,artist_name,genre,release_date) VALUES($1,$2,$3,'Synthetic','Artist','Pop','2026-11-01')", [ids.release,ids.label,ids.artist]);
  await database.owner.query("INSERT INTO soundpub.tracks(id,release_id,title,artist_name,position) VALUES($1,$2,'Track','Artist',1)", [ids.track,ids.release]);
  for (const name of Object.keys(process.env)) if (name.startsWith('VITE_')) delete process.env[name];
  Object.assign(process.env, { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'synthetic-public',
    VITE_SOUNDPUB_BACKEND_DOMAINS: 'users,artists,labels,releases,storage,notifications,audit,settings,royalties,payouts,payments' });
  frontend = await createServer({ root, envDir: false, server: { host: '127.0.0.1', port: 0 } });
  await frontend.listen(); const origin = frontend.resolvedUrls!.local[0]!.replace(/\/$/, ''); await frontend.close();
  const dependencies: Record<string, unknown> = {};
  for (const [name, folder, factory] of [['users','users','createUsersService'],['artists','artists','createArtistsService'],
    ['labels','labels','createLabelsService'],['releases','releases','createReleasesService'],['tracks','tracks','createTracksService'],
    ['auditSettings','audit-settings','createAuditSettingsService'],['notifications','notifications','createNotificationsService']] as const) {
    dependencies[name] = (await load(`backend/src/${folder}/index.ts`))[factory](database.runtime);
  }
  const payments = createPaymentsService(database.runtime, { callbackSecret: secret });
  const payouts = createPayoutsService(database.runtime, createPgPayoutFinance(databasePayoutPolicy));
  const admin = { id: ids.admin, roles: ['superadmin'], status: 'active' };
  const label = { id: ids.label, roles: ['label'], status: 'active' };
  const settings = dependencies.auditSettings as any;
  const initial = await settings.adminSettings(admin);
  await settings.updateAdminSettings(admin, { version: initial.version,
    settings: { min_payout_amount: '100.00', release_price_per_track: '50000.00' } }, 'browser-settings');
  const submissions = createSubmissionService(database.runtime, { payment: paymentSubmissionDependency });
  const principals = createRepositories(database.runtime).principals;
  app = buildApp({ ...dependencies, balance: createBalanceService(database.runtime), royalties: createRoyaltiesService(database.runtime),
    payouts, payments,
    submissions,
    auth: { authenticate: (token: string) => principals.findByIdentity({ issuer: 'qa-local', subject: token }) },
    readiness: { check: async () => true }, admin: { suspendUser: async () => undefined },
    webhooks: { receive: async () => false }, rateLimiter: { consume: async () => ({ allowed: true }) } });
  await app.listen({ host: '127.0.0.1', port: 0 });
  frontend = await createServer({ root, envDir: false, server: { host: '127.0.0.1', port: Number(new URL(origin).port), strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${(app.server.address() as { port: number }).port}`,
      headers: { origin: 'http://127.0.0.1:8181' } } } } });
  await frontend.listen();
  browser = await chromium.launch({ headless: true });
  for (const [viewport, size] of Object.entries({ mobile: { width: 390, height: 844 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1440, height: 900 } })) {
    const context = await browser.newContext({ viewport: size, serviceWorkers: 'block' });
    context.setDefaultTimeout(14000);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        const request = `${viewport}:${url.href}`;
        if (url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2') blockedPresentation.push(request);
        else unexpected.push(request);
        if (/\/rest\/v1\/|\/functions\/v1\//.test(url.pathname)) financialEgress.push(request);
        return route.abort();
      }
      return route.continue();
    });
    await context.addInitScript((id: string) => { const actor = sessionStorage.getItem('qa-role') || id;
      localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: actor, refresh_token: 'synthetic', token_type: 'bearer',
        expires_at: Math.floor(Date.now()/1000)+3600, user: { id: actor, aud: 'authenticated', email: 'qa@example.invalid', app_metadata: {}, user_metadata: {} } }));
    }, ids.label);
    const page = await context.newPage();
    page.on('response', response => { if (response.url().includes('/api/v1/')) network.push({ viewport, method: response.request().method(),
      path: new URL(response.url()).pathname, status: response.status() }); });
    const check = async (name: string, task: () => Promise<void>) => { try { await task(); events.push({ viewport, check: name, result: 'PASS' }); }
      catch (error) { events.push({ viewport, check: name, result: 'FAIL', detail: String(error) }); } };
    const release = await (dependencies.releases as any).createAggregate(label, {
      artist_user_id: ids.artist, title: 'Browser ' + viewport, artist_name: 'Artist', release_type: 'single',
      genre: 'Pop', release_date: '2026-11-01', tracks: [{ title: 'Track', artist_name: 'Artist' }]
    }, 'browser-release-' + viewport);
    const seed = await database.owner.connect();
    try {
      await seed.query('BEGIN');
      await postEvent(seed, { ownerId: ids.label, kind: 'ROYALTY_EARNING', amount: '1000.00',
        businessReference: 'browser-earning-' + viewport, idempotencyKey: 'browser-earning-' + viewport,
        systemActor: 'browser-synthetic-fixture' });
      await seed.query('COMMIT');
    } catch (error) { await seed.query('ROLLBACK'); throw error; }
    finally { seed.release(); }
    const snapshot = async (phase: string) => {
      const rows: Record<string, unknown[]> = {};
      for (const table of ['finance_events','finance_audit','payout_requests','payout_allocations','payout_operations',
        'payment_invoices','payment_mock_invoices','payment_effects','payment_callback_receipts','payment_refunds','audit_logs']) {
        rows[table] = (await database!.owner.query('SELECT * FROM soundpub.' + table)).rows;
      }
      const client = await database!.owner.connect();
      try { persisted.push({ viewport, phase, balance: await getBalance(client, ids.label), rows }); }
      finally { client.release(); }
    };
    await check('payout request, reservation, approval, settlement and reload', async () => {
      const before = await (app as any).inject({ method: 'GET', url: '/api/v1/payouts/eligibility',
        headers: { authorization: 'Bearer ' + ids.label } });
      assert.equal(before.statusCode, 200);
      await page.goto(origin + '/dashboard/payouts');
      await page.getByText('Memenuhi syarat', { exact: true }).waitFor();
      await page.getByLabel('Jumlah IDR (contoh 100000.00)').fill('800.00');
      await page.getByLabel('Bank', { exact: true }).fill('Synthetic');
      await page.getByLabel('Nomor rekening').fill('12345678');
      await page.getByLabel('Nama pemilik rekening').fill('Label');
      const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/payouts');
      await page.getByRole('button', { name: 'Ajukan pencairan' }).click();
      const created = await response;
      assert.equal(created.status(), 200);
      const payout = await created.json();
      await page.getByRole('cell', { name: 'pending', exact: true }).waitFor();
      const expectedAvailable = String((['mobile', 'tablet', 'desktop'].indexOf(viewport) + 1) * 200) + '.00';
      await page.getByText('Saldo tersedia: IDR ' + expectedAvailable, { exact: true }).waitFor();
      await snapshot('reserved');
      const client = await database!.owner.connect();
      try { assert.equal((await getBalance(client, ids.label)).reserved, '800.00'); }
      finally { client.release(); }
      await page.screenshot({ path: join(output, viewport + '-payout-reserved.png'), fullPage: true });
      await page.evaluate(id => sessionStorage.setItem('qa-role', id), ids.admin);
      await page.goto(origin + '/dashboard/admin-payouts');
      await page.getByRole('row').filter({ hasText: payout.id }).getByRole('button', { name: 'Setujui' }).click();
      await page.getByRole('row').filter({ hasText: payout.id }).getByRole('cell', { name: 'approved', exact: true }).waitFor();
      await payouts.settleMock(admin, payout.id, 'mock-browser-settlement-' + viewport, 'settle-' + viewport);
      await payouts.settleMock(admin, payout.id, 'mock-browser-settlement-' + viewport, 'settle-' + viewport);
      await page.evaluate(id => sessionStorage.setItem('qa-role', id), ids.label);
      await page.goto(origin + '/dashboard/payouts');
      await page.reload();
      await page.getByRole('row').filter({ hasText: payout.id }).getByRole('cell', { name: 'paid', exact: true }).waitFor();
      const finalClient = await database!.owner.connect();
      try {
        const balance = await getBalance(finalClient, ids.label);
        assert.equal(balance.reserved, '0.00');
        assert.equal(balance.available, expectedAvailable);
        assert.equal((await finalClient.query("SELECT count(*) FROM soundpub.finance_events WHERE kind='PAYOUT_SETTLEMENT' AND business_reference=$1", [payout.id])).rows[0].count, '1');
        const operations = (await finalClient.query('SELECT key FROM soundpub.payout_operations WHERE payout_id=$1', [payout.id])).rows;
        assert.equal(operations.length, 3);
        const audits = (await finalClient.query("SELECT action,metadata,actor_user_id FROM soundpub.audit_logs WHERE resource_type='payout' AND resource_id=$1 ORDER BY created_at", [payout.id])).rows;
        assert.deepEqual(audits.map(row => row.action), ['payout.pending', 'payout.approved', 'payout.paid']);
        for (const audit of audits) {
          assert.equal(audit.metadata.amount, '800.00');
          assert.equal(audit.metadata.currency, 'IDR');
          assert.ok(operations.some(operation => operation.key === audit.metadata.idempotency_key));
          assert.equal(audit.actor_user_id, audit.action === 'payout.pending' ? ids.label : ids.admin);
        }
      } finally { finalClient.release(); }
      await snapshot('settled');
      await page.screenshot({ path: join(output, viewport + '-payout-paid-reloaded.png'), fullPage: true });
    });
    await check('invoice creation, signed callback, readiness and reload', async () => {
      await page.evaluate(id => sessionStorage.setItem('qa-role', id), ids.admin);
      await page.goto(origin + '/dashboard/invoices?release_id=' + release.release.id);
      await page.getByRole('button', { name: 'Buat invoice mock' }).click();
      await page.getByText('PENDING', { exact: true }).waitFor();
      await page.screenshot({ path: join(output, viewport + '-invoice-pending.png'), fullPage: true });
      const invoice = (await database!.owner.query('SELECT * FROM soundpub.payment_invoices WHERE business_id=$1', [release.release.id])).rows[0];
      assert.equal(invoice.amount_minor, '5000000');
      const before = await submissions.readiness(label, release.release.id);
      assert.ok(before.blockers.some(blocker => blocker.code === 'PAYMENT_REQUIRED'));
      const callback = { provider: 'mock-payment', eventId: 'browser-paid-' + viewport,
        timestamp: String(Math.floor(Date.now()/1000)), signature: '',
        rawBody: Buffer.from(JSON.stringify({ provider_invoice_id: invoice.provider_invoice_id, status: 'PAID',
          amount_minor: invoice.amount_minor, currency: invoice.currency })) };
      callback.signature = webhookSignature(secret, callback);
      await assert.rejects(payments.callback({ ...callback, signature: '0'.repeat(64) }));
      assert.equal(await payments.callback(callback), 'accepted');
      assert.equal(await payments.callback(callback), 'duplicate');
      await page.getByRole('button', { name: 'Periksa status' }).click();
      await page.getByText('PAID', { exact: true }).waitFor();
      await page.reload();
      await page.getByText('PAID', { exact: true }).waitFor();
      await page.getByText('Terverifikasi', { exact: true }).waitFor();
      const after = await submissions.readiness(label, release.release.id);
      assert.ok(!after.blockers.some(blocker => blocker.code === 'PAYMENT_REQUIRED'));
      assert.equal((await database!.owner.query('SELECT status FROM soundpub.releases WHERE id=$1', [release.release.id])).rows[0].status, 'draft');
      await snapshot('paid');
      await page.screenshot({ path: join(output, viewport + '-invoice-paid-reloaded.png'), fullPage: true });
    });
    await check('admin API refund, single reversal and browser reload', async () => {
      const invoice = (await database!.owner.query('SELECT * FROM soundpub.payment_invoices WHERE business_id=$1', [release.release.id])).rows[0];
      const input = { invoice_id: invoice.id, idempotency_key: 'refund-' + viewport, reason: 'Synthetic browser acceptance' };
      const response = await app!.inject({ method: 'POST', url: '/api/v1/admin/payments/refunds',
        headers: { authorization: 'Bearer ' + ids.admin }, payload: input });
      assert.equal(response.statusCode, 200, response.body);
      const replay = await app!.inject({ method: 'POST', url: '/api/v1/admin/payments/refunds',
        headers: { authorization: 'Bearer ' + ids.admin }, payload: input });
      assert.equal(replay.statusCode, 200, replay.body);
      await page.reload();
      await page.getByText('REFUNDED', { exact: true }).waitFor();
      await page.getByText('Terverifikasi', { exact: true }).waitFor();
      const effects = (await database!.owner.query('SELECT kind,amount_minor FROM soundpub.payment_effects WHERE invoice_id=$1 ORDER BY kind', [invoice.id])).rows;
      assert.deepEqual(effects, [{ kind: 'PAYMENT_CHARGE', amount_minor: '5000000' }, { kind: 'PAYMENT_REFUND', amount_minor: '5000000' }]);
      const audits = (await database!.owner.query("SELECT action,metadata,actor_user_id FROM soundpub.audit_logs WHERE resource_type='payment_invoice' AND resource_id=$1 ORDER BY created_at", [invoice.id])).rows;
      assert.deepEqual(audits.map(row => row.action).sort(), ['payment.callback', 'payment.invoice_created', 'payment.refund']);
      for (const audit of audits) {
        assert.equal(audit.metadata.amount_minor, '5000000');
        assert.equal(audit.metadata.currency, 'IDR');
        assert.ok(audit.metadata.idempotency_reference);
        assert.equal(audit.actor_user_id, audit.action === 'payment.callback' ? null : ids.admin);
      }
      assert.equal(invoice.idempotency_key, 'release-invoice:' + release.release.id);
      assert.equal((await database!.owner.query('SELECT count(*) FROM soundpub.payment_callback_receipts WHERE event_id=$1', ['browser-paid-' + viewport])).rows[0].count, '1');
      assert.equal((await database!.owner.query('SELECT count(*) FROM soundpub.payment_refunds WHERE invoice_id=$1 AND idempotency_key=$2', [invoice.id, input.idempotency_key])).rows[0].count, '1');
      assert.ok((await submissions.readiness(label, release.release.id)).blockers.some(blocker => blocker.code === 'PAYMENT_REQUIRED'));
      const integrity = await database!.owner.query('SELECT e.id FROM soundpub.finance_events e LEFT JOIN soundpub.finance_audit a ON a.event_id=e.id LEFT JOIN soundpub.outbox_events o ON o.id=a.outbox_id WHERE a.event_id IS NULL OR o.id IS NULL');
      assert.equal(integrity.rowCount, 0);
      await snapshot('refunded');
      await page.screenshot({ path: join(output, viewport + '-invoice-refunded-reloaded.png'), fullPage: true });
    });
    await context.close();
  }
} catch (error) { events.push({ viewport: 'setup', check: 'browser fixture', result: 'FAIL', detail: String(error) }); }
finally {
  await browser?.close(); await frontend?.close(); await app?.close(); await database?.close();
  for (const name of Object.keys(process.env)) if (name.startsWith('VITE_')) delete process.env[name];
  Object.assign(process.env, saved);
  writeFileSync(join(output, 'results.json'), JSON.stringify({ events, network, unexpected, blockedPresentation, financialEgress, persisted }, null, 2));
  console.log(JSON.stringify({ events, unexpected, blockedPresentationCount: blockedPresentation.length, financialEgress }, null, 2));
  if (events.length !== 9 || events.some(item => item.result === 'FAIL') || unexpected.length || financialEgress.length) process.exitCode = 1;
}
