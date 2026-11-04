import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { createPool, createRepositories, migrate } from '../../../backend/src/db/index.js';
import { buildApp } from '../../../backend/src/api/index.js';
import { MockIdentityProvider, createIdentityAuthenticator } from '../../../backend/src/auth/providers.js';
import { createUsersService } from '../../../backend/src/users/index.js';

const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON!);
const { chromium } = require('playwright');
const output = resolve('docs/migration/qa-agent-e/artifacts/live');
await mkdir(output, { recursive: true });
const name = `soundpub-agent-e-${randomUUID()}`;
const password = randomBytes(24).toString('hex');
const evidence: any = { started: new Date().toISOString(), container: name, checks: [], requests: [], responses: [], cleanup: {} };
const docker = (...args: string[]) => {
  const result = spawnSync('docker', args, { encoding: 'utf8', env: { ...process.env, POSTGRES_PASSWORD: password } });
  if (result.status !== 0) throw new Error(`docker ${args[0]}: ${result.stderr}`);
  return result.stdout.trim();
};
let owner: any, runtime: any, app: any, vite: any, browser: any, created = false;
const actor = '11111111-1111-4111-8111-111111111111';
const target = '22222222-2222-4222-8222-222222222222';
try {
  docker('run', '-d', '--name', name, '--label', 'soundpub.qa.owner=agent-e', '--network', 'bridge', '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB=soundpub_test_users_agent_e', 'postgres:17-alpine');
  created = true;
  const inspect = JSON.parse(docker('inspect', name))[0];
  assert.equal(inspect.Config.Labels['soundpub.qa.owner'], 'agent-e');
  const port = inspect.NetworkSettings.Ports['5432/tcp'][0];
  assert.equal(port.HostIp, '127.0.0.1');
  evidence.database = { host: port.HostIp, port: port.HostPort, name: 'soundpub_test_users_agent_e', image: inspect.Config.Image, persistentVolume: false };
  const connectionString = `postgresql://postgres:${password}@127.0.0.1:${port.HostPort}/soundpub_test_users_agent_e`;
  owner = createPool({ connectionString });
  for (let attempt = 0; ; attempt++) {
    try { await owner.query('SELECT 1'); break; } catch (error) { if (attempt > 40) throw error; await new Promise(done => setTimeout(done, 500)); }
  }
  await owner.query('CREATE ROLE soundpub_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE');
  await owner.query('CREATE ROLE soundpub_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE');
  evidence.migrations = await migrate(owner);
  const ids = [actor, target, ...Array.from({ length: 103 }, () => randomUUID())];
  for (const [index, id] of ids.entries()) {
    await owner.query("INSERT INTO soundpub.backend_users(id,email,status,email_verified_at) VALUES ($1,$2,'active',now())", [id, `live-${index}@example.invalid`]);
    await owner.query('INSERT INTO soundpub.profiles(id,full_name,password_set) VALUES ($1,$2,true)', [id, index === 0 ? 'Live QA Admin' : index === 1 ? 'Live QA Target' : `Pagination ${index}`]);
    await owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())', [id, index === 0 ? 'superadmin' : 'user']);
  }
  for (const [id, subject] of [[actor, 'admin'], [target, 'target']]) await owner.query("INSERT INTO soundpub.external_identities(application_user_id,provider,issuer,subject,verified_at) VALUES ($1,'mock','agent-e-live',$2,now())", [id, subject]);
  runtime = createPool({ connectionString, options: '-c role=soundpub_app -c search_path=soundpub,public' });
  evidence.runtimeRole = (await runtime.query('SELECT current_user')).rows[0].current_user;
  assert.equal(evidence.runtimeRole, 'soundpub_app');
  const service = createUsersService(runtime);
  app = buildApp({ users: service, auth: createIdentityAuthenticator(new MockIdentityProvider('test', JSON.stringify({ 'live-admin-token': { issuer: 'agent-e-live', subject: 'admin' }, 'live-target-token': { issuer: 'agent-e-live', subject: 'target' } })), createRepositories(runtime).principals), readiness: { check: async () => true }, rateLimiter: { consume: async () => ({ allowed: true }) }, admin: { suspendUser: async input => { await service.setStatus(input.actor, input.userId, { status: 'suspended' }, input.requestId, input.reason); } }, webhooks: { receive: async () => false } });
  app.addHook('onRequest', async request => { evidence.requests.push({ method: request.method, path: request.url, bearer: request.headers.authorization === 'Bearer live-admin-token' ? 'synthetic-admin' : request.headers.authorization === 'Bearer live-target-token' ? 'synthetic-target' : request.headers.authorization ? 'invalid' : 'missing' }); });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const backendOrigin = `http://127.0.0.1:${app.server.address().port}`;
  for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key];
  Object.assign(process.env, { NODE_ENV: 'development', VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'synthetic-public-key', VITE_SOUNDPUB_BACKEND_DOMAINS: 'users' });
  vite = await createServer({ envDir: false, server: { host: '127.0.0.1', port: 8181, strictPort: true, proxy: { '/api': { target: backendOrigin, changeOrigin: false } } } });
  await vite.listen();
  evidence.routing = { browser: 'http://127.0.0.1:8181', backend: backendOrigin, proxy: '/api', override: 'Only target port changed to owned ephemeral backend; real repository Vite config loaded.' };
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === evidence.routing.browser ? route.continue() : route.abort());
  await context.addInitScript(({ actor }) => { localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'live-admin-token', refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: actor, email: 'live-0@example.invalid', aud: 'authenticated', app_metadata: {}, user_metadata: {} } })); }, { actor });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('response', async response => { if (new URL(response.url()).pathname.startsWith('/api/')) evidence.responses.push({ path: new URL(response.url()).pathname + new URL(response.url()).search, status: response.status() }); });
  await page.goto(evidence.routing.browser + '/dashboard/users');
  await page.getByText('105 dari 105 users', { exact: true }).waitFor();
  const listRequests = evidence.requests.filter((request: any) => request.path.startsWith('/api/v1/admin/users?'));
  assert.equal(listRequests.length, 2);
  assert(listRequests[1].path.includes('cursor='));
  const rows = await page.getByRole('row').count();
  assert.equal(rows, 106);
  evidence.checks.push({ check: 'Users browser pagination through Vite and real DB', result: 'PASS', users: 105, renderedRows: rows - 1, requests: listRequests });
  await page.screenshot({ path: resolve(output, 'desktop-users-pagination.png') });
  await page.getByPlaceholder('Cari nama atau email...').fill('live-1@example.invalid');
  const row = page.getByRole('row').filter({ hasText: 'live-1@example.invalid' });
  await row.getByRole('button').last().click();
  await page.getByRole('menuitem', { name: 'Ubah Status' }).click();
  await page.getByRole('dialog').getByRole('combobox').click();
  await page.getByRole('option', { name: 'Inactive', exact: true }).click();
  await page.getByRole('button', { name: 'Simpan Status', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal((await owner.query('SELECT status FROM soundpub.backend_users WHERE id=$1', [target])).rows[0].status, 'inactive');
  await row.getByText(/^inactive$/i).waitFor();
  evidence.checks.push({ check: 'Browser status update persisted and list refreshed', result: 'PASS' });
  const probe = async (path: string, token?: string, method = 'GET', body?: object) => page.evaluate(async ({ path, token, method, body }) => { const response = await fetch(path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: response.status, body: await response.json() }; }, { path, token, method, body });
  assert.equal((await probe('/api/v1/me', 'live-target-token')).status, 403);
  assert.equal((await probe(`/api/v1/admin/users/${target}/status`, 'live-admin-token', 'PATCH', { status: 'active' })).status, 200);
  await page.reload();
  await page.getByPlaceholder('Cari nama atau email...').fill('live-1@example.invalid');
  await row.getByRole('button').last().click();
  await page.getByRole('menuitem', { name: 'Ubah Role' }).click();
  await page.getByRole('dialog').getByRole('combobox').first().click();
  await page.getByRole('option', { name: /Admin.*Akses penuh/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Simpan/ }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.deepEqual((await owner.query('SELECT role FROM soundpub.user_roles WHERE user_id=$1', [target])).rows.map((item: any) => item.role), ['admin']);
  assert.deepEqual((await probe('/api/v1/me', 'live-target-token')).body.roles, ['admin']);
  evidence.checks.push({ check: 'Browser role change persisted and target current principal immediately updated', result: 'PASS' });
  await page.screenshot({ path: resolve(output, 'desktop-users-role-persisted.png') });
  await page.goto(evidence.routing.browser + '/dashboard/settings');
  await page.locator('#full_name').fill('Live Persisted Profile');
  await page.getByRole('button', { name: 'Simpan Perubahan', exact: true }).click();
  await page.getByText('Profil berhasil diperbarui', { exact: true }).waitFor();
  assert.equal((await owner.query('SELECT full_name FROM soundpub.profiles WHERE id=$1', [actor])).rows[0].full_name, 'Live Persisted Profile');
  await page.reload();
  await page.locator('#full_name').waitFor();
  assert.equal(await page.locator('#full_name').inputValue(), 'Live Persisted Profile');
  evidence.checks.push({ check: 'Profile browser edit persisted in PostgreSQL and survived reload', result: 'PASS' });
  await page.screenshot({ path: resolve(output, 'desktop-profile-persisted.png'), fullPage: true });
  for (const [label, token, path, expected] of [['missing bearer', undefined, '/api/v1/me', 401], ['invalid bearer', 'invalid-token', '/api/v1/me', 401], ['active target', 'live-target-token', '/api/v1/me', 200]] as const) { const response = await probe(path, token); assert.equal(response.status, expected); evidence.checks.push({ check: label, result: 'PASS', path, status: response.status }); }
  assert.equal((await probe(`/api/v1/admin/users/${target}/roles`, 'live-admin-token', 'PUT', { roles: ['user'] })).status, 200);
  assert.equal((await probe('/api/v1/admin/users', 'live-target-token')).status, 403);
  assert.deepEqual((await probe('/api/v1/me', 'live-target-token')).body.roles, ['user']);
  evidence.checks.push({ check: 'Role removal immediately denies admin access with same target token', result: 'PASS', status: 403 });
  evidence.audit = (await owner.query('SELECT action,count(*)::int AS count FROM soundpub.audit_logs GROUP BY action ORDER BY action')).rows;
  evidence.status = 'PASS';
} catch (error) { evidence.status = 'BLOCKED'; evidence.error = error instanceof Error ? error.stack : String(error); process.exitCode = 1; }
finally {
  for (const [key, action] of [['browser', () => browser?.close()], ['vite', () => vite?.close()], ['backend', () => app?.close()], ['runtimePool', () => runtime?.end()], ['ownerPool', () => owner?.end()]] as const) { try { await action(); evidence.cleanup[key] = 'closed'; } catch (error) { evidence.cleanup[key] = String(error); } }
  if (created) { try { const own = JSON.parse(docker('inspect', name))[0]; assert.equal(own.Config.Labels['soundpub.qa.owner'], 'agent-e'); docker('rm', '-f', '-v', name); evidence.cleanup.container = 'removed with anonymous volumes'; } catch (error) { evidence.cleanup.container = String(error); process.exitCode = 1; } }
  evidence.finished = new Date().toISOString();
  await writeFile(resolve(output, 'results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
}
