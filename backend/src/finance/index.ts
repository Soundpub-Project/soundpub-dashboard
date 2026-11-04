import type { PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { FINANCE_CURRENCY, parseMoney, formatMoney } from './money.js';
export { parseMoney, formatMoney, roundRatio, FINANCE_CURRENCY } from './money.js';

const kinds = ['ROYALTY_EARNING','ROYALTY_ADJUSTMENT','MANUAL_ADJUSTMENT','PAYOUT_RESERVATION',
  'PAYOUT_RELEASE','PAYOUT_SETTLEMENT','PAYMENT_CHARGE','PAYMENT_REFUND'] as const;
const reference = z.string().trim().min(1).max(240);
const eventInput = z.strictObject({ ownerId: z.uuid(), currency: z.literal('IDR').default('IDR'),
  kind: z.enum(kinds), amount: z.string(), businessReference: reference, idempotencyKey: reference,
  actorId: z.uuid().optional(), systemActor: z.string().trim().min(1).max(100).optional(), evidence: reference.optional(),
}).refine(v => Number(v.actorId !== undefined) + Number(v.systemActor !== undefined) === 1);
export type FinanceEventInput = z.input<typeof eventInput>;
export interface FinanceEvent {
  id: string; owner_id: string; currency: 'IDR'; kind: typeof kinds[number]; amount_minor: string;
  business_reference: string; idempotency_key: string; actor_id: string | null;
  system_actor: string | null; evidence: string | null; created_at: Date;
  old_state: Record<string,string>; new_state: Record<string,string>;
}
export interface Balance {
  currency: 'IDR'; available: string; reserved: string; settled: string;
  charged: string; refunded: string;
}

function validateAccount(ownerId: string, currency: string) {
  if (!z.uuid().safeParse(ownerId).success || currency !== FINANCE_CURRENCY) throw new ApiError(400, 'INVALID_FINANCE_ACCOUNT');
}

/** Caller must BEGIN first. Lock multiple owners in sorted UUID order, after authority locks. */
export async function lockAccount(db: PoolClient, ownerId: string, currency = FINANCE_CURRENCY): Promise<void> {
  validateAccount(ownerId, currency);
  await db.query(`INSERT INTO soundpub.finance_accounts(owner_id,currency) VALUES($1,$2) ON CONFLICT DO NOTHING`, [ownerId,currency]);
  await db.query(`SELECT owner_id FROM soundpub.finance_accounts WHERE owner_id=$1 AND currency=$2 FOR UPDATE`, [ownerId,currency]);
}

/** Single statement snapshot. Payment charges/refunds never become withdrawable royalty earnings. */
export async function getBalance(db: PoolClient, ownerId: string, currency = FINANCE_CURRENCY): Promise<Balance> {
  validateAccount(ownerId, currency);
  const row = (await db.query(`SELECT
    COALESCE(sum(CASE WHEN kind IN ('ROYALTY_EARNING','ROYALTY_ADJUSTMENT','MANUAL_ADJUSTMENT','PAYOUT_RELEASE') THEN amount_minor
      WHEN kind='PAYOUT_RESERVATION' THEN -amount_minor ELSE 0 END),0)::text AS available,
    COALESCE(sum(CASE WHEN kind='PAYOUT_RESERVATION' THEN amount_minor
      WHEN kind IN ('PAYOUT_RELEASE','PAYOUT_SETTLEMENT') THEN -amount_minor ELSE 0 END),0)::text AS reserved,
    COALESCE(sum(CASE WHEN kind='PAYOUT_SETTLEMENT' THEN amount_minor ELSE 0 END),0)::text AS settled,
    COALESCE(sum(CASE WHEN kind='PAYMENT_CHARGE' THEN amount_minor ELSE 0 END),0)::text AS charged,
    COALESCE(sum(CASE WHEN kind='PAYMENT_REFUND' THEN amount_minor ELSE 0 END),0)::text AS refunded
    FROM soundpub.finance_events WHERE owner_id=$1 AND currency=$2`, [ownerId,currency])).rows[0]!;
  return { currency: 'IDR', available: formatMoney(BigInt(row.available)), reserved: formatMoney(BigInt(row.reserved)),
    settled: formatMoney(BigInt(row.settled)), charged: formatMoney(BigInt(row.charged)), refunded: formatMoney(BigInt(row.refunded)) };
}

/** Caller owns transaction and business authorization. Returned replay means exact same persisted operation. */
export async function postEvent(db: PoolClient, input: FinanceEventInput): Promise<{ event: FinanceEvent; replayed: boolean }> {
  const parsed = eventInput.safeParse(input);
  if (!parsed.success) throw new ApiError(400, 'INVALID_FINANCE_EVENT');
  const v = parsed.data;
  const amount = parseMoney(v.amount);
  if (amount === 0n || (amount < 0n && !['ROYALTY_ADJUSTMENT','MANUAL_ADJUSTMENT'].includes(v.kind))) throw new ApiError(400, 'INVALID_MONEY');
  if (['PAYOUT_SETTLEMENT','PAYMENT_CHARGE','PAYMENT_REFUND'].includes(v.kind) && !v.evidence) throw new ApiError(400, 'FINANCE_EVIDENCE_REQUIRED');
  await lockAccount(db, v.ownerId, v.currency);
  const prior = (await db.query<FinanceEvent>(`SELECT * FROM soundpub.finance_events WHERE owner_id=$1 AND currency=$2
    AND (idempotency_key=$3 OR (kind=$4 AND business_reference=$5))`,
  [v.ownerId,v.currency,v.idempotencyKey,v.kind,v.businessReference])).rows;
  if (prior.length) {
    const old = prior[0]!;
    if (prior.length !== 1 || old.idempotency_key !== v.idempotencyKey || old.kind !== v.kind || old.amount_minor !== amount.toString()
      || old.business_reference !== v.businessReference || old.actor_id !== (v.actorId ?? null)
      || old.system_actor !== (v.systemActor ?? null) || old.evidence !== (v.evidence ?? null)) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
    return { event: old, replayed: true };
  }
  // Savepoint keeps controlled rejection usable by caller; other transaction failures still propagate.
  await db.query('SAVEPOINT finance_post_event');
  try {
    const event = (await db.query<FinanceEvent>(`INSERT INTO soundpub.finance_events
      (owner_id,currency,kind,amount_minor,business_reference,idempotency_key,actor_id,system_actor,evidence)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [v.ownerId,v.currency,v.kind,amount.toString(),v.businessReference,v.idempotencyKey,v.actorId ?? null,v.systemActor ?? null,v.evidence ?? null])).rows[0]!;
    await db.query('RELEASE SAVEPOINT finance_post_event');
    return { event, replayed: false };
  } catch (error) {
    await db.query('ROLLBACK TO SAVEPOINT finance_post_event');
    await db.query('RELEASE SAVEPOINT finance_post_event');
    const e = error as { code?: string; message?: string };
    if (e.code === '23505') throw new ApiError(409, 'FINANCE_CONFLICT');
    if (e.code === '23514' && e.message?.startsWith('FINANCE_')) throw new ApiError(409, e.message);
    throw error;
  }
}

export interface ReconciliationExpectation {
  businessReference: string;
  kind: FinanceEvent['kind'];
  amount: string;
  evidence?: string;
}

/** Dry run only: compare authoritative domain/provider snapshots supplied by backend adapters. Never repairs. */
export async function reconcileAccount(db: PoolClient, ownerId: string,
  expected: readonly ReconciliationExpectation[], currency = FINANCE_CURRENCY) {
  validateAccount(ownerId, currency);
  const actual = (await db.query<FinanceEvent & { audit_id: string | null; outbox_id: string | null; integrity_ok: boolean | null }>(
    `SELECT e.*,a.event_id AS audit_id,o.id AS outbox_id,
      (a.old_state=e.old_state AND a.new_state=e.new_state AND o.topic='finance.event'
        AND o.payload=jsonb_build_object('eventId',e.id) AND o.idempotency_key='finance:'||e.id::text) AS integrity_ok
      FROM soundpub.finance_events e
      LEFT JOIN soundpub.finance_audit a ON a.event_id=e.id LEFT JOIN soundpub.outbox_events o ON o.id=a.outbox_id
      WHERE e.owner_id=$1 AND e.currency=$2 ORDER BY e.created_at,e.id`, [ownerId,currency])).rows;
  const issues: { code: string; businessReference: string }[] = [];
  const seen = new Set<string>();
  for (const e of expected) {
    const validation = z.strictObject({ businessReference: reference, kind: z.enum(kinds), amount: z.string(), evidence: reference.optional() }).safeParse(e);
    if (!validation.success) throw new ApiError(400, 'INVALID_RECONCILIATION_EXPECTATION');
    const key = JSON.stringify([e.kind,e.businessReference]);
    if (seen.has(key)) throw new ApiError(400, 'DUPLICATE_RECONCILIATION_EXPECTATION');
    seen.add(key);
    const amount = parseMoney(e.amount).toString();
    const row = actual.find(a => a.kind === e.kind && a.business_reference === e.businessReference);
    if (!row) issues.push({ code: 'MISSING_LEDGER_EVENT', businessReference: e.businessReference });
    else if (row.amount_minor !== amount || (e.evidence !== undefined && row.evidence !== e.evidence))
      issues.push({ code: 'AMOUNT_OR_EVIDENCE_MISMATCH', businessReference: e.businessReference });
  }
  for (const row of actual) {
    if (!seen.has(JSON.stringify([row.kind,row.business_reference]))) issues.push({ code: 'UNEXPECTED_LEDGER_EVENT', businessReference: row.business_reference });
    if (!row.audit_id || !row.outbox_id) issues.push({ code: 'MISSING_AUDIT_OR_OUTBOX', businessReference: row.business_reference });
    else if (!row.integrity_ok) issues.push({ code: 'AUDIT_OR_OUTBOX_MISMATCH', businessReference: row.business_reference });
  }
  return { mode: 'DRY_RUN' as const, reconciled: issues.length === 0, issues, eventCount: actual.length };
}
