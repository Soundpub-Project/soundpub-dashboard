import { z } from 'zod';
import { formatMoney, parseMoney } from './money.js';

const uuid = z.uuid();
const money = z.string().regex(/^-?(0|[1-9]\d{0,15})(\.\d{1,2})?$/);
const snapshotSchema = z.strictObject({
  profiles: z.array(z.strictObject({ owner_id: uuid, balance: money })),
  royalty_totals: z.array(z.strictObject({ owner_id: uuid, artist_amount: money, label_amount: money })),
  adjustments: z.array(z.strictObject({ id: uuid, owner_id: uuid,
    source_type: z.enum(['migration_opening_balance', 'release_refund']),
    source_id: uuid, amount: money })),
  payouts: z.array(z.strictObject({ id: uuid, requester_id: uuid, status: z.enum(['pending', 'approved', 'paid', 'rejected']), amount: money })),
  reservations: z.array(z.strictObject({ payout_id: uuid, owner_id: uuid, amount: money })),
});

type Issue = { code: string; reference: string };

export function planLegacyBalanceReconciliation(input: unknown) {
  const snapshot = snapshotSchema.parse(input);
  const issues: Issue[] = [];
  if (!snapshot.profiles.length) issues.push({ code: 'EMPTY_ACCOUNT_SNAPSHOT', reference: 'profiles' });
  const profiles = new Map(snapshot.profiles.map(profile => [profile.owner_id, profile]));
  const payouts = new Map(snapshot.payouts.map(payout => [payout.id, payout]));
  const duplicate = (values: string[], kind: string) => {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) issues.push({ code: 'DUPLICATE_SOURCE_ID', reference: `${kind}:${value}` });
      seen.add(value);
    }
  };
  duplicate(snapshot.profiles.map(row => row.owner_id), 'profile');
  duplicate(snapshot.payouts.map(row => row.id), 'payout');
  duplicate(snapshot.adjustments.map(row => row.id), 'adjustment');
  duplicate(snapshot.reservations.map(row => `${row.payout_id}:${row.owner_id}`), 'reservation');
  duplicate(snapshot.royalty_totals.map(row => row.owner_id), 'royalty-owner-total');

  const parseMinor = (value: string, reference: string,
    policy: 'any' | 'nonnegative' | 'positive' | 'nonzero' = 'nonnegative') => {
    const amount = parseMoney(value);
    if ((policy === 'nonnegative' && amount < 0n) || (policy === 'positive' && amount <= 0n) ||
        (policy === 'nonzero' && amount === 0n)) {
      issues.push({ code: 'INVALID_SOURCE_AMOUNT', reference });
      return 0n;
    }
    return amount;
  };
  const royalties = new Map<string, bigint>();
  const adjustments = new Map<string, bigint>();
  const reserved = new Map<string, bigint>();
  const paidStatus = new Map<string, bigint>();
  const reservationByPayout = new Map<string, bigint>();

  for (const row of snapshot.royalty_totals) {
    const artist = parseMinor(row.artist_amount, `royalty:${row.owner_id}`);
    const label = parseMinor(row.label_amount, `royalty:${row.owner_id}`);
    royalties.set(row.owner_id, (royalties.get(row.owner_id) ?? 0n) + artist + label);
    if (!profiles.has(row.owner_id)) issues.push({ code: 'OWNER_PROFILE_MISSING', reference: `royalty:${row.owner_id}` });
  }
  const adjustmentKeys = new Set<string>();
  for (const row of snapshot.adjustments) {
    const key = `${row.source_type}:${row.source_id}`;
    if (adjustmentKeys.has(key)) issues.push({ code: 'DUPLICATE_ADJUSTMENT_SOURCE', reference: key });
    adjustmentKeys.add(key);
    const amount = parseMinor(row.amount, `adjustment:${row.id}`, 'nonzero');
    adjustments.set(row.owner_id, (adjustments.get(row.owner_id) ?? 0n) + amount);
    if (!profiles.has(row.owner_id)) issues.push({ code: 'OWNER_PROFILE_MISSING', reference: `adjustment:${row.id}` });
  }
  for (const row of snapshot.reservations) {
    const reference = `reservation:${row.payout_id}:${row.owner_id}`;
    const amount = parseMinor(row.amount, reference, 'positive');
    const payout = payouts.get(row.payout_id);
    if (!payout) issues.push({ code: 'PAYOUT_MISSING', reference });
    else reservationByPayout.set(row.payout_id, (reservationByPayout.get(row.payout_id) ?? 0n) + amount);
    if (!profiles.has(row.owner_id)) issues.push({ code: 'OWNER_PROFILE_MISSING', reference });
    if (payout && payout.requester_id !== row.owner_id)
      issues.push({ code: 'CROSS_OWNER_PAYOUT_RESERVATION_REQUIRES_REVIEW', reference });
    if (payout && ['pending', 'approved', 'paid'].includes(payout.status)) {
      reserved.set(row.owner_id, (reserved.get(row.owner_id) ?? 0n) + amount);
      if (payout.status === 'paid') paidStatus.set(row.owner_id, (paidStatus.get(row.owner_id) ?? 0n) + amount);
    }
  }
  for (const payout of snapshot.payouts) {
    if (payout.status === 'paid')
      issues.push({ code: 'PAID_PAYOUT_SETTLEMENT_UNVERIFIED', reference: `payout:${payout.id}` });
    if (!profiles.has(payout.requester_id))
      issues.push({ code: 'PAYOUT_REQUESTER_PROFILE_MISSING', reference: `payout:${payout.id}` });
    const amount = parseMinor(payout.amount, `payout:${payout.id}`, 'positive');
    if (reservationByPayout.get(payout.id) !== amount) {
      issues.push({ code: 'PAYOUT_RESERVATION_TOTAL_MISMATCH', reference: `payout:${payout.id}` });
    }
  }

  const accounts = snapshot.profiles.map(profile => {
    const royaltyMinor = royalties.get(profile.owner_id) ?? 0n;
    const adjustmentMinor = adjustments.get(profile.owner_id) ?? 0n;
    const reservedMinor = reserved.get(profile.owner_id) ?? 0n;
    const paidStatusMinor = paidStatus.get(profile.owner_id) ?? 0n;
    const balanceMinor = parseMinor(profile.balance, `profile:${profile.owner_id}`, 'any');
    const expectedAvailableMinor = royaltyMinor + adjustmentMinor - reservedMinor;
    const matches = balanceMinor === expectedAvailableMinor;
    if (expectedAvailableMinor < 0n) issues.push({ code: 'NEGATIVE_EXPECTED_BALANCE', reference: `profile:${profile.owner_id}` });
    if (balanceMinor < 0n) issues.push({ code: 'NEGATIVE_SOURCE_BALANCE', reference: `profile:${profile.owner_id}` });
    if (!matches) issues.push({ code: 'PROFILE_BALANCE_MISMATCH', reference: `profile:${profile.owner_id}` });
    return {
      owner_id: profile.owner_id,
      currency: 'IDR' as const,
      profile_balance: formatMoney(balanceMinor),
      royalty_credits: formatMoney(royaltyMinor),
      balance_adjustments: formatMoney(adjustmentMinor),
      outstanding_payouts: formatMoney(reservedMinor - paidStatusMinor),
      paid_status_payouts: formatMoney(paidStatusMinor),
      expected_available: formatMoney(expectedAvailableMinor),
      matches_profile_balance: matches,
    };
  }).sort((left, right) => left.owner_id.localeCompare(right.owner_id));

  return { valid: issues.length === 0, accounts, issues,
    totals: {
      accounts: accounts.length,
      mismatches: accounts.filter(account => !account.matches_profile_balance).length,
      royalty_credits: formatMoney([...royalties.values()].reduce((total, amount) => total + amount, 0n)),
      balance_adjustments: formatMoney([...adjustments.values()].reduce((total, amount) => total + amount, 0n)),
      outstanding_payouts: formatMoney([...reserved.values()].reduce((total, amount) => total + amount, 0n) -
        [...paidStatus.values()].reduce((total, amount) => total + amount, 0n)),
      paid_status_payouts: formatMoney([...paidStatus.values()].reduce((total, amount) => total + amount, 0n)),
    } };
}
