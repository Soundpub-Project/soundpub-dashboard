import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { buildApp } from '../../backend/src/api/index.js';
import { createRepositories } from '../../backend/src/db/index.js';
import { createUsersService } from '../../backend/src/users/index.js';
import { createArtistsService } from '../../backend/src/artists/index.js';
import { createLabelsService } from '../../backend/src/labels/index.js';
import { createReleasesService } from '../../backend/src/releases/index.js';
import { createTracksService } from '../../backend/src/tracks/index.js';
import { concurrencyPostgres } from '../../backend/test/support/concurrency-postgres.js';

assert.ok(process.env.PLAYWRIGHT_PACKAGE_JSON, 'Set PLAYWRIGHT_PACKAGE_JSON to cached Playwright package.json');
const { chromium } = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON)('playwright');
const labelId = '00000000-0000-4000-8000-000000000201';
const artistId = '00000000-0000-4000-8000-000000000202';
const database = await concurrencyPostgres();
let app: ReturnType<typeof buildApp> | undefined;
let frontend: Awaited<ReturnType<typeof createServer>> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const results: { viewport: string; checks: string[]; external: string[]; responses: number[] }[] = [];
try {
  for (const [id, role] of [[labelId, 'label'], [artistId, 'artist']]) {
    await database.owner.query("INSERT INTO soundpub.backend_users(id,email,status) VALUES ($1,$2,'active')", [id, `${role}@example.invalid`]);
    await database.owner.query('INSERT INTO soundpub.profiles(id,full_name,parent_label_id) VALUES ($1,$2,$3)', [id, `Synthetic ${role}`, id === artistId ? labelId : null]);
    await database.owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())', [id, role]);
    await database.owner.query("INSERT INTO soundpub.external_identities(application_user_id,provider,issuer,subject,verified_at) VALUES ($1,'mock','browser-local',$2,now())", [id, id]);
  }
  await database.owner.query('INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at) VALUES ($1,$2,$3,now())', [labelId, artistId, 'Synthetic artist']);
  const principals = createRepositories(database.runtime).principals;
  app = buildApp({ users: createUsersService(database.runtime), artists: createArtistsService(database.runtime),
    labels: createLabelsService(database.runtime), releases: createReleasesService(database.runtime), tracks: createTracksService(database.runtime),
    auth: { authenticate: token => principals.findByIdentity({ issuer: 'browser-local', subject: token }) },
    readiness: { check: async () => true }, rateLimiter: { consume: async () => ({ allowed: true }) },
    admin: { suspendUser: async () => {} }, webhooks: { receive: async () => false } });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const apiOrigin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key];
  Object.assign(process.env, { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'synthetic-public',
    VITE_SOUNDPUB_BACKEND_DOMAINS: 'users,artists,labels,releases' });
  frontend = await createServer({ envDir: false, server: { host: '127.0.0.1', port: 0,
    proxy: { '/api': { target: apiOrigin, headers: { origin: 'http://127.0.0.1:8181' } } } } });
  await frontend.listen();
  const origin = frontend.resolvedUrls!.local[0]!.replace(/\/$/, '');
  browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  for (const [viewport, dimensions] of Object.entries({ mobile: { width: 390, height: 844 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1440, height: 900 } })) {
    const context = await browser.newContext({ viewport: dimensions, serviceWorkers: 'block' });
    const external: string[] = [], checks: string[] = [], responses: number[] = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { external.push(url.origin + url.pathname); return route.abort(); }
      return route.continue();
    });
    await context.addInitScript((id: string) => localStorage.setItem('sb-127-auth-token', JSON.stringify({
      access_token: id, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id, aud: 'authenticated', email: 'label@example.invalid', app_metadata: {}, user_metadata: {} },
    })), labelId);
    const page = await context.newPage();
    page.on('response', response => { if (response.url().includes('/api/v1/releases') || response.url().includes('/api/v1/tracks')) responses.push(response.status()); });
    try {
      await page.goto(`${origin}/dashboard/releases/new`);
      await page.getByText('Tambah Release', { exact: false }).first().waitFor();
      await page.getByLabel('Artist user ID').fill(artistId);
      await page.getByLabel('Judul', { exact: true }).fill(`Browser ${viewport}`);
      await page.getByLabel('Artist', { exact: true }).fill('Synthetic artist');
      const createdResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/releases') && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Simpan metadata release' }).click();
      const created = await createdResponse;
      assert.equal(created.status(), 200, await created.text());
      const release = await created.json();
      assert.equal((await database.owner.query('SELECT title FROM soundpub.releases WHERE id=$1', [release.id])).rows[0].title, `Browser ${viewport}`);
      await page.getByRole('heading', { name: 'Edit Release' }).waitFor();
      checks.push('draft create, API persisted');
      await page.getByLabel('Judul track').fill(`Track ${viewport}`);
      await page.getByLabel('Artist track').fill('Synthetic artist');
      const trackResponse = page.waitForResponse(response => response.url().endsWith(`/api/v1/releases/${release.id}/tracks`) && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Tambah track' }).click();
      assert.equal((await trackResponse).status(), 200);
      assert.equal((await database.owner.query('SELECT count(*)::int AS n FROM soundpub.tracks WHERE release_id=$1', [release.id])).rows[0].n, 1);
      await page.reload();
      await page.getByText(`Track ${viewport}`, { exact: false }).first().waitFor();
      checks.push('track persisted reload');
      const deletedResponse = page.waitForResponse(response => response.url().includes('/api/v1/tracks/') && response.request().method() === 'DELETE');
      await page.getByRole('button', { name: 'Hapus' }).click();
      assert.equal((await deletedResponse).status(), 200);
      assert.equal((await database.owner.query('SELECT count(*)::int AS n FROM soundpub.tracks WHERE release_id=$1', [release.id])).rows[0].n, 0);
      checks.push('track delete and database persistence');
      await page.goto(`${origin}/dashboard/releases/${release.id}`);
      await page.getByText(`Browser ${viewport}`, { exact: false }).filter({ visible: true }).first().waitFor();
      await page.goto(`${origin}/dashboard/releases`);
      await page.getByText(`Browser ${viewport}`, { exact: false }).filter({ visible: true }).first().waitFor();
      checks.push('release detail/list');
      assert.ok(responses.every(status => status === 200), JSON.stringify(responses));
      assert.ok(external.every(url => !url.includes('/rest/v1/releases') && !url.includes('/rest/v1/tracks') && !url.includes('/rpc/delete_release_with_refund') && !url.includes('/rpc/is_soundpub_artist_for_release')), JSON.stringify(external));
    } finally {
      results.push({ viewport, checks, external, responses });
      await context.close();
    }
  }
  console.log(JSON.stringify(results.map(({ viewport, checks, responses }) => ({ viewport, checks, apiResponses: responses.length })), null, 2));
} finally {
  await browser?.close();
  await frontend?.close();
  await app?.close();
  await database.close();
}
