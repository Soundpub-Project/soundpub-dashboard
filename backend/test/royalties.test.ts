import test from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { createRoyaltiesService } from '../src/royalties/index.js';
import { decimal, fingerprint, minor, type RoyaltyRow } from '../src/royalties/contracts.js';

const actor = { id: '00000000-0000-4000-8000-000000000001', status: 'active' as const, roles: ['admin' as const] };
const owner = '00000000-0000-4000-8000-000000000002';
const batchId = '00000000-0000-4000-8000-000000000005';
const row: RoyaltyRow = { source_row_id: 'synthetic-1', beneficiary_id: owner,
  release_id: '00000000-0000-4000-8000-000000000003', track_id: '00000000-0000-4000-8000-000000000004',
  platform: 'Synthetic DSP', gross_amount: '0.30', deduction_amount: '0.10', net_amount: '0.20' };
const statement = { source: 'synthetic-dsp', period: '2026-10', currency: 'IDR', filename: 'synthetic.json', rows: [row] };

// Transaction double exercises orchestration only; PostgreSQL trigger/race proof requires disposable DB QA.
function fixture() {
  let committed: string[] = [], staged: string[] = [], inTransaction = false;
  const calls: string[] = [];
  const events: unknown[][] = [];
  const options = { missingMapping: false, auditFailure: false, staleAdmin: false, available: '20', overlap: false, outboxFailure: false };
  let corrected = false;
  const db = {
    release() {},
    async query(sql: string, args: unknown[] = []) {
      calls.push(sql);
      const result = (rows: unknown[] = []) => ({ rows, rowCount: rows.length });
      if (sql === 'BEGIN') { inTransaction = true; staged = [...committed]; return result(); }
      if (sql === 'COMMIT') { committed = [...staged]; inTransaction = false; return result(); }
      if (sql === 'ROLLBACK') { staged = []; inTransaction = false; return result(); }
      if (sql.includes('SELECT id, status FROM soundpub.backend_users')) return result([{ id: actor.id, status: 'active' }]);
      if (sql.includes('SELECT user_id, role')) return result([{ user_id: actor.id, role: options.staleAdmin ? 'user' : 'admin' }]);
      if (sql.includes('SELECT t.id, a.id AS artist_id')) return result(options.missingMapping ? [] : [{ id: row.track_id, artist_id: '00000000-0000-4000-8000-000000000006', financial_owner_user_id: owner }]);
      if (sql.includes('SELECT id FROM soundpub.royalty_import_batches')) return result(committed.includes('batch') ? [{ id: batchId }] : []);
      if (sql.includes('SELECT id FROM soundpub.royalty_import_entries')) return result(options.overlap ? [{ id: 'overlap' }] : []);
      if (sql.includes('INSERT INTO soundpub.royalty_import_batches')) { staged.push('batch'); return result([{ id: batchId }]); }
      if (sql.includes('INSERT INTO soundpub.royalty_import_entries')) { staged.push('entry'); return result(); }
      if (sql.includes('GROUP BY financial_owner_user_id')) return result([{ beneficiary_id: owner, amount: '0.20' }]);
      if (sql.includes('SELECT total_amount::text')) return result([{ total_amount: '0.20', currency: 'IDR', checksum: 'test' }]);
      if (sql.includes('SELECT reason FROM')) return result(corrected ? [{ reason: 'synthetic correction' }] : []);
      if (sql.includes('INSERT INTO soundpub.royalty_import_corrections')) { staged.push('correction'); return result(); }
      if (sql.includes('COALESCE(sum(CASE')) return result([{ amount: options.available }]);
      if (sql.includes('INSERT INTO soundpub.finance_events')) {
        assert.equal(inTransaction, true);
        if (args[2] === 'ROYALTY_ADJUSTMENT' && options.available === '0') {
          throw Object.assign(new Error('FINANCE_INSUFFICIENT_BALANCE'), { code: '23514' });
        }
        events.push(args); staged.push(String(args[2])); return result();
      }
      if (sql.includes('INSERT INTO soundpub.outbox_events') && options.outboxFailure) throw new Error('synthetic outbox failure');
      if (sql.includes('INSERT INTO soundpub.audit_logs')) {
        if (options.auditFailure) throw new Error('synthetic audit failure');
        staged.push('audit');
      }
      return result();
    },
  };
  return { service: createRoyaltiesService({ connect: async () => db } as unknown as Pool), options, calls,
    events, committed: () => committed, markCorrected: () => { corrected = true; } };
}

