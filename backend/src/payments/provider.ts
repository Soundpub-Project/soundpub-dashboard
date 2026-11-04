import type { PoolClient } from 'pg';
import { ApiError } from '../api/types.js';
import type { Invoice, PaymentProvider, ProviderInvoice } from './contracts.js';

// ponytail: durable local simulator only; live providers require outbox and independent settlement proof.
export class MockPaymentProvider implements PaymentProvider {
 readonly name = 'mock' as const;
 async create(db: PoolClient, invoice: Invoice) {
  await db.query(`INSERT INTO soundpub.payment_mock_invoices(provider_invoice_id,amount_minor,currency,status)
   VALUES ($1,$2,$3,'PENDING')`, [invoice.provider_invoice_id, invoice.amount_minor, invoice.currency]);
 }
 async status(db: PoolClient, reference: string) {
  return (await db.query<ProviderInvoice>('SELECT * FROM soundpub.payment_mock_invoices WHERE provider_invoice_id=$1', [reference])).rows[0] ?? null;
 }
 async refund(db: PoolClient, reference: string) {
  if ((await db.query(`UPDATE soundpub.payment_mock_invoices SET status='REFUNDED'
   WHERE provider_invoice_id=$1 AND status='PAID'`, [reference])).rowCount !== 1) throw new ApiError(409, 'PAYMENT_UNRECONCILED');
 }
}
