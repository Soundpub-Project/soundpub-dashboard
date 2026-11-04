import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'vite';
import { buildApp } from '../../backend/src/api/index.ts';
import { createPool, createRepositories, migrate } from '../../backend/src/db/index.ts';
import { createArtistsService } from '../../backend/src/artists/index.ts';
import { createLabelsService } from '../../backend/src/labels/index.ts';
import { createUsersService } from '../../backend/src/users/index.ts';

assert(process.env.PLAYWRIGHT_PACKAGE_JSON, 'Set PLAYWRIGHT_PACKAGE_JSON to existing installed playwright/package.json');
const { chromium } = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON)('playwright');
const run = `soundpub-browser-${process.pid}-${Date.now()}`;
const output = resolve(tmpdir(), run);
await mkdir(output, { recursive: true });
const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const password = randomBytes(24).toString('hex');
const results: any[] = [];
let owner: any, runtime: any, app: any, server: any, browser: any;
let container = false;
let controlledFailure = false;
let labelFailure = false;
let labelDelay = false;
const labelId = '00000000-0000-4000-8000-000000000101';
const otherId = '00000000-0000-4000-8000-000000000102';
const adminId = '00000000-0000-4000-8000-000000000103';
try {
  docker('run', '--detach', '--rm', '--name', run, '--publish', '127.0.0.1::5432',
    '--env', `POSTGRES_PASSWORD=${password}`, '--env', 'POSTGRES_DB=soundpub_test_browser', 'postgres:17-alpine');
  container = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { docker('exec', run, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'); ready = true; break; } catch { await delay(500); }
  }
  assert(ready, 'Owned disposable PostgreSQL did not become ready');
  const port = docker('port', run, '5432/tcp').split(':').at(-1);
  owner = createPool({ connectionString: `postgres://postgres:${password}@127.0.0.1:${port}/soundpub_test_browser` });
  await owner.query('CREATE ROLE soundpub_app NOLOGIN');
  await owner.query('CREATE ROLE soundpub_owner NOLOGIN');
  const migrations = await migrate(owner);
  runtime = createPool({ connectionString: `postgres://postgres:${password}@127.0.0.1:${port}/soundpub_test_browser`, options: '-c role=soundpub_app' });
  for (const [id, name, role] of [[labelId, 'Browser Label A', 'label'], [otherId, 'Browser Label B', 'label'], [adminId, 'Browser Admin', 'admin']]) {
    await owner.query("INSERT INTO soundpub.backend_users(id,email,status) VALUES ($1,$2,'active')", [id, `${role}${id.slice(-3)}@example.invalid`]);
    await owner.query('INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,$2)', [id, name]);
    await owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())', [id, role]);
    await owner.query("INSERT INTO soundpub.external_identities(application_user_id,provider,issuer,subject,verified_at) VALUES ($1,'mock','browser-local',$2,now())", [id, id]);
  }
  const principals = createRepositories(runtime).principals;
  app = buildApp({ artists: createArtistsService(runtime), labels: createLabelsService(runtime), users: createUsersService(runtime),
    auth: { authenticate: token => principals.findByIdentity({ issuer: 'browser-local', subject: token }) },
    readiness: { check: async () => true }, rateLimiter: { consume: async () => ({ allowed: true }) },
    admin: { suspendUser: async () => { throw new Error('Unsupported in browser harness'); } }, webhooks: { receive: async () => false } });
  app.addHook('preHandler', async (request: any) => {
    if (controlledFailure && request.url.includes('/artists')) throw new Error('Owned browser controlled failure');
    if (labelDelay && request.url.includes('/labels')) await delay(500);
    if (labelFailure && request.url.includes('/labels')) throw new Error('Owned browser controlled label failure');
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const backendOrigin = `http://127.0.0.1:${app.server.address().port}`;
  for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key];
  Object.assign(process.env, { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'synthetic-browser-public', VITE_SOUNDPUB_BACKEND_DOMAINS: 'users,artists,labels' });
  server = await createServer({ envDir: false, server: { host: '127.0.0.1', port: 0,
    proxy: { '/api': { target: backendOrigin, headers: { origin: 'http://127.0.0.1:8181' } } } } });
  await server.listen();
  const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
  browser = await chromium.launch({ headless: true });
  results.push({ environment: { origin, backendOrigin, postgres: `127.0.0.1:${port}/soundpub_test_browser`, container: run, migrations, runtimeRole: (await runtime.query('select current_user')).rows[0].current_user }, auth: 'Synthetic local identity binding; no external auth provider' });
  for (const [device, viewport] of Object.entries({ mobile: { width: 390, height: 844 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1440, height: 900 } })) {
    if (process.env.PHASE3B_VIEWPORT && process.env.PHASE3B_VIEWPORT !== device) continue;
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const requests: any[] = [], blocked: string[] = [], checks: string[] = [];
    await context.route('**/*', (route: any) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { blocked.push(url.origin + url.pathname); return route.abort(); }
      return route.continue();
    });
    await context.addInitScript((id: string) => localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: id,
      refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id, aud: 'authenticated', email: 'browser@example.invalid', app_metadata: {}, user_metadata: {} } })), labelId);
    const page = await context.newPage();
    page.on('response', (response: any) => { if (response.url().includes('/api/v1/')) requests.push({ path: new URL(response.url()).pathname, method: response.request().method(), status: response.status(), requestId: response.headers()['x-request-id'] }); });
    const api = (method: string, path: string, body?: any, token = adminId) => page.evaluate(async ({ method, path, body, token }: any) => {
      const response = await fetch(`/api/v1${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() };
    }, { method, path, body, token });
    try {
      labelDelay = true;
      await page.goto(`${origin}/dashboard/my-artists`);
      await page.locator('.animate-spin').first().waitFor();
      labelDelay = false;
      await page.getByRole('button', { name: 'Tambah Artist' }).waitFor();
      checks.push('UI roster list');
      await page.getByRole('button', { name: 'Tambah Artist' }).click();
      assert(await page.getByRole('button', { name: 'Daftarkan Artist' }).isDisabled());
      checks.push('UI required-field validation');
      const name = `Browser ${device}`;
      await page.locator('#fullName').fill(name);
      await page.getByRole('combobox').nth(0).click();
      await page.getByRole('option', { name: 'Pop', exact: true }).click();
      await page.getByRole('combobox').nth(1).click();
      await page.getByRole('option', { name: 'Original Music', exact: true }).click();
      await page.locator('#terms').click();
      const createdResponse = page.waitForResponse((response: any) => response.url().endsWith('/api/v1/artists') && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Daftarkan Artist' }).click();
      const created = await createdResponse;
      assert.equal(created.status(), 200, await created.text());
      const artist = await created.json();
      assert.equal((await owner.query('SELECT parent_label_id FROM soundpub.profiles WHERE id=$1', [artist.id])).rows[0].parent_label_id, labelId);
      await page.reload();
      await page.getByText(name, { exact: true }).waitFor();
      checks.push('UI create + independent DB row + reload');
      await page.getByText(name, { exact: true }).locator('xpath=../..').getByRole('button').first().click();
      const detailResponse = page.waitForResponse((response: any) => response.url().endsWith(`/artists/${artist.id}`) && response.request().method() === 'GET');
      await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
      await detailResponse;
      await page.waitForFunction(() => !(Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Simpan') as HTMLButtonElement)?.disabled);
      await page.locator('#editFullName').fill(`${name} Edited`);
      const savedResponse = page.waitForResponse((response: any) => response.url().endsWith(`/artists/${artist.id}`) && response.request().method() === 'PATCH');
      await page.getByRole('button', { name: 'Simpan', exact: true }).click();
      assert.equal((await savedResponse).status(), 200);
      assert.equal((await owner.query('SELECT full_name FROM soundpub.profiles WHERE id=$1', [artist.id])).rows[0].full_name, `${name} Edited`);
      await page.reload();
      await page.getByText(`${name} Edited`, { exact: true }).waitFor();
      checks.push('UI detail read/edit + independent DB row + reload');
      for (const path of ['/artists', `/artists/${artist.id}`, '/labels', `/labels/${labelId}`]) assert.equal((await api('GET', path)).status, 200);
      assert.equal((await api('POST', '/artists', {})).status, 400);
      assert.equal((await api('GET', '/artists', undefined, 'unknown')).status, 401);
      assert.equal((await api('GET', '/artists/00000000-0000-4000-8000-000000000999')).status, 404);
      checks.push('Browser fetch real API list/detail Artist/Label; 400/401/404 (not product UI acceptance)');
      assert.equal((await api('POST', `/artists/${artist.id}/transfer`, { labelId: otherId, expectedParentLabelId: labelId, confirmationPhrase: 'PINDAH LABEL', royaltyTransferMode: 'keep_old_label' })).status, 200);
      assert.equal((await owner.query('SELECT parent_label_id FROM soundpub.profiles WHERE id=$1', [artist.id])).rows[0].parent_label_id, otherId);
      assert.equal((await api('POST', `/artists/${artist.id}/transfer`, { labelId, expectedParentLabelId: labelId, confirmationPhrase: 'PINDAH LABEL' })).status, 409);
      labelFailure = true;
      await page.reload();
      await page.getByRole('alert').filter({ hasText: 'Daftar artis backend' }).waitFor();
      const failureCount = requests.filter(item => item.status === 500).length;
      await delay(1200);
      assert.equal(requests.filter(item => item.status === 500).length, failureCount);
      labelFailure = false;
      await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
      await page.getByText('Belum ada artist', { exact: true }).waitFor();
      checks.push('Label roster controlled 500; no retry loop; manual recovery');
      assert.equal((await api('POST', `/artists/${artist.id}/remove`, { expectedParentLabelId: otherId })).status, 200);
      assert.equal((await owner.query('SELECT parent_label_id FROM soundpub.profiles WHERE id=$1', [artist.id])).rows[0].parent_label_id, null);
      assert.equal((await api('POST', `/artists/${artist.id}/assign`, { labelId, expectedParentLabelId: null })).status, 200);
      await page.reload();
      await page.getByText(`${name} Edited`, { exact: true }).waitFor();
      checks.push('Browser fetch transfer/detach/assign + DB state; stale 409; UI roster reload (no mutation controls exercised)');
      const rosterPattern = `**/api/v1/labels/${labelId}/artists*`;
      await context.route(rosterPattern, (route: any) => route.abort('connectionfailed'));
      await page.reload();
      await page.getByRole('alert').filter({ hasText: 'Daftar artis backend' }).waitFor();
      await context.unroute(rosterPattern);
      await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
      await page.getByText(`${name} Edited`, { exact: true }).waitFor();
      checks.push('Aborted roster connection; useful UI error + recovery; no response mocked');
      await page.getByRole('button', { name: 'Tambah Artist' }).click();
      await page.locator('#fullName').fill('Unauthorized optimistic artist');
      await page.getByRole('combobox').nth(0).click();
      await page.getByRole('option', { name: 'Pop', exact: true }).click();
      await page.getByRole('combobox').nth(1).click();
      await page.getByRole('option', { name: 'Original Music', exact: true }).click();
      await page.locator('#terms').click();
      await owner.query("DELETE FROM soundpub.user_roles WHERE user_id=$1 AND role='label'", [labelId]);
      const deniedResponse = page.waitForResponse((response: any) => response.url().endsWith('/api/v1/artists') && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Daftarkan Artist' }).click();
      assert.equal((await deniedResponse).status(), 403);
      await page.getByText('FORBIDDEN', { exact: true }).waitFor();
      assert(await page.locator('#fullName').isVisible());
      assert.equal((await owner.query("SELECT count(*)::int AS count FROM soundpub.artist_profiles WHERE artist_name='Unauthorized optimistic artist'")).rows[0].count, 0);
      await owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'label',now())", [labelId]);
      await page.getByRole('button', { name: 'Batal', exact: true }).click();
      checks.push('Loaded UI authority revoked in DB; UI create denied 403; error visible, dialog retained, no DB row');
      const openEdit = async () => {
        await page.getByText(`${name} Edited`, { exact: true }).locator('xpath=../..').getByRole('button').first().click();
        const detail = page.waitForResponse((response: any) => response.url().endsWith(`/artists/${artist.id}`) && response.request().method() === 'GET');
        await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
        await detail;
        await page.waitForFunction(() => !(Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Simpan') as HTMLButtonElement)?.disabled);
      };
      await openEdit();
      await page.locator('#editPhone').fill('1'.repeat(51));
      const invalid = page.waitForResponse((response: any) => response.url().endsWith(`/artists/${artist.id}`) && response.request().method() === 'PATCH');
      await page.getByRole('button', { name: 'Simpan', exact: true }).click();
      assert.equal((await invalid).status(), 400);
      await page.getByText('VALIDATION_ERROR', { exact: true }).waitFor();
      assert.equal((await owner.query('SELECT phone FROM soundpub.profiles WHERE id=$1', [artist.id])).rows[0].phone, null);
      await page.getByRole('button', { name: 'Batal', exact: true }).click();
      checks.push('UI invalid 51-character phone PATCH 400; visible VALIDATION_ERROR; DB unchanged');
      await openEdit();
      await owner.query("UPDATE soundpub.external_identities SET verified_at=NULL WHERE application_user_id=$1", [labelId]);
      const unauthorized = page.waitForResponse((response: any) => response.url().endsWith(`/artists/${artist.id}`) && response.request().method() === 'PATCH');
      await page.getByRole('button', { name: 'Simpan', exact: true }).click();
      assert.equal((await unauthorized).status(), 401);
      await page.getByText('UNAUTHENTICATED', { exact: true }).waitFor();
      assert(await page.locator('#editFullName').isVisible());
      await owner.query('UPDATE soundpub.external_identities SET verified_at=now() WHERE application_user_id=$1', [labelId]);
      await page.getByRole('button', { name: 'Batal', exact: true }).click();
      checks.push('Loaded UI edit with identity unverified in DB; real 401; visible UNAUTHENTICATED, dialog retained');
      await page.goto(`${origin}/dashboard/artist-profile/${artist.id}`);
      await page.getByRole('heading', { name: `Profil Artis — ${name} Edited` }).waitFor();
      await page.getByText('Label pengelola: Browser Label A', { exact: true }).waitFor();
      assert.equal(await page.getByPlaceholder('Nama panggung').inputValue(), name);
      await page.getByPlaceholder('Masukkan nomor telepon aktif').fill('081234567890');
      await page.getByPlaceholder('Indonesia', { exact: true }).fill('Indonesia');
      await page.getByPlaceholder('Jakarta').fill('Bandung');
      await page.getByPlaceholder('Ceritakan tentang artis ini...').fill('Browser detail persisted bio');
      const profileSaved = page.waitForResponse((response: any) => response.url().endsWith(`/artists/${artist.id}`) && response.request().method() === 'PATCH');
      await page.getByRole('button', { name: 'Simpan Profil', exact: true }).click();
      assert.equal((await profileSaved).status(), 200);
      const persistedProfile = (await owner.query(`SELECT p.phone, ap.country, ap.city, ap.bio FROM soundpub.profiles p JOIN soundpub.artist_profiles ap ON ap.user_id=p.id WHERE p.id=$1`, [artist.id])).rows[0];
      assert.deepEqual(persistedProfile, { phone: '081234567890', country: 'Indonesia', city: 'Bandung', bio: 'Browser detail persisted bio' });
      await page.reload();
      await page.getByText('Label pengelola: Browser Label A', { exact: true }).waitFor();
      assert.equal(await page.getByPlaceholder('Masukkan nomor telepon aktif').inputValue(), '081234567890');
      assert.equal(await page.getByPlaceholder('Indonesia', { exact: true }).inputValue(), 'Indonesia');
      assert.equal(await page.getByPlaceholder('Jakarta').inputValue(), 'Bandung');
      checks.push('Full Artist detail success; identity, management Label, editable fields, DB persistence and reload');

      controlledFailure = true;
      await page.reload();
      await page.getByRole('alert').filter({ hasText: 'Profil artis backend' }).waitFor();
      const artist500Count = requests.filter(item => item.path.endsWith(artist.id) && item.status === 500).length;
      await delay(1200);
      assert.equal(requests.filter(item => item.path.endsWith(artist.id) && item.status === 500).length, artist500Count);
      controlledFailure = false;
      await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
      await page.getByText('Label pengelola: Browser Label A', { exact: true }).waitFor();
      checks.push('Artist detail controlled backend 500; no retry loop; manual recovery');

      const artistDetailPattern = `**/api/v1/artists/${artist.id}`;
      await context.route(artistDetailPattern, (route: any) => route.abort('connectionfailed'));
      await page.reload();
      await page.getByRole('alert').filter({ hasText: 'Profil artis backend' }).waitFor();
      await context.unroute(artistDetailPattern);
      await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
      await page.getByText('Label pengelola: Browser Label A', { exact: true }).waitFor();
      checks.push('Artist detail network failure; stable page; manual recovery');

      controlledFailure = true;
      await page.reload();
      await page.getByRole('alert').filter({ hasText: 'Profil artis backend' }).waitFor();
      controlledFailure = false;
      await owner.query('UPDATE soundpub.external_identities SET verified_at=NULL WHERE application_user_id=$1', [labelId]);
      const artistUnauthorized = page.waitForResponse((response: any) => response.url().endsWith(`/artists/${artist.id}`) && response.request().method() === 'GET');
      await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
      assert.equal((await artistUnauthorized).status(), 401);
      await page.getByRole('alert').filter({ hasText: 'Profil artis backend' }).waitFor();
      await owner.query('UPDATE soundpub.external_identities SET verified_at=now() WHERE application_user_id=$1', [labelId]);
      await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
      await page.getByText('Label pengelola: Browser Label A', { exact: true }).waitFor();
      checks.push('Artist detail GET 401 after loaded session revocation; no privilege leak; recovery');

      await page.goto(`${origin}/dashboard/artist-profile/00000000-0000-4000-8000-000000000999`);
      await page.getByRole('alert').filter({ hasText: 'Profil artis backend' }).waitFor();
      assert(requests.some(item => item.path.endsWith('000000000999') && item.status === 404));
      checks.push('Missing Artist detail route: real 404 and visible useful product error');

      const adminContext = await browser.newContext({ viewport, serviceWorkers: 'block' });
      try {
        await adminContext.route('**/*', (route: any) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        await adminContext.addInitScript((id: string) => localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: id, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id, aud: 'authenticated', app_metadata: {}, user_metadata: {} } })), adminId);
        const adminPage = await adminContext.newPage();
        adminPage.on('response', (response: any) => { if (response.url().includes('/api/v1/')) requests.push({ path: new URL(response.url()).pathname, method: response.request().method(), status: response.status(), requestId: response.headers()['x-request-id'], actor: 'admin UI' }); });
        const openRole = async (destination: string) => {
          await adminPage.goto(`${origin}/dashboard/users`);
          const row = adminPage.getByRole('row').filter({ hasText: `${name} Edited` });
          await row.getByRole('button').last().click();
          await adminPage.getByRole('menuitem', { name: 'Ubah Role', exact: true }).click();
          const dialog = adminPage.getByRole('dialog');
          await dialog.getByRole('combobox').nth(1).click();
          await adminPage.getByRole('option', { name: destination, exact: true }).click();
          await dialog.getByPlaceholder('PINDAH LABEL').fill('PINDAH LABEL');
        };
        const submitRole = async (operation: string, status: number) => {
          const response = adminPage.waitForResponse((response: any) => response.url().endsWith(`/artists/${artist.id}/${operation}`) && response.request().method() === 'POST');
          await adminPage.getByRole('dialog').getByRole('button', { name: 'Simpan', exact: true }).click();
          assert.equal((await response).status(), status);
        };
        await adminPage.goto(`${origin}/dashboard/users`);
        await adminPage.getByRole('row').filter({ hasText: 'label101@example.invalid' }).waitFor();
        await adminPage.getByRole('row').filter({ hasText: 'label102@example.invalid' }).waitFor();
        labelDelay = true;
        const openingLabels = openRole('Browser Label B');
        labelDelay = false;
        await openingLabels;
        const choices = adminPage.getByRole('dialog').getByRole('combobox').nth(1);
        await choices.click();
        await adminPage.getByRole('option', { name: 'Browser Label A', exact: true }).waitFor();
        await adminPage.getByRole('option', { name: 'Browser Label B', exact: true }).waitFor();
        await adminPage.keyboard.press('Escape');
        assert.equal((await owner.query('SELECT count(*)::int AS count FROM soundpub.artists WHERE label_id=$1', [otherId])).rows[0].count, 0);
        checks.push('Canonical Label list: Users rows + role dialog options; current Label A roster and empty Label B confirmed in DB');

        const emptyContext = await browser.newContext({ viewport, serviceWorkers: 'block' });
        try {
          await emptyContext.route('**/*', (route: any) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
          await emptyContext.addInitScript((id: string) => localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: id, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id, aud: 'authenticated', app_metadata: {}, user_metadata: {} } })), otherId);
          const emptyPage = await emptyContext.newPage();
          emptyPage.on('response', (response: any) => { if (response.url().includes('/api/v1/')) requests.push({ path: new URL(response.url()).pathname, method: response.request().method(), status: response.status(), requestId: response.headers()['x-request-id'], actor: 'empty Label B UI' }); });
          await emptyPage.goto(`${origin}/dashboard/my-artists`);
          await emptyPage.getByText('Belum ada artist', { exact: true }).waitFor();
          await emptyPage.reload();
          await emptyPage.getByText('Belum ada artist', { exact: true }).waitFor();
          checks.push('Label B detail empty UI and persisted reload; DB roster zero');
        } finally { await emptyContext.close(); }
        await owner.query("UPDATE soundpub.user_roles SET role='user' WHERE user_id=$1 AND role='label'", [otherId]);
        await submitRole('transfer', 400);
        await adminPage.getByText('VALIDATION_ERROR', { exact: true }).waitFor();
        assert(await adminPage.getByRole('dialog').isVisible());
        assert.equal((await owner.query('SELECT parent_label_id FROM soundpub.profiles WHERE id=$1', [artist.id])).rows[0].parent_label_id, labelId);
        await owner.query("UPDATE soundpub.user_roles SET role='label' WHERE user_id=$1 AND role='user'", [otherId]);
        checks.push('Label destination invalidated after selection: UI 400, visible validation, retained dialog, unchanged parent');
        await owner.query('UPDATE soundpub.external_identities SET verified_at=NULL WHERE application_user_id=$1', [adminId]);
        await submitRole('transfer', 401);
        await adminPage.getByText('UNAUTHENTICATED', { exact: true }).waitFor();
        assert(await adminPage.getByRole('dialog').isVisible());
        await owner.query('UPDATE soundpub.external_identities SET verified_at=now() WHERE application_user_id=$1', [adminId]);
        checks.push('Label transfer UI 401 after identity revocation; dialog retained; no optimistic mutation');
        await owner.query("UPDATE soundpub.user_roles SET role='user' WHERE user_id=$1 AND role='admin'", [adminId]);
        await submitRole('transfer', 403);
        await adminPage.getByText('FORBIDDEN', { exact: true }).waitFor();
        assert(await adminPage.getByRole('dialog').isVisible());
        await owner.query("UPDATE soundpub.user_roles SET role='admin' WHERE user_id=$1 AND role='user'", [adminId]);
        checks.push('Label transfer UI 403 after admin authority revocation; dialog retained; no privilege leak');
        assert.equal((await owner.query('SELECT parent_label_id FROM soundpub.profiles WHERE id=$1', [artist.id])).rows[0].parent_label_id, labelId);
        await submitRole('transfer', 200);
        assert.equal((await owner.query('SELECT parent_label_id FROM soundpub.profiles WHERE id=$1', [artist.id])).rows[0].parent_label_id, otherId);
        await adminPage.reload();
        await adminPage.getByRole('row').filter({ hasText: `${name} Edited` }).filter({ hasText: 'Browser Label B' }).waitFor();
        const labelContext = await browser.newContext({ viewport, serviceWorkers: 'block' });
        try {
          await labelContext.route('**/*', (route: any) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
          await labelContext.addInitScript((id: string) => localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: id, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id, aud: 'authenticated', app_metadata: {}, user_metadata: {} } })), otherId);
          const labelPage = await labelContext.newPage();
          labelPage.on('response', (response: any) => { if (response.url().includes('/api/v1/')) requests.push({ path: new URL(response.url()).pathname, method: response.request().method(), status: response.status(), requestId: response.headers()['x-request-id'], actor: 'Label B UI' }); });
          await labelPage.goto(`${origin}/dashboard/my-artists`);
          await labelPage.getByText(`${name} Edited`, { exact: true }).waitFor();
          await labelPage.reload();
          await labelPage.getByText(`${name} Edited`, { exact: true }).waitFor();
          assert.equal((await owner.query('SELECT label_id FROM soundpub.artists WHERE artist_user_id=$1', [artist.id])).rows[0].label_id, otherId);
          checks.push('Label B detail via own roster: current transferred artist, independent membership row and persisted reload');
        } finally { await labelContext.close(); }
        await owner.query("UPDATE soundpub.user_roles SET role='user' WHERE user_id=$1 AND role='label'", [otherId]);
        await adminPage.goto(`${origin}/dashboard/artist-profile/${artist.id}`);
        await adminPage.getByRole('alert').filter({ hasText: 'Profil artis backend' }).waitFor();
        assert(requests.some(item => item.path.endsWith(`/labels/${otherId}`) && item.status === 404));
        await owner.query("UPDATE soundpub.user_roles SET role='label' WHERE user_id=$1 AND role='user'", [otherId]);
        await adminPage.getByRole('button', { name: 'Coba lagi', exact: true }).click();
        await adminPage.getByText('Label pengelola: Browser Label B', { exact: true }).waitFor();
        checks.push('Missing Label detail 404 via related Artist page; no leaked Label data; manual recovery');
        checks.push('Admin Users UI transfer; independent DB parent B; persisted row after reload');
        await openRole('Browser Label A');
        assert.equal((await api('POST', `/artists/${artist.id}/remove`, { expectedParentLabelId: otherId })).status, 200);
        await submitRole('transfer', 409);
        await adminPage.getByText('CONFLICT', { exact: true }).waitFor();
        assert(await adminPage.getByRole('dialog').isVisible());
        assert.equal((await owner.query('SELECT parent_label_id FROM soundpub.profiles WHERE id=$1', [artist.id])).rows[0].parent_label_id, null);
        checks.push('UI transfer stale after competing real detach; 409 visible CONFLICT, dialog retained, DB remains detached');
        await openRole('Browser Label A');
        await submitRole('assign', 200);
        assert.equal((await owner.query('SELECT parent_label_id FROM soundpub.profiles WHERE id=$1', [artist.id])).rows[0].parent_label_id, labelId);
        await adminPage.reload();
        await adminPage.getByRole('row').filter({ hasText: `${name} Edited` }).filter({ hasText: 'Browser Label A' }).waitFor();
        checks.push('Admin Users UI assign independent artist; DB parent A + persisted reload');
      } finally { await adminContext.close(); }
      await owner.query("UPDATE soundpub.user_roles SET role='whitelabel' WHERE user_id=$1 AND role='label'", [labelId]);
      await page.goto(`${origin}/dashboard/my-artists`);
      const detachRow = page.getByRole('row').filter({ hasText: `${name} Edited` });
      await detachRow.getByRole('button').last().click();
      await page.getByRole('menuitem', { name: 'Hapus dari Label', exact: true }).click();
      const detached = page.waitForResponse((response: any) => response.url().includes(`/artists/${artist.id}/remove`) && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Hapus dari Label', exact: true }).click();
      assert.equal((await detached).status(), 200);
      assert.equal((await owner.query('SELECT parent_label_id FROM soundpub.profiles WHERE id=$1', [artist.id])).rows[0].parent_label_id, null);
      await page.reload();
      await page.getByRole('button', { name: 'Tambah Artist' }).waitFor();
      assert.equal(await page.getByText(`${name} Edited`, { exact: true }).count(), 0);
      await page.getByText('Belum ada artist', { exact: true }).waitFor();
      await owner.query("UPDATE soundpub.user_roles SET role='label' WHERE user_id=$1 AND role='whitelabel'", [labelId]);
      checks.push('Whitelabel roster UI detach; independent DB null parent; persisted absence after reload');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      await page.screenshot({ path: resolve(output, `${device}.png`), fullPage: true });
      results.push({ device, status: overflow ? 'FAIL' : 'PASS', overflow, checks, requests, blocked });
    } catch (error) {
      results.push({ device, status: 'FAIL', error: String(error), checks, requests, blocked });
      await page.screenshot({ path: resolve(output, `${device}-failure.png`), fullPage: true }).catch(() => {});
    } finally { controlledFailure = false; labelFailure = false; labelDelay = false; await context.close(); }
  }
} catch (error) { results.push({ setupError: String(error) }); }
finally {
  await browser?.close();
  await server?.close();
  await app?.close();
  await runtime?.end();
  await owner?.end();
  if (container) { docker('rm', '--force', run); results.push({ teardown: 'Owned container removed; no persistent volumes used' }); }
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ output, results }, null, 2));
}
assert.equal(results.filter(result => result.device && result.status === 'PASS').length, process.env.PHASE3B_VIEWPORT ? 1 : 3, 'Required viewport runs must pass; see results.json');
