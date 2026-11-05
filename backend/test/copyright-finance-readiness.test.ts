import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool, PoolClient } from 'pg';
import { createBalanceService } from '../src/finance/service.js';
import { reconciliationSnapshot } from '../src/finance/readiness.js';
import { runFinanceReconciliation } from '../src/reconciliation/index.js';

const owner = '00000000-0000-4000-8000-000000000001';
const actor = { id: owner, status: 'active' as const, roles: ['copyright' as const] };

test('balance masks availability for unreconciled copyright entry without changing generic royalty predicate', async () => {
  const calls: string[] = [];
  const client = { release() {}, async query(sql: string) {
    calls.push(sql);
    const rows = sql.includes('SELECT id, status FROM') ? [{ id: owner, status: 'active' }]
      : sql.includes('SELECT user_id, role') ? [{ user_id: owner, role: 'copyright' }]
      : sql.includes(') unreconciled LIMIT 1') ? [{}]
      : sql.includes('AS available,') ? [{ available: '1000', reserved: '0', settled: '0', charged: '0', refunded: '0' }]
      : [];
    return { rows, rowCount: rows.length };
  } };
  const balance = await createBalanceService({ connect: async () => client } as unknown as Pool).get(actor);
  assert.equal(balance.status, 'RECONCILIATION_REQUIRED');
  assert.equal(balance.available, null);
  const readiness = calls.find(sql => sql.includes(') unreconciled LIMIT 1'))!;
  assert.match(readiness, /correction\.id IS NULL\s+AND NOT soundpub\.royalty_reconciliation_intact/);
  assert.match(readiness, /copyright_royalty_entries/);
  assert.match(readiness, /entry\.beneficiary_id=ANY/);
  assert.match(readiness, /reconciliation\.result='MATCHED'/);
  assert.match(readiness, /copyright_royalty_reconciliation_intact/);
  assert.match(readiness, /correction\.id IS NOT NULL AND NOT soundpub\.copyright_royalty_correction_intact/);
  assert.doesNotMatch(readiness, /entry\.owner_id/);
});

test('readiness expects only reconciled copyright earnings and intact corrections, then fails closed', async () => {
  let captured = '';
  const db = { async query(sql: string) { captured = sql; return { rows: [{ snapshot: {}, intact: false }], rowCount: 1 }; } };
  assert.equal((await reconciliationSnapshot(db as unknown as PoolClient, owner)).intact, false);
  assert.match(captured, /\(sum\(e\.amount\)\*100\)::bigint AS amount/);
  assert.match(captured, /WHERE e\.beneficiary_id=\$1/);
  assert.match(captured, /r\.result='MATCHED'/);
  assert.match(captured, /WHERE \(reconciled OR \(correction IS NOT NULL AND correction_intact\)\) AND amount<>0/);
  assert.match(captured, /'ROYALTY_ADJUSTMENT','copyright-royalty:'\|\|batch_id::text,-amount/);
  assert.match(captured, /correction IS NULL AND NOT reconciled/);
  assert.match(captured, /correction IS NOT NULL AND NOT correction_intact/);
  assert.doesNotMatch(captured, /MANUAL_ADJUSTMENT','copyright-royalty:/);
});

test('global reconciliation recognizes existing copyright refs and audits batch integrity/count', async () => {
  const calls: string[] = [];
  const client = { release() {}, async query(sql: string) {
    calls.push(sql);
    if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ locked: true }], rowCount: 1 };
    if (sql.includes('FROM soundpub.finance_reconciliation_runs ORDER BY')) return { rows: [], rowCount: 0 };
    if (sql.startsWith('WITH raw AS')) return { rows: [{ total_count: '0', fingerprint: 'empty',
      code: null, resource_type: null, resource_id: null, detail: null }], rowCount: 1 };
    if (sql.includes('AS royalty_batches')) return { rows: [{ royalty_batches: '0', copyright_royalty_batches: '0',
      finance_events: '0', payouts: '0', payment_invoices: '0', manual_adjustments: '0', unresolved_callbacks: '0' }], rowCount: 1 };
    if (sql.includes('INSERT INTO soundpub.finance_reconciliation_runs')) return { rows: [{ id: owner, status: 'PASS',
      issue_count: 0, issues: [], snapshot: {}, snapshot_checksum: 'x', runner: 'test', started_at: new Date(), finished_at: new Date() }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  } };
  await runFinanceReconciliation({ connect: async () => client } as unknown as Pool, { runner: 'test' });
  const sql = calls.join('\n');
  assert.match(sql, /COPYRIGHT_ROYALTY_BATCH_INTEGRITY/);
  assert.match(sql, /copyright_royalty_correction_intact/);
  assert.match(sql, /r\.result='MATCHED'/);
  assert.match(sql, /copyright-royalty:\[0-9a-f-\]\{36\}/);
  assert.match(sql, /FROM soundpub\.copyright_royalty_batches b/);
  assert.match(sql, /AS copyright_royalty_batches/);
});
