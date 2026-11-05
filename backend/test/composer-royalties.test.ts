import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';
import { parseComposerStatement } from '../src/composer-royalties/contracts.js';
import { createComposerRoyaltiesService } from '../src/composer-royalties/index.js';

const actor = { id: '00000000-0000-4000-8000-000000000001', status: 'active' as const, roles: ['admin' as const] };
const owner = '00000000-0000-4000-8000-000000000002';
const mapping = '00000000-0000-4000-8000-000000000003';
const row = { composer_code: 'SYNTHETIC001', composer_name: 'Synthetic Composer', total_net_royalti: '0.10' };
const statement = { source: 'synthetic', source_batch: 'synthetic-batch', period: '2026-10', currency: 'IDR', rows: [row] };

function pool(rows: object[] = []) {
  const writes: string[] = [];
  const client = { async query(sql: string) {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [], rowCount: null };
    if (sql.includes('FROM soundpub.backend_users')) return { rows: [{ id: actor.id, status: 'active' }], rowCount: 1 };
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 };
    if (sql.includes('FROM soundpub.user_roles')) return { rows: [{ user_id: actor.id, role: 'admin' }], rowCount: 1 };
    if (sql.includes('DISTINCT ON')) return { rows, rowCount: rows.length };
    writes.push(sql); return { rows: [], rowCount: 0 };
  }, release() {} };
  return { value: { connect: async () => client } as unknown as Pool, writes };
}

test('composer parser normalizes exact money and rejects case-insensitive duplicates', () => {
  assert.equal(parseComposerStatement(statement).total_amount, '0.10');
  assert.throws(() => parseComposerStatement({ ...statement, rows: [row, { ...row, composer_code: 'synthetic001' }] }), /DUPLICATE_COMPOSER/);
});

test('DB-resolved preview snapshots mapping, blockers and deterministic checksum without writes', async () => {
  const database = pool([{ id: mapping, composer_code: 'synthetic001', owner_id: owner, canonical_name: 'Canonical Composer' }]);
  const service = createComposerRoyaltiesService(database.value);
  const first = await service.preview(actor, statement) as any;
  const second = await service.preview(actor, structuredClone(statement)) as any;
  assert.deepEqual(first, second);
  assert.deepEqual(first.rows[0], { ...row, beneficiary_id: owner, canonical_name: 'Canonical Composer', mapping_id: mapping, status: 'MATCHED' });
  assert.deepEqual(first.blockers, ['WORK_ALLOCATION_CONTRACT_REQUIRED']);
  assert.match(first.checksum, /^[a-f0-9]{64}$/);
  assert.equal(first.posting_allowed, false);
  assert.deepEqual(database.writes, []);
});

test('unmatched preview remains quarantined and stale DB authority fails closed', async () => {
  const database = pool();
  const service = createComposerRoyaltiesService(database.value);
  const result = await service.preview(actor, statement) as any;
  assert.deepEqual(result.blockers, ['COMPOSER_IDENTITY_MAPPING_REQUIRED', 'WORK_ALLOCATION_CONTRACT_REQUIRED']);
  const stale = pool();
  const original = stale.value.connect.bind(stale.value);
  stale.value.connect = async () => { const client = await original(); const query = client.query.bind(client);
    client.query = ((sql: string, values?: unknown[]) => sql.includes('FROM soundpub.user_roles')
      ? Promise.resolve({ rows: [], rowCount: 0 }) : query(sql, values)) as typeof client.query; return client; };
  await assert.rejects(createComposerRoyaltiesService(stale.value).preview(actor, statement), { code: 'FORBIDDEN' });
});

test('strict statement boundaries reject posting fields, invalid money and unsupported shares', () => {
  for (const input of [{ ...statement, post: true }, { ...statement, rows: [{ ...row, total_net_royalti: '1.001' }] },
    { ...statement, rows: [{ ...row, share_percentage: '100' }] }]) assert.throws(() => parseComposerStatement(input));
});
