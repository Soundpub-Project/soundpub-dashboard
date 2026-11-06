import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Principal } from '../src/auth/index.js';
import { buildApp } from '../src/api/index.js';
import { createComposerRoyaltiesService } from '../src/composer-royalties/index.js';
import { copyrightRoyaltySummary } from '../src/composer-royalties/contracts.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

const empty = { currency: 'IDR', semantics: 'GROSS_ENTRIES', total_minor: '0', entry_count: '0', periods: [], latest: null };
const actor: Principal = { id: randomUUID(), roles: ['copyright'], status: 'active' };
function fixture(roles: Principal['roles'], status = 'active') {
  const scopes: unknown[] = [];
  const db = { async query(sql: string, values: unknown[] = []) {
    if (sql.includes('FROM soundpub.backend_users')) return { rows: [{ id: actor.id, status }] };
    if (sql.includes('FROM soundpub.user_roles')) return { rows: roles.map(role => ({ user_id: actor.id, role })) };
    if (sql.includes('WITH scoped')) { scopes.push(values[0]); return { rows: [empty] }; }
    return { rows: [] };
  }, release() {} };
  return { scopes, service: createComposerRoyaltiesService({ connect: async () => db } as unknown as Pool) };
}

test('summary uses verified DB authority and same beneficiary scope as list', async () => {
  for (const role of ['admin', 'superadmin', 'copyright'] as const) {
    const f = fixture([role]);
    assert.deepEqual(await f.service.summary(actor, {}), empty);
    assert.deepEqual(f.scopes, [role === 'copyright' ? actor.id : null]);
  }
  const downgraded = fixture(['copyright']);
  await downgraded.service.summary({ ...actor, roles: ['admin'] }, {});
  assert.deepEqual(downgraded.scopes, [actor.id]);
  for (const f of [fixture([]), fixture(['user']), fixture(['admin'], 'suspended')]) {
    await assert.rejects(f.service.summary({ ...actor, roles: ['admin'] }, {}), { code: 'FORBIDDEN' });
    assert.deepEqual(f.scopes, []);
  }
  await assert.rejects(fixture(['admin']).service.summary(actor, { owner_id: randomUUID() }), { code: 'BAD_REQUEST' });
});

test('summary HTTP authenticates, rejects owner override, and exposes strict exact string OpenAPI', async () => {
  const f = fixture(['copyright']);
  const app = buildApp({ auth: { authenticate: async token => token === 'valid' ? actor : null },
    readiness: { check: async () => true }, admin: { suspendUser: async () => undefined },
    webhooks: { receive: async () => false }, rateLimiter: { consume: async () => ({ allowed: true }) },
    composerRoyalties: f.service });
  try {
    const url = '/api/v1/copyright/royalties/summary';
    assert.equal((await app.inject(url)).statusCode, 401);
    const headers = { authorization: 'Bearer valid' };
    const response = await app.inject({ url, headers });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), empty);
    assert.equal((await app.inject({ url: `${url}?owner_id=${randomUUID()}`, headers })).statusCode, 400);
    const operation = (await app.inject('/openapi.json')).json().paths[url].get;
    assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
    const schema = operation.responses['200'].content['application/json'].schema;
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.total_minor.type, 'string');
    assert.equal(schema.properties.periods.items.additionalProperties, false);
    assert.equal(copyrightRoyaltySummary.safeParse({ ...empty, total_minor: 0 }).success, false);
  } finally { await app.close(); }
});

test('summary PostgreSQL aggregates all scoped entries exactly, including corrected history', {
  skip: process.env.RUN_DOCKER_TESTS !== '1', timeout: 120_000,
}, async () => {
  const database = await concurrencyPostgres();
  const { owner, runtime } = database;
  const admin: Principal = { id: randomUUID(), roles: ['admin'], status: 'active' };
  const beneficiary: Principal = { ...actor, id: randomUUID() };
  const other: Principal = { ...actor, id: randomUUID() };
  const outsider: Principal = { ...actor, id: randomUUID() };
  try {
    for (const user of [admin, beneficiary, other, outsider]) {
      await owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active')", [user.id]);
      await owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,$2,now())', [user.id,user.roles[0]]);
    }
    const service = createComposerRoyaltiesService(runtime);
    assert.deepEqual(await service.summary(outsider, {}), empty);
    // More than one list page, fractional pennies, and a total above JS safe integer minor units.
    const rows = Array.from({ length: 102 }, (_, index) => ({ composer_code: `SUMMARY-${index}`,
      composer_name: 'Synthetic Composer', total_net_royalti: index === 0 ? '90071992547409.93' : '0.10' }));
    for (const row of rows) await service.createMapping(admin, { composer_code: row.composer_code,
      owner_id: beneficiary.id, canonical_name: row.composer_name, valid_from: '2026-01' });
    await service.createMapping(admin, { composer_code: 'OTHER', owner_id: other.id, canonical_name: 'Other', valid_from: '2026-01' });
    const post = async (period: string, source_batch: string, inputRows: typeof rows) => {
      const statement = { source: 'summary-test', source_batch, period, currency: 'IDR', rows: inputRows };
      const preview = await service.preview(admin, statement) as { checksum: string };
      return await service.postImport(admin, { expected_checksum: preview.checksum, statement }) as { batch: { id: string } };
    };
    const first = await post('2026-10', 'first', rows);
    await post('2026-11', 'second', [{ ...rows[1]!, total_net_royalti: '0.20' },
      { composer_code: 'OTHER', composer_name: 'Other', total_net_royalti: '2.00' }]);
    const summary = await service.summary(beneficiary, {});
    assert.equal(summary.total_minor, '9007199254742023');
    assert.equal(summary.entry_count, '103');
    assert.deepEqual(summary.periods, [
      { period: '2026-11', total_minor: '20', entry_count: '1' },
      { period: '2026-10', total_minor: '9007199254742003', entry_count: '102' },
    ]);
    assert.deepEqual(summary.latest, { period: '2026-11', amount_minor: '20' });
    assert.equal((await service.summary(other, {})).total_minor, '200');
    assert.equal((await service.summary(admin, {})).total_minor, '9007199254742223');
    assert.deepEqual(await service.summary(outsider, {}), empty);
    await service.correct(admin, first.batch.id, { reason: 'synthetic reversal' });
    assert.deepEqual(await service.summary(beneficiary, {}), summary);
    await owner.query('DELETE FROM soundpub.user_roles WHERE user_id=$1', [admin.id]);
    await assert.rejects(service.summary(admin, {}), { code: 'FORBIDDEN' });
  } finally { await database.close(); }
});
