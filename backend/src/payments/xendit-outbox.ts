import { z } from 'zod';
import type { Pool } from 'pg';
import { withTransaction } from '../db/pool.js';
import type { OutboxHandler } from '../worker/index.js';
import { idrAmountFromMinor, type XenditInvoiceClient } from './xendit-client.js';

const payloadSchema = z.object({ invoice_id: z.uuid() }).strict();
const supportedStatus = new Set(['PENDING', 'PAID', 'EXPIRED', 'FAILED']);

export function createXenditInvoiceOutboxHandler(
  pool: Pool,
  client: XenditInvoiceClient,
  redirects: { success: string; failure: string },
): OutboxHandler {
  return {
    delivery: 'external',
    async handle(event) {
      const { invoice_id: invoiceId } = payloadSchema.parse(event.payload);
      const invoice = (await pool.query<{
        id: string; amount_minor: string; provider_external_id: string; payer_email: string | null;
      }>(`SELECT invoice.id,invoice.amount_minor::text,invoice.provider_external_id,owner.email AS payer_email
        FROM soundpub.payment_invoices invoice
        JOIN soundpub.backend_users owner ON owner.id=invoice.payer_owner_id
        WHERE invoice.id=$1 AND invoice.provider='xendit'`, [invoiceId])).rows[0];
      if (!invoice || !invoice.provider_external_id || !invoice.payer_email) throw new Error('Invoice is not ready for provider delivery');
      const amount = idrAmountFromMinor(invoice.amount_minor);
      const remote = await client.createOrRecover({
        external_id: invoice.provider_external_id,
        amount,
        currency: 'IDR',
        description: `SoundPub release invoice ${invoice.id}`,
        payer_email: invoice.payer_email,
        customer: { given_names: 'SoundPub Payer', email: invoice.payer_email },
        success_redirect_url: redirects.success,
        failure_redirect_url: redirects.failure,
      });
      if (!supportedStatus.has(remote.status)) throw new Error('Xendit invoice has unsupported status');
      const stored = await withTransaction(pool, async db => {
        const updated = await db.query(`UPDATE soundpub.payment_invoices
          SET provider_invoice_id=$2,provider_invoice_url=$3,provider_status=$4,status=$5,updated_at=now()
          WHERE id=$1 AND provider='xendit' AND status='CREATING' AND provider_external_id=$6`,
        [invoice.id, remote.id, remote.invoice_url, remote.status, remote.status, invoice.provider_external_id]);
        if (updated.rowCount === 1) {
          await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
            VALUES (NULL,'payment.invoice_provider_ready','payment_invoice',$1,$2,$3::jsonb)`,
          [invoice.id, event.idempotency_key, JSON.stringify({ provider: 'xendit', provider_invoice_id: remote.id,
            provider_external_id: invoice.provider_external_id, status: remote.status })]);
          return true;
        }
        const existing = (await db.query<{ provider_invoice_id: string | null; provider_invoice_url: string | null;
          provider_external_id: string | null }>(`SELECT provider_invoice_id,provider_invoice_url,provider_external_id
          FROM soundpub.payment_invoices WHERE id=$1 AND provider='xendit'`, [invoice.id])).rows[0];
        return existing?.provider_invoice_id === remote.id && existing.provider_invoice_url === remote.invoice_url &&
          existing.provider_external_id === invoice.provider_external_id;
      });
      if (!stored) throw new Error('Persisted Xendit invoice conflicts with provider response');
    },
  };
}