import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const fingerprint = () => Object.fromEntries(['docs/migration/phase3e-browser.ts', 'scripts/phase3e-admission-browser.ts']
  .map(path => [path, createHash('sha256').update(readFileSync(join(root, path))).digest('hex')]));
const provenance = process.argv[3] === '--admission' ? { startedAt: new Date().toISOString(), sources: fingerprint() } : undefined;
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
const events: { viewport: string; check: string; result: string; detail?: string }[] = [];
const network: { viewport: string; method: string; path: string; status: number }[] = [];
const requests: { viewport: string; method: string; path: string }[] = [];
const unexpected: string[] = [];
const blockedPresentation: string[] = [];
const financialEgress: string[] = [];
const persisted: Record<string, string> = {};
const admission = process.argv[3] === '--admission' ? await load('scripts/phase3e-admission-browser.ts') : null;
const controls = admission?.createControls();
const admissionEvidence: unknown[] = [];
let expectedChecks = 69;
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
  const payments = createPaymentsService(database.runtime, { callbackSecret: 'synthetic-browser-callback-secret-32-characters',
    ...(controls ? { provider: controls.provider } : {}) });
  const principals = createRepositories(database.runtime).principals;
  app = buildApp({ ...dependencies, balance: createBalanceService(database.runtime), royalties: createRoyaltiesService(database.runtime),
    payouts: createPayoutsService(database.runtime, createPgPayoutFinance(databasePayoutPolicy)), payments,
    submissions: createSubmissionService(database.runtime, { payment: paymentSubmissionDependency }),
    auth: { authenticate: (token: string) => controls?.expired.has(token) ? Promise.resolve(null)
      : principals.findByIdentity({ issuer: 'qa-local', subject: token.replace(/^fresh:/, '') }) },
    readiness: { check: async () => true }, admin: { suspendUser: async () => undefined },
    webhooks: { async receive({ body, signature }: { body: Buffer; signature: string }) {
      if (!admission) return false;
      // Same signed-envelope adapter as backend/src/main.ts; no new product endpoint.
      const parsed = /^t=(\d{1,12}),id=([A-Za-z0-9_:-]{1,200}),v1=([a-fA-F0-9]{64})$/.exec(signature);
      if (!parsed) return false;
      try { await payments.callback({ provider: 'mock-payment', timestamp: parsed[1], eventId: parsed[2], signature: parsed[3], rawBody: body }); return true; }
      catch { return false; }
    } }, rateLimiter: { consume: async () => controls?.rateLimited
      ? { allowed: false, retryAfterSeconds: 1 } : { allowed: true } } });
  await app.listen({ host: '127.0.0.1', port: 0 });
  frontend = await createServer({ root, envDir: false, server: { host: '127.0.0.1', port: Number(new URL(origin).port), strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${(app.server.address() as { port: number }).port}`,
      headers: { origin: 'http://127.0.0.1:8181' } } } } });
  await frontend.listen();
  browser = await chromium.launch({ headless: true });
  for (const [viewport, size] of Object.entries({ mobile: { width: 390, height: 844 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1440, height: 900 } })) {
    const context = await browser.newContext({ viewport: size, serviceWorkers: 'block' });
    context.setDefaultTimeout(14000);
    if (admission) await context.routeWebSocket('**/*', socket => {
      const url = new URL(socket.url());
      url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
      if (url.origin === origin) socket.connectToServer();
      else { unexpected.push(`${viewport}:${socket.url()}`); socket.close(); }
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (/\/rest\/v1\/|\/functions\/v1\//.test(url.pathname)) {
        financialEgress.push(`${viewport}:${url.href}`);
        return route.abort();
      }
      if (url.origin !== origin) {
        const request = `${viewport}:${url.href}`;
        if (url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2') blockedPresentation.push(request);
        else unexpected.push(request);
        return route.abort();
      }
      return route.continue();
    });
    await context.addInitScript((id: string) => { const actor = sessionStorage.getItem('qa-role') || id;
      localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: actor, refresh_token: 'synthetic', token_type: 'bearer',
        expires_at: Math.floor(Date.now()/1000)+3600, user: { id: actor, aud: 'authenticated', email: 'qa@example.invalid', app_metadata: {}, user_metadata: {} } }));
    }, ids.label);
    const page = await context.newPage();
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/v1/')) requests.push({
      viewport, method: request.method(), path: new URL(request.url()).pathname }); });
    page.on('response', response => { if (response.url().includes('/api/v1/')) network.push({ viewport, method: response.request().method(),
      path: new URL(response.url()).pathname, status: response.status() }); });
    const check = async (name: string, task: () => Promise<void>) => { try { await task(); events.push({ viewport, check: name, result: 'PASS' }); }
      catch (error) { events.push({ viewport, check: name, result: 'FAIL', detail: String(error) }); } };
    await check('royalty summary and no settled balance', async () => { await page.goto(origin + '/dashboard/royalties');
      await page.getByRole('heading', { name: 'Royalti', exact: true }).waitFor();
      await page.getByText('Pendapatan belum direkonsiliasi.', { exact: false }).waitFor();
      await page.getByText('IDR 0.00', { exact: true }).first().waitFor();
      await page.screenshot({ path: join(output, `${viewport}-royalties.png`), fullPage: true }); });
    await check('payout policy fails closed', async () => { await page.goto(origin + '/dashboard/payouts');
      await page.getByRole('heading', { name: 'Pencairan' }).waitFor(); await page.getByRole('alert').filter({ hasText: 'Gagal memuat keuangan' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Ajukan pencairan' }).isDisabled(), true);
      await page.screenshot({ path: join(output, `${viewport}-payouts.png`), fullPage: true }); });
    await check('invoice cannot be created without approved price', async () => {
      await page.evaluate(id => sessionStorage.setItem('qa-role', id), ids.admin);
      await page.goto(origin + `/dashboard/invoices?release_id=${ids.release}`);
      await page.getByRole('heading', { name: 'Status pembayaran' }).waitFor();
      const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/payments/invoices');
      await page.getByRole('button', { name: 'Buat invoice mock' }).click();
      assert.equal((await response).status(), 409);
      await page.getByRole('alert').filter({ hasText: 'Pembuatan invoice belum dikonfirmasi' }).waitFor();
      await page.screenshot({ path: join(output, `${viewport}-invoices.png`), fullPage: true }); });
    await check('admin import preview and rejected unknown beneficiary', async () => {
      await page.evaluate(id => sessionStorage.setItem('qa-role', id), ids.admin);
      await page.goto(origin + '/dashboard/upload');
      await page.getByRole('heading', { name: 'Impor royalti' }).waitFor();
      await page.getByLabel('Pernyataan JSON').fill(JSON.stringify({ source: 'synthetic', period: '2026-10', currency: 'IDR',
        filename: 'test.json', rows: [{ source_row_id: 'row-1', beneficiary_id: randomUUID(), release_id: ids.release,
          track_id: ids.track, gross_amount: '100.00', deduction_amount: '0.00', net_amount: '100.00' }] }));
      await page.getByRole('button', { name: 'Validasi', exact: true }).click();
      const validation = page.getByRole('region', { name: 'Hasil validasi' });
      await validation.waitFor();
      await validation.getByText('pemetaan tidak dikenal: 1', { exact: false }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Simpan impor tervalidasi' }).isDisabled(), true);
      await page.screenshot({ path: join(output, `${viewport}-import-preview.png`), fullPage: true });
    });
    const statement = { source: 'synthetic', period: '2026-10', currency: 'IDR', filename: 'test.json',
      rows: [{ source_row_id: 'row-1', beneficiary_id: ids.artist, release_id: ids.release,
        track_id: ids.track, gross_amount: '100.00', deduction_amount: '0.00', net_amount: '100.00' }] };
    const rejectedPost = async (path: string, body: unknown, status: number, code: string, token = ids.admin) => {
      const response = await page.evaluate(async ({ path, body, token }) => {
        const result = await fetch(path, { method: 'POST', headers: {
          'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}),
          'Idempotency-Key': crypto.randomUUID(),
        }, body: JSON.stringify(body) });
        return { status: result.status, body: await result.json() };
      }, { path, body, token });
      assert.equal(response.status, status, path);
      assert.equal(response.body.error?.code, code, path);
      assert.equal(typeof response.body.error?.requestId, 'string', path);
    };
    await check('malformed JSON and numeric amount never reach import API', async () => {
      const before = requests.filter(r => r.method === 'POST' && r.path.startsWith('/api/v1/royalties/')).length;
      for (const source of ['{', JSON.stringify({ ...statement, rows: [{ ...statement.rows[0], net_amount: 100 }] })]) {
        await page.getByLabel('Pernyataan JSON').fill(source);
        await page.getByRole('button', { name: 'Validasi', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'Operasi gagal' }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Simpan impor tervalidasi' }).isDisabled(), true);
      }
      assert.equal(requests.filter(r => r.method === 'POST' && r.path.startsWith('/api/v1/royalties/')).length, before);
    });
    const invalidStatements = [
      { name: 'invalid period', body: { ...statement, period: '2026-13' }, code: 'BAD_REQUEST' },
      { name: 'unsupported composer', body: { ...statement, rows: [{ ...statement.rows[0], composer_code: 'UNKNOWN' }] }, code: 'ROYALTY_IMPORT_INVALID' },
      { name: 'unsupported share', body: { ...statement, rows: [{ ...statement.rows[0], share_percentage: '101' }] }, code: 'ROYALTY_IMPORT_INVALID' },
    ];
    for (const { name, body } of invalidStatements) {
      await check(`${name} disables import save before API`, async () => {
        const before = requests.filter(r => r.method === 'POST' && r.path.startsWith('/api/v1/royalties/')).length;
        await page.getByLabel('Pernyataan JSON').fill(JSON.stringify(body));
        await page.getByRole('button', { name: 'Validasi', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'Operasi gagal' }).waitFor();
        assert.equal(await page.getByRole('region', { name: 'Hasil validasi' }).count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Simpan impor tervalidasi' }).isDisabled(), true);
        assert.equal(requests.filter(r => r.method === 'POST' && r.path.startsWith('/api/v1/royalties/')).length, before);
      });
    }
    await check('backend rejects invalid period and unsupported composer or share commits', async () => {
      await rejectedPost('/api/v1/royalties/imports/preview', invalidStatements[0].body, 400, 'BAD_REQUEST');
      for (const { body, code } of invalidStatements) {
        await rejectedPost('/api/v1/royalties/imports/commit', body, 400, code);
      }
    });
    await check('backend amount mismatch disables save and rejects direct commit', async () => {
      const body = { ...statement, rows: [{ ...statement.rows[0], net_amount: '99.00' }] };
      await page.getByLabel('Pernyataan JSON').fill(JSON.stringify(body));
      const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/royalties/imports/preview');
      await page.getByRole('button', { name: 'Validasi', exact: true }).click();
      const preview = await response;
      assert.equal(preview.status(), 200);
      assert.deepEqual((await preview.json()).errors, [{ row: 1, code: 'AMOUNT_MISMATCH' }]);
      await page.getByRole('region', { name: 'Hasil validasi' }).getByText('Baris 1: AMOUNT_MISMATCH', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Simpan impor tervalidasi' }).isDisabled(), true);
      await rejectedPost('/api/v1/royalties/imports/commit', body, 400, 'ROYALTY_IMPORT_INVALID');
    });
    await check('duplicate import rows cannot be saved', async () => {
      await page.getByLabel('Pernyataan JSON').fill(JSON.stringify({ ...statement, rows: [statement.rows[0], statement.rows[0]] }));
      await page.getByRole('button', { name: 'Validasi', exact: true }).click();
      await page.getByRole('region', { name: 'Hasil validasi' }).getByText('duplikat: 1', { exact: false }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Simpan impor tervalidasi' }).isDisabled(), true);
    });
    await check('editing validated import invalidates stale preview', async () => {
      await page.getByLabel('Pernyataan JSON').fill(JSON.stringify(statement));
      await page.getByRole('button', { name: 'Validasi', exact: true }).click();
      await page.getByRole('region', { name: 'Hasil validasi' }).getByText('Valid: 1', { exact: false }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Simpan impor tervalidasi' }).isEnabled(), true);
      await page.getByLabel('Pernyataan JSON').fill('{');
      assert.equal(await page.getByRole('region', { name: 'Hasil validasi' }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Simpan impor tervalidasi' }).isDisabled(), true);
    });
    await check('invalid release UUID disables payment lookup', async () => {
      const before = requests.filter(r => r.path.startsWith('/api/v1/payments/')).length;
      await page.goto(origin + '/dashboard/invoices?release_id=invalid');
      await page.getByRole('alert').filter({ hasText: 'Masukkan UUID' }).waitFor();
      assert.equal(await page.getByLabel('ID release').getAttribute('aria-invalid'), 'true');
      assert.equal(await page.getByRole('button', { name: 'Periksa status' }).isDisabled(), true);
      assert.equal(await page.getByRole('button', { name: 'Buat invoice mock' }).count(), 0);
      assert.equal(requests.filter(r => r.path.startsWith('/api/v1/payments/')).length, before);
    });
    await check('forged paid URL cannot establish payment', async () => {
      await page.goto(origin + `/dashboard/invoices?release_id=${ids.release}&status=PAID&paid=true&amount=0`);
      await page.getByText('Invoice belum tersedia.', { exact: true }).waitFor();
      assert.equal(await page.getByText('PAID', { exact: true }).count(), 0);
      assert.equal(await page.getByText('Terverifikasi', { exact: true }).count(), 0);
    });
    await check('royalty network failure hides cached totals and recovers', async () => {
      const endpoint = origin + '/api/v1/royalties/summary';
      await page.goto(origin + '/dashboard/royalties');
      await page.getByText('IDR 0.00', { exact: true }).first().waitFor();
      await page.route(endpoint, route => route.abort('connectionfailed'));
      try {
        await page.getByRole('button', { name: 'Muat ulang', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'Gagal memuat royalti' }).waitFor();
        assert.equal(await page.getByText('IDR 0.00', { exact: true }).count(), 0);
        await page.screenshot({ path: join(output, `${viewport}-royalty-network-error.png`), fullPage: true });
      } finally { await page.unroute(endpoint); }
      await page.getByRole('button', { name: 'Muat ulang', exact: true }).click();
      await page.getByText('IDR 0.00', { exact: true }).first().waitFor();
      assert.equal(await page.getByRole('alert').filter({ hasText: 'Gagal memuat royalti' }).count(), 0);
    });
    await check('payout network failure disables request and recovers history', async () => {
      await page.evaluate(id => sessionStorage.setItem('qa-role', id), ids.label);
      const endpoint = origin + '/api/v1/payouts**';
      await page.route(endpoint, route => route.abort('connectionfailed'));
      try {
        await page.goto(origin + '/dashboard/payouts');
        await page.getByRole('alert').filter({ hasText: 'Gagal memuat keuangan' }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Ajukan pencairan' }).isDisabled(), true);
        assert.equal(await page.getByText('Belum ada pencairan.', { exact: true }).count(), 0);
        await page.screenshot({ path: join(output, `${viewport}-payout-network-error.png`), fullPage: true });
      } finally { await page.unroute(endpoint); }
      await page.getByRole('button', { name: 'Muat ulang', exact: true }).click();
      await page.getByText('Belum ada pencairan.', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Ajukan pencairan' }).isDisabled(), true);
    });
    await check('payment network failure hides cached status and recovers', async () => {
      await page.evaluate(id => sessionStorage.setItem('qa-role', id), ids.admin);
      const endpoint = origin + `/api/v1/payments/releases/${ids.release}`;
      await page.goto(origin + `/dashboard/invoices?release_id=${ids.release}`);
      await page.getByText('Invoice belum tersedia.', { exact: true }).waitFor();
      await page.route(endpoint, route => route.abort('connectionfailed'));
      try {
        await page.getByRole('button', { name: 'Periksa status' }).click();
        await page.getByRole('alert').filter({ hasText: 'Status pembayaran belum dapat dikonfirmasi.' }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Buat invoice mock' }).count(), 0);
        assert.equal(await page.getByText('Invoice belum tersedia.', { exact: true }).count(), 0);
        assert.equal(await page.getByText('Terverifikasi', { exact: true }).count(), 0);
        await page.screenshot({ path: join(output, `${viewport}-payment-network-error.png`), fullPage: true });
      } finally { await page.unroute(endpoint); }
      await page.getByRole('button', { name: 'Periksa status' }).click();
      await page.getByText('Invoice belum tersedia.', { exact: true }).waitFor();
    });
    await check('invoice API outage gives no success and permits status retry', async () => {
      const endpoint = origin + '/api/v1/payments/invoices';
      await page.route(endpoint, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_READY' } }) }));
      try {
        const response = page.waitForResponse(endpoint);
        await page.getByRole('button', { name: 'Buat invoice mock' }).click();
        assert.equal((await response).status(), 503);
        await page.getByRole('alert').filter({ hasText: 'Pembuatan invoice belum dikonfirmasi' }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Buat invoice mock' }).isEnabled(), true);
        assert.equal(await page.getByText('PENDING', { exact: true }).count(), 0);
      } finally { await page.unroute(endpoint); }
      await page.getByRole('button', { name: 'Periksa status' }).click();
      await page.getByText('Invoice belum tersedia.', { exact: true }).waitFor();
    });
    await check('browser HTTP rejects missing identity and label admin access', async () => {
      // Browser-origin HTTP assertions; these do not claim UI redirect or production authentication coverage.
      for (const [path, token, status] of [
        ['/api/v1/royalties/summary', '', 401], ['/api/v1/payouts', '', 401],
        [`/api/v1/payments/releases/${ids.release}`, '', 401],
        ['/api/v1/royalties/imports', ids.label, 403], ['/api/v1/admin/payouts', ids.label, 403],
        ['/api/v1/admin/payments/reconciliation', ids.label, 403],
        [`/api/v1/payments/releases/${ids.release}`, ids.label, 404],
      ] as const) {
        assert.equal(await page.evaluate(async ({ path, token }) => (await fetch(path, {
          headers: token ? { Authorization: 'Bearer ' + token } : {},
        })).status, { path, token }), status, path);
      }
    });
    await check('browser HTTP rejects unauthorized import preview and commit mutations', async () => {
      for (const path of ['/api/v1/royalties/imports/preview', '/api/v1/royalties/imports/commit']) {
        await rejectedPost(path, statement, 403, 'FORBIDDEN', ids.label);
        await rejectedPost(path, statement, 401, 'UNAUTHORIZED', '');
      }
    });
    await check('removed current admin authority rejects previously validated import', async () => {
      await page.evaluate(id => sessionStorage.setItem('qa-role', id), ids.admin);
      await page.goto(origin + '/dashboard/upload');
      await page.getByLabel('Pernyataan JSON').fill(JSON.stringify(statement));
      await page.getByRole('button', { name: 'Validasi', exact: true }).click();
      await page.getByRole('region', { name: 'Hasil validasi' }).getByText('Valid: 1', { exact: false }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Simpan impor tervalidasi' }).isEnabled(), true);
      try {
        assert.equal((await database!.owner.query("UPDATE soundpub.user_roles SET verified_at=NULL WHERE user_id=$1 AND role='superadmin'", [ids.admin])).rowCount, 1);
        const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/royalties/imports/commit');
        await page.getByRole('button', { name: 'Simpan impor tervalidasi' }).click();
        const rejected = await response;
        assert.equal(rejected.status(), 403);
        assert.equal((await rejected.json()).error.code, 'FORBIDDEN');
        await page.getByRole('alert').filter({ hasText: 'Operasi gagal' }).waitFor();
        assert.equal(await page.getByRole('status').filter({ hasText: 'Batch ' }).count(), 0);
        await page.screenshot({ path: join(output, `${viewport}-import-stale-authority.png`), fullPage: true });
      } finally {
        await database!.owner.query("UPDATE soundpub.user_roles SET verified_at=now() WHERE user_id=$1 AND role='superadmin'", [ids.admin]);
      }
      await page.reload();
      await page.getByText('Belum ada impor.', { exact: true }).waitFor();
    });
    for (const status of ['inactive', 'suspended']) {
      await check(`${status} current payout user rejected after active page load`, async () => {
        await page.evaluate(id => sessionStorage.setItem('qa-role', id), ids.label);
        await page.goto(origin + '/dashboard/payouts');
        await page.getByText('Belum ada pencairan.', { exact: true }).waitFor();
        await page.getByRole('status').filter({ hasText: 'Memuat…' }).waitFor({ state: 'hidden' });
        try {
          assert.equal((await database!.owner.query('UPDATE soundpub.backend_users SET status=$2 WHERE id=$1', [ids.label, status])).rowCount, 1);
          const responses = Promise.all(['/api/v1/payouts', '/api/v1/payouts/eligibility'].map(path =>
            page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === path)));
          await page.getByRole('button', { name: 'Muat ulang', exact: true }).click();
          for (const response of await responses) {
            assert.equal(response.status(), 403);
            assert.equal((await response.json()).error.code, 'FORBIDDEN');
          }
          await page.getByRole('alert').filter({ hasText: 'Gagal memuat keuangan' }).waitFor();
          assert.equal(await page.getByRole('button', { name: 'Ajukan pencairan' }).isDisabled(), true);
          assert.equal(await page.getByText('Belum ada pencairan.', { exact: true }).count(), 0);
          await rejectedPost('/api/v1/payouts', { amount: '100.00', currency: 'IDR', bank_name: 'Synthetic',
            account_number: '12345678', account_holder_name: 'Label' }, 403, 'FORBIDDEN', ids.label);
          await page.screenshot({ path: join(output, `${viewport}-payout-${status}.png`), fullPage: true });
        } finally {
          await database!.owner.query("UPDATE soundpub.backend_users SET status='active' WHERE id=$1", [ids.label]);
        }
        await page.reload();
        await page.getByText('Belum ada pencairan.', { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Ajukan pencairan' }).isDisabled(), true);
      });
    }
    await context.close();
  }
  for (const table of ['royalty_import_batches', 'royalty_import_entries', 'royalty_import_corrections',
    'payout_requests', 'payout_allocations', 'payout_operations', 'payment_invoices', 'payment_mock_invoices',
    'payment_effects', 'payment_callback_receipts', 'payment_refunds', 'finance_events', 'finance_audit']) {
    persisted[table] = (await database.owner.query('SELECT count(*) FROM soundpub.' + table)).rows[0].count;
    assert.equal(persisted[table], '0', `${table}: negative checks must have no financial effects`);
  }
  if (admission) {
    expectedChecks += admission.CHECKS_PER_VIEWPORT * 3;
    await admission.runAdmission({ database, browser, origin, output, dependencies, payments, controls,
      events, network, requests, unexpected, blockedPresentation, financialEgress, evidence: admissionEvidence, adminId: ids.admin });
  }
} catch (error) { events.push({ viewport: 'setup', check: 'browser fixture', result: 'FAIL', detail: String(error) }); }
finally {
  await browser?.close(); await frontend?.close(); await app?.close(); await database?.close();
  for (const name of Object.keys(process.env)) if (name.startsWith('VITE_')) delete process.env[name];
  Object.assign(process.env, saved);
  const sourcesUnchanged = !provenance || JSON.stringify(provenance.sources) === JSON.stringify(fingerprint());
  writeFileSync(join(output, 'results.json'), JSON.stringify({ provenance, completedAt: new Date().toISOString(), sourcesUnchanged,
    events, network, requests, unexpected, blockedPresentation, financialEgress, persisted, admissionEvidence }, null, 2));
  console.log(JSON.stringify({ events, unexpected, blockedPresentationCount: blockedPresentation.length, financialEgress, persisted }, null, 2));
  if (!sourcesUnchanged || events.length !== expectedChecks || events.some(item => item.result === 'FAIL' || (admission && item.result === 'SKIP')) || unexpected.length || financialEgress.length) process.exitCode = 1;
}