test('money exact above Number precision; unsupported representations rejected', () => {
  assert.equal(decimal(minor('9999999999999999.99')), '9999999999999999.99');
  assert.equal(decimal(minor('0.10') + minor('0.20')), '0.30');
  for (const value of ['-1','1e2','1.001','NaN','01',' 1','1,00']) assert.throws(() => minor(value));
});
test('checksum ignores filename, order and equivalent decimal spelling', () => {
  const other = { ...row, source_row_id: 'synthetic-2' };
  assert.equal(fingerprint('dsp','2026-10','IDR',[row, other]),
    fingerprint('dsp','2026-10','IDR',[other, { ...row, gross_amount: '0.3' }]));
  assert.notEqual(fingerprint('dsp','2026-10','IDR',[row]), fingerprint('dsp','2026-11','IDR',[row]));
});
test('preview no financial writes; reports malformed, duplicate and unknown mappings', async () => {
  const f = fixture();
  const preview = await f.service.preview(actor, { ...statement, rows: [row, row, { ...row, net_amount: '-1' }] });
  assert.equal(preview.valid_rows, 1); assert.equal(preview.duplicates, 1); assert.equal(preview.invalid_rows, 2);
  assert.equal(preview.total_amount, '0.20');
  assert.equal(f.calls.some(sql => /INSERT|UPDATE|DELETE/.test(sql)), false);
  f.options.missingMapping = true;
  assert.equal((await f.service.preview(actor, statement)).unknown_mappings, 1);
});
test('commit exact replay credits once; ledger and audit share transaction', async () => {
  const f = fixture();
  assert.deepEqual(await f.service.commit(actor, statement, 'request-1'), { id: batchId, replayed: false });
  assert.deepEqual(await f.service.commit(actor, { ...statement, filename: 'renamed.json' }, 'request-2'), { id: batchId, replayed: true });
  assert.deepEqual(f.committed(), ['batch','entry','ROYALTY_EARNING','audit']);
});
test('audit failure rolls back batch, entries and financial effect', async () => {
  const f = fixture(); f.options.auditFailure = true;
  await assert.rejects(f.service.commit(actor, statement, 'request'), /synthetic audit failure/);
  assert.deepEqual(f.committed(), []); assert.ok(f.calls.includes('ROLLBACK'));
});
test('invalid rows, mismatched money and overlapping source rows fail closed', async () => {
  const f = fixture();
  await assert.rejects(f.service.commit(actor, { ...statement, rows: [{ ...row, net_amount: '9' }] }, 'r'), /ROYALTY_IMPORT_INVALID/);
  f.options.overlap = true;
  await assert.rejects(f.service.commit(actor, statement, 'r'), /ROYALTY_SOURCE_ROW_CONFLICT/);
  assert.deepEqual(f.committed(), []);
});
test('live role removal and ordinary actor cannot import', async () => {
  const f = fixture(); f.options.staleAdmin = true;
  await assert.rejects(f.service.commit(actor, statement, 'r'), /FORBIDDEN/);
  await assert.rejects(f.service.preview({ ...actor, roles: ['user'] }, statement), /FORBIDDEN/);
});
test('trust boundary rejects unsupported currency, forged fields and empty/oversized uploads', async () => {
  const f = fixture();
  for (const input of [{ ...statement, currency: 'USD' }, { ...statement, current_balance: '99' },
    { ...statement, period: '2026-13' }, { ...statement, rows: [] }, { ...statement, rows: Array(1001).fill(row) }]) {
    await assert.rejects(f.service.preview(actor, input), /BAD_REQUEST/);
  }
  const maximum = { ...row, gross_amount: '9999999999999999.99', deduction_amount: '0', net_amount: '9999999999999999.99' };
  const preview = await f.service.preview(actor, { ...statement, rows: [maximum, { ...maximum, source_row_id: 'second' }] });
  assert.equal(preview.invalid_rows, 1);
  assert.equal(preview.errors[0]?.code, 'BENEFICIARY_AMOUNT_LIMIT');
});
test('summary rejects forged beneficiary after live admin removal', async () => {
  const f = fixture(); f.options.staleAdmin = true;
  await assert.rejects(f.service.summary(actor, { beneficiary_id: owner }), /FORBIDDEN/);
});
test('correction append-only, idempotent, insufficient available balance rolls back', async () => {
  const f = fixture(); f.options.available = '0';
  await assert.rejects(f.service.correct(actor, batchId, { reason: 'synthetic correction' }, 'r'), /INSUFFICIENT_BALANCE/);
  assert.deepEqual(f.committed(), []);
  f.options.available = '20';
  await f.service.correct(actor, batchId, { reason: 'synthetic correction' }, 'r');
  assert.deepEqual(f.committed(), ['correction','ROYALTY_ADJUSTMENT','audit']);
  f.markCorrected();
  assert.equal((await f.service.correct(actor, batchId, { reason: 'synthetic correction' }, 'r')).replayed, true);
  await assert.rejects(f.service.correct(actor, batchId, { reason: 'different' }, 'r'), /CORRECTION_CONFLICT/);
  assert.equal(f.calls.some(sql => /DELETE FROM/.test(sql)), false);
});


