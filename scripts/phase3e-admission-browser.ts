import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { MockPaymentProvider } from '../backend/src/payments/provider.js';
import { ApiError } from '../backend/src/api/types.js';
import { postEvent, getBalance } from '../backend/src/finance/index.js';
import { webhookSignature } from '../backend/src/integrations/webhook.js';

// ponytail: synthetic identity/provider adapters only; real identity and settlement need separate admission.
export const CHECKS_PER_VIEWPORT = 52;
const secret = 'synthetic-browser-callback-secret-32-characters';
export function createControls() {
  const controls = { fault: '', expired: new Set<string>(), rateLimited: false, provider: new MockPaymentProvider() };
  const provider = controls.provider;
  for (const method of ['create', 'status', 'refund'] as const) {
    const original = provider[method].bind(provider) as (...args: any[]) => Promise<any>;
    (provider[method] as any) = async (...args: any[]) => {
      if (controls.fault === method || controls.fault === method + '-timeout') {
        // Fault follows durable mock write for create/refund, so SQL rollback is observable.
        if (method !== 'status') await original(...args);
        throw new ApiError(503, controls.fault.endsWith('-timeout') ? 'MOCK_PROVIDER_TIMEOUT' : 'MOCK_PROVIDER_REJECTED');
      }
      return original(...args);
    };
  }
  return controls;
}

