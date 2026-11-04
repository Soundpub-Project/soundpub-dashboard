import { build, createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON);
const { chromium } = require('playwright');
const output = resolve('docs/migration/qa-agent-e/artifacts');
await mkdir(output, { recursive: true });
for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key];
Object.assign(process.env, { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'synthetic-qa-public-key', VITE_SOUNDPUB_BACKEND_DOMAINS: 'users' });
await build({ envDir: false, build: { outDir: resolve(output, 'build'), emptyOutDir: true } });
process.env.NODE_ENV = 'development';
const server = await createServer({ envDir: false, server: { host: '127.0.0.1', port: 8282, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ headless: true });
const results = [];
const actor = { id: '11111111-1111-4111-8111-111111111111', email: 'qa@example.invalid', full_name: 'QA Admin', status: 'active', roles: ['superadmin'], created_at: new Date().toISOString(), balance: 0, password_set: true, email_verified: true };
const target = { ...actor, id: '22222222-2222-4222-8222-222222222222', full_name: 'QA Target', email: 'target@example.invalid', roles: ['user'] };
try {
  for (const [viewportName, viewport] of Object.entries({ mobile: { width: 390, height: 844 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1440, height: 900 } })) {
    for (const scenario of ['anonymous', 'users', 'profile', 'empty', 'unauthorized', 'forbidden', 'server-error', 'network-error', 'loading']) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      const requests = [];
      const errors = [];
      await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.pathname.startsWith('/api/')) {
          requests.push({ method: request.method(), path: url.pathname + url.search, bearer: request.headers().authorization === 'Bearer synthetic-browser-token', body: request.postData() });
          if (scenario === 'network-error' && url.pathname.includes('/admin/users')) return route.abort();
          if (scenario === 'loading' && url.pathname.includes('/admin/users')) await new Promise(done => setTimeout(done, 2500));
          const status = url.pathname.includes('/admin/users') ? ({ unauthorized: 401, forbidden: 403, 'server-error': 500 }[scenario] ?? 200) : 200;
          const body = status !== 200 ? { error: { code: 'QA_ERROR' } } : url.pathname.includes('/admin/users') ? { items: scenario === 'empty' ? [] : [target], nextCursor: null } : { profile: actor, roles: actor.roles };
          return route.fulfill({ status, json: body });
        }
        if (url.origin !== 'http://127.0.0.1:8282') {
          requests.push({ blockedExternal: url.origin + url.pathname, method: request.method() });
          return route.abort();
        }
        return route.continue();
      });
      if (scenario !== 'anonymous') await context.addInitScript(actor => {
        localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'synthetic-browser-token', refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { ...actor, aud: 'authenticated', app_metadata: {}, user_metadata: {} } }));
      }, actor);
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      page.on('pageerror', error => errors.push(error.message));
      const routePath = scenario === 'profile' ? '/dashboard/settings' : '/dashboard/users';
      try {
        await page.goto('http://127.0.0.1:8282' + routePath, { waitUntil: 'domcontentloaded' });
        if (scenario === 'loading') await page.waitForTimeout(800);
        else await page.waitForTimeout(3500);
        const body = await page.locator('body').innerText();
        if (scenario === 'anonymous') assert.equal(new URL(page.url()).pathname, '/auth');
        if (scenario === 'users') { assert.match(body, /QA Target/); assert(requests.some(request => request.path?.startsWith('/api/v1/admin/users') && request.bearer)); }
        if (scenario === 'profile') {
          assert(await page.locator('#full_name').isVisible());
          await page.locator('#full_name').fill('QA Edited Name');
          await page.getByRole('button', { name: 'Simpan Perubahan', exact: true }).click();
          await page.waitForTimeout(500);
          assert(requests.some(request => request.method === 'PATCH' && request.path === '/api/v1/profile'));
        }
        if (scenario === 'users') {
          const row = page.getByRole('row').filter({ hasText: 'target@example.invalid' });
          await row.getByRole('button').last().click();
          await page.getByRole('menuitem', { name: 'Ubah Status' }).click();
          await page.getByRole('dialog').getByRole('combobox').click();
          await page.getByRole('option', { name: 'Inactive', exact: true }).click();
          await page.getByRole('button', { name: 'Simpan Status', exact: true }).click();
          await page.waitForTimeout(500);
          assert(requests.some(request => request.method === 'PATCH' && request.path?.endsWith('/status')));
          await row.getByRole('button').last().click();
          await page.getByRole('menuitem', { name: 'Ubah Role' }).click();
          await page.getByRole('dialog').getByRole('combobox').first().click();
          await page.getByRole('option', { name: /Admin.*Akses penuh/ }).click();
          await page.getByRole('dialog').getByRole('button', { name: /Simpan/ }).click();
          await page.waitForTimeout(500);
          assert(requests.some(request => request.method === 'PUT' && request.path?.endsWith('/roles')));
        }
        await page.screenshot({ path: resolve(output, `${viewportName}-${scenario}.png`), fullPage: true });
        results.push({ viewportName, viewport, scenario, route: routePath, finalUrl: page.url(), result: 'EXECUTED', assertions: ['anonymous', 'users', 'profile'].includes(scenario) ? 'PASS' : 'OBSERVATION_ONLY', overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), body: body.slice(0, 12000), requests, errors });
      } catch (error) {
        await page.screenshot({ path: resolve(output, `${viewportName}-${scenario}.png`), fullPage: true }).catch(() => {});
        results.push({ viewportName, scenario, route: routePath, finalUrl: page.url(), result: 'FAIL', error: error.message, requests, errors });
      }
      await context.close();
    }
  }
} finally {
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ timestamp: new Date().toISOString(), boundary: 'Browser responses mocked; external requests aborted; no backend identity verification or proxy acceptance established.', results }, null, 2));
  await browser.close();
  await server.close();
}
console.log(JSON.stringify(results.map(({ viewportName, scenario, result, assertions }) => ({ viewportName, scenario, result, assertions })), null, 2));
