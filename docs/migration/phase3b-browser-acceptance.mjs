import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON);
const { chromium } = require('playwright');
for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key];
Object.assign(process.env, {
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'synthetic-browser-public',
  VITE_SOUNDPUB_BACKEND_DOMAINS: 'users,artists,labels', NODE_ENV: 'development',
});
const server = await createServer({ envDir: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true });
const output = resolve('docs/migration/phase3b-browser');
await mkdir(output, { recursive: true });
const label = { id: '11111111-1111-4111-8111-111111111111', full_name: 'QA Label',
  email: 'label@example.invalid', created_at: '2026-10-28T00:00:00.000000Z', status: 'active', roles: ['label'] };
const target = { membershipId: '33333333-3333-4333-8333-333333333333', artistId: '22222222-2222-4222-8222-222222222222',
  labelId: label.id, name: 'QA Artist', fullName: 'QA Artist', status: 'active' };
const results = [];
try {
  for (const [device, viewport] of Object.entries({ mobile: { width: 390, height: 844 },
    tablet: { width: 768, height: 1024 }, desktop: { width: 1440, height: 900 } })) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const requests = [];
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) { requests.push({ blocked: url.pathname }); return route.abort(); }
      if (!url.pathname.startsWith('/api/v1/')) return route.continue();
      requests.push({ path: url.pathname, method: request.method(), authorized: request.headers().authorization === 'Bearer synthetic-browser-token' });
      const body = url.pathname === '/api/v1/profile' ? { profile: label, roles: label.roles } :
        url.pathname === `/api/v1/labels/${label.id}/artists` ? { items: [target], nextCursor: null } :
        url.pathname === '/api/v1/labels' ? { items: [{ ...label, ownerId: label.id, logo_url: null, logo_url_light: null, logo_url_dark: null }], nextCursor: null } :
        { items: [], nextCursor: null };
      return route.fulfill({ status: 200, json: body });
    });
    await context.addInitScript(actor => {
      localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'synthetic-browser-token',
        refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { ...actor, aud: 'authenticated', app_metadata: {}, user_metadata: {} } }));
    }, label);
    const page = await context.newPage();
    try {
      await page.goto(`${origin}/dashboard/my-artists`, { waitUntil: 'domcontentloaded' });
      await page.getByText('QA Artist', { exact: true }).first().waitFor({ timeout: 10000 });
      assert(await page.getByRole('button', { name: /Tambah Artist/ }).isVisible());
      assert(requests.some(item => item.path === `/api/v1/labels/${label.id}/artists` && item.authorized));
      assert(!requests.some(item => /^\/(rest|functions)\/v1\//.test(item.path ?? '')));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      await page.screenshot({ path: resolve(output, `${device}.png`), fullPage: true });
      results.push({ device, list: 'PASS', overflow, requests });
    } catch (error) {
      results.push({ device, list: 'FAIL', error: String(error), requests });
      await page.screenshot({ path: resolve(output, `${device}-failure.png`), fullPage: true }).catch(() => {});
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await server.close();
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ boundary: 'Mock API; list/transport only; no persistence or transfer browser acceptance.', results }, null, 2));
}
assert(results.every(result => result.list === 'PASS' && !result.overflow), JSON.stringify(results));
console.log(JSON.stringify(results.map(({ device, list, overflow }) => ({ device, list, overflow }))));
