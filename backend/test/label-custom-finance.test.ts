import test from 'node:test';
import assert from 'node:assert/strict';
import type { Pool, PoolClient } from 'pg';
import { customFinanceScope } from '../src/finance/custom.js';
import { createPgPayoutFinance } from '../src/payouts/finance.js';
import { createBalanceService } from '../src/finance/service.js';
import { createPayoutsService } from '../src/payouts/index.js';
import { requestInput } from '../src/payouts/contracts.js';
import { createRoyaltiesService } from '../src/royalties/index.js';

const pic = { id: '00000000-0000-4000-8000-000000000001', roles: ['label_custom' as const], status: 'active' as const };
function fixture() {
  const options = { activeUnit: true, custom: true, historicalForeign: false };
  const calls: { sql: string; args: unknown[] }[] = [];
  const db = { release() {}, async query(sql: string, args: unknown[] = []) {
    calls.push({ sql, args });
    const result = (rows: unknown[] = []) => ({ rows, rowCount: rows.length });
    if (sql.includes('SELECT id, status FROM')) return result([{ id: pic.id, status: 'active' }]);
    if (sql.includes('SELECT user_id, role')) return result([{ user_id: pic.id, role: 'label_custom' }]);
    if (sql.includes("role='label_custom'")) return result(options.custom ? [{}] : []);
    if (sql.includes('SELECT unit.id')) return result(options.activeUnit ? [{ id: pic.id }] : []);
    if (sql.includes('SELECT DISTINCT a.owner_id')) return result(options.historicalForeign ? [{ owner_id: 'foreign' }] : []);
    if (sql.includes('AS available,')) return result([{ available: '10000', reserved: '0', settled: '0', charged: '0', refunded: '0' }]);
    if (sql.includes('SELECT email_verified_at')) return result([{ email_verified_at: new Date() }]);
    return result();
  } };
  const pool = { connect: async () => db } as unknown as Pool;
  return { db: db as unknown as PoolClient, pool, options, calls };
}

test('label-custom-finance active unit required; ordinary label compatibility retained', async () => {
  const f = fixture(); assert.equal(await customFinanceScope(f.db, pic.id), true);
  f.options.activeUnit = false;
  await assert.rejects(customFinanceScope(f.db, pic.id), /ACTIVE_PIC_UNIT_REQUIRED/);
  f.options.custom = false; assert.equal(await customFinanceScope(f.db, pic.id), false);
});

test('label-custom-finance eligibility and reservations read only PIC account', async () => {
  const f = fixture();
  const finance = createPgPayoutFinance(async () => ({ minimum: '1.00', destinationReady: true, reconciled: true }));
  await finance.lock(f.db, pic.id);
  assert.equal((await finance.eligibility(f.db, pic.id)).available, '100.00');
  await finance.reserve(f.db, { ownerId: pic.id, payoutId: pic.id, amount: '10.00', currency: 'IDR' });
  assert.equal(f.calls.some(c => c.sql.includes('parent_label_id')), false);
  for (const call of f.calls.filter(c => c.sql.includes('FROM soundpub.finance_events WHERE owner_id=')))
    assert.equal(call.args[0], pic.id);
  const allocation = f.calls.find(c => c.sql.includes('INSERT INTO soundpub.payout_allocations'));
  assert.equal(allocation?.args[1], pic.id);
  f.options.historicalForeign = true;
  await assert.rejects(finance.lock(f.db, pic.id), /PAYOUT_RESERVATION_MISMATCH/);
});

test('label-custom-finance balance PIC-only and reconciliation remains closed', async () => {
  const f = fixture();
  const balance = await createBalanceService(f.pool).get(pic);
  assert.equal(balance.aggregate, false); assert.equal(balance.account_count, 1);
  assert.equal(balance.available, null); assert.equal(balance.status, 'RECONCILIATION_REQUIRED');
  assert.ok(f.calls.some(c => c.sql === 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')); 
  assert.equal(f.calls.some(c => c.sql.includes('parent_label_id')), false);
  await assert.rejects(createBalanceService(f.pool).get(pic, '00000000-0000-4000-8000-000000000002'), /FORBIDDEN/);
});

test('label-custom-finance payout cannot bypass missing approval through injected policy', async () => {
  const f = fixture();
  const finance = createPgPayoutFinance(async () => ({ minimum: '1.00', destinationReady: true, reconciled: true }));
  const service = createPayoutsService(f.pool, finance);
  const eligibility = await service.eligibility(pic);
  assert.equal(eligibility.eligible, false); assert.equal(eligibility.available, null);
  assert.ok(eligibility.reasons.includes('RECONCILIATION_REQUIRED'));
  const input = { amount: '10.00', currency: 'IDR', bank_name: 'Synthetic', account_number: '123456', account_holder_name: 'PIC' };
  await assert.rejects(service.request(pic, input, 'request'), /PAYOUT_INELIGIBLE/);
  for (const field of ['artist_id', 'owner_id', 'financial_owner_user_id', 'recipient', 'recipient_id'])
    assert.equal(requestInput.safeParse({ ...input, [field]: pic.id }).success, false);
  f.options.activeUnit = false;
  await assert.rejects(service.eligibility(pic), /ACTIVE_PIC_UNIT_REQUIRED/);
});

test('label-custom-finance breakdown requires active PIC and hides foreign filters', async () => {
  const f = fixture(); const service = createRoyaltiesService(f.pool);
  assert.deepEqual((await service.breakdown(pic)).items, []);
  await assert.rejects(service.breakdown(pic, { artist_id: pic.id }), /NOT_FOUND/);
  await assert.rejects(service.breakdown(pic, { release_id: pic.id }), /NOT_FOUND/);
  await assert.rejects(service.breakdown(pic, { period: '2026-13' }), /BAD_REQUEST/);
  f.options.custom = false; await assert.rejects(service.breakdown(pic), /FORBIDDEN/);
});
