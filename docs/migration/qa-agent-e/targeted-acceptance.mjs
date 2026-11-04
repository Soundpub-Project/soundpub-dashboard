import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON);
const { chromium } = require('playwright');
const output = resolve('docs/migration/qa-agent-e/artifacts/targeted');
await mkdir(output, { recursive: true });
for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key];
Object.assign(process.env, { NODE_ENV: 'development', VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'synthetic-public-key', VITE_SOUNDPUB_BACKEND_DOMAINS: 'users' });
const origin = 'http://127.0.0.1:8282';
const server = await createServer({ envDir: false, server: { host: '127.0.0.1', port: 8282, strictPort: true } });
const actor = { id: '11111111-1111-4111-8111-111111111111', email: 'qa@example.invalid', full_name: 'QA Admin', status: 'active', roles: ['superadmin'], created_at: new Date().toISOString(), password_set: true, balance: 0 };
const target = { ...actor, id: '22222222-2222-4222-8222-222222222222', email: 'target@example.invalid', full_name: 'QA Target', roles: ['user'] };
const results = { started: new Date().toISOString(), boundary: 'All API/Auth responses intercepted; 8282 only for fixtures, no live proxy/CORS assertion.', snapshots: [], scenarios: [] };
for (const path of ['src/hooks/useAuth.tsx', 'src/pages/Settings.tsx', 'src/components/auth/ProtectedRoute.tsx', 'src/lib/sessionLimit.ts', 'src/components/users/ChangeRoleDialog.tsx', 'src/components/users/ChangeStatusDialog.tsx']) results.snapshots.push({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const [viewportName, viewport] of Object.entries({ mobile: { width: 390, height: 844 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1440, height: 1000 } })) {
    for (const scenario of ['expired-refresh-success', 'expired-refresh-rejected', 'six-hour-expired', 'profile-validation', 'role-validation', 'status-validation', 'profile-401-settings', 'profile-403-settings', 'profile-401-users', 'profile-403-users']) {
      const record = { viewportName, scenario, requests: [], navigations: [], errors: [], assertions: [], result: 'PASS' };
      results.scenarios.push(record);
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const fixture = url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/v1/');
        if (fixture) {
          record.requests.push({ method: request.method(), path: url.pathname + url.search, body: request.postData(), bearer: request.headers().authorization === 'Bearer refreshed-synthetic-token' ? 'refreshed' : request.headers().authorization === 'Bearer synthetic-token' ? 'cached' : 'other-or-missing' });
          if (url.pathname === '/auth/v1/token') {
            if (scenario === 'expired-refresh-rejected') return route.fulfill({ status: 400, json: { error: 'invalid_grant', error_code: 'refresh_token_not_found', msg: 'Synthetic expired refresh token' } });
            return route.fulfill({ json: { access_token: 'refreshed-synthetic-token', refresh_token: 'refreshed-synthetic-refresh', token_type: 'bearer', expires_in: 3600, user: { ...actor, aud: 'authenticated', app_metadata: {}, user_metadata: {} } } });
          }
          if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
          if (request.method() === 'GET' && url.pathname === '/api/v1/profile' && /profile-(401|403)-/.test(scenario)) return route.fulfill({ status: scenario.includes('401') ? 401 : 403, json: { error: { code: scenario.includes('401') ? 'UNAUTHORIZED' : 'FORBIDDEN' } } });
          if (request.method() !== 'GET') return route.fulfill({ status: 400, json: { error: { code: 'BAD_REQUEST', message: 'Synthetic validation rejection' } } });
          return route.fulfill({ json: url.pathname.includes('/admin/users') ? { items: [target], nextCursor: null } : { profile: actor, roles: actor.roles } });
        }
        if (url.origin !== origin) return route.abort();
        return route.continue();
      });
      await context.addInitScript(({ actor, scenario }) => {
        localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'synthetic-token', refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + (scenario.startsWith('expired-') ? -3600 : 3600), user: { ...actor, aud: 'authenticated', app_metadata: {}, user_metadata: {} } }));
        if (scenario === 'six-hour-expired') localStorage.setItem('soundpub.session_started_at', JSON.stringify({ userId: actor.id, startedAt: Date.now() - 7 * 3600 * 1000 }));
      }, { actor, scenario });
      const page = await context.newPage();
      page.setDefaultTimeout(7000);
      page.on('pageerror', error => record.errors.push(error.message));
      page.on('framenavigated', frame => { if (frame === page.mainFrame()) record.navigations.push(frame.url()); });
      const settings = scenario.includes('settings') || scenario === 'profile-validation';
      record.route = settings ? '/dashboard/settings' : '/dashboard/users';
      try {
        await page.goto(origin + record.route, { waitUntil: 'domcontentloaded' });
        if (scenario === 'profile-validation') {
          await page.locator('#full_name').fill('   ');
          await page.getByRole('button', { name: 'Simpan Perubahan', exact: true }).click();
          await page.getByText('Gagal memperbarui profil', { exact: true }).waitFor();
          assert.equal(await page.locator('#full_name').inputValue(), '   ');
          assert(await page.getByRole('button', { name: 'Simpan Perubahan', exact: true }).isEnabled());
          assert.equal(record.requests.filter(request => request.method === 'PATCH' && request.path === '/api/v1/profile').length, 1);
          assert(!(await page.getByText('Profil berhasil diperbarui', { exact: true }).count()));
          record.assertions.push('400 profile toast; input retained; save re-enabled; exactly one PATCH; no success');
        } else if (scenario === 'role-validation' || scenario === 'status-validation') {
          const row = page.getByRole('row').filter({ hasText: target.email });
          await row.getByRole('button').last().click();
          const role = scenario === 'role-validation';
          await page.getByRole('menuitem', { name: role ? 'Ubah Role' : 'Ubah Status' }).click();
          await page.getByRole('dialog').getByRole('combobox').first().click();
          await page.getByRole('option', { name: role ? /Admin.*Akses penuh/ : 'Inactive', exact: !role }).click();
          const button = page.getByRole('dialog').getByRole('button', { name: /Simpan/ });
          await button.click();
          await page.getByText('VALIDATION_ERROR', { exact: true }).waitFor();
          assert(await page.getByRole('dialog').isVisible());
          assert(await button.isEnabled());
          assert.equal(record.requests.filter(request => request.method === (role ? 'PUT' : 'PATCH')).length, 1);
          record.assertions.push('400 validation error visible; dialog retained; save re-enabled; one mutation');
        } else if (scenario === 'expired-refresh-success') {
          await page.getByRole('row').filter({ hasText: target.email }).waitFor();
          assert.equal(record.requests.filter(request => request.path.startsWith('/auth/v1/token')).length, 1);
          assert(record.requests.filter(request => request.path.startsWith('/api/')).every(request => request.bearer === 'refreshed'));
          record.assertions.push('one refresh; Users rendered; only refreshed bearer used for API');
        } else if (scenario === 'expired-refresh-rejected' || scenario === 'six-hour-expired') {
          await page.waitForURL('**/auth');
          await page.getByRole('tab', { name: 'Login', exact: true }).waitFor();
          assert.equal(await page.evaluate(() => localStorage.getItem('sb-127-auth-token')), null);
          record.assertions.push('redirect /auth; login UI visible; cached session removed');
          if (scenario === 'expired-refresh-rejected') assert.equal(record.requests.filter(request => request.path.startsWith('/auth/v1/token')).length, 1);
        } else {
          await page.waitForURL('**/auth');
          await page.getByRole('tab', { name: 'Login', exact: true }).waitFor();
          await page.getByText(scenario.includes('401') ? 'Sesi tidak valid. Silakan login kembali.' : 'Akun tidak memiliki akses. Silakan hubungi administrator.', { exact: true }).first().waitFor();
          assert(record.requests.some(request => request.method === 'GET' && request.path === '/api/v1/profile'));
          assert(!record.requests.some(request => request.path.startsWith('/api/v1/admin/users')));
          assert(!record.requests.some(request => request.path.startsWith('/auth/v1/token')));
          assert.equal(await page.evaluate(() => localStorage.getItem('sb-127-auth-token')), null);
          assert(record.requests.some(request => request.path.startsWith('/auth/v1/logout')));
          record.assertions.push('profile rejection redirects /auth; correct toast; cached session cleared; logout called; no admin list/refresh');
        }
        const before = record.requests.length;
        const beforeNavigation = record.navigations.length;
        await page.waitForTimeout(2200);
        assert.equal(record.requests.length, before, 'no repeated API/Auth requests during quiet window');
        assert.equal(record.navigations.length, beforeNavigation, 'no navigation loop during quiet window');
        assert.equal(record.errors.length, 0);
        record.assertions.push('2.2-second quiet window: no repeated requests/navigation; zero uncaught page errors');
      } catch (error) { record.result = 'FAIL'; record.error = error.stack; }
      record.finalUrl = page.url();
      record.body = await page.locator('body').innerText();
      record.sessionPresent = await page.evaluate(() => localStorage.getItem('sb-127-auth-token') !== null);
      await page.screenshot({ path: resolve(output, `${viewportName}-${scenario}.png`), fullPage: true });
      await context.close();
      await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
      console.log(viewportName, scenario, record.result, record.error?.split('\n')[0] ?? '');
    }
  }
} finally {
  await browser?.close();
  await server.close();
  results.finished = new Date().toISOString();
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
}
if (results.scenarios.some(record => record.result === 'FAIL')) process.exitCode = 1;
