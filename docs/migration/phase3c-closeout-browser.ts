import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { buildApp } from '../../backend/src/api/index.js';
import { createRepositories } from '../../backend/src/db/index.js';
import { createUsersService } from '../../backend/src/users/index.js';
import { createArtistsService } from '../../backend/src/artists/index.js';
import { createLabelsService } from '../../backend/src/labels/index.js';
import { createReleasesService } from '../../backend/src/releases/index.js';
import { createTracksService } from '../../backend/src/tracks/index.js';
import { createPublicCatalogService } from '../../backend/src/public-catalog/index.js';
import { createSubmissionService } from '../../backend/src/submissions/index.js';
import { concurrencyPostgres } from '../../backend/test/support/concurrency-postgres.js';

assert.ok(process.env.PLAYWRIGHT_PACKAGE_JSON, 'Set PLAYWRIGHT_PACKAGE_JSON to installed playwright/package.json');
const { chromium } = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON)('playwright');
const output = await mkdtemp(join(tmpdir(), 'soundpub-phase3c-closeout-'));
const labelId = '00000000-0000-4000-8000-000000000301';
const artistId = '00000000-0000-4000-8000-000000000302';
const otherId = '00000000-0000-4000-8000-000000000303';
const evidence: { viewport: string; check: string; status: string; detail?: string }[] = [];
let database: Awaited<ReturnType<typeof concurrencyPostgres>> | undefined;
let app: ReturnType<typeof buildApp> | undefined;
let frontend: Awaited<ReturnType<typeof createServer>> | undefined;
let browser: any;
let databaseFailure = false;
const savedEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('VITE_')));
try {
  database = await concurrencyPostgres();
  for (const [id, role, name] of [[labelId, 'label', 'Historical browser label'], [artistId, 'artist', 'Synthetic artist'], [otherId, 'label', 'Current browser label']]) {
    await database.owner.query("INSERT INTO soundpub.backend_users(id,email,status) VALUES ($1,$2,'active')", [id, `${id}@example.invalid`]);
    await database.owner.query('INSERT INTO soundpub.profiles(id,full_name,parent_label_id) VALUES ($1,$2,$3)', [id, name, id === artistId ? labelId : null]);
    await database.owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())', [id, role]);
    await database.owner.query("INSERT INTO soundpub.external_identities(application_user_id,provider,issuer,subject,verified_at) VALUES ($1,'mock','browser-local',$2,now())", [id, id]);
  }
  await database.owner.query('INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at) VALUES ($1,$2,$3,now())', [labelId, artistId, 'Synthetic artist']);
  await database.owner.query(`CREATE FUNCTION soundpub.browser_reject_track() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.title='Browser rollback fault' THEN RAISE EXCEPTION 'Synthetic track persistence failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER browser_reject_track BEFORE INSERT OR UPDATE ON soundpub.tracks FOR EACH ROW EXECUTE FUNCTION soundpub.browser_reject_track()`);
  const principals = createRepositories(database.runtime).principals;
  const transferFixture = async (destination: string) => {
    const connection = await database!.owner.connect();
    try {
      await connection.query('BEGIN');
      await connection.query('UPDATE soundpub.artists SET label_id=$1 WHERE artist_user_id=$2', [destination, artistId]);
      await connection.query('UPDATE soundpub.profiles SET parent_label_id=$1 WHERE id=$2', [destination, artistId]);
      await connection.query('COMMIT');
    } catch (error) { await connection.query('ROLLBACK'); throw error; }
    finally { connection.release(); }
  };
  const dependencyStates = new Map<string, { cover: boolean; audio: boolean; payment: boolean; provider: boolean }>();
  const dependencies = { publicCatalog: createPublicCatalogService(database.runtime), users: createUsersService(database.runtime), artists: createArtistsService(database.runtime),
    labels: createLabelsService(database.runtime), releases: createReleasesService(database.runtime), tracks: createTracksService(database.runtime),
    submissions: createSubmissionService(database.runtime, {
      media: { check: async ({ release }) => ({ cover: dependencyStates.get(release.id)?.cover ?? false, audio: dependencyStates.get(release.id)?.audio ?? false }) },
      payment: { isReleasePaymentSatisfied: async ({ release }) => dependencyStates.get(release.id)?.payment ?? false },
      provider: { providerReady: async ({ release }) => dependencyStates.get(release.id)?.provider ?? false },
    }),
    auth: { authenticate: (token: string) => principals.findByIdentity({ issuer: 'browser-local', subject: token }) },
    readiness: { check: async () => true }, rateLimiter: { consume: async () => ({ allowed: true }) },
    admin: { suspendUser: async () => { throw new Error('Unsupported harness operation'); } }, webhooks: { receive: async () => false } };
  app = buildApp(dependencies);
  app.addHook('preHandler', async request => {
    if (databaseFailure && request.url.startsWith('/api/v1/releases')) throw new Error('Disposable acceptance failure');
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const apiOrigin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key];
  Object.assign(process.env, { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'synthetic-public', VITE_SOUNDPUB_BACKEND_DOMAINS: 'users,artists,labels,releases' });
  frontend = await createServer({ envDir: false, server: { host: '127.0.0.1', port: 0,
    proxy: { '/api': { target: apiOrigin, headers: { origin: 'http://127.0.0.1:8181' } } } } });
  await frontend.listen();
  const origin = frontend.resolvedUrls!.local[0]!.replace(/\/$/, '');
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  for (const [viewport, dimensions] of Object.entries({ mobile: { width: 390, height: 844 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1440, height: 900 } })) {
    const context = await browser.newContext({ viewport: dimensions, serviceWorkers: 'block' });
    context.setDefaultTimeout(10000);
    const external: string[] = [];
    const responses: { path: string; method: string; status: number }[] = [];
    await context.route('**/*', (route: any) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { external.push(url.pathname); return route.abort(); }
      return route.continue();
    });
    await context.addInitScript((id: string) => localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: id,
      refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id, aud: 'authenticated', email: 'browser@example.invalid', app_metadata: {}, user_metadata: {} } })), labelId);
    const page = await context.newPage();
    page.on('response', (response: any) => {
      const path = new URL(response.url()).pathname;
      if (path.startsWith('/api/')) responses.push({ path, method: response.request().method(), status: response.status() });
    });
    const check = async (name: string, action: () => Promise<void>) => {
      try { await action(); evidence.push({ viewport, check: name, status: 'PASS' }); }
      catch (error) {
        evidence.push({ viewport, check: name, status: 'FAIL', detail: error instanceof Error ? error.message : String(error) });
        await page.screenshot({ path: join(output, `${viewport}-${evidence.length}.png`), fullPage: true }).catch(() => {});
      }
    };
    const gap = (name: string, detail: string) => evidence.push({ viewport, check: name, status: 'BLOCKED', detail });
    const api = (method: string, path: string, body?: unknown, token: string | null = labelId) => page.evaluate(async (input: any) => {
      const response = await fetch(`/api/v1${input.path}`, { method: input.method,
        headers: { 'Content-Type': 'application/json', ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}) },
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }) });
      return { status: response.status, body: await response.json() };
    }, { method, path, body, token });
    let release: any;
    const title = `Closeout ${viewport}`;
    try {
      await page.goto(`${origin}/dashboard/releases/new`);
      await check('Product aggregate create', async () => {
        await page.getByLabel('Artist user ID').fill(artistId);
        await page.getByLabel('Judul', { exact: true }).fill(title);
        await page.getByLabel('Artist', { exact: true }).fill('Synthetic artist');
        await page.getByLabel('Genre', { exact: true }).fill('Pop');
        await page.getByLabel('Tanggal rilis', { exact: true }).fill('2026-11-01');
        await page.getByLabel('Judul track').fill(`Initial track ${viewport}`);
        await page.getByLabel('Artist track').fill('Synthetic artist');
        await page.getByRole('button', { name: /Tambah track/i }).click();
        const created = page.waitForResponse((response: any) => /\/api\/v1\/releases(?:\/aggregate)?$/.test(response.url()) && response.request().method() === 'POST');
        await page.getByRole('button', { name: /Simpan.*release/i }).click();
        const response = await created;
        assert.equal(response.status(), 200, await response.text());
        const body = await response.json();
        release = body.release ?? body;
        await page.getByRole('heading', { name: /Edit Release/ }).waitFor();
        const count = (await database!.owner.query('SELECT count(*)::int AS n FROM soundpub.tracks WHERE release_id=$1', [release.id])).rows[0].n;
        assert.ok(count > 0, 'Product create persisted zero initial tracks; aggregate UI missing');
        assert.ok(response.url().endsWith('/aggregate'), 'Product did not use aggregate endpoint');
      });
      if (release) {
        await check('Product aggregate edit and persisted reload', async () => {
          await page.getByLabel('Judul', { exact: true }).fill(`${title} edited`);
          await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
          await page.getByLabel('Judul track').fill(`Initial edited ${viewport}`);
          await page.getByRole('button', { name: /Simpan track|Simpan perubahan track|Perbarui track/i }).click();
          const saved = page.waitForResponse((response: any) => response.url().endsWith(`/releases/${release.id}/aggregate`) && response.request().method() === 'PATCH');
          await page.getByRole('button', { name: /Simpan.*release/i }).click();
          assert.equal((await saved).status(), 200);
          await page.reload();
          await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled && Boolean(document.querySelector('fieldset')));
          await page.getByLabel('Judul', { exact: true }).inputValue().then((value: string) => assert.equal(value, `${title} edited`));
          assert.equal((await database!.owner.query('SELECT title FROM soundpub.releases WHERE id=$1', [release.id])).rows[0].title, `${title} edited`);
          assert.equal((await database!.owner.query('SELECT title FROM soundpub.tracks WHERE release_id=$1 ORDER BY position', [release.id])).rows[0].title, `Initial edited ${viewport}`);
        });
        await check('Product staged track create/edit/remove and reload', async () => {
          const saveAggregate = async () => {
            const saved = page.waitForResponse((response: any) => response.url().endsWith(`/releases/${release.id}/aggregate`) && response.request().method() === 'PATCH');
            await page.getByRole('button', { name: /Simpan.*release/i }).click();
            assert.equal((await saved).status(), 200);
            await page.reload();
            await page.waitForFunction(() => Boolean(document.querySelector('fieldset')) && !document.querySelector('fieldset')?.disabled);
          };
          await page.getByLabel('Judul track').fill(`Track ${viewport}`);
          await page.getByLabel('Artist track').fill('Synthetic artist');
          await page.getByRole('button', { name: /Tambah track/i }).click();
          assert.equal((await database!.owner.query('SELECT count(*)::int AS n FROM soundpub.tracks WHERE release_id=$1', [release.id])).rows[0].n, 1);
          await saveAggregate();
          await page.getByText(`Track ${viewport}`, { exact: false }).first().waitFor();
          await page.getByRole('button', { name: 'Edit', exact: true }).last().click();
          await page.getByLabel('Judul track').fill(`Edited track ${viewport}`);
          await page.getByRole('button', { name: /Simpan track|Simpan perubahan track|Perbarui track/i }).click();
          await saveAggregate();
          await page.getByText(`Edited track ${viewport}`, { exact: false }).first().waitFor();
          await page.getByRole('button', { name: 'Naik', exact: true }).last().click();
          await saveAggregate();
          assert.equal((await database!.owner.query('SELECT title FROM soundpub.tracks WHERE release_id=$1 ORDER BY position', [release.id])).rows[0].title, `Edited track ${viewport}`);
          await page.getByRole('button', { name: 'Hapus', exact: true }).first().click();
          await saveAggregate();
          assert.equal((await database!.owner.query('SELECT count(*)::int AS n FROM soundpub.tracks WHERE release_id=$1', [release.id])).rows[0].n, 1);
        });
        for (const [status, category, prepare, restore] of [
          [400, 'VALIDATION_ERROR', async () => { await page.getByLabel('Judul', { exact: true }).fill('   '); }, async () => {}],
          [401, 'UNAUTHENTICATED', async () => { await database!.owner.query('UPDATE soundpub.external_identities SET verified_at=NULL WHERE application_user_id=$1', [labelId]); }, async () => { await database!.owner.query('UPDATE soundpub.external_identities SET verified_at=now() WHERE application_user_id=$1', [labelId]); }],
          [403, 'FORBIDDEN', async () => { await database!.owner.query("DELETE FROM soundpub.user_roles WHERE user_id=$1 AND role='label'", [labelId]); }, async () => { await database!.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'label',now())", [labelId]); }],
          [409, 'CONFLICT', async () => { const current = await api('GET', `/releases/${release.id}`); assert.equal((await api('PATCH', `/releases/${release.id}`, { version: current.body.version, genre: 'Pop' })).status, 200); }, async () => {}],
          [500, 'INTERNAL_ERROR', async () => { databaseFailure = true; }, async () => { databaseFailure = false; }],
        ] as const) {
          await check(`Product ${status} edit error and recovery`, async () => {
            await page.goto(`${origin}/dashboard/releases/${release.id}/edit`);
            await page.getByLabel('Judul', { exact: true }).waitFor();
            await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
            try {
              await prepare();
              const denied = page.waitForResponse((response: any) => response.url().includes(`/releases/${release.id}`) && response.request().method() === 'PATCH');
              await page.getByRole('button', { name: /Simpan.*release/i }).click();
              assert.equal((await denied).status(), status);
              await page.getByRole('alert').filter({ hasText: category }).waitFor();
              assert.ok(await page.getByLabel('Judul', { exact: true }).isVisible());
            } finally { await restore(); }
            await page.reload();
            await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
          });
        }
        await check('Product network failure and recovery', async () => {
          const pattern = `**/api/v1/releases/${release.id}/aggregate`;
          await context.route(pattern, (route: any) => route.request().method() === 'PATCH' ? route.abort('connectionfailed') : route.continue());
          try {
            await page.getByRole('button', { name: /Simpan.*release/i }).click();
            await page.getByRole('alert').filter({ hasText: 'TEMPORARY_FAILURE' }).waitFor();
          } finally { await context.unroute(pattern); }
          await page.reload();
          await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
        });
        for (const [status, category] of [[400, 'VALIDATION_ERROR'], [409, 'CONFLICT'], [403, 'FORBIDDEN']] as const) {
          await check(`Product staged Track ${status} error; persisted row safe`, async () => {
            await page.goto(`${origin}/dashboard/releases/${release.id}/edit`);
            await page.waitForFunction(() => Boolean(document.querySelector('fieldset')) && !document.querySelector('fieldset')?.disabled);
            await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
            await page.getByLabel('Judul track').fill(status === 400 ? '   ' : 'Must not persist');
            await page.getByRole('button', { name: 'Perbarui track', exact: true }).click();
            if (status === 409) await database!.owner.query("UPDATE soundpub.tracks SET lyrics='Concurrent fixture' WHERE release_id=$1", [release.id]);
            if (status === 403) await database!.owner.query("DELETE FROM soundpub.user_roles WHERE user_id=$1 AND role='label'", [labelId]);
            try {
              const denied = page.waitForResponse((response: any) => response.url().endsWith(`/releases/${release.id}/aggregate`) && response.request().method() === 'PATCH');
              await page.getByRole('button', { name: /Simpan.*release/i }).click();
              assert.equal((await denied).status(), status);
              await page.getByRole('alert').filter({ hasText: category }).waitFor();
              assert.equal((await database!.owner.query('SELECT title FROM soundpub.tracks WHERE release_id=$1 ORDER BY position', [release.id])).rows[0].title, `Initial edited ${viewport}`);
            } finally {
              if (status === 403) await database!.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'label',now())", [labelId]);
            }
            await page.reload();
            await page.waitForFunction(() => Boolean(document.querySelector('fieldset')) && !document.querySelector('fieldset')?.disabled);
          });
        }
        await check('Product list and detail', async () => {
          for (const path of [`/dashboard/releases/${release.id}`, '/dashboard/releases']) {
            await page.goto(origin + path);
            await page.getByText(`${title} edited`, { exact: false }).filter({ visible: true }).first().waitFor();
          }
        });
        await check('Browser fetch readiness contract (API evidence only)', async () => {
          const result = await api('GET', `/releases/${release.id}/submission-readiness`);
          assert.equal(result.status, 200);
          assert.equal(result.body.ready, false);
          assert.ok(Array.isArray(result.body.blockers) && result.body.blockers.length > 0);
          await page.goto(`${origin}/dashboard/releases/${release.id}/edit`);
          await page.getByRole('region', { name: 'Kesiapan pengajuan' }).waitFor();
          for (const blocker of result.body.blockers) await page.getByText(`${blocker.code} (${blocker.owner})`, { exact: true }).waitFor();
          assert.ok(await page.getByRole('button', { name: 'Ajukan release', exact: true }).isDisabled());
          const denied = await api('POST', `/releases/${release.id}/submit`, { version: result.body.version });
          assert.equal(denied.status, 409);
          assert.equal(denied.body.error.code, 'SUBMISSION_BLOCKED');
        });
      }
      await check('Browser fetch aggregate create/edit/rollback/stale (API evidence only)', async () => {
        const created = await api('POST', '/releases/aggregate', { artist_user_id: artistId, title: `Aggregate ${viewport}`, artist_name: 'Synthetic artist', release_type: 'ep', tracks: [{ title: 'First', artist_name: 'Synthetic artist' }, { title: 'Second', artist_name: 'Synthetic artist' }] });
        assert.equal(created.status, 200, JSON.stringify(created.body));
        const initial = created.body;
        assert.equal(initial.tracks.length, 2);
        const edited = await api('PATCH', `/releases/${initial.release.id}/aggregate`, { version: initial.release.version, title: 'Aggregate edited', tracks: [{ ...Object.fromEntries(['id', 'version', 'title', 'artist_name'].map(key => [key, initial.tracks[1][key]])) }, { title: 'New', artist_name: 'Synthetic artist' }] });
        assert.equal(edited.status, 200, JSON.stringify(edited.body));
        assert.equal(edited.body.tracks.length, 2);
        assert.equal(edited.body.tracks[0].id, initial.tracks[1].id);
        const invalid = await api('PATCH', `/releases/${initial.release.id}/aggregate`, { version: edited.body.release.version, title: 'Must rollback', tracks: [{ title: '', artist_name: 'Synthetic artist' }] });
        assert.equal(invalid.status, 400);
        assert.equal((await api('GET', `/releases/${initial.release.id}`)).body.title, 'Aggregate edited');
        assert.equal((await api('PATCH', `/releases/${initial.release.id}/aggregate`, { version: initial.release.version, tracks: [] })).status, 409);
        assert.equal((await database!.owner.query('SELECT count(*)::int AS n FROM soundpub.tracks WHERE release_id=$1', [initial.release.id])).rows[0].n, 2);
        const before = (await database!.owner.query('SELECT count(*)::int AS n FROM soundpub.releases')).rows[0].n;
        const failedCreate = await api('POST', '/releases/aggregate', { artist_user_id: artistId, title: 'Rollback create', artist_name: 'Synthetic artist', release_type: 'ep', tracks: [{ title: 'Valid before fault', artist_name: 'Synthetic artist' }, { title: 'Browser rollback fault', artist_name: 'Synthetic artist' }] });
        assert.equal(failedCreate.status, 500);
        assert.equal((await database!.owner.query('SELECT count(*)::int AS n FROM soundpub.releases')).rows[0].n, before);
        const failedEdit = await api('PATCH', `/releases/${initial.release.id}/aggregate`, { version: edited.body.release.version, title: 'Rollback edit', tracks: [{ title: 'Browser rollback fault', artist_name: 'Synthetic artist' }] });
        assert.equal(failedEdit.status, 500);
        assert.equal((await api('GET', `/releases/${initial.release.id}`)).body.title, 'Aggregate edited');
        assert.equal((await database!.owner.query('SELECT count(*)::int AS n FROM soundpub.tracks WHERE release_id=$1', [initial.release.id])).rows[0].n, 2);
        const concurrent = await Promise.all(['Concurrent A', 'Concurrent B'].map(nextTitle => api('PATCH', `/releases/${initial.release.id}/aggregate`, { version: edited.body.release.version, title: nextTitle, tracks: edited.body.tracks.map((track: any) => ({ id: track.id, version: track.version, title: track.title, artist_name: track.artist_name })) })));
        assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 409]);
      });
      await check('Product missing release error', async () => {
        await page.goto(`${origin}/dashboard/releases/00000000-0000-4000-8000-000000000999/edit`);
        await page.getByRole('alert').filter({ hasText: 'NOT_FOUND' }).waitFor();
        assert.ok(responses.some(response => response.status === 404));
      });
      await check('Public catalog browser fetch visibility/allowlist (API evidence only)', async () => {
        assert.ok(release, 'Release fixture unavailable');
        assert.equal((await api('GET', `/public/releases/${release.id}`, undefined, null)).status, 404);
        await database!.owner.query("UPDATE soundpub.releases SET status='active' WHERE id=$1", [release.id]);
        try {
          const listed = await api('GET', `/public/releases?search=${encodeURIComponent(title)}`, undefined, null);
          assert.equal(listed.status, 200);
          assert.ok(listed.body.data.some((row: any) => row.id === release.id));
          const detail = await api('GET', `/public/releases/${release.id}`, undefined, null);
          assert.equal(detail.status, 200);
          assert.deepEqual(Object.keys(detail.body).sort(), ['id', 'title', 'artist_name', 'genre', 'release_type', 'release_date', 'upc', 'cover_url', 'label', 'tracks'].sort());
          await page.goto(`${origin}/catalog`);
          await page.getByRole('heading', { name: `${title} edited`, exact: true }).waitFor();
          await page.getByRole('button', { name: 'Lihat detail', exact: true }).click();
          const detailRegion = page.getByRole('region', { name: 'Detail rilisan publik' });
          await detailRegion.getByRole('heading', { name: `${title} edited`, exact: true }).waitFor();
          await detailRegion.getByText(`Initial edited ${viewport}`, { exact: false }).waitFor();
          await database!.owner.query('UPDATE soundpub.releases SET archived_at=now() WHERE id=$1', [release.id]);
          assert.equal((await api('GET', `/public/releases/${release.id}`, undefined, null)).status, 404);
          const refreshed = page.waitForResponse((response: any) => response.url().includes('/api/v1/public/releases') && response.request().method() === 'GET');
          await page.reload();
          assert.equal((await refreshed).status(), 200);
          assert.equal(await page.getByRole('heading', { name: `${title} edited`, exact: true }).count(), 0);
        } finally { await database!.owner.query("UPDATE soundpub.releases SET status='draft',archived_at=NULL WHERE id=$1", [release.id]); }
      });
      await check('Loaded product edit after management transfer; historical display', async () => {
        assert.ok(release, 'Release fixture unavailable');
        await page.goto(`${origin}/dashboard/releases/${release.id}/edit`);
        await page.waitForFunction(() => Boolean(document.querySelector('fieldset')) && !document.querySelector('fieldset')?.disabled);
        await page.getByLabel('Judul', { exact: true }).fill('Unauthorized transferred edit');
        await transferFixture(otherId);
        try {
          const denied = page.waitForResponse((response: any) => response.url().includes(`/releases/${release.id}`) && response.request().method() === 'PATCH');
          await page.getByRole('button', { name: /Simpan.*release/i }).click();
          assert.equal((await denied).status(), 404);
          await page.getByRole('alert').filter({ hasText: 'NOT_FOUND' }).waitFor();
          assert.equal((await database!.owner.query('SELECT title,label_id FROM soundpub.releases WHERE id=$1', [release.id])).rows[0].label_id, labelId);
          assert.notEqual((await database!.owner.query('SELECT title FROM soundpub.releases WHERE id=$1', [release.id])).rows[0].title, 'Unauthorized transferred edit');
          await context.addInitScript((id: string) => {
            const session = JSON.parse(localStorage.getItem('sb-127-auth-token')!);
            session.access_token = id; session.user.id = id;
            localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
          }, artistId);
          await page.goto(`${origin}/dashboard/releases/${release.id}`);
          await page.getByText('Historical browser label', { exact: true }).filter({ visible: true }).first().waitFor();
          const current = await api('GET', `/releases/${release.id}`, undefined, otherId);
          assert.equal(current.status, 200);
          assert.equal(current.body.label_id, labelId);
          assert.equal(current.body.label_name, 'Historical browser label');
        } finally {
          await transferFixture(labelId);
        }
      });
      await check('Synthetic media/payment/provider blockers and satisfied product submission', async () => {
        assert.ok(release, 'Release fixture unavailable');
        for (const [state, expected] of [
          [{ cover: false, audio: false, payment: true, provider: true }, ['COVER_REQUIRED', 'AUDIO_REQUIRED']],
          [{ cover: true, audio: true, payment: false, provider: true }, ['PAYMENT_REQUIRED']],
          [{ cover: true, audio: true, payment: true, provider: false }, ['PROVIDER_METADATA_REQUIRED']],
        ] as const) {
          dependencyStates.set(release.id, state);
          const readiness = await api('GET', `/releases/${release.id}/submission-readiness`);
          assert.equal(readiness.status, 200);
          assert.deepEqual(readiness.body.blockers.map((blocker: any) => blocker.code).sort(), [...expected].sort());
          await page.goto(`${origin}/dashboard/releases/${release.id}/edit`);
          for (const code of expected) await page.getByText(code, { exact: false }).first().waitFor();
          assert.ok(await page.getByRole('button', { name: 'Ajukan release', exact: true }).isDisabled());
          const denied = await api('POST', `/releases/${release.id}/submit`, { version: readiness.body.version });
          assert.equal(denied.status, 409);
          assert.equal(denied.body.error.code, 'SUBMISSION_BLOCKED');
          assert.equal((await database!.owner.query('SELECT status FROM soundpub.releases WHERE id=$1', [release.id])).rows[0].status, 'draft');
        }
        dependencyStates.set(release.id, { cover: true, audio: true, payment: true, provider: true });
        await page.goto(`${origin}/dashboard/releases/${release.id}/edit`);
        await page.getByText('Siap diajukan', { exact: true }).waitFor();
        const submitted = page.waitForResponse((response: any) => response.url().endsWith(`/releases/${release.id}/submit`) && response.request().method() === 'POST');
        await page.getByRole('button', { name: 'Ajukan release', exact: true }).click();
        assert.equal((await submitted).status(), 200);
        assert.equal((await database!.owner.query('SELECT status FROM soundpub.releases WHERE id=$1', [release.id])).rows[0].status, 'pending');
        await page.reload();
        await page.getByText('RELEASE_STATE_INVALID', { exact: false }).first().waitFor();
      });
      await check('No direct legacy release/track business requests', async () => {
        assert.deepEqual(external.filter(path => /\/rest\/v1\/(releases|tracks)(?:$|[/?])|\/rpc\/|\/functions\/v1\/(get-catalog-tracks|create-xendit-invoice|delete-release)/.test(path)), []);
      });
    } finally {
      await writeFile(join(output, `${viewport}-requests.json`), JSON.stringify({ responses, blockedExternalPaths: external }, null, 2));
      await context.close();
    }
  }
} catch (error) {
  evidence.push({ viewport: 'environment', check: 'Stack execution', status: 'FAIL', detail: error instanceof Error ? error.message : String(error) });
} finally {
  await browser?.close();
  await frontend?.close();
  await app?.close();
  await database?.close();
  for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key];
  Object.assign(process.env, savedEnv);
  const status = evidence.some(row => row.status === 'FAIL') ? 'FAILED' : evidence.some(row => row.status === 'BLOCKED') ? 'BLOCKED' : 'PASS';
  await writeFile(join(output, 'results.json'), JSON.stringify({ status, executedAt: new Date().toISOString(), auth: 'Synthetic local identity binding; real domain API and disposable PostgreSQL; no API response mocks', evidence }, null, 2));
  console.log(JSON.stringify({ status, output, evidence }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
