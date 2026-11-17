import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { buildApp } from '../src/api/index.js';
import { createAuditSettingsService } from '../src/audit-settings/index.js';
import { hashPassword } from '../src/auth/local-crypto.js';
import { ApiError } from '../src/api/types.js';
import { createLabelCustomService } from '../src/label-custom/index.js';
import { createLocalAuthService } from '../src/local-auth/index.js';
import { createMediaObjectStore, createMediaService, type MediaRow } from '../src/media/index.js';
import { createPayoutsService } from '../src/payouts/index.js';
import { createPgPayoutFinance } from '../src/payouts/finance.js';
import { databasePayoutPolicy } from '../src/payouts/policy.js';
import { createRoyaltiesService } from '../src/royalties/index.js';
import { createRoyaltyImportJobProcessor } from '../src/royalties/jobs.js';
import type { RoyaltyImportFileRow, RoyaltyImportObjectStore } from '../src/royalties/store.js';
import { createUsersService } from '../src/users/index.js';
import { concurrencyPostgres, dockerTestsEnabled, testComposeResource } from './support/concurrency-postgres.js';

const frontend = 'http://127.0.0.1:8281';
const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function freePort() {
  const server = createServer();
  await new Promise<void>((done, fail) => server.once('error', fail).listen(0, '127.0.0.1', done));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  await new Promise<void>((done, fail) => server.close(error => error ? fail(error) : done()));
  return address.port;
}

class BrowserProtocol {
  private sequence = 0;
  private pending = new Map<number, (message: any) => void>();
  readonly requests: string[] = [];
  readonly blocked: string[] = [];
  readonly errors: string[] = [];

