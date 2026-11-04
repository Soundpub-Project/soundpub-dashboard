import { customFinanceScope } from '../finance/custom.js';
import type { PoolClient } from 'pg';
import { ApiError } from '../api/types.js';
import { lockAccount, getBalance, postEvent, parseMoney, formatMoney } from '../finance/index.js';
import type { PayoutFinance } from './contracts.js';

/** Explicit backend policy evidence; unresolved threshold/destination/provenance must fail closed. */
export type PayoutPolicy = (db: PoolClient, ownerId: string) => Promise<{
  minimum: string; destinationReady: boolean; reconciled: boolean;
}>;

export function createPgPayoutFinance(policy: PayoutPolicy): PayoutFinance {
  async function scope(db: PoolClient, ownerId: string) {
    if (await customFinanceScope(db, ownerId)) return [ownerId];
    // Current label roster only, not historical attribution. Authority owner lock precedes this.
    const rows = (await db.query<{ id: string }>(`SELECT p.id FROM soundpub.profiles p
      WHERE p.id=$1 OR (p.parent_label_id=$1 AND EXISTS(SELECT 1 FROM soundpub.artists a
        WHERE a.artist_user_id=p.id AND a.label_id=$1 AND a.verified_at IS NOT NULL))
      ORDER BY p.id FOR SHARE`, [ownerId])).rows;
    return [...new Set([ownerId, ...rows.map(r => r.id)])].sort();
  }
  async function allocations(db: PoolClient, payoutId: string) {
    const row = (await db.query<{ amount: string }>('SELECT amount::text FROM soundpub.payout_requests WHERE id=$1', [payoutId])).rows[0];
    const parts = (await db.query<{ owner_id: string; amount: string }>(`SELECT owner_id,amount::text FROM soundpub.payout_allocations
      WHERE payout_id=$1 ORDER BY owner_id`, [payoutId])).rows;
    if (!row || parts.reduce((sum, p) => sum + parseMoney(p.amount), 0n) !== parseMoney(row.amount))
      throw new ApiError(409, 'PAYOUT_RESERVATION_MISMATCH');
    return parts;
  }
  async function finish(db: PoolClient, payoutId: string, kind: 'PAYOUT_RELEASE' | 'PAYOUT_SETTLEMENT', evidence?: string) {
    const parts = await allocations(db, payoutId);
    for (const part of parts) await lockAccount(db, part.owner_id);
    for (const part of parts) await postEvent(db, { ownerId: part.owner_id, kind, amount: part.amount,
      businessReference: payoutId, idempotencyKey: `${kind}:${payoutId}`, systemActor: 'payout-service',
      ...(evidence ? { evidence: `${evidence}:${part.owner_id}` } : {}) });
  }
  return {
    async lock(db, ownerId) {
      // Include historical allocations: cancellation/settlement after transfer still uses original account.
      const ids = await scope(db, ownerId);
      const historical = (await db.query<{ owner_id: string }>(`SELECT DISTINCT a.owner_id FROM soundpub.payout_allocations a
        JOIN soundpub.payout_requests p ON p.id=a.payout_id WHERE p.user_id=$1 AND p.status IN ('pending','approved')`, [ownerId])).rows;
      if (await customFinanceScope(db, ownerId) && historical.some(r => r.owner_id !== ownerId))
        throw new ApiError(409, 'PAYOUT_RESERVATION_MISMATCH');
      for (const id of [...new Set([...ids, ...historical.map(r => r.owner_id)])].sort()) await lockAccount(db, id);
    },
    async eligibility(db, ownerId) {
      const p = await policy(db, ownerId);
      let available = 0n;
      for (const id of await scope(db, ownerId)) available += parseMoney((await getBalance(db, id)).available);
      const user = (await db.query('SELECT email_verified_at FROM soundpub.backend_users WHERE id=$1', [ownerId])).rows[0];
      const broken = (await db.query(`SELECT 1 FROM soundpub.finance_events e LEFT JOIN soundpub.finance_audit a ON a.event_id=e.id
        LEFT JOIN soundpub.outbox_events o ON o.id=a.outbox_id WHERE e.owner_id=ANY($1::uuid[]) AND (a.event_id IS NULL OR o.id IS NULL) LIMIT 1`, [await scope(db, ownerId)])).rowCount;
      return { ...p, available: formatMoney(available), verified: Boolean(user?.email_verified_at), reconciled: p.reconciled && !broken };
    },
    async reserve(db, input) {
      let remaining = parseMoney(input.amount);
      const ids = await scope(db, input.ownerId);
      // Stable sorted account lock order; allocation preference follows legacy label-first rule.
      const ordered = [input.ownerId, ...ids.filter(id => id !== input.ownerId)];
      for (const id of ordered) {
        if (remaining === 0n) break;
        const balance = parseMoney((await getBalance(db, id)).available);
        const take = balance < remaining ? balance : remaining;
        if (take <= 0n) continue;
        await postEvent(db, { ownerId: id, kind: 'PAYOUT_RESERVATION', amount: formatMoney(take),
          businessReference: input.payoutId, idempotencyKey: `PAYOUT_RESERVATION:${input.payoutId}`, systemActor: 'payout-service' });
        await db.query('INSERT INTO soundpub.payout_allocations(payout_id,owner_id,amount) VALUES($1,$2,$3)', [input.payoutId, id, formatMoney(take)]);
        remaining -= take;
      }
      if (remaining !== 0n) throw new ApiError(409, 'INSUFFICIENT_BALANCE');
    },
    release(db, id) { return finish(db, id, 'PAYOUT_RELEASE'); },
    settle(db, id, evidence) { return finish(db, id, 'PAYOUT_SETTLEMENT', evidence); },
  };
}
