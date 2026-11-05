import test from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { createRoyaltiesService } from '../src/royalties/index.js';

const actor = { id: '00000000-0000-4000-8000-000000000001', status: 'active' as const, roles: ['admin' as const] };
const batchId = '00000000-0000-4000-8000-000000000002';

function fixture() {
  const queries: { sql: string; args: unknown[] }[] = [];
  const db = {
    release() {},
    async query(sql: string, args: unknown[] = []) {
      queries.push({ sql, args });
      const result = (rows: unknown[] = []) => ({ rows, rowCount: rows.length });
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return result();
      if (sql.includes('SELECT id, status FROM soundpub.backend_users')) return result([{ id: actor.id, status: 'active' }]);
      if (sql.includes('SELECT pg_advisory_xact_lock')) return result();
      if (sql.includes('SELECT user_id, role')) return result([{ user_id: actor.id, role: 'admin' }]);
      if (sql.includes('FROM soundpub.royalty_import_batches b') && sql.includes('WHERE b.id=$1')) return result([{
        id: batchId, source: 'test', period: '2026-10', currency: 'IDR', filename: 'test.csv', uploader_id: actor.id,
        row_count: 205, total_amount: '205.00', validation_result: {}, checksum: 'checksum', status: 'UNRECONCILED',
        replacement_batch_id: null, replaces_batch_id: null, change_reason: null, change_actor_id: null, changed_at: null,
        created_at: new Date('2026-11-05T00:00:00Z'),
      }]);
      if (sql.includes('FROM soundpub.royalty_import_entries e WHERE e.batch_id=$1')) return result([{
        id: '00000000-0000-4000-8000-000000000003', source_row_id: 'row-101', source_row_number: 101,
        allocations: [], net_amount: '1.00',
      }]);
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  return { service: createRoyaltiesService({ connect: async () => db } as unknown as Pool), queries };
}

test('royalty detail defaults to first 100 source-ordered entries', async () => {
  const { service, queries } = fixture();
  const detail = await service.detail(actor, batchId);
  assert.equal(detail.entry_total, 205);
  assert.equal(detail.entry_limit, 100);
  assert.equal(detail.entry_offset, 0);
  assert.equal(detail.entries.length, 1);
  const entries = queries.find(query => query.sql.includes('FROM soundpub.royalty_import_entries e'))!;
  assert.deepEqual(entries.args, [batchId, 100, 0]);
  assert.match(entries.sql, /ORDER BY \(e\.source_row_number IS NULL\),e\.source_row_number,e\.source_row_id,e\.id LIMIT \$2 OFFSET \$3/);
});

test('royalty detail accepts bounded limit and offset', async () => {
  const { service, queries } = fixture();
  const detail = await service.detail(actor, batchId, { limit: '25', offset: '100' });
  assert.equal(detail.entry_limit, 25);
  assert.equal(detail.entry_offset, 100);
  const entries = queries.find(query => query.sql.includes('FROM soundpub.royalty_import_entries e'))!;
  assert.deepEqual(entries.args, [batchId, 25, 100]);
});

test('royalty detail rejects unsafe pagination values', async () => {
  const { service } = fixture();
  await assert.rejects(service.detail(actor, batchId, { limit: 0 }), { statusCode: 400 });
  await assert.rejects(service.detail(actor, batchId, { limit: 501 }), { statusCode: 400 });
  await assert.rejects(service.detail(actor, batchId, { offset: -1 }), { statusCode: 400 });
  await assert.rejects(service.detail(actor, batchId, { offset: 100001 }), { statusCode: 400 });
});
