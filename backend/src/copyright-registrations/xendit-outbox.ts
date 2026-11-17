import type { Pool } from 'pg';
import { z } from 'zod';
import { withTransaction } from '../db/pool.js';
import type { OutboxHandler } from '../worker/index.js';
import { idrAmountFromMinor, type XenditInvoiceClient } from '../payments/xendit-client.js';

const payload = z.strictObject({ payment_id: z.uuid() });

export function copyrightRegistrationRedirects(success: string, failure: string) {
  const path = '/dashboard/copyright-registration/status';
  return { success: new URL(path, success).toString(), failure: new URL(path, failure).toString() };
}

export function createCopyrightInvoiceDeliveryHandler(pool: Pool, client: XenditInvoiceClient,
  redirects: { success: string; failure: string }): OutboxHandler {
  return { delivery: 'external', async handle(event) {
    const { payment_id: paymentId } = payload.parse(event.payload);
    const payment = (await pool.query<{ id: string; amount_minor: string; provider_external_id: string;
      email: string; legal_name: string }>(`SELECT p.id,p.amount_minor::text,p.provider_external_id,r.email,r.legal_name
      FROM soundpub.copyright_registration_payments p
      JOIN soundpub.copyright_registrations r ON r.id=p.registration_id AND r.owner_id=p.owner_id
      WHERE p.id=$1 AND p.provider='xendit'`, [paymentId])).rows[0];
    if (!payment || !payment.provider_external_id || !payment.email) throw new Error('Copyright invoice not ready');
    const amount = idrAmountFromMinor(payment.amount_minor);
    const remote = await client.createOrRecover({ external_id: payment.provider_external_id, amount,
      currency: 'IDR', description: `SoundPub copyright registration ${payment.id}`,
      payer_email: payment.email, customer: { given_names: payment.legal_name.slice(0, 200), email: payment.email },
      success_redirect_url: redirects.success, failure_redirect_url: redirects.failure });
    if (remote.status !== 'PENDING') throw new Error('Copyright invoice requires reconciliation before activation');
    const stored = await withTransaction(pool, async db => {
      const result = await db.query(`UPDATE soundpub.copyright_registration_payments
        SET status='PROVIDER_PENDING',provider_invoice_id=$2,provider_invoice_url=$3,provider_status='PENDING'
        WHERE id=$1 AND provider='xendit' AND status='CREATING' AND provider_external_id=$4`,
      [paymentId, remote.id, remote.invoice_url, payment.provider_external_id]);
      if (result.rowCount === 1) {
        await db.query(`INSERT INTO soundpub.audit_logs(action,resource_type,resource_id,request_id,metadata)
          VALUES ('copyright_registration.payment_provider_ready','copyright_registration_payment',$1,$2,$3::jsonb)`,
        [paymentId, event.idempotency_key, JSON.stringify({ provider: 'xendit', invoiceId: remote.id })]);
        return true;
      }
      const existing = (await db.query<{ provider_invoice_id: string | null; provider_invoice_url: string | null;
        provider_external_id: string | null }>(`SELECT provider_invoice_id,provider_invoice_url,provider_external_id
        FROM soundpub.copyright_registration_payments WHERE id=$1 AND provider='xendit'`, [paymentId])).rows[0];
      return existing?.provider_invoice_id === remote.id && existing.provider_invoice_url === remote.invoice_url &&
        existing.provider_external_id === payment.provider_external_id;
    });
    if (!stored) throw new Error('Copyright invoice provider evidence conflicts');
  } };
}
