import assert from 'node:assert/strict';
import test from 'node:test';
import { planLegacyBalanceReconciliation } from '../src/finance/legacy-balance-plan.js';

const owner = '00000000-0000-4000-8000-000000000001';
const pending = '00000000-0000-4000-8000-000000000011';
const paid = '00000000-0000-4000-8000-000000000012';
const adjustment = '00000000-0000-4000-8000-000000000021';

function snapshot() {
  return {
    profiles: [{ owner_id: owner, balance: '131.50' }],
    royalty_totals: [{ owner_id: owner, artist_amount: '100.50', label_amount: '50.00' }],
    adjustments: [{ id: adjustment, owner_id: owner, source_type: 'migration_opening_balance',
      source_id: owner, amount: '5.00' }],
    payouts: [{ id: pending, requester_id: owner, status: 'pending', amount: '10.00' },
      { id: paid, requester_id: owner, status: 'approved', amount: '14.00' }],
    reservations: [{ payout_id: pending, owner_id: owner, amount: '10.00' },
      { payout_id: paid, owner_id: owner, amount: '14.00' }],
  };
}

test('legacy balance plan exactly reconciles credits, adjustments and outstanding payout states', () => {
  const result = planLegacyBalanceReconciliation(snapshot());
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.accounts, [{ owner_id: owner, currency: 'IDR', profile_balance: '131.50',
    royalty_credits: '150.50', balance_adjustments: '5.00', outstanding_payouts: '24.00',
    paid_status_payouts: '0.00', expected_available: '131.50', matches_profile_balance: true }]);
  assert.deepEqual(result.totals, { accounts: 1, mismatches: 0, royalty_credits: '150.50',
    balance_adjustments: '5.00', outstanding_payouts: '24.00', paid_status_payouts: '0.00' });
});

test('legacy balance plan reports profile drift and negative expected availability', () => {
  const input = snapshot();
  input.profiles[0]!.balance = '131.49';
  input.payouts[0]!.amount = '200.00';
  input.reservations[0]!.amount = '200.00';
  const result = planLegacyBalanceReconciliation(input);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.code === 'PROFILE_BALANCE_MISMATCH'));
  assert.ok(result.issues.some(issue => issue.code === 'NEGATIVE_EXPECTED_BALANCE'));
});

test('legacy balance plan rejects missing owners and payout reservation drift', () => {
  const input = snapshot();
  input.reservations[0]!.owner_id = '00000000-0000-4000-8000-000000000099';
  input.reservations[1]!.payout_id = '00000000-0000-4000-8000-000000000098';
  const result = planLegacyBalanceReconciliation(input);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.code === 'OWNER_PROFILE_MISSING'));
  assert.ok(result.issues.some(issue => issue.code === 'PAYOUT_MISSING'));
  assert.ok(result.issues.some(issue => issue.code === 'PAYOUT_RESERVATION_TOTAL_MISMATCH'));
});

test('legacy balance plan rejects duplicate source identities and unsafe extra fields', () => {
  const input = snapshot();
  input.adjustments.push({ ...input.adjustments[0]! });
  const result = planLegacyBalanceReconciliation(input);
  assert.ok(result.issues.some(issue => issue.code === 'DUPLICATE_SOURCE_ID'));
  assert.ok(result.issues.some(issue => issue.code === 'DUPLICATE_ADJUSTMENT_SOURCE'));
  assert.throws(() => planLegacyBalanceReconciliation({ ...snapshot(), profiles: [{ owner_id: owner,
    balance: '131.50', account_number: 'synthetic-sensitive' }] }), /Unrecognized key/);
  assert.throws(() => planLegacyBalanceReconciliation({ ...snapshot(), adjustments: [{ ...snapshot().adjustments[0]!,
    source_type: 'unmapped-source' }] }), /Invalid option/);
});

test('legacy balance plan accepts rejected payouts only after matching stored reservation provenance', () => {
  const input = snapshot();
  input.payouts[0]!.status = 'rejected';
  input.profiles[0]!.balance = '141.50';
  const result = planLegacyBalanceReconciliation(input);
  assert.equal(result.valid, true);
  assert.equal(result.accounts[0]?.outstanding_payouts, '14.00');
  assert.equal(result.accounts[0]?.expected_available, '141.50');
});

test('legacy paid payout status is reported but never accepted as settlement evidence', () => {
  const input = snapshot();
  input.payouts[1]!.status = 'paid';
  const result = planLegacyBalanceReconciliation(input);
  assert.equal(result.valid, false);
  assert.deepEqual(result.issues, [{ code: 'PAID_PAYOUT_SETTLEMENT_UNVERIFIED', reference: `payout:${paid}` }]);
  assert.equal(result.accounts[0]?.paid_status_payouts, '14.00');
});
test('legacy balance plan permits zero account balance and rejects zero payout or adjustment', () => {
  const empty = snapshot();
  empty.profiles[0]!.balance = '0.00';
  empty.royalty_totals = [];
  empty.adjustments = [];
  empty.payouts = [];
  empty.reservations = [];
  assert.equal(planLegacyBalanceReconciliation(empty).valid, true);
  const invalid = snapshot();
  invalid.adjustments[0]!.amount = '0.00';
  invalid.payouts[0]!.amount = '0.00';
  assert.ok(planLegacyBalanceReconciliation(invalid).issues.filter(issue => issue.code === 'INVALID_SOURCE_AMOUNT').length >= 2);
});

test('legacy balance plan never treats an empty profile export as reconciled', () => {
  const result = planLegacyBalanceReconciliation({ ...snapshot(), profiles: [], royalty_totals: [], adjustments: [],
    payouts: [], reservations: [] });
  assert.equal(result.valid, false);
  assert.deepEqual(result.issues, [{ code: 'EMPTY_ACCOUNT_SNAPSHOT', reference: 'profiles' }]);
});

test('legacy balance plan flags cross-owner payout reservations for explicit relationship review', () => {
  const input = snapshot();
  const child = '00000000-0000-4000-8000-000000000002';
  input.profiles.push({ owner_id: child, balance: '0.00' });
  input.royalty_totals.push({ owner_id: child, artist_amount: '10.00', label_amount: '0.00' });
  input.profiles[0]!.balance = '141.50';
  input.reservations[0]!.owner_id = child;
  const result = planLegacyBalanceReconciliation(input);
  assert.equal(result.valid, false);
  assert.deepEqual(result.issues, [{ code: 'CROSS_OWNER_PAYOUT_RESERVATION_REQUIRES_REVIEW',
    reference: `reservation:${pending}:${child}` }]);
});

test('legacy balance plan rejects missing payout requester or requester profile', () => {
  const input = snapshot();
  const orphan = '00000000-0000-4000-8000-000000000099';
  input.payouts[0]!.requester_id = orphan;
  const result = planLegacyBalanceReconciliation(input);
  assert.ok(result.issues.some(issue => issue.code === 'PAYOUT_REQUESTER_PROFILE_MISSING'
    && issue.reference === `payout:${pending}`));
  assert.throws(() => planLegacyBalanceReconciliation({ ...snapshot(), payouts: [{ id: pending,
    status: 'pending', amount: '10.00' }] }), /requester_id/);
});
