import type { PoolClient } from 'pg';
import { z } from 'zod';

export const money = z.string().regex(/^(0|[1-9][0-9]{0,15})\.[0-9]{2}$/);
export const requestInput = z.strictObject({ amount: money, currency: z.literal('IDR'),
  bank_name: z.string().trim().min(1).max(200), account_number: z.string().trim().regex(/^[0-9]{4,40}$/),
  account_holder_name: z.string().trim().min(1).max(200) });
export const keyInput = z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/);
export const states = ['pending', 'approved', 'rejected', 'cancelled', 'failed', 'paid'] as const;
export type State = typeof states[number];
export type Payout = { id: string; user_id: string; amount: string; currency: 'IDR'; status: State;
  bank_name: string; account_holder_name: string; proof_media_id: string | null; created_at: Date; updated_at: Date };
export const projection = `id,user_id,amount::text,currency,status,bank_name,account_holder_name,
  (SELECT media_object_id FROM soundpub.payout_settlement_proofs WHERE payout_id=payout_requests.id) AS proof_media_id,
  created_at,updated_at`;
export const settlementInput = z.strictObject({ proof_media_id: z.uuid(), evidence: z.string().trim().min(1).max(200) });

/** Trusted backend adapter. Use supplied transaction client, common finance locks,
 * current label roster and exact source allocations. Never commit or call providers.
 * Reserve rejects insufficient funds; release/settle require matching active allocation.
 */
export interface PayoutFinance {
  lock(db: PoolClient, ownerId: string): Promise<void>;
  eligibility(db: PoolClient, ownerId: string): Promise<{
    available: string; minimum: string; verified: boolean; destinationReady: boolean; reconciled: boolean;
  }>;
  reserve(db: PoolClient, input: { payoutId: string; ownerId: string; amount: string; currency: 'IDR' }): Promise<void>;
  release(db: PoolClient, payoutId: string): Promise<void>;
  settle(db: PoolClient, payoutId: string, evidence: string): Promise<void>;
}
export function minor(value: string): bigint { return BigInt(value.replace('.', '')); }
export function transitionAllowed(from: State, to: State): boolean {
  return (from === 'pending' && ['approved', 'rejected', 'cancelled', 'failed'].includes(to)) ||
    (from === 'approved' && ['rejected', 'failed', 'paid'].includes(to));
}