  constructor(private socket: WebSocket, private apiOrigin: string, private uploadOrigins: readonly string[] = []) {
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.pending.has(message.id)) {
        this.pending.get(message.id)!(message);
        this.pending.delete(message.id);
      }
      if (message.method === 'Runtime.exceptionThrown')
        this.errors.push(String(message.params.exceptionDetails.text));
      if (message.method === 'Fetch.requestPaused') void this.route(message.params).catch(error => {
        this.errors.push(String(error));
      });
    });
  }

  command(method: string, params: Record<string, unknown> = {}) {
    return new Promise<any>((done, fail) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(id); fail(new Error(`Browser command timed out: ${method}`)); }, 15_000);
      this.pending.set(id, message => {
        clearTimeout(timer);
        if (message.error) fail(new Error(JSON.stringify(message.error)));
        else done(message.result);
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  private async route(paused: { requestId: string; request: { url: string } }) {
    const url = new URL(paused.request.url);
    if (this.uploadOrigins.includes(url.origin)) {
      await this.command('Fetch.continueRequest', { requestId: paused.requestId });
      return;
    }
    if (url.origin !== frontend) {
      this.blocked.push(url.origin);
      await this.command('Fetch.failRequest', { requestId: paused.requestId, errorReason: 'BlockedByClient' });
      return;
    }
    if (url.pathname.startsWith('/api/v1/')) {
      this.requests.push(url.pathname);
      await this.command('Fetch.continueRequest', {
        requestId: paused.requestId, url: `${this.apiOrigin}${url.pathname}${url.search}`,
      });
      return;
    }
    await this.command('Fetch.continueRequest', { requestId: paused.requestId });
  }

  async evaluate(expression: string) {
    const reply = await this.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (reply.exceptionDetails) throw new Error(String(reply.exceptionDetails.text));
    return reply.result.value;
  }

  async wait(expression: string, label: string) {
    const deadline = Date.now() + 20_000;
    for (;;) {
      if (await this.evaluate(expression)) return;
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
      await delay(100);
    }
  }

  async fill(selector: string, value: string) {
    assert.equal(await this.evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!(input instanceof HTMLInputElement)) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`), true, `Input missing: ${selector}`);
  }

  async select(selector: string, value: string) {
    assert.equal(await this.evaluate(`(() => {
      const select = document.querySelector(${JSON.stringify(selector)});
      if (!(select instanceof HTMLSelectElement)) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(value)});
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`), true, `Select missing: ${selector}`);
  }

  async setFileInput(selector: string, path: string) {
    const document = await this.command('DOM.getDocument', { depth: -1, pierce: true });
    const node = await this.command('DOM.querySelector', { nodeId: document.root.nodeId, selector });
    assert.ok(node.nodeId, `File input missing: ${selector}`);
    await this.command('DOM.setFileInputFiles', { files: [path], nodeId: node.nodeId });
    await this.evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)});
      if (!(input instanceof HTMLInputElement)) return false;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  }

  async click(expression: string, label: string) {
    assert.equal(await this.evaluate(`(() => { const target = ${expression}; if (!target) return false;
      target.click(); return true; })()`), true, `Button missing: ${label}`);
  }
}

test('browser E2E: Label Custom PIC artist lifecycle and payout readiness gate', {
  skip: dockerTestsEnabled && process.env.RUN_BROWSER_TESTS === '1' ? false :
    'Set RUN_DOCKER_TESTS=1 and RUN_BROWSER_TESTS=1; requires dev frontend at 127.0.0.1:8281',
  timeout: 120_000,
}, async t => {
  const response = await fetch(`${frontend}/auth`, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200, 'The dev frontend must be available at 127.0.0.1:8281');
  const database = await concurrencyPostgres();
  t.after(() => database.close());
  const picId = randomUUID();
  const email = `browser-${picId}@example.test`;
  const password = `Browser-${randomUUID()}-Only`;
  const hash = await hashPassword(password);
  await database.owner.query(`INSERT INTO soundpub.backend_users(id,email,status,email_verified_at)
    VALUES($1,$2,'active',now())`, [picId, email]);
  await database.owner.query('INSERT INTO soundpub.profiles(id,full_name,password_set) VALUES($1,$2,true)',
    [picId, 'Synthetic Browser PIC']);
  await database.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,'label_custom',now())", [picId]);
  await database.owner.query(`INSERT INTO soundpub.local_auth_credentials(user_id,login_email,password_hash)
    VALUES($1,$2,$3)`, [picId, email, hash]);

  const app = buildApp({
    localAuth: createLocalAuthService(database.runtime, { deliverySecret: 'synthetic-browser-key-32-characters' }),
    users: createUsersService(database.runtime), labelCustom: createLabelCustomService(database.runtime),
    payouts: createPayoutsService(database.runtime, createPgPayoutFinance(databasePayoutPolicy)),
    auth: { authenticate: async () => null }, readiness: { check: async () => true },
    rateLimiter: { consume: async () => ({ allowed: true }) },
    admin: { suspendUser: async () => undefined }, webhooks: { receive: async () => false },
  });
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  t.after(() => app.close());
  const apiOrigin = new URL(address).origin;
  const debugPort = await freePort();
  const dataDir = await mkdtemp(join(tmpdir(), 'soundpub-browser-'));
  let browser: ChildProcess | undefined;
  let socket: WebSocket | undefined;
  t.after(async () => {
    socket?.close();
    if (browser && browser.exitCode === null) browser.kill();
    if (!resolve(dataDir).startsWith(`${resolve(tmpdir())}${sep}`) || !basename(dataDir).startsWith('soundpub-browser-'))
      throw new Error('Unsafe browser temp directory');
    for (let attempt = 0; attempt < 10; attempt++) {
      try { await rm(dataDir, { recursive: true, force: true }); break; }
      catch (error) {
        if (attempt === 9 || !['EBUSY','EPERM','ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        await delay(250);
      }
    }
  });
  browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${dataDir}`, 'about:blank'],
  { stdio: 'ignore', windowsHide: true });
  const deadline = Date.now() + 10_000;
  let tab: { webSocketDebuggerUrl: string } | undefined;
  while (!tab) {
    try {
      const reply = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' });
      if (reply.ok) tab = await reply.json() as { webSocketDebuggerUrl: string };
    } catch {}
    if (Date.now() >= deadline) throw new Error('Chrome debugging endpoint unavailable');
    if (!tab) await delay(100);
  }
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise<void>((done, fail) => {
    socket!.addEventListener('open', () => done(), { once: true });
    socket!.addEventListener('error', () => fail(new Error('Chrome websocket unavailable')), { once: true });
  });
  const protocol = new BrowserProtocol(socket, apiOrigin);
  await protocol.command('Page.enable');
  await protocol.command('Runtime.enable');
  await protocol.command('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await protocol.command('Page.navigate', { url: `${frontend}/auth` });
  await protocol.wait("Boolean(document.querySelector('#login-email'))", 'login form');
  await protocol.fill('#login-email', email);
  await protocol.fill('#login-password', password);
  await protocol.click("document.querySelector('#login-password')?.closest('form')?.querySelector('button[type=submit]')", 'login');
  await protocol.wait("location.pathname === '/dashboard' || location.pathname === '/dashboard/my-artists'", 'login redirect');
  await protocol.command('Page.navigate', { url: `${frontend}/dashboard/my-artists` });
  await protocol.wait("Boolean(document.querySelector('h1')?.textContent?.includes('My Artists'))", 'PIC artist page');
  await protocol.wait("Boolean(document.querySelector('#label-custom-unit-name'))", 'unit setup');
  await protocol.fill('#label-custom-unit-name', 'Synthetic Browser Unit');
  await protocol.click("[...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Buat Unit')", 'create unit');
  await protocol.wait("Boolean([...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Tambah Artist'))", 'artist list');
  await protocol.click("[...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Tambah Artist')", 'open artist form');
  await protocol.wait("Boolean(document.querySelector('[role=dialog] input[name=name]'))", 'artist form');
  assert.equal(await protocol.evaluate("Boolean(document.querySelector('[role=dialog] input[type=password]'))"), false);
  await protocol.fill('[role=dialog] input[name=name]', 'Synthetic Browser Artist');
  await protocol.fill('[role=dialog] input[name=contact_email]', 'artist@example.test');
  await protocol.fill('[role=dialog] input[name=contact_phone]', '+628120000001');
  await protocol.click("[...document.querySelectorAll('[role=dialog] button')].find(button => button.textContent?.trim() === 'Tambah Artis')", 'create artist');
  await protocol.wait("Boolean(document.querySelector('[aria-label=\"Edit Synthetic Browser Artist\"]'))", 'created artist');
  await protocol.click("document.querySelector('[aria-label=\"Edit Synthetic Browser Artist\"]')", 'edit artist');
  await protocol.wait("Boolean(document.querySelector('[role=dialog] input[name=name]'))", 'edit form');
  await protocol.fill('[role=dialog] input[name=name]', 'Renamed Browser Artist');
  await protocol.click("[...document.querySelectorAll('[role=dialog] button')].find(button => button.textContent?.trim() === 'Simpan Perubahan')", 'save artist');
  await protocol.wait("Boolean(document.querySelector('[aria-label=\"Arsipkan Renamed Browser Artist\"]'))", 'updated artist');
  await protocol.click("document.querySelector('[aria-label=\"Arsipkan Renamed Browser Artist\"]')", 'archive artist');
  await protocol.wait("Boolean(document.querySelector('[role=alertdialog]'))", 'archive confirmation');
  await protocol.click("[...document.querySelectorAll('[role=alertdialog] button')].find(button => button.textContent?.trim() === 'Arsipkan')", 'confirm archive');
  await protocol.wait("Boolean(document.body.textContent.includes('Artis berhasil diarsipkan.'))", 'archived artist');
  assert.deepEqual((await database.owner.query(`SELECT name,CASE WHEN verified_at IS NOT NULL THEN 'active' ELSE 'archived' END AS status,
      artist_user_id,contact_email,contact_phone
    FROM soundpub.artists WHERE label_id=$1`, [picId])).rows, [{ name: 'Renamed Browser Artist', status: 'archived',
    artist_user_id: null, contact_email: 'artist@example.test', contact_phone: '+628120000001' }]);
  await protocol.command('Page.navigate', { url: `${frontend}/dashboard/payouts` });
  await protocol.wait("Boolean(document.querySelector('section[aria-label=\"Tujuan pencairan PIC\"]'))", 'PIC payout destination');
  await protocol.wait("Boolean(document.body.textContent?.includes('Rekonsiliasi diperlukan; pencairan diblokir.'))", 'payout reconciliation gate');
  assert.equal(await protocol.evaluate("Boolean([...document.querySelectorAll('button')].find(button => button.textContent?.includes('Ajukan pencairan'))?.disabled)"), true);
  await protocol.fill('section[aria-label="Tujuan pencairan PIC"] form label:nth-of-type(1) input', 'Synthetic Bank');
  await protocol.fill('section[aria-label="Tujuan pencairan PIC"] form label:nth-of-type(2) input', '12345678');
  await protocol.fill('section[aria-label="Tujuan pencairan PIC"] form label:nth-of-type(3) input', 'Synthetic Browser PIC');
  await protocol.click("[...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Simpan rekening untuk verifikasi')", 'save PIC destination');
  await protocol.wait("Boolean(document.body.textContent?.includes('Rekening tersimpan. Verifikasi admin independen diperlukan'))", 'unverified destination');
  assert.deepEqual((await database.owner.query(`SELECT d.owner_id,d.bank_name,d.account_number,d.account_holder_name,
      v.destination_id IS NOT NULL AS verified
    FROM soundpub.pic_payout_destinations d LEFT JOIN soundpub.pic_destination_verifications v ON v.destination_id=d.id
    WHERE d.owner_id=$1`, [picId])).rows,
  [{ owner_id: picId, bank_name: 'Synthetic Bank', account_number: '12345678',
    account_holder_name: 'Synthetic Browser PIC', verified: false }]);
  assert.equal(await protocol.evaluate("Boolean([...document.querySelectorAll('button')].find(button => button.textContent?.includes('Ajukan pencairan'))?.disabled)"), true);
  assert.equal((await database.owner.query('SELECT count(*)::int AS count FROM soundpub.backend_users')).rows[0].count, 1);
  assert.ok(protocol.requests.includes('/api/v1/auth/login'));
  assert.ok(protocol.requests.includes('/api/v1/label-custom/artists'));
  assert.ok(protocol.requests.includes('/api/v1/payouts/eligibility'));
  assert.deepEqual(protocol.blocked.filter(origin => /supabase|\/rest\/v1/.test(origin)), []);
  assert.deepEqual(protocol.errors, []);
});


