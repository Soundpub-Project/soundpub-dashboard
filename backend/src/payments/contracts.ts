import type { PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';

export const paymentStates = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'] as const;
export type PaymentStatus = typeof paymentStates[number];
export const invoiceInput = z.strictObject({ release_id: z.uuid(), idempotency_key: z.string().min(1).max(200) });
export const refundInput = z.strictObject({ invoice_id: z.uuid(), idempotency_key: z.string().min(1).max(200), reason: z.string().trim().min(1).max(500) });
export const callbackInput = z.strictObject({ provider_invoice_id: z.string().min(1).max(200), status: z.string().min(1).max(64),
 amount_minor: z.string().regex(/^[1-9][0-9]{0,15}$/).refine(v => BigInt(v) <= 9007199254740991n), currency: z.string().regex(/^[A-Z]{3}$/) });
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
 const result = schema.safeParse(value);
 if (!result.success) throw new ApiError(400, 'BAD_REQUEST');
 return result.data;
}
// Fixed scale 2 matches persisted release snapshot; excess precision rejects, never rounds.
export function toMinor(value: string): string {
 if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(value)) throw new ApiError(409, 'PAYMENT_PRICE_UNAVAILABLE');
 const [whole, fraction = ''] = value.split('.');
 const amount = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
 if (amount <= 0n || amount > 9007199254740991n) throw new ApiError(409, 'PAYMENT_PRICE_UNAVAILABLE');
 return amount.toString();
}
export function nextPaymentStatus(current: PaymentStatus, incoming: PaymentStatus): PaymentStatus {
 if (current === 'REFUNDED' || incoming === 'PENDING') return current;
 if (incoming === 'REFUNDED') return current === 'PAID' ? incoming : current;
 if (current === 'PAID') return current;
 return incoming;
}
export interface Invoice {
 id: string; business_type: 'release'; business_id: string; provider: 'mock'; provider_invoice_id: string;
 amount_minor: string; currency: 'IDR'; precision: 2; status: PaymentStatus; idempotency_key: string;
 reconciliation_required: boolean; created_at: Date; updated_at: Date;
}
export interface ProviderInvoice { provider_invoice_id: string; amount_minor: string; currency: 'IDR'; status: PaymentStatus }
export interface PaymentProvider {
 readonly name: 'mock';
 create(db: PoolClient, invoice: Invoice): Promise<void>;
 status(db: PoolClient, reference: string): Promise<ProviderInvoice | null>;
 refund(db: PoolClient, reference: string): Promise<void>;
}