test('canonical artist and PIC owner assertions reject forged attribution', async () => {
  const f = fixture();
  for (const forged of [{ ...row, beneficiary_id: actor.id }, { ...row, artist_id: actor.id },
    { ...row, financial_owner_user_id: owner }]) {
    const result = await f.service.preview(actor, { ...statement, rows: [forged] });
    assert.equal(result.valid_rows, 0);
    await assert.rejects(f.service.commit(actor, { ...statement, rows: [forged] }, 'forged'), /ROYALTY_IMPORT_INVALID/);
  }
  const { beneficiary_id: _owner, ...serverResolved } = row;
  assert.equal((await f.service.preview(actor, { ...statement, rows: [serverResolved] })).valid_rows, 1);
  await f.service.commit(actor, statement, 'canonical');
  assert.ok(f.calls.some(sql => sql.includes('net_amount,artist_id,financial_owner_user_id)')));
  assert.ok(f.calls.some(sql => sql.includes('GROUP BY financial_owner_user_id')));
});

test('royalty outbox failure rolls back earning and correction transaction', async () => {
  for (const correction of [false, true]) {
    const f = fixture(); f.options.outboxFailure = true;
    await assert.rejects(correction
      ? f.service.correct(actor, batchId, { reason: 'synthetic correction' }, 'r')
      : f.service.commit(actor, statement, 'r'), /synthetic outbox failure/);
    assert.deepEqual(f.committed(), []);
  }
});


test('correction uses immutable original owner without catalog re-resolution', async () => {
  const f = fixture(); f.options.missingMapping = true;
  await f.service.correct(actor, batchId, { reason: 'synthetic correction' }, 'reverse');
  assert.equal(f.events[0]?.[0], owner);
  assert.equal(f.events[0]?.[2], 'ROYALTY_ADJUSTMENT');
  assert.equal(f.events[0]?.[3], '-20');
  assert.equal(f.calls.some(sql => sql.includes('FROM soundpub.tracks')), false);
});
