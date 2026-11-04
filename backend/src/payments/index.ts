import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { usersRepository } from '../users/repository.js';
import { withTransaction } from '../db/pool.js';
import { receiveWebhook, type WebhookInput } from '../integrations/webhook.js';
import type { SubmissionContext } from '../submissions/index.js';
import { callbackInput, invoiceInput, refundInput, parse, toMinor, nextPaymentStatus, paymentStates, type PaymentStatus, type Invoice, type PaymentProvider } from './contracts.js';
import { MockPaymentProvider } from './provider.js';
import { formatMoney, postEvent } from '../finance/index.js';
export * from './contracts.js';
export { MockPaymentProvider } from './provider.js';
const allows = createAuthorizer();
async function authority(db: PoolClient, actor: Principal, releaseId?: string, adminOnly = false, relatedIds: string[] = []) {
 const current = (await usersRepository(db).lock([actor.id, ...relatedIds], false)).get(actor.id);
 if (!current || !allows(current, adminOnly ? 'admin' : 'authenticated')) throw new ApiError(403, 'FORBIDDEN');
 if (releaseId) {
  const r = (await db.query<{ artist_user_id: string | null; archived_at: Date | null }>(
   'SELECT artist_user_id,archived_at FROM soundpub.releases WHERE id=$1 FOR SHARE', [releaseId])).rows[0];
  if (!r || r.archived_at) throw new ApiError(404, 'NOT_FOUND');
  // Conservative owner/admin policy. Historical creator/label attribution grants no payment authority.
  if (!allows(current, 'admin') && !(r.artist_user_id === current.id && current.roles.includes('artist'))) throw new ApiError(404, 'NOT_FOUND');
 }
}
async function find(db: PoolClient, releaseId: string) {
 return (await db.query<Invoice>('SELECT * FROM soundpub.payment_invoices WHERE business_id=$1 FOR UPDATE', [releaseId])).rows[0] ?? null;
}
async function lockPaymentRelease(db: PoolClient, releaseId: string) {
 const ownerId = (await db.query<{ artist_user_id: string | null }>(
  'SELECT artist_user_id FROM soundpub.releases WHERE id=$1', [releaseId])).rows[0]?.artist_user_id;
 if (ownerId) await db.query('SELECT id FROM soundpub.backend_users WHERE id=$1 FOR KEY SHARE', [ownerId]);
 const release = (await db.query<{ artist_user_id: string | null }>(
  'SELECT artist_user_id FROM soundpub.releases WHERE id=$1 FOR SHARE', [releaseId])).rows[0];
 if (!release || release.artist_user_id !== ownerId) throw new ApiError(409, 'CONFLICT');
}
async function audit(db: PoolClient, invoice: Invoice, actor: string | null, operation: string, oldState: string | null, newState: string, reference: string) {
 await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
 VALUES ($1,$2,'payment_invoice',$3,$4,$5::jsonb)`, [actor, operation, invoice.id, reference, JSON.stringify({
  business_reference: invoice.business_id, amount_minor: invoice.amount_minor, currency: invoice.currency,
  old_state: oldState, new_state: newState, idempotency_reference: reference, system: actor === null ? 'mock_callback' : undefined,
 })]);
}
async function effect(db: PoolClient, invoice: Invoice, kind: 'PAYMENT_CHARGE' | 'PAYMENT_REFUND', reference: string) {
 const owner = (await db.query<{ artist_user_id: string | null }>(
  'SELECT artist_user_id FROM soundpub.releases WHERE id=$1 FOR SHARE', [invoice.business_id])).rows[0]?.artist_user_id;
 if (!owner) throw new ApiError(409, 'PAYMENT_OWNER_UNAVAILABLE');
 await db.query(`INSERT INTO soundpub.payment_effects(invoice_id,kind,amount_minor,currency,reference)
 VALUES ($1,$2,$3,$4,$5)`, [invoice.id, kind, invoice.amount_minor, invoice.currency, reference]);
 await postEvent(db, { ownerId: owner, kind, amount: formatMoney(BigInt(invoice.amount_minor)),
  businessReference: invoice.id, idempotencyKey: `${kind}:${invoice.id}`, systemActor: 'mock-payment', evidence: reference });
}
export async function reconcileInvoice(db: PoolClient, invoice: Invoice, provider: PaymentProvider = new MockPaymentProvider()) {
 const remote = await provider.status(db, invoice.provider_invoice_id);
 const effects = (await db.query<{ kind: string; amount_minor: string; currency: string; reference: string }>(
  'SELECT kind,amount_minor,currency,reference FROM soundpub.payment_effects WHERE invoice_id=$1', [invoice.id])).rows;
 const issues: string[] = [];
 const snapshot = (await db.query<{ total: string | null; price: string | null; tracks: number; owner_id: string | null }>(
  `SELECT r.total_payment_snapshot::text AS total, r.price_per_track_snapshot::text AS price,
   (SELECT count(*)::integer FROM soundpub.tracks t WHERE t.release_id=r.id) AS tracks,
   r.artist_user_id AS owner_id
   FROM soundpub.releases r WHERE r.id=$1`, [invoice.business_id])).rows[0];
 if (!snapshot?.total || !snapshot.price || snapshot.tracks < 1 || toMinor(snapshot.total) !== invoice.amount_minor ||
    (BigInt(toMinor(snapshot.price)) * BigInt(snapshot.tracks)).toString() !== invoice.amount_minor)
   issues.push('RELEASE_PRICE_MISMATCH');
 if (!remote) issues.push('PROVIDER_MISSING');
 else {
  if (remote.status !== invoice.status) issues.push('STATE_MISMATCH');
  if (remote.amount_minor !== invoice.amount_minor || remote.currency !== invoice.currency) issues.push('AMOUNT_MISMATCH');
 }
 const charges = effects.filter(e => e.kind === 'PAYMENT_CHARGE');
 const refunds = effects.filter(e => e.kind === 'PAYMENT_REFUND');
 const ledger = (await db.query<{ owner_id: string; currency: string; kind: string; amount_minor: string; evidence: string | null }>(
  `SELECT owner_id,currency,kind,amount_minor,evidence FROM soundpub.finance_events WHERE business_reference=$1
   AND kind IN ('PAYMENT_CHARGE','PAYMENT_REFUND') ORDER BY kind`, [invoice.id])).rows;
 if (charges.length !== (['PAID','REFUNDED'].includes(invoice.status) ? 1 : 0)) issues.push('CHARGE_MISMATCH');
 if (refunds.length !== (invoice.status === 'REFUNDED' ? 1 : 0)) issues.push('REFUND_MISMATCH');
 if (effects.some(e => e.amount_minor !== invoice.amount_minor || e.currency !== invoice.currency)) issues.push('LEDGER_AMOUNT_MISMATCH');
 if (!snapshot?.owner_id || ledger.length !== effects.length || effects.some(effect =>
   ledger.filter(event => event.kind === effect.kind && event.owner_id === snapshot.owner_id &&
    event.currency === effect.currency && event.amount_minor === effect.amount_minor && event.evidence === effect.reference).length !== 1))
   issues.push('FINANCE_LEDGER_MISMATCH');
 const auditRows = (await db.query<{ action: string; request_id: string | null; actor_user_id: string | null; metadata: Record<string, unknown> }>(`SELECT action,request_id,actor_user_id,metadata FROM soundpub.audit_logs
  WHERE resource_type='payment_invoice' AND resource_id=$1`, [invoice.id])).rows;
 const manualRefund = (await db.query<{ actor_user_id: string; idempotency_key: string }>(
   'SELECT actor_user_id,idempotency_key FROM soundpub.payment_refunds WHERE invoice_id=$1', [invoice.id])).rows[0];
 const isManualRefund = (reference: string) => !!manualRefund && reference === `refund:${manualRefund.idempotency_key}`;
 const callbackReferences = effects.filter(effect => !isManualRefund(effect.reference)).map(effect => effect.reference);
 const callbacks = (await db.query<{ event_id: string; provider_invoice_id: string; disposition: string; payload: Record<string, unknown> }>(
   `SELECT receipt.event_id,receipt.provider_invoice_id,receipt.disposition,receipt.payload
    FROM soundpub.payment_callback_receipts receipt JOIN soundpub.webhook_events webhook
      ON webhook.event_id=receipt.event_id AND webhook.provider='mock-payment' AND webhook.status='processed'
    WHERE receipt.event_id=ANY($1::text[])`, [callbackReferences])).rows;
 const auditMatches = (action: string, reference: string, status: string) => auditRows.some(row => row.action === action &&
   row.request_id === reference && row.metadata.amount_minor === invoice.amount_minor &&
   row.metadata.currency === invoice.currency && row.metadata.business_reference === invoice.business_id &&
   row.metadata.idempotency_reference === reference &&
   (action === 'payment.callback' ? row.actor_user_id === null && row.metadata.system === 'mock_callback' &&
      callbacks.some(callback => callback.event_id === reference && callback.disposition === 'applied' &&
        callback.provider_invoice_id === invoice.provider_invoice_id && callback.payload.provider_invoice_id === invoice.provider_invoice_id &&
        callback.payload.amount_minor === invoice.amount_minor && callback.payload.currency === invoice.currency &&
        callback.payload.status === status) :
    action === 'payment.refund' ? row.actor_user_id === manualRefund?.actor_user_id : true));
 if (!auditRows.some(row => row.action === 'payment.invoice_created' && row.metadata.amount_minor === invoice.amount_minor &&
   row.metadata.currency === invoice.currency && row.metadata.business_reference === invoice.business_id &&
   row.metadata.idempotency_reference === invoice.idempotency_key)) issues.push('AUDIT_MISSING');
 if (charges.some(effect => !auditMatches('payment.callback', effect.reference, 'PAID'))) issues.push('SETTLEMENT_EVIDENCE_MISSING');
 if (refunds.some(effect => !auditMatches(isManualRefund(effect.reference) ? 'payment.refund' : 'payment.callback',
   isManualRefund(effect.reference) ? manualRefund!.idempotency_key : effect.reference, 'REFUNDED'))) issues.push('REFUND_EVIDENCE_MISSING');
 if (invoice.reconciliation_required) issues.push('MANUAL_REVIEW_REQUIRED');
 return { invoice_id: invoice.id, issues, reconciled: issues.length === 0 };
}
export const paymentSubmissionDependency = {
 async isReleasePaymentSatisfied({ db, release }: SubmissionContext): Promise<boolean> {
  const invoice = await find(db, release.id);
  if (!invoice || invoice.status !== 'PAID') return false;
  return (await reconcileInvoice(db, invoice)).reconciled;
 },
};
export function createPaymentsService(pool: Pool, options: { callbackSecret: string; provider?: PaymentProvider }) {
 if (options.callbackSecret.length < 32) throw new Error('Mock callback secret must contain at least 32 characters');
 const provider = options.provider ?? new MockPaymentProvider();
 if (provider.name !== 'mock') throw new Error('Only mock payment provider allowed');
 return {
  async createInvoice(actor: Principal, input: unknown, requestId: string) {
   const data = parse(invoiceInput, input);
   return withTransaction(pool, async db => {
    await authority(db, actor, data.release_id);
    const snapshot = (await db.query<{ price: string | null; total: string | null; tracks: number }>(
     `SELECT r.price_per_track_snapshot::text AS price, r.total_payment_snapshot::text AS total,
       (SELECT count(*)::integer FROM soundpub.tracks t WHERE t.release_id=r.id) AS tracks
      FROM soundpub.releases r WHERE r.id=$1`, [data.release_id])).rows[0];
    if (!snapshot?.price || !snapshot.total || snapshot.tracks < 1 ||
      (BigInt(toMinor(snapshot.price)) * BigInt(snapshot.tracks)).toString() !== toMinor(snapshot.total))
      throw new ApiError(409, 'PAYMENT_PRICE_UNAVAILABLE');
    const amount = toMinor(snapshot.total);
    const existing = await find(db, data.release_id);
    if (existing) {
     if (existing.idempotency_key !== data.idempotency_key) throw new ApiError(409, 'CONFLICT');
     if (existing.amount_minor !== amount) throw new ApiError(409, 'PAYMENT_PRICE_CHANGED');
     return existing;
    }
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,17))', [data.idempotency_key]);
    if ((await db.query('SELECT id FROM soundpub.payment_invoices WHERE idempotency_key=$1', [data.idempotency_key])).rows.length) throw new ApiError(409, 'CONFLICT');
    const invoice = (await db.query<Invoice>(`INSERT INTO soundpub.payment_invoices(business_id,provider_invoice_id,amount_minor,idempotency_key)
     VALUES ($1,$2,$3,$4) RETURNING *`, [data.release_id, `mock_${randomUUID()}`, amount, data.idempotency_key])).rows[0]!;
    await provider.create(db, invoice);
    await audit(db, invoice, actor.id, 'payment.invoice_created', null, 'PENDING', data.idempotency_key);
    return invoice;
   });
  },
  async status(actor: Principal, releaseId: string) {
   const id = parse(z.uuid(), releaseId);
   return withTransaction(pool, async db => {
    await authority(db, actor, id);
    const invoice = await find(db, id);
    return { invoice, reconciliation: invoice ? await reconcileInvoice(db, invoice, provider) : null };
   });
  },
  async callback(input: WebhookInput) {
   if (input.provider !== 'mock-payment') throw new ApiError(400, 'BAD_REQUEST');
   return receiveWebhook({ async connect() {
    const client = await pool.connect();
    // Phase 2 webhook foundation uses unqualified SQL; pin private schema per checkout.
    try { await client.query('SET search_path=soundpub,pg_catalog'); return client; }
    catch (error) { client.release(true); throw error; }
   } }, input, options.callbackSecret, async (payload, client) => {
    const db = client as PoolClient;
    const event = parse(callbackInput, payload);
    if (!paymentStates.includes(event.status as PaymentStatus)) {
     await db.query(`INSERT INTO soundpub.payment_callback_receipts(event_id,provider_invoice_id,disposition,payload)
      VALUES ($1,$2,'unsupported',$3::jsonb)`, [input.eventId,event.provider_invoice_id,JSON.stringify(event)]);
     return;
    }
    const businessId = (await db.query<{ business_id: string }>(
     'SELECT business_id FROM soundpub.payment_invoices WHERE provider_invoice_id=$1', [event.provider_invoice_id])).rows[0]?.business_id;
    if (businessId) await lockPaymentRelease(db, businessId);
    const invoice = (await db.query<Invoice>('SELECT * FROM soundpub.payment_invoices WHERE provider_invoice_id=$1 FOR UPDATE', [event.provider_invoice_id])).rows[0];
    if (invoice && invoice.business_id !== businessId) throw new ApiError(409, 'CONFLICT');
    let disposition = 'unknown_invoice';
    if (invoice) {
     const next = nextPaymentStatus(invoice.status, event.status as PaymentStatus);
     if (event.amount_minor !== invoice.amount_minor || event.currency !== invoice.currency) disposition = 'mismatch';
     else if (event.status === 'REFUNDED' && !['PAID','REFUNDED'].includes(invoice.status)) disposition = 'invalid_transition';
     else {
      disposition = next === invoice.status ? 'ignored' : 'applied';
      if (next !== invoice.status) {
       if (next === 'PAID') await effect(db, invoice, 'PAYMENT_CHARGE', input.eventId);
       if (next === 'REFUNDED') await effect(db, invoice, 'PAYMENT_REFUND', input.eventId);
       await db.query('UPDATE soundpub.payment_invoices SET status=$2,updated_at=now() WHERE id=$1', [invoice.id, next]);
       await db.query('UPDATE soundpub.payment_mock_invoices SET status=$2 WHERE provider_invoice_id=$1', [invoice.provider_invoice_id, next]);
       await audit(db, invoice, null, 'payment.callback', invoice.status, next, input.eventId);
      }
     }
     if (['mismatch','invalid_transition'].includes(disposition)) {
      await db.query('UPDATE soundpub.payment_invoices SET reconciliation_required=true,updated_at=now() WHERE id=$1', [invoice.id]);
      await audit(db, invoice, null, 'payment.manual_review', invoice.status, invoice.status, input.eventId);
     }
    }
    await db.query(`INSERT INTO soundpub.payment_callback_receipts(event_id,provider_invoice_id,disposition,payload)
     VALUES ($1,$2,$3,$4::jsonb)`, [input.eventId,event.provider_invoice_id,disposition,JSON.stringify(event)]);
   });
  },
  async refund(actor: Principal, input: unknown, requestId: string) {
   const data = parse(refundInput, input);
   return withTransaction(pool, async db => {
    const businessId = (await db.query<{ business_id: string }>(
     'SELECT business_id FROM soundpub.payment_invoices WHERE id=$1', [data.invoice_id])).rows[0]?.business_id;
    if (!businessId) { await authority(db, actor, undefined, true); throw new ApiError(404, 'NOT_FOUND'); }
    const beneficiaryId = (await db.query<{ artist_user_id: string | null }>(
     'SELECT artist_user_id FROM soundpub.releases WHERE id=$1', [businessId])).rows[0]?.artist_user_id;
    await authority(db, actor, undefined, true, beneficiaryId ? [beneficiaryId] : []);
    await lockPaymentRelease(db, businessId);
    const invoice = (await db.query<Invoice>('SELECT * FROM soundpub.payment_invoices WHERE id=$1 FOR UPDATE', [data.invoice_id])).rows[0];
    if (!invoice || invoice.business_id !== businessId) throw new ApiError(409, 'CONFLICT');
    const prior = (await db.query<{ idempotency_key: string; reason: string }>('SELECT * FROM soundpub.payment_refunds WHERE invoice_id=$1', [invoice.id])).rows[0];
    if (prior) {
     if (prior.idempotency_key !== data.idempotency_key || prior.reason !== data.reason) throw new ApiError(409, 'CONFLICT');
     return invoice;
    }
    if (invoice.status !== 'PAID' || !(await reconcileInvoice(db, invoice, provider)).reconciled) throw new ApiError(409, 'PAYMENT_UNRECONCILED');
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,18))', [data.idempotency_key]);
    if ((await db.query('SELECT invoice_id FROM soundpub.payment_refunds WHERE idempotency_key=$1', [data.idempotency_key])).rows.length) throw new ApiError(409, 'CONFLICT');
    await provider.refund(db, invoice.provider_invoice_id);
    await db.query('INSERT INTO soundpub.payment_refunds(invoice_id,idempotency_key,reason,actor_user_id) VALUES ($1,$2,$3,$4)', [invoice.id,data.idempotency_key,data.reason,actor.id]);
    await effect(db, invoice, 'PAYMENT_REFUND', `refund:${data.idempotency_key}`);
    await db.query("UPDATE soundpub.payment_invoices SET status='REFUNDED',updated_at=now() WHERE id=$1", [invoice.id]);
    await audit(db, invoice, actor.id, 'payment.refund', 'PAID', 'REFUNDED', data.idempotency_key);
    return { ...invoice, status: 'REFUNDED' as const };
   });
  },
  async reconcile(actor: Principal) {
   return withTransaction(pool, async db => {
    await authority(db, actor, undefined, true);
    const invoices = (await db.query<Invoice>('SELECT * FROM soundpub.payment_invoices ORDER BY id FOR UPDATE')).rows;
    const results = [];
    for (const invoice of invoices) results.push(await reconcileInvoice(db, invoice, provider));
    const unresolved_callbacks = (await db.query(`SELECT event_id,provider_invoice_id,disposition FROM soundpub.payment_callback_receipts
     WHERE disposition IN ('unknown_invoice','mismatch','invalid_transition','unsupported') ORDER BY event_id`)).rows;
    return { mode: 'DRY_RUN' as const, results, unresolved_callbacks,
     reconciled: results.every(r => r.reconciled) && unresolved_callbacks.length === 0 };
   });
  },
 };
}
export type PaymentsService = ReturnType<typeof createPaymentsService>;