test('browser E2E: catalogless CSV, independent reconciliation and PIC payout lifecycle', {
  skip: dockerTestsEnabled && process.env.RUN_BROWSER_TESTS === '1' ? false :
    'Set RUN_DOCKER_TESTS=1 and RUN_BROWSER_TESTS=1; requires dev frontend at 127.0.0.1:8281',
  timeout: 180_000,
}, async t => {
  const response = await fetch(`${frontend}/auth`, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200, 'The dev frontend must be available at 127.0.0.1:8281');
  const database = await concurrencyPostgres();
  t.after(() => database.close());
  const storageAccessKey = `browser${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const storageSecretKey = randomUUID();
  const storageResource = testComposeResource('test-rustfs', { RUSTFS_ACCESS_KEY: storageAccessKey, RUSTFS_SECRET_KEY: storageSecretKey });
  t.after(() => storageResource.close());
  const storageOrigin = `http://${storageResource.start()}`;
  const storageDeadline = Date.now() + 45_000;
  for (;;) {
    try { if ((await fetch(`${storageOrigin}/health`, { signal: AbortSignal.timeout(1000) })).ok) break; }
    catch {}
    if (Date.now() >= storageDeadline) throw new Error('Disposable browser RustFS readiness timeout');
    await delay(200);
  }  const picId = randomUUID();
  const adminId = randomUUID();
  const reviewerId = randomUUID();
  const email = `browser-import-${adminId}@example.test`;
  const password = `Browser-${randomUUID()}-Only`;
  const picEmail = `pic-${picId}@example.test`;
  const picPassword = `Browser-${randomUUID()}-Only`;
  const reviewerEmail = `reviewer-${reviewerId}@example.test`;
  const reviewerPassword = `Browser-${randomUUID()}-Only`;
  for (const [id, role, name, loginEmail, loginPassword] of [
    [picId, 'label_custom', 'Synthetic Browser PIC', picEmail, picPassword],
    [adminId, 'admin', 'Synthetic Browser Importer', email, password],
    [reviewerId, 'admin', 'Synthetic Browser Reviewer', reviewerEmail, reviewerPassword],
  ] as const) {
    await database.owner.query(`INSERT INTO soundpub.backend_users(id,email,status,email_verified_at)
      VALUES($1,$2,'active',now())`, [id, loginEmail]);
    await database.owner.query('INSERT INTO soundpub.profiles(id,full_name,password_set) VALUES($1,$2,true)', [id, name]);
    await database.owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,$2,now())', [id, role]);
    await database.owner.query('INSERT INTO soundpub.local_auth_credentials(user_id,login_email,password_hash) VALUES($1,$2,$3)',
      [id, loginEmail, await hashPassword(loginPassword)]);
  }
  const roster = createLabelCustomService(database.runtime);
  await roster.createUnit({ id: picId, roles: ['label_custom'], status: 'active' },
    { name: 'Synthetic Browser Label' }, 'browser-import-unit');
  const artist = await roster.createArtist({ id: picId, roles: ['label_custom'], status: 'active' },
    { name: 'Unit Artist', contact_email: 'unit@example.test', contact_phone: '+628120000000' }, 'browser-import-artist');
  const pic = { id: picId, roles: ['label_custom'] as const, status: 'active' as const };
  const reviewer = { id: reviewerId, roles: ['admin'] as const, status: 'active' as const };
  const payouts = createPayoutsService(database.runtime, createPgPayoutFinance(databasePayoutPolicy));
  const settings = createAuditSettingsService(database.runtime);
  const initialSettings = await settings.adminSettings(reviewer);
  await settings.updateAdminSettings(reviewer, { version: initialSettings.version, settings: { min_payout_amount: '50.00' } },
    'browser-import-minimum');
  const destination = (await payouts.updateDestination(pic, { bank_name: 'Synthetic Bank', account_number: '12345678',
    account_holder_name: 'Synthetic Browser PIC' })).destination;
  const csv = 'period,isrc,upc,title,artist,label_name,platform,country,sales_unit,net_revenue\n' +
    '2026-11,IDA010000006,,Uncatalogued Song,Unit Artist,Synthetic Browser PIC,Spotify,ID,10,100.00\n';
  const checksums = new Map<string, { size: number; checksum: string }>();
  const uploaded = new Map<string, Buffer>();
  const uploads = createHttpServer(async (request, reply) => {
    reply.setHeader('Access-Control-Allow-Origin', frontend);
    reply.setHeader('Access-Control-Allow-Methods', 'PUT,OPTIONS');
    reply.setHeader('Access-Control-Allow-Headers', 'content-type');
    if (request.method === 'OPTIONS') { reply.writeHead(204); reply.end(); return; }
    const id = request.url?.match(/^\/upload\/([0-9a-f-]{36})$/)?.[1];
    if (request.method !== 'PUT' || !id || !checksums.has(id)) { reply.writeHead(404); reply.end(); return; }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const expected = checksums.get(id)!;
    if (bytes.byteLength !== expected.size || createHash('sha256').update(bytes).digest('hex') !== expected.checksum) {
      reply.writeHead(400); reply.end(); return;
    }
    uploaded.set(id, bytes);
    reply.writeHead(200); reply.end();
  });
  await new Promise<void>((done, fail) => uploads.once('error', fail).listen(0, '127.0.0.1', done));
  t.after(async () => {
    uploads.closeAllConnections();
    await new Promise<void>((done, fail) => uploads.close(error => error ? fail(error) : done()));
  });
  const storageAddress = uploads.address();
  assert.ok(storageAddress && typeof storageAddress !== 'string');
  const uploadOrigin = `http://127.0.0.1:${storageAddress.port}`;
  const store: RoyaltyImportObjectStore = {
    bucket: 'synthetic-private', key: id => `royalty-imports/objects/${id}`,
    request: async (ownerId, input) => {
      const id = randomUUID();
      checksums.set(id, { size: input.size, checksum: input.checksum });
      return { metadata: { id, ownerId, mimeType: input.mime_type, size: input.size,
        checksum: input.checksum, visibility: 'private', createdAt: new Date().toISOString() },
      url: `${uploadOrigin}/upload/${id}`, method: 'PUT', headers: { 'content-type': 'text/csv' } };
    },
    requestForId: async () => { throw new Error('Unused replacement operation'); },
    verify: async (row: RoyaltyImportFileRow) => {
      const bytes = uploaded.get(row.id);
      if (!bytes) throw new ApiError(409, 'ROYALTY_FILE_BYTES_MISSING');
      if (bytes.byteLength !== Number(row.size_bytes) || createHash('sha256').update(bytes).digest('hex') !== row.source_checksum)
        throw new ApiError(400, 'ROYALTY_FILE_CHECKSUM_MISMATCH');
    },
    open: async (row: RoyaltyImportFileRow) => {
      const bytes = uploaded.get(row.id);
      if (!bytes) throw new ApiError(404, 'NOT_FOUND');
      return (async function* () { yield bytes; })();
    },
    download: async () => '', remove: async row => { uploaded.delete(row.id); },
    isReady: async () => true, close: () => undefined,
  };
  const mediaStore = await createMediaObjectStore(database.runtime, { environment: 'test', endpoint: storageOrigin,
    publicEndpoint: storageOrigin, credentials: { accessKeyId: storageAccessKey, secretAccessKey: storageSecretKey },
    bucket: 'soundpub-synthetic-browser-proof', prefix: 'media', allowedOrigins: [frontend] });
  t.after(() => mediaStore.close());
  const royalties = createRoyaltiesService(database.runtime, store, database.reconciler);
  const app = buildApp({
    localAuth: createLocalAuthService(database.runtime, { deliverySecret: 'synthetic-browser-key-32-characters' }),
    users: createUsersService(database.runtime), royalties, payouts,
    media: createMediaService(database.runtime, mediaStore),
    auth: { authenticate: async () => null }, readiness: { check: async () => true },
    rateLimiter: { consume: async () => ({ allowed: true }) },
    admin: { suspendUser: async () => undefined }, webhooks: { receive: async () => false },
  });
  const serverErrors: string[] = [];
  app.addHook('onError', async (_request, _reply, error) => { serverErrors.push(error.message); });
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  t.after(() => app.close());
  const processor = createRoyaltyImportJobProcessor(database.runtime, store, 'browser-worker');
  const workerErrors: string[] = [];
  let polling = false;
  const worker = setInterval(() => {
    if (polling) return;
    polling = true;
    void processor.poll().catch(error => workerErrors.push(String(error))).finally(() => { polling = false; });
  }, 100);
  t.after(() => clearInterval(worker));
  const debugPort = await freePort();
  const dataDir = await mkdtemp(join(tmpdir(), 'soundpub-browser-'));
  let browser: ChildProcess | undefined;
  let socket: WebSocket | undefined;
  t.after(async () => {
    socket?.close();
    if (browser && browser.exitCode === null) browser.kill();
    if (!resolve(dataDir).startsWith(`${resolve(tmpdir())}${sep}`) || !basename(dataDir).startsWith('soundpub-browser-'))
      throw new Error('Unsafe browser temp directory');
    for (let attempt = 0; attempt < 10; attempt++) {
      try { await rm(dataDir, { recursive: true, force: true }); break; }
      catch (error) {
        if (attempt === 9 || !['EBUSY','EPERM','ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        await delay(250);
      }
    }
  });
  const csvPath = join(dataDir, 'catalogless-browser.csv');
  await writeFile(csvPath, csv);
  const proofPath = join(dataDir, 'synthetic-transfer.pdf');
  await writeFile(proofPath, '%PDF-1.7\nSynthetic browser-only transfer evidence\n');
  browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${dataDir}`, 'about:blank'],
  { stdio: 'ignore', windowsHide: true });
  const deadline = Date.now() + 10_000;
  let tab: { webSocketDebuggerUrl: string } | undefined;
  while (!tab) {
    try {
      const reply = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' });
      if (reply.ok) tab = await reply.json() as { webSocketDebuggerUrl: string };
    } catch {}
    if (Date.now() >= deadline) throw new Error('Chrome debugging endpoint unavailable');
    if (!tab) await delay(100);
  }
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise<void>((done, fail) => {
    socket!.addEventListener('open', () => done(), { once: true });
    socket!.addEventListener('error', () => fail(new Error('Chrome websocket unavailable')), { once: true });
  });
  const protocol = new BrowserProtocol(socket, new URL(address).origin, [uploadOrigin, storageOrigin]);
  await protocol.command('Page.enable');
  await protocol.command('Runtime.enable');
  await protocol.command('DOM.enable');
  await protocol.command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await protocol.command('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await protocol.command('Page.navigate', { url: `${frontend}/auth` });
  await protocol.wait("Boolean(document.querySelector('#login-email'))", 'login form');
  await protocol.fill('#login-email', email);
  await protocol.fill('#login-password', password);
  await protocol.click("document.querySelector('#login-password')?.closest('form')?.querySelector('button[type=submit]')", 'admin login');
  await protocol.wait("location.pathname === '/dashboard'", 'admin login redirect');
  await protocol.command('Page.navigate', { url: `${frontend}/dashboard/upload` });
  await protocol.wait("Boolean(document.querySelector('h1')?.textContent?.includes('Impor royalti'))", 'backend royalty import');
  await protocol.setFileInput('input[type=file]', csvPath);
  await protocol.click("[...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Upload dan preview')", 'preview CSV');
  await protocol.wait("Boolean(document.body.textContent?.includes('Hasil preview') && document.body.textContent?.includes('Menunggu approval'))", 'catalogless preview');
  await protocol.wait("Boolean([...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Setujui preview' && !button.disabled))", 'approval enabled');
  await protocol.click("[...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Setujui preview')", 'approve import');
  await protocol.wait("Boolean(document.body.textContent?.includes('Preview disetujui dan terkunci') || document.querySelector('[role=alert]'))", 'approval response');
  assert.ok(await protocol.evaluate("document.body.textContent?.includes('Preview disetujui dan terkunci')"), await protocol.evaluate("document.querySelector('[role=alert]')?.textContent || document.body.innerText.slice(-1200)"));
  await protocol.wait("Boolean([...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Commit batch atomik' && !button.disabled))", 'commit enabled');
  await protocol.click("[...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Commit batch atomik')", 'commit import');
  await protocol.wait("Boolean(document.body.textContent?.includes('berhasil disimpan secara atomik'))", 'committed royalty');
  const rows = (await database.owner.query(`SELECT session.id AS session_id,session.status,session.batch_id,entry.artist_id,entry.financial_owner_user_id,
      entry.source_isrc,entry.release_id,entry.track_id FROM soundpub.royalty_import_sessions session
      JOIN soundpub.royalty_import_entries entry ON entry.batch_id=session.batch_id
      WHERE session.requester_id=$1`, [adminId])).rows;
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { session_id: rows[0].session_id, status: 'COMMITTED', batch_id: rows[0].batch_id,
    artist_id: artist.id, financial_owner_user_id: picId, source_isrc: 'IDA010000006', release_id: null, track_id: null });
  assert.deepEqual((await database.owner.query(`SELECT allocation.component,allocation.owner_id,allocation.amount::text
    FROM soundpub.royalty_import_allocations allocation JOIN soundpub.royalty_import_entries entry ON entry.id=allocation.entry_id
    WHERE entry.batch_id=$1 ORDER BY allocation.component`, [rows[0].batch_id])).rows,
  [{ component: 'ARTIST', owner_id: picId, amount: '70.00' },
    { component: 'LABEL', owner_id: picId, amount: '21.00' },
    { component: 'SOUNDPUB', owner_id: null, amount: '9.00' }]);
  assert.deepEqual((await database.owner.query(`SELECT owner_id,amount_minor::text FROM soundpub.finance_events
    WHERE business_reference=$1`, [`royalty:${rows[0].batch_id}`])).rows,
    [{ owner_id: picId, amount_minor: '9100' }]);
  assert.equal((await database.owner.query('SELECT count(*)::int AS count FROM soundpub.backend_users')).rows[0].count, 3);
  assert.deepEqual(workerErrors, []);
  assert.ok(protocol.requests.includes('/api/v1/royalties/import-files'));
  assert.ok(protocol.requests.includes(`/api/v1/royalties/import-files/${rows[0].session_id}/commit`));
  assert.ok(protocol.requests.includes(`/api/v1/admin/royalties/import-files/${rows[0].session_id}/approve`));
  await protocol.click("[...document.querySelectorAll('button')].find(button => button.textContent?.includes('Logout'))", 'importer logout');
  await protocol.wait("Boolean(document.querySelector('#login-email'))", 'reviewer login form');
  await protocol.fill('#login-email', reviewerEmail);
  await protocol.fill('#login-password', reviewerPassword);
  await protocol.click("document.querySelector('#login-password')?.closest('form')?.querySelector('button[type=submit]')", 'reviewer login');
  await protocol.wait("location.pathname === '/dashboard'", 'reviewer login redirect');
  await protocol.command('Page.navigate', { url: `${frontend}/dashboard/upload` });
  const batchHistoryRow = "([...document.querySelectorAll('table')].find(table => table.querySelector('thead')?.textContent?.includes('Sumber') && table.querySelector('thead')?.textContent?.includes('File'))?.querySelector('tbody tr'))";
  await protocol.wait(`Boolean(${batchHistoryRow}?.textContent?.includes('catalogless-browser.csv') && ${batchHistoryRow}?.querySelector('button'))`, 'committed batch detail control');
  await protocol.click(`${batchHistoryRow}?.querySelector('button')`, 'open batch reconciliation');
  await protocol.wait("Boolean(document.body.textContent?.includes('Rekonsiliasi batch'))", 'batch reconciliation details');
  await protocol.wait("Boolean([...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Setujui rekonsiliasi' && !button.disabled))", 'independent reconciliation ready');
  await protocol.click("[...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Setujui rekonsiliasi')", 'approve reconciliation');
  await protocol.wait("Boolean(document.body.textContent?.includes('Batch berhasil direkonsiliasi'))", 'independent reconciliation');
  assert.deepEqual((await database.owner.query(`SELECT actor_id,result FROM soundpub.royalty_import_reconciliations WHERE batch_id=$1`,
    [rows[0].batch_id])).rows, [{ actor_id: reviewerId, result: 'MATCHED' }]);
  await protocol.command('Page.navigate', { url: `${frontend}/dashboard/admin-payouts` });
  await protocol.wait("Boolean(document.querySelector('section[aria-label=\\\"Verifikasi PIC dan persetujuan rekonsiliasi\\\"]'))", 'admin PIC readiness review');
  const review = 'section[aria-label="Verifikasi PIC dan persetujuan rekonsiliasi"]';
  await protocol.fill(`${review} form label:nth-of-type(1) input`, picId);
  await protocol.select(`${review} form select`, 'verify_destination');
  await protocol.fill(`${review} form label:nth-of-type(3) input`, destination.id);
  await protocol.fill(`${review} form label:nth-of-type(4) input`, 'Synthetic account independently verified');
  await protocol.click("document.querySelector('section[aria-label=\\\"Verifikasi PIC dan persetujuan rekonsiliasi\\\"] button[type=submit]')", 'verify PIC destination');
  await protocol.wait("Boolean(document.body.textContent?.includes('Review backend dikonfirmasi: verify_destination'))", 'PIC destination approval');
  await protocol.select(`${review} form select`, 'approve_reconciliation');
  await protocol.fill(`${review} form label:nth-of-type(3) input`, 'Synthetic PIC royalty ledger independently reconciled');
  await protocol.click("document.querySelector('section[aria-label=\\\"Verifikasi PIC dan persetujuan rekonsiliasi\\\"] button[type=submit]')", 'approve PIC reconciliation');
  await protocol.wait("Boolean(document.body.textContent?.includes('Review backend dikonfirmasi: approve_reconciliation'))", 'PIC reconciliation approval');
  await protocol.click("[...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Logout')", 'reviewer logout');
  await protocol.wait("Boolean(document.querySelector('#login-email'))", 'PIC login form');
  await protocol.fill('#login-email', picEmail);
  await protocol.fill('#login-password', picPassword);
  await protocol.click("document.querySelector('#login-password')?.closest('form')?.querySelector('button[type=submit]')", 'PIC login');
  await protocol.wait("location.pathname.startsWith('/dashboard')", 'PIC login redirect');
  await protocol.command('Page.navigate', { url: `${frontend}/dashboard/payouts` });
  await protocol.wait("Boolean(document.body.textContent?.includes('Memenuhi syarat'))", 'PIC payout eligibility');
  await protocol.fill('form input[inputmode=decimal]', '60.00');
  await protocol.click("[...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Ajukan pencairan')", 'request PIC payout');
  await protocol.wait("Boolean(document.body.textContent?.includes(': pending'))", 'PIC payout request');
  const payout = (await database.owner.query(`SELECT id,user_id,amount::text,status FROM soundpub.payout_requests WHERE user_id=$1`,
    [picId])).rows[0];
  assert.deepEqual(payout, { id: payout.id, user_id: picId, amount: '60.00', status: 'pending' });
  assert.deepEqual((await database.owner.query(`SELECT owner_id,amount::text FROM soundpub.payout_allocations WHERE payout_id=$1`,
    [payout.id])).rows, [{ owner_id: picId, amount: '60.00' }]);
  const reservedEligibility = await payouts.eligibility(pic);
  assert.ok(reservedEligibility.reasons.includes('PENDING_PAYOUT'));
  assert.ok(reservedEligibility.reasons.includes('BELOW_MINIMUM'));
  await protocol.wait("Boolean([...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Batalkan' && !button.disabled))", 'cancel control after payout list refresh');
  await protocol.click("[...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Batalkan')", 'cancel PIC payout');
  await protocol.wait("Boolean(document.body.textContent?.includes(': cancelled'))", 'cancelled PIC payout');
  assert.equal((await database.owner.query(`SELECT status FROM soundpub.payout_requests WHERE id=$1`, [payout.id])).rows[0].status, 'cancelled');
  assert.deepEqual((await database.owner.query(`SELECT kind,amount_minor::text FROM soundpub.finance_events WHERE business_reference=$1
    AND kind IN ('PAYOUT_RESERVATION','PAYOUT_RELEASE') ORDER BY kind`, [payout.id])).rows,
    [{ kind: 'PAYOUT_RELEASE', amount_minor: '6000' }, { kind: 'PAYOUT_RESERVATION', amount_minor: '6000' }]);
  await protocol.wait("Boolean(document.body.textContent?.includes('Memenuhi syarat'))", 'eligibility after cancellation');
  await protocol.fill('form input[inputmode=decimal]', '60.00');
  await protocol.click("[...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Ajukan pencairan')", 'request payout to settle');
  await protocol.wait("Boolean(document.body.textContent?.includes(': pending') || document.body.textContent?.includes('Operasi belum dikonfirmasi'))", 'second payout response');
  const payable = (await database.owner.query(`SELECT id,user_id,amount::text,status FROM soundpub.payout_requests
    WHERE user_id=$1 AND id<>$2`, [picId,payout.id])).rows[0];
  assert.ok(payable, `Second payout missing: ${serverErrors.join('; ')}`);
  assert.deepEqual(payable, { id: payable.id, user_id: picId, amount: '60.00', status: 'pending' });
  await protocol.click("[...document.querySelectorAll('button')].find(button => button.textContent?.includes('Logout'))", 'PIC logout');
  await protocol.wait("Boolean(document.querySelector('#login-email'))", 'admin settlement login form');
  await protocol.fill('#login-email', reviewerEmail);
  await protocol.fill('#login-password', reviewerPassword);
  await protocol.click("document.querySelector('#login-password')?.closest('form')?.querySelector('button[type=submit]')", 'admin settlement login');
  await protocol.wait("location.pathname.startsWith('/dashboard')", 'admin settlement login redirect');
  await protocol.command('Page.navigate', { url: `${frontend}/dashboard/admin-payouts` });
  await protocol.wait(`Boolean([...document.querySelectorAll('tr')].find(row => row.textContent?.includes('${payable.id}') && row.textContent?.includes('pending')))`, 'pending payout for admin');
  const row = `([...document.querySelectorAll('tr')].find(item => item.textContent?.includes('${payable.id}')))`;
  await protocol.click(`${row}?.querySelector('button')`, 'approve PIC payout');
  await protocol.wait(`Boolean(${row}?.querySelector('input[type=file][accept="application/pdf,image/png,image/jpeg,image/webp"]'))`, 'approved payout proof controls');
  await protocol.setFileInput('input[type=file][accept="application/pdf,image/png,image/jpeg,image/webp"]', proofPath);
  await protocol.fill('table tbody tr label input[maxlength="200"]', 'Synthetic independently verified transfer');
  await protocol.wait("Boolean([...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Tandai lunas dengan bukti' && !button.disabled))", 'proof upload form ready');
  await protocol.click("[...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Tandai lunas dengan bukti')", 'settle with private proof');
  await protocol.wait("Boolean(document.body.textContent?.includes(': paid') || document.body.textContent?.includes('Settlement belum terkonfirmasi'))", 'settlement result');
  assert.equal(await protocol.evaluate("document.body.textContent?.includes('Settlement belum terkonfirmasi')"), false, serverErrors.join('; '));
  await protocol.wait(`Boolean(${row}?.textContent?.includes('paid'))`, 'paid payout');
  assert.deepEqual((await database.owner.query(`SELECT media.category,media.status,media.resource_type,media.resource_id,
    media.owner_user_id,media.bucket,proof.uploaded_by FROM soundpub.payout_settlement_proofs proof
    JOIN soundpub.media_objects media ON media.id=proof.media_object_id WHERE proof.payout_id=$1`, [payable.id])).rows,
    [{ category: 'PAYOUT_PROOF', status: 'ACTIVE', resource_type: 'payout', resource_id: payable.id,
      owner_user_id: reviewerId, bucket: 'soundpub-synthetic-browser-proof', uploaded_by: reviewerId }]);
  const mediaId = (await database.owner.query<{ media_object_id: string }>(
    'SELECT media_object_id FROM soundpub.payout_settlement_proofs WHERE payout_id=$1', [payable.id])).rows[0]!.media_object_id;
  const mediaRow = (await database.owner.query<MediaRow>('SELECT * FROM soundpub.media_objects WHERE id=$1', [mediaId])).rows[0]!;
  const signedProof = await mediaStore.download(mediaRow);
  const downloadedProof = await fetch(signedProof);
  assert.equal(downloadedProof.status, 200);
  assert.deepEqual(Buffer.from(await downloadedProof.arrayBuffer()), await readFile(proofPath));
  assert.equal((await fetch(`${storageOrigin}/${mediaStore.bucket}/${mediaStore.key(mediaId)}`)).status, 403);
  assert.deepEqual((await database.owner.query(`SELECT kind,owner_id,amount_minor::text FROM soundpub.finance_events
    WHERE business_reference=$1 ORDER BY kind`, [payable.id])).rows,
    [{ kind: 'PAYOUT_RESERVATION', owner_id: picId, amount_minor: '6000' },
      { kind: 'PAYOUT_SETTLEMENT', owner_id: picId, amount_minor: '6000' }]);
  assert.ok(protocol.requests.includes('/api/v1/storage/uploads'));
  assert.ok(protocol.requests.includes(`/api/v1/admin/payouts/${payable.id}/settle`));
  assert.deepEqual((await database.owner.query('SELECT management_mode,artist_user_id FROM soundpub.artists WHERE id=$1', [artist.id])).rows,
    [{ management_mode: 'LABEL_CUSTOM_MANAGED', artist_user_id: null }]);
  assert.equal((await database.owner.query(`SELECT count(*)::int AS count FROM soundpub.backend_users WHERE id=$1`, [artist.id])).rows[0].count, 0);
  assert.deepEqual(workerErrors, []);
  assert.ok(protocol.requests.includes(`/api/v1/admin/royalties/imports/${rows[0].batch_id}/reconciliation`));
  assert.ok(protocol.requests.includes('/api/v1/payouts/eligibility'));
  assert.deepEqual(protocol.blocked.filter(origin => /supabase/.test(origin)), []);
  assert.deepEqual(protocol.errors, []);
});