export async function runAdmission(h: any) {
  const { database, browser, origin, output, dependencies, payments, controls, events, network,
    requests, unexpected, blockedPresentation, financialEgress, evidence, adminId } = h;
  const admin = { id: adminId, roles: ['superadmin'], status: 'active' };
  const settings = await dependencies.auditSettings.adminSettings(admin);
  await dependencies.auditSettings.updateAdminSettings(admin, { version: settings.version,
    settings: { min_payout_amount: '100.00', release_price_per_track: '50000.00' } }, 'admission-synthetic-settings');
  const tables = ['royalty_import_batches', 'royalty_import_entries', 'royalty_import_corrections', 'payout_requests',
    'payout_allocations', 'payout_operations', 'payment_invoices', 'payment_mock_invoices', 'payment_effects',
    'payment_callback_receipts', 'payment_refunds', 'finance_events', 'finance_audit', 'audit_logs', 'outbox_events', 'webhook_events'];
  const snapshot = async () => {
    const rows: Record<string, any> = {};
    for (const table of tables) {
      const result = (await database.owner.query(`SELECT count(*)::int AS count,
        COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') AS rows FROM soundpub.${table} t`)).rows[0];
      rows[table] = { count: result.count, sha256: createHash('sha256').update(JSON.stringify(result.rows)).digest('hex') };
    }
    return rows;
  };
  const sqlCount = async (table: string, where: string, args: unknown[]) =>
    Number((await database.owner.query(`SELECT count(*) FROM soundpub.${table} WHERE ${where}`, args)).rows[0].count);
  const balance = async (id: string) => {
    const client = await database.owner.connect();
    try { return await getBalance(client, id); } finally { client.release(); }
  };
  for (const [viewport, size] of Object.entries({ mobile: { width: 390, height: 844 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1440, height: 900 } })) {
    let number = 0;
    const check = async (name: string, task: (f: any) => Promise<void>, options: { actor?: string; expired?: boolean; refresh?: 'success' | 'failure'; skip?: string } = {}) => {
      number++;
      if (options.skip) { events.push({ viewport, check: name, result: 'SKIP', detail: options.skip }); return; }
      const label = { id: randomUUID(), roles: ['label'], status: 'active' };
      const artist = { id: randomUUID(), roles: ['artist'], status: 'active' };
      for (const actor of [label, artist]) {
        await database.owner.query("INSERT INTO soundpub.backend_users(id,status,email_verified_at) VALUES($1,'active',now())", [actor.id]);
        await database.owner.query('INSERT INTO soundpub.profiles(id,full_name,parent_label_id) VALUES($1,$2,$3)',
          [actor.id, actor.roles[0], actor === artist ? label.id : null]);
        await database.owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,$2,now())', [actor.id, actor.roles[0]]);
        await database.owner.query("INSERT INTO soundpub.external_identities(application_user_id,provider,issuer,subject,verified_at) VALUES($1,'mock','qa-local',$2,now())", [actor.id, actor.id]);
      }
      await database.owner.query("INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at) VALUES($1,$2,'Synthetic Artist',now())", [label.id, artist.id]);
      const aggregate = await dependencies.releases.createAggregate(label, { artist_user_id: artist.id, title: `Admission ${viewport} ${number}`,
        artist_name: 'Synthetic Artist', release_type: 'single', genre: 'Pop', release_date: '2026-11-01',
        tracks: [{ title: 'Synthetic Track', artist_name: 'Synthetic Artist' }] }, 'admission-release-' + randomUUID());
      const release = aggregate.release.id, track = aggregate.tracks[0].id;
      const client = await database.owner.connect();
      try {
        await client.query('BEGIN');
        await postEvent(client, { ownerId: label.id, kind: 'ROYALTY_EARNING', amount: '1000.00',
          businessReference: 'admission-fixture-' + label.id, idempotencyKey: 'admission-fixture-' + label.id, systemActor: 'synthetic-browser-fixture' });
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      const context = await browser.newContext({ viewport: size, serviceWorkers: 'block', hasTouch: viewport !== 'desktop' });
      context.setDefaultTimeout(8000);
      const refreshes: unknown[] = [];
      const websockets: string[] = [];
      await context.routeWebSocket('**/*', (socket: any) => {
        const url = new URL(socket.url());
        websockets.push(url.href);
        url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
        if (url.origin === origin) socket.connectToServer();
        else { unexpected.push(`${viewport}:${socket.url()}`); socket.close(); }
      });
      await context.route('**/*', async (route: any) => {
        const url = new URL(route.request().url());
        if (/\/(rest|functions)\/v1\//.test(url.pathname)) { financialEgress.push(`${viewport}:${url.href}`); return route.abort(); }
        if (url.origin === 'http://127.0.0.1:54321' && url.pathname === '/auth/v1/token' && options.refresh) {
          assert.equal(url.search, '?grant_type=refresh_token');
          if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: {
            'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST',
            'access-control-allow-headers': route.request().headers()['access-control-request-headers'] ?? '*' } });
          refreshes.push({ url: url.href, outcome: options.refresh });
          return route.fulfill({ status: options.refresh === 'success' ? 200 : 400, contentType: 'application/json',
            headers: { 'access-control-allow-origin': origin }, body: JSON.stringify(options.refresh === 'success'
              ? { access_token: 'fresh:' + label.id, refresh_token: 'synthetic-renewed', token_type: 'bearer', expires_in: 3600,
                user: { id: label.id, aud: 'authenticated', email: 'qa@example.invalid', app_metadata: {}, user_metadata: {} } }
              : { code: 'refresh_token_not_found', error_code: 'refresh_token_not_found', msg: 'Synthetic expired refresh token' }) });
        }
        if (url.origin !== origin) {
          if (url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2') blockedPresentation.push(`${viewport}:${url.href}`);
          else unexpected.push(`${viewport}:${url.href}`);
          return route.abort();
        }
        return route.continue();
      });
      const actor = options.actor === 'admin' ? adminId : label.id;
      await context.addInitScript(({ actor, expired }: any) => {
        if (sessionStorage.getItem('qa-seeded')) return;
        sessionStorage.setItem('qa-seeded', 'true');
        localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: actor,
          refresh_token: 'synthetic', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + (expired ? -60 : 3600),
          user: { id: actor, aud: 'authenticated', email: 'qa@example.invalid', app_metadata: {}, user_metadata: {} } }));
      }, { actor, expired: options.expired });
      const page = await context.newPage();
      page.on('request', (request: any) => { if (new URL(request.url()).pathname.startsWith('/api/v1/')) requests.push({ viewport, method: request.method(), path: new URL(request.url()).pathname }); });
      page.on('response', (response: any) => { if (new URL(response.url()).pathname.startsWith('/api/v1/')) network.push({ viewport, method: response.request().method(), path: new URL(response.url()).pathname, status: response.status() }); });
      const http = async (path: string, body?: unknown, token = actor, key = randomUUID(), headers = {}) => page.evaluate(async (input: any) => {
        const result = await fetch(input.path, { method: input.body === undefined ? 'GET' : 'POST', headers: {
          ...(input.token ? { Authorization: 'Bearer ' + input.token } : {}), ...(input.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          'Idempotency-Key': input.key, ...input.headers }, ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }) });
        return { status: result.status, body: await result.json(), requestId: result.headers.get('x-request-id') };
      }, { path, body, token, key, headers });
      const expectError = (response: any, status: number, code: string) => {
        assert.equal(response.status, status, JSON.stringify(response)); assert.equal(response.body.error.code, code);
        assert.equal(typeof response.requestId, 'string'); assert.equal(response.body.error.requestId, response.requestId);
      };
      const payoutBody = { amount: '200.00', currency: 'IDR', bank_name: 'Synthetic', account_number: '12345678', account_holder_name: 'Synthetic Label' };
      const statement = { source: 'admission-' + label.id, period: '2026-10', currency: 'IDR', filename: 'synthetic.json',
        rows: [{ source_row_id: 'row-1', beneficiary_id: artist.id, release_id: release, track_id: track, gross_amount: '100.00', deduction_amount: '0.00', net_amount: '100.00' }] };
      const payoutPage = async () => { await page.goto(origin + '/dashboard/payouts'); await page.getByText('Memenuhi syarat', { exact: true }).waitFor();
        await page.getByRole('status').filter({ hasText: 'Memuat…' }).waitFor({ state: 'hidden' }); };
      const fillPayout = async (amount = '200.00') => {
        for (const [label, value] of [['Jumlah IDR (contoh 100000.00)', amount], ['Bank', 'Synthetic'], ['Nomor rekening', '12345678'], ['Nama pemilik rekening', 'Synthetic Label']]) await page.getByLabel(label, { exact: true }).fill(value);
      };
      const responseFor = (path: string) => page.waitForResponse((r: any) => r.request().method() === 'POST' && new URL(r.url()).pathname === path);
      const clickPost = async (button: string, path: string) => { const response = responseFor(path); await page.getByRole('button', { name: button, exact: true }).click(); return response; };
      const payoutError = () => page.getByRole('alert').filter({ hasText: 'Operasi belum dikonfirmasi' }).waitFor();
      const submitPayout = async () => { const result = await clickPost('Ajukan pencairan', '/api/v1/payouts'); assert.equal(result.status(), 200); const row = await result.json();
        await page.getByRole('row').filter({ hasText: row.id }).getByRole('cell', { name: 'pending', exact: true }).waitFor();
        await page.getByRole('status').filter({ hasText: 'Memuat…' }).waitFor({ state: 'hidden' }); return row; };
      const createPayout = async (key = randomUUID()) => { const result = await http('/api/v1/payouts', payoutBody, label.id, key); assert.equal(result.status, 200, JSON.stringify(result)); return result.body; };
      const transition = async (id: string, status: string) => { const result = await http(`/api/v1/admin/payouts/${id}/transition`, { status }, adminId); assert.equal(result.status, 200, JSON.stringify(result)); return result.body; };
      const importPage = async () => { await page.goto(origin + '/dashboard/upload'); await page.getByLabel('Pernyataan JSON').waitFor(); };
      const preview = async (body = statement) => { await page.getByLabel('Pernyataan JSON').fill(JSON.stringify(body));
        assert.equal((await clickPost('Validasi', '/api/v1/royalties/imports/preview')).status(), 200);
        await page.getByRole('region', { name: 'Hasil validasi' }).getByText('Valid: 1', { exact: false }).waitFor(); };
      const invoicePage = async () => { await page.goto(origin + '/dashboard/invoices?release_id=' + release); await page.getByText('Invoice belum tersedia.', { exact: true }).waitFor(); };
      const createInvoice = async () => { const result = await http('/api/v1/payments/invoices', { release_id: release, idempotency_key: 'release-invoice:' + release }, adminId);
        assert.equal(result.status, 200, JSON.stringify(result)); return result.body; };
      const callback = async (invoice: any, status: string, changes: any = {}, envelope: any = {}) => {
        const input = { provider: 'mock-payment', eventId: randomUUID(), timestamp: String(Math.floor(Date.now() / 1000)),
          rawBody: Buffer.from(JSON.stringify({ provider_invoice_id: invoice.provider_invoice_id, status, amount_minor: invoice.amount_minor, currency: 'IDR', ...changes })), ...envelope };
        const signature = envelope.signature ?? webhookSignature(secret, input);
        return http('/api/v1/webhooks/events', JSON.parse(input.rawBody.toString()), '', randomUUID(),
          { 'x-webhook-signature': `t=${input.timestamp},id=${input.eventId},v1=${signature}` });
      };
      const noChange = async (task: () => Promise<void>) => { const before = await snapshot(); await task(); assert.deepEqual(await snapshot(), before, 'Rejected action changed persisted financial/audit/outbox rows'); };
      const f = { page, context, label, artist, release, track, http, expectError, payoutBody, statement, payoutPage, fillPayout,
        responseFor, clickPost, payoutError, submitPayout, createPayout, transition, importPage, preview, invoicePage, createInvoice, callback,
        noChange, refreshes, actor, balance, sqlCount };
      const before = await snapshot();
      try {
        await page.goto(origin + '/dashboard/royalties');
        if (!options.refresh) await page.getByRole('heading', { name: 'Royalti', exact: true }).waitFor();
        await task(f);
        events.push({ viewport, check: name, result: 'PASS' });
      } catch (error) { events.push({ viewport, check: name, result: 'FAIL', detail: String(error) }); console.log(`${viewport} ${number}: ${String(error)}`); }
      finally {
        controls.fault = ''; controls.expired.clear(); controls.rateLimited = false;
        await context.setOffline(false);
        await database.owner.query("UPDATE soundpub.user_roles SET verified_at=now() WHERE user_id=$1 AND role='superadmin'", [adminId]);
        await page.screenshot({ path: join(output, `${viewport}-admission-${String(number).padStart(2, '0')}.png`), fullPage: true }).catch(() => {});
        const integrity = await database.owner.query(`SELECT e.id FROM soundpub.finance_events e
          LEFT JOIN soundpub.finance_audit a ON a.event_id=e.id LEFT JOIN soundpub.outbox_events o ON o.id=a.outbox_id
          WHERE a.event_id IS NULL OR o.id IS NULL`);
        const balances = { label: await balance(label.id), artist: await balance(artist.id) };
        evidence.push({ viewport, check: name, before, after: await snapshot(), balances, missingFinanceAuditOutbox: integrity.rowCount, refreshes, websockets,
          layout: await page.evaluate(() => ({ viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth })) });
        assert.equal(integrity.rowCount, 0);
        for (const b of Object.values(balances) as any[]) { assert.ok(BigInt(b.available.replace('.', '')) >= 0n); assert.ok(BigInt(b.reserved.replace('.', '')) >= 0n); }
        await context.close();
      }
      console.log(`${viewport} ${number}: ${events.at(-1).result} ${name}`);
    };

    await check('eligible payout malformed amounts and destination rejected before POST', async f => {
      await f.payoutPage(); await f.fillPayout();
      const before = requests.length;
      for (const amount of ['-1.00', '1.001', '1e3', 'NaN', '9007199254740991000.00']) {
        await f.page.getByLabel('Jumlah IDR (contoh 100000.00)').fill(amount);
        await f.page.getByRole('button', { name: 'Ajukan pencairan', exact: true }).click(); await f.payoutError();
      }
      await f.fillPayout(); await f.page.getByLabel('Nomor rekening').fill('abc');
      await f.page.getByRole('button', { name: 'Ajukan pencairan', exact: true }).click(); await f.payoutError();
      assert.equal(requests.slice(before).filter((r: any) => r.method === 'POST').length, 0);
    });
    for (const [name, amount, code] of [['below minimum', '99.99', 'BELOW_MINIMUM'], ['insufficient balance', '1000.01', 'INSUFFICIENT_BALANCE'], ['zero amount', '0.00', 'INVALID_AMOUNT']]) {
      await check(`eligible payout ${name} rejected by backend`, async f => {
        await f.payoutPage(); await f.fillPayout(amount); await f.noChange(async () => {
          const r = await f.clickPost('Ajukan pencairan', '/api/v1/payouts'); assert.equal(r.status(), amount === '0.00' ? 400 : 409);
          assert.equal((await r.json()).error.code, code); await f.payoutError();
        });
      });
    }
    await check('forged payout owner numeric amount and currency rejected over browser HTTP', async f => {
      await f.noChange(async () => {
        for (const extra of [{ user_id: adminId }, { amount: 200 }, { currency: 'USD' }]) f.expectError(await f.http('/api/v1/payouts', { ...f.payoutBody, ...extra }), 400, 'BAD_REQUEST');
      });
    });
    await check('payout role removed after eligible form loaded', async f => {
      await f.payoutPage(); await f.fillPayout();
      await database.owner.query("UPDATE soundpub.user_roles SET role='user' WHERE user_id=$1", [f.label.id]);
      await f.noChange(async () => { assert.equal((await f.clickPost('Ajukan pencairan', '/api/v1/payouts')).status(), 403); await f.payoutError(); });
    });
    for (const status of ['inactive', 'suspended']) await check(`${status} actor cannot submit previously eligible payout`, async f => {
      await f.payoutPage(); await f.fillPayout(); await database.owner.query('UPDATE soundpub.backend_users SET status=$2 WHERE id=$1', [f.label.id, status]);
      await f.noChange(async () => { assert.equal((await f.clickPost('Ajukan pencairan', '/api/v1/payouts')).status(), 403); await f.payoutError(); });
    });
    await check('verification removed while editing blocks eligible payout', async f => {
      await f.payoutPage(); await f.fillPayout(); await database.owner.query('UPDATE soundpub.backend_users SET email_verified_at=NULL WHERE id=$1', [f.label.id]);
      await f.noChange(async () => { const r = await f.clickPost('Ajukan pencairan', '/api/v1/payouts'); assert.equal(r.status(), 409); assert.equal((await r.json()).error.code, 'PAYOUT_INELIGIBLE'); await f.payoutError(); });
    });
    await check('competing pending payout invalidates loaded eligibility', async f => {
      await f.payoutPage(); await f.fillPayout(); await f.createPayout();
      await f.noChange(async () => { const r = await f.clickPost('Ajukan pencairan', '/api/v1/payouts'); assert.equal(r.status(), 409); await f.payoutError(); });
      await f.page.reload(); await f.page.getByText('PENDING_PAYOUT', { exact: false }).waitFor();
      assert.equal(await f.page.getByRole('button', { name: 'Ajukan pencairan', exact: true }).isDisabled(), true);
    });
    await check('slow payout double click produces one request reservation and receipt', async f => {
      await f.payoutPage(); await f.fillPayout();
      let resume!: () => void, entered!: () => void;
      const gate = new Promise<void>(r => resume = r), reached = new Promise<void>(r => entered = r);
      await f.page.route(origin + '/api/v1/payouts', async (route: any) => {
        if (route.request().method() !== 'POST') return route.continue(); entered(); await gate; return route.continue();
      });
      const before = requests.length;
      try {
        await f.page.getByRole('button', { name: 'Ajukan pencairan', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
        await reached; assert.equal(await f.page.getByRole('button', { name: 'Ajukan pencairan', exact: true }).isDisabled(), true);
        assert.equal(await f.page.getByLabel('Nomor rekening').isDisabled(), true);
      } finally { resume(); }
      await f.page.getByRole('cell', { name: 'pending', exact: true }).waitFor();
      assert.equal(requests.slice(before).filter((r: any) => r.path === '/api/v1/payouts' && r.method === 'POST').length, 1);
      assert.equal(await sqlCount('payout_requests', 'user_id=$1', [f.label.id]), 1); assert.equal((await balance(f.label.id)).reserved, '200.00');
    });
    await check('payout committed response lost then same-page retry uses same key', async f => {
      await f.payoutPage(); await f.fillPayout(); let key = '';
      const endpoint = origin + '/api/v1/payouts';
      await f.page.route(endpoint, async (route: any) => {
        if (route.request().method() !== 'POST') return route.continue(); key = route.request().headers()['idempotency-key'];
        const result = await route.fetch(); assert.equal(result.status(), 200); await route.abort('connectionfailed');
      });
      await f.page.getByRole('button', { name: 'Ajukan pencairan', exact: true }).click(); await f.payoutError();
      assert.equal(await sqlCount('payout_requests', 'user_id=$1', [f.label.id]), 1);
      assert.equal(await f.page.getByLabel('Nomor rekening').isDisabled(), true);
      await f.page.unroute(endpoint);
      const replay = await f.clickPost('Ajukan pencairan', '/api/v1/payouts'); assert.equal(replay.status(), 200);
      assert.equal(replay.request().headers()['idempotency-key'], key);
      assert.equal(await sqlCount('payout_requests', 'user_id=$1', [f.label.id]), 1);
      assert.equal(await sqlCount('payout_operations', 'actor_id=$1', [f.label.id]), 1); assert.equal((await balance(f.label.id)).reserved, '200.00');
    });
    await check('payout replay key payload conflict leaves original effects unchanged', async f => {
      const key = randomUUID(); await f.createPayout(key);
      await f.noChange(async () => f.expectError(await f.http('/api/v1/payouts', { ...f.payoutBody, amount: '201.00' }, f.label.id, key), 409, 'IDEMPOTENCY_CONFLICT'));
    });
    await check('parallel payout requests with different keys cannot reserve twice', async f => {
      const results = await Promise.all([f.http('/api/v1/payouts', f.payoutBody), f.http('/api/v1/payouts', f.payoutBody)]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      assert.equal(await sqlCount('payout_requests', 'user_id=$1', [f.label.id]), 1); assert.equal((await balance(f.label.id)).reserved, '200.00');
    });
    await check('foreign payout detail and cancellation denied without mutation', async f => {
      const row = await f.createPayout(); await f.noChange(async () => {
        f.expectError(await f.http('/api/v1/payouts/' + row.id, undefined, f.artist.id), 404, 'NOT_FOUND');
        f.expectError(await f.http(`/api/v1/payouts/${row.id}/cancel`, {}, f.artist.id), 404, 'NOT_FOUND');
      });
    });
    await check('browser cannot forge paid payout or access trusted settlement route', async f => {
      const row = await f.createPayout(); await f.noChange(async () => {
        f.expectError(await f.http(`/api/v1/admin/payouts/${row.id}/transition`, { status: 'paid', evidence: 'forged' }, adminId), 403, 'TRUSTED_SETTLEMENT_REQUIRED');
        f.expectError(await f.http(`/api/v1/admin/payouts/${row.id}/mock-settle`, {}, adminId), 404, 'NOT_FOUND');
      });
    });
    await check('stale cancel control rejects payout already approved elsewhere', async f => {
      await f.payoutPage(); await f.fillPayout(); const row = await f.submitPayout(); await f.transition(row.id, 'approved');
      await f.noChange(async () => { const r = await f.clickPost('Batalkan', `/api/v1/payouts/${row.id}/cancel`); assert.equal(r.status(), 409); await f.payoutError(); });
      await f.page.reload(); await f.page.getByRole('cell', { name: 'approved', exact: true }).waitFor(); assert.equal(await f.page.getByRole('button', { name: 'Batalkan' }).count(), 0);
    });
    await check('stale admin approval rejects terminal cancelled payout', async f => {
      const row = await f.createPayout(); await f.page.goto(origin + '/dashboard/admin-payouts');
      const ui = f.page.getByRole('row').filter({ hasText: row.id }); await ui.getByRole('button', { name: 'Setujui' }).waitFor();
      assert.equal((await f.http(`/api/v1/payouts/${row.id}/cancel`, {}, f.label.id)).status, 200);
      await f.noChange(async () => { const response = f.responseFor(`/api/v1/admin/payouts/${row.id}/transition`); await ui.getByRole('button', { name: 'Setujui' }).click(); assert.equal((await response).status(), 409); await f.payoutError(); });
      await f.page.reload(); await f.page.getByRole('row').filter({ hasText: row.id }).getByRole('cell', { name: 'cancelled', exact: true }).waitFor();
    }, { actor: 'admin' });
    await check('parallel cancellation and fresh-key replay release funds once', async f => {
      const row = await f.createPayout(); const path = `/api/v1/payouts/${row.id}/cancel`;
      assert.deepEqual((await Promise.all([f.http(path, {}), f.http(path, {})])).map(r => r.status), [200, 200]);
      assert.equal(await sqlCount('finance_events', "business_reference=$1 AND kind='PAYOUT_RELEASE'", [row.id]), 1);
      assert.equal((await balance(f.label.id)).reserved, '0.00'); assert.equal((await balance(f.label.id)).available, '1000.00');
    });
    await check('admin rejection and failure release reservations without settlement', async f => {
      for (const [button, status] of [['Tolak', 'rejected'], ['Gagal', 'failed']]) {
        const row = await f.createPayout(); await f.page.goto(origin + '/dashboard/admin-payouts');
        const ui = f.page.getByRole('row').filter({ hasText: row.id }); await ui.getByRole('button', { name: button }).click(); await ui.getByRole('cell', { name: status, exact: true }).waitFor();
        assert.equal(await sqlCount('finance_events', "business_reference=$1 AND kind='PAYOUT_RELEASE'", [row.id]), 1);
        assert.equal(await sqlCount('finance_events', "business_reference=$1 AND kind='PAYOUT_SETTLEMENT'", [row.id]), 0);
      }
      assert.equal((await balance(f.label.id)).available, '1000.00');
    }, { actor: 'admin' });
    await check('ambiguous committed payout reload observes pending and prevents new request', async f => {
      await f.payoutPage(); await f.fillPayout(); const endpoint = origin + '/api/v1/payouts';
      await f.page.route(endpoint, async (route: any) => { if (route.request().method() !== 'POST') return route.continue(); assert.equal((await route.fetch()).status(), 200); await route.abort(); });
      await f.page.getByRole('button', { name: 'Ajukan pencairan', exact: true }).click(); await f.payoutError(); await f.page.unroute(endpoint);
      await f.page.reload(); await f.page.getByRole('cell', { name: 'pending', exact: true }).waitFor();
      assert.equal(await f.page.getByRole('button', { name: 'Ajukan pencairan', exact: true }).isDisabled(), true); assert.equal(await sqlCount('payout_requests', 'user_id=$1', [f.label.id]), 1);
    });
    await check('offline payout before commit retains retry identity and recovers once', async f => {
      await f.payoutPage(); await f.fillPayout(); const before = await snapshot();
      await f.context.setOffline(true); await f.page.getByRole('button', { name: 'Ajukan pencairan', exact: true }).click(); await f.payoutError(); assert.deepEqual(await snapshot(), before);
      await f.context.setOffline(false); await f.submitPayout(); assert.equal(await sqlCount('payout_requests', 'user_id=$1', [f.label.id]), 1);
    });
    await check('real API rate limit rejects payout then same operation retries once', async f => {
      await f.payoutPage(); await f.fillPayout(); controls.rateLimited = true;
      try { await f.noChange(async () => { const r = await f.clickPost('Ajukan pencairan', '/api/v1/payouts'); assert.equal(r.status(), 429); assert.equal(r.headers()['retry-after'], '1'); await f.payoutError(); }); }
      finally { controls.rateLimited = false; }
      await f.submitPayout(); assert.equal(await sqlCount('payout_requests', 'user_id=$1', [f.label.id]), 1);
    });

    await check('import double click and exact replay create one batch and earning', async f => {
      await f.importPage(); await f.preview();
      const response = f.responseFor('/api/v1/royalties/imports/commit');
      await f.page.getByRole('button', { name: 'Simpan impor tervalidasi', exact: true }).evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
      const r = await response; assert.equal(r.status(), 200); const batch = await r.json();
      await f.page.getByRole('status').filter({ hasText: 'Batch ' }).waitFor();
      const replay = await f.http('/api/v1/royalties/imports/commit', f.statement, adminId); assert.equal(replay.status, 200); assert.equal(replay.body.replayed, true);
      assert.equal(replay.body.id, batch.id); assert.equal(await sqlCount('royalty_import_batches', 'source=$1', [f.statement.source]), 1);
      assert.equal(await sqlCount('finance_events', "business_reference=$1 AND kind='ROYALTY_EARNING'", ['royalty:' + batch.id]), 1);
    }, { actor: 'admin' });
    await check('overlapping persisted royalty source row rejects changed money', async f => {
      const result = await f.http('/api/v1/royalties/imports/commit', f.statement, adminId); assert.equal(result.status, 200);
      const changed = { ...f.statement, rows: [{ ...f.statement.rows[0], gross_amount: '101.00', net_amount: '101.00' }] };
      await f.noChange(async () => f.expectError(await f.http('/api/v1/royalties/imports/commit', changed, adminId), 409, 'ROYALTY_SOURCE_ROW_CONFLICT'));
    }, { actor: 'admin' });
    await check('beneficiary becomes inactive after valid preview so commit fails closed', async f => {
      await f.importPage(); await f.preview(); await database.owner.query("UPDATE soundpub.backend_users SET status='inactive' WHERE id=$1", [f.artist.id]);
      await f.noChange(async () => { const r = await f.clickPost('Simpan impor tervalidasi', '/api/v1/royalties/imports/commit'); assert.equal(r.status(), 400); assert.equal((await r.json()).error.code, 'ROYALTY_IMPORT_INVALID'); await f.page.getByRole('alert').filter({ hasText: 'Operasi gagal' }).waitFor(); });
    }, { actor: 'admin' });
    await check('import committed response lost then retry resolves exact persisted batch', async f => {
      await f.importPage(); await f.preview(); const endpoint = origin + '/api/v1/royalties/imports/commit';
      await f.page.route(endpoint, async (route: any) => { assert.equal((await route.fetch()).status(), 200); await route.abort(); });
      await f.page.getByRole('button', { name: 'Simpan impor tervalidasi', exact: true }).click(); await f.page.getByRole('alert').filter({ hasText: 'Operasi gagal' }).waitFor();
      await f.page.unroute(endpoint); const r = await f.clickPost('Simpan impor tervalidasi', '/api/v1/royalties/imports/commit'); assert.equal((await r.json()).replayed, true);
      await f.page.getByRole('status').filter({ hasText: 'sudah tersimpan' }).waitFor(); assert.equal(await sqlCount('royalty_import_batches', 'source=$1', [f.statement.source]), 1);
    }, { actor: 'admin' });
    await check('committed unreconciled imports quarantine funded label payout and balance', async f => {
      assert.equal((await f.http('/api/v1/royalties/imports/commit', f.statement, adminId)).status, 200);
      await f.page.goto(origin + '/dashboard/payouts'); await f.page.getByText('Saldo belum tersedia hingga rekonsiliasi selesai.', { exact: true }).waitFor();
      assert.equal(await f.page.getByRole('button', { name: 'Ajukan pencairan', exact: true }).isDisabled(), true);
      const b = await f.http('/api/v1/balance'); assert.equal(b.body.available, null); assert.equal(b.body.status, 'RECONCILIATION_REQUIRED');
      await f.noChange(async () => f.expectError(await f.http('/api/v1/payouts', f.payoutBody), 409, 'PAYOUT_INELIGIBLE'));
    });
    await check('stale correction conflict and replay produce one offset visible after reload', async f => {
      const batch = (await f.http('/api/v1/royalties/imports/commit', f.statement, adminId)).body;
      const path = `/api/v1/royalties/imports/${batch.id}/correction`;
      const results = await Promise.all([f.http(path, { reason: 'Synthetic first' }, adminId), f.http(path, { reason: 'Synthetic competing' }, adminId)]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      const winner = results[0].status === 200 ? 'Synthetic first' : 'Synthetic competing';
      await f.noChange(async () => { const replay = await f.http(path, { reason: winner }, adminId); assert.equal(replay.status, 200); assert.equal(replay.body.replayed, true); });
      assert.equal(await sqlCount('finance_events', "business_reference=$1 AND kind='ROYALTY_ADJUSTMENT'", ['royalty:' + batch.id]), 1);
      await f.page.goto(origin + '/dashboard/upload');
      await f.page.getByRole('listitem').filter({ hasText: batch.id }).filter({ hasText: 'VOIDED_WITH_OFFSET' }).waitFor();
      const summary = await f.http('/api/v1/royalties/summary?beneficiary_id=' + f.artist.id, undefined, adminId); assert.equal(summary.body.net_earnings, '0.00');
    }, { actor: 'admin' });
    await check('empty oversized negative and excess-precision imports never POST', async f => {
      await f.importPage(); const before = requests.length;
      for (const rows of [[], Array(1001).fill(f.statement.rows[0]), [{ ...f.statement.rows[0], net_amount: '-1.00' }], [{ ...f.statement.rows[0], net_amount: '0.001' }]]) {
        await f.page.getByLabel('Pernyataan JSON').fill(JSON.stringify({ ...f.statement, rows })); await f.page.getByRole('button', { name: 'Validasi', exact: true }).click();
        await f.page.getByRole('alert').filter({ hasText: 'Operasi gagal' }).waitFor(); assert.equal(await f.page.getByRole('button', { name: 'Simpan impor tervalidasi', exact: true }).isDisabled(), true);
      }
      assert.equal(requests.slice(before).filter((r: any) => r.method === 'POST').length, 0);
    }, { actor: 'admin' });

    await check('invoice double click creates one local and mock-provider invoice', async f => {
      await f.invoicePage(); const response = f.responseFor('/api/v1/payments/invoices');
      await f.page.getByRole('button', { name: 'Buat invoice mock', exact: true }).evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
      assert.equal((await response).status(), 200); await f.page.getByText('PENDING', { exact: true }).waitFor();
      assert.equal(await sqlCount('payment_invoices', 'business_id=$1', [f.release]), 1);
      assert.equal((await f.createInvoice()).business_id, f.release);
    }, { actor: 'admin' });
    await check('invoice committed response lost then status check recovers without recreation', async f => {
      await f.invoicePage(); const endpoint = origin + '/api/v1/payments/invoices';
      await f.page.route(endpoint, async (route: any) => { assert.equal((await route.fetch()).status(), 200); await route.abort(); });
      await f.page.getByRole('button', { name: 'Buat invoice mock', exact: true }).click(); await f.page.getByRole('alert').filter({ hasText: 'Pembuatan invoice belum dikonfirmasi' }).waitFor();
      await f.page.unroute(endpoint); await f.page.getByRole('button', { name: 'Periksa status', exact: true }).click(); await f.page.getByText('PENDING', { exact: true }).waitFor();
      await f.page.reload(); await f.page.getByText('PENDING', { exact: true }).waitFor(); assert.equal(await sqlCount('payment_invoices', 'business_id=$1', [f.release]), 1);
    }, { actor: 'admin' });
    for (const fault of ['create', 'create-timeout']) await check(`mock provider ${fault} rolls back invoice and permits retry`, async f => {
      await f.invoicePage(); controls.fault = fault;
      try { await f.noChange(async () => { const r = await f.clickPost('Buat invoice mock', '/api/v1/payments/invoices'); assert.equal(r.status(), 503); await f.page.getByRole('alert').filter({ hasText: 'Pembuatan invoice belum dikonfirmasi' }).waitFor(); }); }
      finally { controls.fault = ''; }
      assert.equal((await f.clickPost('Buat invoice mock', '/api/v1/payments/invoices')).status(), 200); await f.page.getByText('PENDING', { exact: true }).waitFor();
      assert.equal(await sqlCount('payment_invoices', 'business_id=$1', [f.release]), 1);
    }, { actor: 'admin' });
    await check('provider status failure hides cached PAID until retry confirms persisted refund', async f => {
      const invoice = await f.createInvoice(); assert.equal((await f.callback(invoice, 'PAID')).status, 200);
      await f.page.goto(origin + '/dashboard/invoices?release_id=' + f.release); await f.page.getByText('PAID', { exact: true }).waitFor();
      controls.fault = 'status';
      try { await f.page.getByRole('button', { name: 'Periksa status', exact: true }).click(); await f.page.getByRole('alert').filter({ hasText: 'Status pembayaran belum dapat dikonfirmasi' }).waitFor();
        assert.equal(await f.page.getByText('PAID', { exact: true }).count(), 0); assert.equal(await f.page.getByText('Terverifikasi', { exact: true }).count(), 0); }
      finally { controls.fault = ''; }
      assert.equal((await f.callback(invoice, 'REFUNDED')).status, 200);
      await f.page.getByRole('button', { name: 'Periksa status', exact: true }).click(); await f.page.getByText('REFUNDED', { exact: true }).waitFor();
      await f.page.reload(); await f.page.getByText('REFUNDED', { exact: true }).waitFor();
    }, { actor: 'admin' });
    await check('provider refund failure rolls back mock write ledger audit and receipt', async f => {
      const invoice = await f.createInvoice(); assert.equal((await f.callback(invoice, 'PAID')).status, 200);
      controls.fault = 'refund'; const body = { invoice_id: invoice.id, idempotency_key: randomUUID(), reason: 'Synthetic fault' };
      try { await f.noChange(async () => f.expectError(await f.http('/api/v1/admin/payments/refunds', body, adminId), 503, 'MOCK_PROVIDER_REJECTED')); }
      finally { controls.fault = ''; }
      const result = await f.http('/api/v1/admin/payments/refunds', body, adminId); assert.equal(result.status, 200); assert.equal(result.body.status, 'REFUNDED');
      await f.page.goto(origin + '/dashboard/invoices?release_id=' + f.release); await f.page.getByText('REFUNDED', { exact: true }).waitFor();
    }, { actor: 'admin' });
    await check('invalid callback signature rejected through real HTTP without effects', async f => {
      const invoice = await f.createInvoice(); await f.noChange(async () => f.expectError(await f.callback(invoice, 'PAID', {}, { signature: '0'.repeat(64) }), 401, 'UNAUTHORIZED'));
      await f.page.goto(origin + '/dashboard/invoices?release_id=' + f.release); await f.page.getByText('PENDING', { exact: true }).waitFor();
    }, { actor: 'admin' });
    await check('expired signed callback rejected through real HTTP without effects', async f => {
      const invoice = await f.createInvoice(); await f.noChange(async () => f.expectError(await f.callback(invoice, 'PAID', {}, { timestamp: String(Math.floor(Date.now() / 1000) - 600) }), 401, 'UNAUTHORIZED'));
    }, { actor: 'admin' });
    await check('callback amount currency and refund-before-paid mismatch require review', async f => {
      const invoice = await f.createInvoice();
      for (const [status, changes] of [['PAID', { amount_minor: '1' }], ['PAID', { currency: 'USD' }], ['REFUNDED', {}]] as const) assert.equal((await f.callback(invoice, status, changes)).status, 200);
      assert.equal(await sqlCount('payment_effects', 'invoice_id=$1', [invoice.id]), 0);
      const result = await f.http('/api/v1/payments/releases/' + f.release, undefined, adminId); assert.equal(result.body.invoice.status, 'PENDING'); assert.equal(result.body.reconciliation.reconciled, false);
      await f.page.goto(origin + '/dashboard/invoices?release_id=' + f.release); await f.page.getByText('Belum terverifikasi', { exact: true }).waitFor();
      assert.equal(await sqlCount('payment_callback_receipts', "provider_invoice_id=$1 AND disposition IN ('mismatch','invalid_transition')", [invoice.provider_invoice_id]), 3);
    }, { actor: 'admin' });
    await check('callback replay and reused event ID cannot double charge', async f => {
      const invoice = await f.createInvoice(); const eventId = randomUUID();
      assert.equal((await f.callback(invoice, 'PAID', {}, { eventId })).status, 200);
      await f.noChange(async () => { assert.equal((await f.callback(invoice, 'PAID', {}, { eventId })).status, 200); f.expectError(await f.callback(invoice, 'FAILED', {}, { eventId }), 401, 'UNAUTHORIZED'); });
      assert.equal(await sqlCount('payment_effects', "invoice_id=$1 AND kind='PAYMENT_CHARGE'", [invoice.id]), 1);
      assert.equal(await sqlCount('payment_callback_receipts', 'event_id=$1', [eventId]), 1);
    }, { actor: 'admin' });
    await check('FAILED payment overrides forged success URL and survives reload', async f => {
      const invoice = await f.createInvoice(); assert.equal((await f.callback(invoice, 'FAILED')).status, 200);
      await f.page.goto(origin + '/payment/callback?release_id=' + f.release + '&status=success&paid=true');
      await f.page.getByText('FAILED', { exact: true }).waitFor(); assert.equal(await f.page.getByText('PAID', { exact: true }).count(), 0);
      await f.page.reload(); await f.page.getByText('FAILED', { exact: true }).waitFor(); assert.equal(await sqlCount('payment_effects', 'invoice_id=$1', [invoice.id]), 0);
    }, { actor: 'admin' });
    await check('out-of-order callbacks cannot regress PAID or resurrect REFUNDED', async f => {
      const invoice = await f.createInvoice(); assert.equal((await f.callback(invoice, 'PAID')).status, 200);
      for (const status of ['PENDING', 'FAILED']) assert.equal((await f.callback(invoice, status)).status, 200);
      assert.equal((await f.http('/api/v1/payments/releases/' + f.release, undefined, adminId)).body.invoice.status, 'PAID');
      assert.equal((await f.callback(invoice, 'REFUNDED')).status, 200); assert.equal((await f.callback(invoice, 'PAID')).status, 200);
      await f.page.goto(origin + '/dashboard/invoices?release_id=' + f.release); await f.page.getByText('REFUNDED', { exact: true }).waitFor();
      assert.equal(await sqlCount('payment_effects', 'invoice_id=$1', [invoice.id]), 2);
    }, { actor: 'admin' });
    await check('provider mismatch blocks payment readiness and refund without effects', async f => {
      const invoice = await f.createInvoice(); assert.equal((await f.callback(invoice, 'PAID')).status, 200);
      await database.owner.query("UPDATE soundpub.payment_mock_invoices SET amount_minor=amount_minor+1 WHERE provider_invoice_id=$1", [invoice.provider_invoice_id]);
      const ready = await f.http(`/api/v1/releases/${f.release}/submission-readiness`, undefined, adminId); assert.equal(ready.status, 200);
      assert.ok(ready.body.blockers.some((b: any) => b.code === 'PAYMENT_REQUIRED'));
      await f.noChange(async () => f.expectError(await f.http('/api/v1/admin/payments/refunds', { invoice_id: invoice.id, idempotency_key: randomUUID(), reason: 'Synthetic mismatch' }, adminId), 409, 'PAYMENT_UNRECONCILED'));
      await f.page.goto(origin + '/dashboard/invoices?release_id=' + f.release); await f.page.getByText('Belum terverifikasi', { exact: true }).waitFor();
    }, { actor: 'admin' });
    await check('expired mock bearer rejects eligible payout then recovery submits once', async f => {
      await f.payoutPage(); await f.fillPayout(); controls.expired.add(f.label.id);
      try { await f.noChange(async () => { assert.equal((await f.clickPost('Ajukan pencairan', '/api/v1/payouts')).status(), 401); await f.payoutError(); }); }
      finally { controls.expired.clear(); }
      await f.submitPayout(); assert.equal(await sqlCount('payout_requests', 'user_id=$1', [f.label.id]), 1);
    });
    await check('expired Supabase session refreshes against isolated mock auth provider', async f => {
      await f.payoutPage(); assert.equal(f.refreshes.length, 1); await f.fillPayout(); await f.submitPayout();
      assert.equal(await sqlCount('payout_requests', 'user_id=$1', [f.label.id]), 1);
    }, { expired: true, refresh: 'success' });
    await check('rejected expired refresh redirects auth and creates no financial effects', async f => {
      await f.page.waitForURL(origin + '/auth'); assert.equal(f.refreshes.length, 1);
      assert.equal(await f.page.getByRole('button', { name: 'Ajukan pencairan', exact: true }).count(), 0);
      assert.equal(await sqlCount('payout_requests', 'user_id=$1', [f.label.id]), 0);
    }, { expired: true, refresh: 'failure' });
    await check('full offline royalty refresh hides cached totals and recovers online', async f => {
      await f.page.getByText('IDR 0.00', { exact: true }).first().waitFor();
      try {
        await f.context.setOffline(true); await f.page.getByRole('button', { name: 'Muat ulang', exact: true }).click();
        await f.page.getByRole('alert').filter({ hasText: 'Gagal memuat royalti' }).waitFor({ timeout: 18000 });
        assert.equal(await f.page.getByText('IDR 0.00', { exact: true }).count(), 0);
      } finally {
        await f.context.setOffline(false);
        await f.page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Muat ulang')?.disabled);
        await f.page.getByRole('button', { name: 'Muat ulang', exact: true }).click(); await f.page.getByText('IDR 0.00', { exact: true }).first().waitFor();
      }
    });
    await check('slow payment read times out then repeated failures stop until explicit retry', async f => {
      const invoice = await f.createInvoice();
      await f.page.goto(origin + '/dashboard/invoices?release_id=' + f.release); await f.page.getByText('PENDING', { exact: true }).waitFor();
      const endpoint = origin + '/api/v1/payments/releases/' + f.release;
      let release!: () => void, reached!: () => void;
      const gate = new Promise<void>(r => release = r), entered = new Promise<void>(r => reached = r);
      await f.page.route(endpoint, async (route: any) => { reached(); await gate; await route.abort().catch(() => {}); });
      try {
        await f.page.getByRole('button', { name: 'Periksa status', exact: true }).click(); await entered;
        assert.equal(await f.page.getByRole('button', { name: 'Periksa status', exact: true }).isDisabled(), true);
        await f.page.getByRole('alert').filter({ hasText: 'Status pembayaran belum dapat dikonfirmasi' }).waitFor({ timeout: 18000 });
        assert.equal(await f.page.getByText('PENDING', { exact: true }).count(), 0);
      } finally { release(); await f.page.unroute(endpoint); }
      let attempts = 0;
      await f.page.route(endpoint, (route: any) => { attempts++; return route.abort(); });
      try {
        for (let i = 0; i < 2; i++) {
          await f.page.getByRole('button', { name: 'Periksa status', exact: true }).click();
          await f.page.getByRole('button', { name: 'Periksa status', exact: true }).waitFor({ state: 'visible' });
          await f.page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Periksa status')?.disabled);
        }
        assert.equal(attempts, 2);
      } finally { await f.page.unroute(endpoint); }
      await f.page.getByRole('button', { name: 'Periksa status', exact: true }).click(); await f.page.getByText('PENDING', { exact: true }).waitFor();
      assert.equal(await sqlCount('payment_invoices', 'id=$1', [invoice.id]), 1);
    }, { actor: 'admin' });
    await check('label admin-route navigation hides privileged controls', async f => {
      for (const path of ['/dashboard/upload', '/dashboard/admin-payouts', '/dashboard/invoices']) {
        await f.page.goto(origin + path); await f.page.waitForURL(origin + '/dashboard');
        assert.equal(await f.page.getByRole('button', { name: 'Simpan impor tervalidasi', exact: true }).count(), 0);
        assert.equal(await f.page.getByRole('button', { name: 'Setujui', exact: true }).count(), 0);
        assert.equal(await f.page.getByRole('button', { name: 'Buat invoice mock', exact: true }).count(), 0);
      }
    });
    await check('payment owner and refund admin boundaries reject browser mutations', async f => {
      const invoice = await f.createInvoice(); await f.noChange(async () => {
        f.expectError(await f.http('/api/v1/payments/invoices', { release_id: f.release, idempotency_key: 'forged-owner' }, f.label.id), 404, 'NOT_FOUND');
        f.expectError(await f.http('/api/v1/admin/payments/refunds', { invoice_id: invoice.id, idempotency_key: randomUUID(), reason: 'Unauthorized' }, f.artist.id), 403, 'FORBIDDEN');
        f.expectError(await f.http('/api/v1/royalties/summary?beneficiary_id=' + f.artist.id), 403, 'FORBIDDEN');
      });
    });
    await check('all seven current roles enforce financial HTTP authorization', async f => {
      await f.noChange(async () => {
        for (const role of ['user', 'artist', 'label', 'copyright', 'whitelabel', 'admin', 'superadmin']) {
          await database.owner.query('UPDATE soundpub.user_roles SET role=$2 WHERE user_id=$1', [f.label.id, role]);
          const privileged = role === 'admin' || role === 'superadmin';
          const payout = await f.http('/api/v1/payouts', { ...f.payoutBody, amount: '1000.01' });
          f.expectError(payout, ['label', 'whitelabel'].includes(role) ? 409 : 403,
            ['label', 'whitelabel'].includes(role) ? 'INSUFFICIENT_BALANCE' : 'FORBIDDEN');
          for (const [path, body] of [['/api/v1/royalties/imports/preview', f.statement],
            ['/api/v1/admin/payouts', undefined], ['/api/v1/royalties/summary?beneficiary_id=' + f.artist.id, undefined]] as const) {
            const response = await f.http(path, body);
            if (privileged) assert.equal(response.status, 200);
            else f.expectError(response, 403, 'FORBIDDEN');
          }
        }
      });
    });
    await check('composer allocation identity and share validation in browser UI', async () => {},
      { skip: 'No composer financial allocation browser surface or approved share contract. Unsupported-field artist-import denials are covered separately; cannot fabricate this acceptance.' });
    assert.equal(number, CHECKS_PER_VIEWPORT, 'Admission scenario inventory drift');
  }
}
