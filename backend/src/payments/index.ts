import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { calculateReleasePrice, type ReleasePriceSnapshot } from '../releases/pricing.js';
import { withTransaction } from '../db/pool.js';
import { receiveWebhook, type WebhookInput } from '../integrations/webhook.js';
import type { SubmissionContext } from '../submissions/index.js';
import { callbackInput, invoiceInput, refundInput, parse, toMinor, nextPaymentStatus, paymentStates, type PaymentStatus, type Invoice, type PaymentProvider } from './contracts.js';
import { MockPaymentProvider } from './provider.js';
import { formatMoney, postEvent } from '../finance/index.js';
import { renderInvoicePdf } from './invoice-pdf.js';
import type { InvoiceDocumentStore } from './invoice-document-store.js';
import { parseXenditInvoiceCallback, verifyXenditCallbackToken } from './xendit-webhook.js';
import { webhookSignature } from '../integrations/webhook.js';
import { idrAmountFromMinor, type XenditInvoiceClient } from './xendit-client.js';
export * from './contracts.js';
export { MockPaymentProvider } from './provider.js';
export { XenditInvoiceClient } from './xendit-client.js';
const allows = createAuthorizer();
type PaymentIdentity = { artistId: string; payerOwnerId: string; financialOwnerId: string;
 ownershipPolicy: 'LOGIN_ACCOUNT' | 'LABEL_CUSTOM_PIC' };
type PaymentResource = { artist_id: string | null; archived_at: Date | null; management_mode: string;
 artist_user_id: string | null; label_id: string | null; label_custom_unit_id: string | null; verified_at: Date | null;
 unit_id: string | null; unit_owner_id: string | null; unit_status: string | null };
async function paymentPrincipals(db: PoolClient, ids: string[]) {
 const unique = [...new Set(ids)].sort();
 const users = (await db.query<{ id: string; status: Principal['status'] }>(`SELECT id,status FROM soundpub.backend_users
  WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE`, [unique])).rows;
 await db.query(`SELECT pg_advisory_xact_lock_shared(hashtextextended(id::text,0))
   FROM unnest($1::uuid[]) AS ids(id) ORDER BY id`, [unique]);
 const roles = (await db.query<{ user_id: string; role: Principal['roles'][number] }>(`SELECT user_id,role FROM soundpub.user_roles
  WHERE user_id=ANY($1::uuid[]) AND tenant_id IS NULL AND verified_at IS NOT NULL ORDER BY user_id,role`, [unique])).rows;
 return new Map(users.map(user => [user.id, { ...user, roles:roles.filter(role => role.user_id===user.id).map(role => role.role) }]));
}
async function paymentResource(db: PoolClient, releaseId: string, lock: boolean) {
 return (await db.query<PaymentResource>(`SELECT r.artist_id,r.archived_at,a.management_mode,a.artist_user_id,a.label_id,
   a.label_custom_unit_id,a.verified_at,unit.id AS unit_id,unit.owner_user_id AS unit_owner_id,unit.status AS unit_status
   FROM soundpub.releases r JOIN soundpub.artists a ON a.id=r.artist_id
   LEFT JOIN soundpub.label_custom_units unit ON unit.id=a.label_custom_unit_id
   WHERE r.id=$1 ${lock ? 'FOR SHARE OF r,a' : ''}`, [releaseId])).rows[0] ?? null;
}
function identity(resource: PaymentResource | null): PaymentIdentity | null {
 if (!resource || resource.archived_at || !resource.artist_id || !resource.verified_at) return null;
 if (resource.management_mode === 'LOGIN_ACCOUNT' && resource.artist_user_id) return {
  artistId: resource.artist_id, payerOwnerId: resource.artist_user_id,
  financialOwnerId: resource.artist_user_id, ownershipPolicy: 'LOGIN_ACCOUNT',
 };
 if (resource.management_mode === 'LABEL_CUSTOM_MANAGED' && !resource.artist_user_id && resource.label_id &&
     resource.unit_id === resource.label_custom_unit_id && resource.unit_owner_id === resource.label_id && resource.unit_status === 'active') return {
  artistId: resource.artist_id, payerOwnerId: resource.label_id,
  financialOwnerId: resource.label_id, ownershipPolicy: 'LABEL_CUSTOM_PIC',
 };
 return null;
}
async function authority(db: PoolClient, actor: Principal | null, releaseId: string, ownerOnly = false, adminOnly = false) {
 const initial = identity(await paymentResource(db, releaseId, false));
 if (!initial) throw new ApiError(404, 'NOT_FOUND');
 const principals = await paymentPrincipals(db, [initial.payerOwnerId, ...(actor ? [actor.id] : [])]);
 const current = actor ? principals.get(actor.id) : null;
 const owner = principals.get(initial.payerOwnerId);
 if (actor && (!current || !allows(current, adminOnly ? 'admin' : 'authenticated'))) throw new ApiError(403, 'FORBIDDEN');
 const locked = identity(await paymentResource(db, releaseId, true));
 if (!locked || JSON.stringify(locked) !== JSON.stringify(initial) || !owner || owner.status !== 'active' ||
     (locked.ownershipPolicy === 'LOGIN_ACCOUNT' ? !owner.roles.includes('artist') : !owner.roles.includes('label_custom'))) {
  throw new ApiError(409, 'PAYMENT_OWNER_UNAVAILABLE');
 }
 if (actor && ownerOnly && current!.id !== locked.payerOwnerId) throw new ApiError(404, 'NOT_FOUND');
 if (actor && !ownerOnly && !allows(current!, 'admin') && current!.id !== locked.payerOwnerId) throw new ApiError(404, 'NOT_FOUND');
 return locked;
}
async function systemIdentity(db: PoolClient, releaseId: string) {
 const initial = identity(await paymentResource(db, releaseId, false));
 if (!initial) throw new ApiError(409, 'PAYMENT_OWNER_UNAVAILABLE');
 const owner = (await db.query<{ status: string }>('SELECT status FROM soundpub.backend_users WHERE id=$1 FOR SHARE',
  [initial.financialOwnerId])).rows[0];
 await db.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))', [initial.financialOwnerId]);
 const role = initial.ownershipPolicy === 'LOGIN_ACCOUNT' ? 'artist' : 'label_custom';
 const verifiedRole = (await db.query(`SELECT 1 FROM soundpub.user_roles WHERE user_id=$1 AND role=$2
  AND tenant_id IS NULL AND verified_at IS NOT NULL`, [initial.financialOwnerId, role])).rowCount === 1;
 const locked = identity(await paymentResource(db, releaseId, true));
 if (!locked || JSON.stringify(locked) !== JSON.stringify(initial) || owner?.status !== 'active' || !verifiedRole) {
  throw new ApiError(409, 'PAYMENT_OWNER_UNAVAILABLE');
 }
 return locked;
}
async function find(db: PoolClient, releaseId: string) {
 return (await db.query<Invoice>('SELECT * FROM soundpub.payment_invoices WHERE business_id=$1 FOR UPDATE', [releaseId])).rows[0] ?? null;
}
function assertPaymentIdentity(invoice: Invoice, current: PaymentIdentity) {
 if (current.artistId !== invoice.artist_id || current.payerOwnerId !== invoice.payer_owner_id ||
     current.financialOwnerId !== invoice.financial_owner_id || current.ownershipPolicy !== invoice.ownership_policy) {
  throw new ApiError(409, 'PAYMENT_OWNER_CHANGED');
 }
}
async function audit(db: PoolClient, invoice: Invoice, actor: string | null, operation: string, oldState: string | null, newState: string, reference: string) {
 await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
 VALUES ($1,$2,'payment_invoice',$3,$4,$5::jsonb)`, [actor, operation, invoice.id, reference, JSON.stringify({
  business_reference: invoice.business_id, amount_minor: invoice.amount_minor, currency: invoice.currency,
  old_state: oldState, new_state: newState, idempotency_reference: reference, system: actor === null ? `${invoice.provider}_callback` : undefined,
 })]);
}
async function effect(db: PoolClient, invoice: Invoice, kind: 'PAYMENT_CHARGE' | 'PAYMENT_REFUND', reference: string) {
 await db.query(`INSERT INTO soundpub.payment_effects(invoice_id,kind,amount_minor,currency,reference)
 VALUES ($1,$2,$3,$4,$5)`, [invoice.id, kind, invoice.amount_minor, invoice.currency, reference]);
 await postEvent(db, { ownerId: invoice.financial_owner_id, kind, amount: formatMoney(BigInt(invoice.amount_minor)),
  businessReference: invoice.id, idempotencyKey: `${kind}:${invoice.id}`, systemActor: invoice.provider === 'xendit' ? 'xendit-payment' : 'mock-payment', evidence: reference });
}
export async function reconcileInvoice(db: PoolClient, invoice: Invoice, provider: PaymentProvider = new MockPaymentProvider()) {
 const remote = invoice.provider === 'mock' ? (invoice.provider_invoice_id ? await provider.status(db, invoice.provider_invoice_id) : null) :
  invoice.provider_status && invoice.provider_invoice_id ? { provider_invoice_id: invoice.provider_invoice_id, amount_minor: invoice.amount_minor, currency: invoice.currency, status: invoice.provider_status as PaymentStatus } : null;
 const effects = (await db.query<{ kind: string; amount_minor: string; currency: string; reference: string }>(
  'SELECT kind,amount_minor,currency,reference FROM soundpub.payment_effects WHERE invoice_id=$1', [invoice.id])).rows;
 const issues: string[] = [];
 const snapshot = (await db.query<{ total: string | null; price: string | null; pricing_mode: 'per_track' | 'per_category' | null; pricing_track_count: number | null; tracks: number; artist_id: string | null;
   owner_id: string | null; ownership_policy: string | null }>(
  `SELECT r.total_payment_snapshot::text AS total, r.price_per_track_snapshot::text AS price,
   r.pricing_snapshot_mode AS pricing_mode,r.pricing_snapshot_track_count AS pricing_track_count,
   (SELECT count(*)::integer FROM soundpub.tracks t WHERE t.release_id=r.id) AS tracks,
   r.artist_id, CASE WHEN a.management_mode='LOGIN_ACCOUNT' AND owner.status='active'
       AND EXISTS(SELECT 1 FROM soundpub.user_roles role WHERE role.user_id=a.artist_user_id AND role.role='artist'
         AND role.tenant_id IS NULL AND role.verified_at IS NOT NULL) THEN a.artist_user_id
     WHEN a.management_mode='LABEL_CUSTOM_MANAGED' AND unit.status='active' AND unit.owner_user_id=a.label_id
       AND owner.status='active' AND EXISTS(SELECT 1 FROM soundpub.user_roles role WHERE role.user_id=a.label_id
         AND role.role='label_custom' AND role.tenant_id IS NULL AND role.verified_at IS NOT NULL)
     THEN unit.owner_user_id END AS owner_id,
   CASE WHEN a.management_mode='LOGIN_ACCOUNT' THEN 'LOGIN_ACCOUNT'
     WHEN a.management_mode='LABEL_CUSTOM_MANAGED' THEN 'LABEL_CUSTOM_PIC' END AS ownership_policy
   FROM soundpub.releases r LEFT JOIN soundpub.artists a ON a.id=r.artist_id
   LEFT JOIN soundpub.label_custom_units unit ON unit.id=a.label_custom_unit_id
   LEFT JOIN soundpub.backend_users owner ON owner.id=COALESCE(a.artist_user_id,a.label_id)
   WHERE r.id=$1`, [invoice.business_id])).rows[0];
 if (!snapshot?.total || !snapshot.price || snapshot.tracks < 1 || toMinor(snapshot.total) !== invoice.amount_minor ||
    (snapshot.pricing_mode === 'per_category' ? snapshot.pricing_track_count !== snapshot.tracks :
      (BigInt(toMinor(snapshot.price)) * BigInt(snapshot.tracks)).toString() !== invoice.amount_minor))
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
 if (!snapshot?.owner_id || snapshot.owner_id !== invoice.payer_owner_id || snapshot.owner_id !== invoice.financial_owner_id ||
   snapshot.artist_id !== invoice.artist_id || snapshot.ownership_policy !== invoice.ownership_policy ||
   ledger.length !== effects.length || effects.some(effect =>
   ledger.filter(event => event.kind === effect.kind && event.owner_id === invoice.financial_owner_id &&
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
      ON webhook.event_id=receipt.event_id AND webhook.provider=CASE WHEN $2='mock' THEN 'mock-payment' ELSE 'xendit-invoice' END AND webhook.status='processed'
    WHERE receipt.event_id=ANY($1::text[])`, [callbackReferences, invoice.provider])).rows;
 const auditMatches = (action: string, reference: string, status: string) => auditRows.some(row => row.action === action &&
   row.request_id === reference && row.metadata.amount_minor === invoice.amount_minor &&
   row.metadata.currency === invoice.currency && row.metadata.business_reference === invoice.business_id &&
   row.metadata.idempotency_reference === reference &&
   (action === 'payment.callback' ? row.actor_user_id === null && row.metadata.system === `${invoice.provider}_callback` &&
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
export function createPaymentsService(pool: Pool, options: { callbackSecret: string; xenditWebhookToken?: string; provider?: PaymentProvider;
 documentStore?: InvoiceDocumentStore; xenditEnabled?: boolean }) {
 if (options.callbackSecret.length < 32) throw new Error('Mock callback secret must contain at least 32 characters');
 const provider = options.provider ?? new MockPaymentProvider();
 if (provider.name !== 'mock') throw new Error('Only mock payment provider allowed');
 return {
  async createInvoice(actor: Principal, input: unknown, requestId: string) {
   const data = parse(invoiceInput, input);
   if (!allows(actor, 'authenticated')) throw new ApiError(403, 'FORBIDDEN');
   return withTransaction(pool, async db => {
     await db.query("SELECT pg_advisory_xact_lock(hashtextextended('release-invoice:' || $1,17))", [data.release_id]);
     const paymentOwner = await authority(db, actor, data.release_id, true);
     const existing = await find(db, data.release_id);
     if (existing) {
      if (existing.idempotency_key !== data.idempotency_key) throw new ApiError(409, 'CONFLICT');
      assertPaymentIdentity(existing, paymentOwner);
      return existing;
     }
     await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,17))', [data.idempotency_key]);
     const replay = (await db.query<Invoice>('SELECT * FROM soundpub.payment_invoices WHERE idempotency_key=$1 FOR UPDATE', [data.idempotency_key])).rows[0];
     if (replay) {
      if (replay.business_id !== data.release_id || replay.payer_owner_id !== paymentOwner.payerOwnerId ||
        replay.financial_owner_id !== paymentOwner.financialOwnerId || replay.artist_id !== paymentOwner.artistId || replay.ownership_policy !== paymentOwner.ownershipPolicy) throw new ApiError(409, 'CONFLICT');
      return replay;
     }
     const releasePricing = (await db.query<{ release_type: string | null; distribution_service: 'standard' | 'custom_label'; tracks: number }>(
      "SELECT r.release_type,r.distribution_service,(SELECT count(*)::integer FROM soundpub.tracks t WHERE t.release_id=r.id) AS tracks FROM soundpub.releases r WHERE r.id=$1", [data.release_id])).rows[0];
     const settings = (await db.query<{ settings: Record<string, string | null> }>('SELECT settings FROM soundpub.application_settings WHERE id=true')).rows[0]?.settings ?? {};
     let snapshot: ReleasePriceSnapshot;
     try { snapshot = calculateReleasePrice(settings, releasePricing?.tracks ?? 0, releasePricing?.distribution_service ?? 'standard', releasePricing?.release_type ?? 'single'); }
     catch { throw new ApiError(409, 'PAYMENT_PRICE_UNAVAILABLE'); }
     if (!snapshot.price_per_track_snapshot || !snapshot.total_payment_snapshot || !snapshot.pricing_snapshot_mode || !snapshot.pricing_snapshot_track_count) throw new ApiError(409, 'PAYMENT_PRICE_UNAVAILABLE');
     const amount = toMinor(snapshot.total_payment_snapshot);
     await db.query('UPDATE soundpub.releases SET price_per_track_snapshot=$2,total_payment_snapshot=$3,pricing_snapshot_mode=$4,pricing_snapshot_track_count=$5 WHERE id=$1 AND (price_per_track_snapshot IS DISTINCT FROM $2 OR total_payment_snapshot IS DISTINCT FROM $3 OR pricing_snapshot_mode IS DISTINCT FROM $4 OR pricing_snapshot_track_count IS DISTINCT FROM $5)',
      [data.release_id, snapshot.price_per_track_snapshot, snapshot.total_payment_snapshot, snapshot.pricing_snapshot_mode, snapshot.pricing_snapshot_track_count]);
     let invoice: Invoice;
     if (options.xenditEnabled) {
      try { idrAmountFromMinor(amount); } catch { throw new ApiError(409, 'PAYMENT_PRICE_UNAVAILABLE'); }
      const externalId = `sp-rel-${randomUUID()}`;
      invoice = (await db.query<Invoice>(`INSERT INTO soundpub.payment_invoices(business_id,provider,provider_invoice_id,provider_external_id,amount_minor,
       idempotency_key,payer_owner_id,financial_owner_id,artist_id,ownership_policy,status)
       VALUES ($1,'xendit',NULL,$2,$3,$4,$5,$6,$7,$8,'CREATING') RETURNING *`, [data.release_id, externalId, amount,
       data.idempotency_key, paymentOwner.payerOwnerId, paymentOwner.financialOwnerId,
       paymentOwner.artistId, paymentOwner.ownershipPolicy])).rows[0]!;
      await db.query(`INSERT INTO soundpub.outbox_events(topic,payload,idempotency_key)
       VALUES ('payment.invoice_create',$1::jsonb,$2)`, [JSON.stringify({ invoice_id: invoice.id }), `xendit-invoice-create:${invoice.id}`]);
      await audit(db, invoice, actor.id, 'payment.invoice_created', null, 'CREATING', data.idempotency_key);
     } else {
      invoice = (await db.query<Invoice>(`INSERT INTO soundpub.payment_invoices(business_id,provider_invoice_id,amount_minor,
       idempotency_key,payer_owner_id,financial_owner_id,artist_id,ownership_policy)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [data.release_id, `mock_${randomUUID()}`, amount,
       data.idempotency_key, paymentOwner.payerOwnerId, paymentOwner.financialOwnerId,
       paymentOwner.artistId, paymentOwner.ownershipPolicy])).rows[0]!;
      await provider.create(db, invoice);
      await audit(db, invoice, actor.id, 'payment.invoice_created', null, 'PENDING', data.idempotency_key);
     }
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
   if (!['mock-payment', 'xendit-invoice'].includes(input.provider)) throw new ApiError(400, 'BAD_REQUEST');
   return receiveWebhook({ async connect() {
    const client = await pool.connect();
    // Phase 2 webhook foundation uses unqualified SQL; pin private schema per checkout.
    try { await client.query('SET search_path=soundpub,pg_catalog'); return client; }
    catch (error) { client.release(true); throw error; }
   } }, input, options.callbackSecret, async (payload, client) => {
    const db = client as PoolClient;
    const event = parse(callbackInput, payload);
    if (event.status === 'CREATING' || !paymentStates.includes(event.status as PaymentStatus)) {
     await db.query(`INSERT INTO soundpub.payment_callback_receipts(event_id,provider_invoice_id,disposition,payload)
      VALUES ($1,$2,'unsupported',$3::jsonb)`, [input.eventId,event.provider_invoice_id,JSON.stringify(event)]);
     return;
    }
     const externalInvoice = input.provider === 'xendit-invoice' && event.provider_external_id
      ? (await db.query<Invoice>('SELECT * FROM soundpub.payment_invoices WHERE provider=$1 AND provider_external_id=$2 FOR UPDATE',
        ['xendit', event.provider_external_id])).rows[0]
      : undefined;
     if (externalInvoice && (externalInvoice.status === 'CREATING' || !externalInvoice.provider_invoice_id)) {
      throw new ApiError(503, 'PAYMENT_PROVIDER_UNAVAILABLE');
     }
     if (externalInvoice && externalInvoice.provider_invoice_id !== event.provider_invoice_id) {
      throw new ApiError(409, 'CONFLICT');
     }
     const businessId = externalInvoice?.business_id ?? (await db.query<{ business_id: string }>(
      'SELECT business_id FROM soundpub.payment_invoices WHERE provider_invoice_id=$1 AND provider=$2', [event.provider_invoice_id,input.provider === 'mock-payment' ? 'mock' : 'xendit'])).rows[0]?.business_id;
     let ownerSnapshot: PaymentIdentity | null = null;
     if (businessId) {
      try { ownerSnapshot = await systemIdentity(db, businessId); }
      catch (error) { if (!(error instanceof ApiError)) throw error; }
     }
     const invoice = (await db.query<Invoice>('SELECT * FROM soundpub.payment_invoices WHERE provider_invoice_id=$1 FOR UPDATE', [event.provider_invoice_id])).rows[0];
     if (invoice && invoice.business_id !== businessId) throw new ApiError(409, 'CONFLICT');
     if (invoice && input.provider === 'xendit-invoice' && event.provider_external_id &&
       invoice.provider_external_id !== event.provider_external_id) throw new ApiError(409, 'CONFLICT');
     if (!invoice && input.provider === 'xendit-invoice') throw new ApiError(503, 'PAYMENT_PROVIDER_UNAVAILABLE');
    let disposition = 'unknown_invoice';
    if (invoice) {
     const next = nextPaymentStatus(invoice.status, event.status as PaymentStatus);
      const ownerMatches = !!ownerSnapshot && ownerSnapshot.artistId === invoice.artist_id &&
       ownerSnapshot.payerOwnerId === invoice.payer_owner_id &&
       ownerSnapshot.financialOwnerId === invoice.financial_owner_id && ownerSnapshot.ownershipPolicy === invoice.ownership_policy;
      if (!ownerMatches || event.amount_minor !== invoice.amount_minor || event.currency !== invoice.currency) disposition = 'mismatch';
     else if ((event.status === 'REFUNDED' && !['PAID','REFUNDED'].includes(invoice.status)) ||
      (event.status === 'PAID' && ['FAILED','EXPIRED'].includes(invoice.status))) disposition = 'invalid_transition';
     else {
      disposition = next === invoice.status ? 'ignored' : 'applied';
      if (next !== invoice.status) {
       if (next === 'PAID') await effect(db, invoice, 'PAYMENT_CHARGE', input.eventId);
       if (next === 'REFUNDED') await effect(db, invoice, 'PAYMENT_REFUND', input.eventId);
       await db.query(`UPDATE soundpub.payment_invoices SET status=$2,
        provider_status=CASE WHEN provider='xendit' THEN $2 ELSE provider_status END,updated_at=now() WHERE id=$1`, [invoice.id, next]);
       if (input.provider === 'mock-payment' && invoice.provider_invoice_id) await db.query('UPDATE soundpub.payment_mock_invoices SET status=$2 WHERE provider_invoice_id=$1', [invoice.provider_invoice_id, next]);
       await audit(db, invoice, null, 'payment.callback', invoice.status, next, input.eventId);
      }
     }
     if (['mismatch','invalid_transition'].includes(disposition)) {
      await db.query(`UPDATE soundpub.payment_invoices SET reconciliation_required=true,
       provider_status=CASE WHEN provider='xendit' AND $2 THEN $3 ELSE provider_status END,updated_at=now()
       WHERE id=$1`, [invoice.id, disposition === 'invalid_transition' && event.status === 'PAID', event.status]);
      await audit(db, invoice, null, 'payment.manual_review', invoice.status, invoice.status, input.eventId);
     }
    }
    await db.query(`INSERT INTO soundpub.payment_callback_receipts(event_id,provider_invoice_id,disposition,payload)
     VALUES ($1,$2,$3,$4::jsonb)`, [input.eventId,event.provider_invoice_id,disposition,JSON.stringify(event)]);
   });
  },
  async xenditCallback(input: { body: Buffer; token: string | undefined }) {
   if (!options.xenditWebhookToken || !verifyXenditCallbackToken(options.xenditWebhookToken, input.token)) throw new ApiError(401, 'UNAUTHORIZED');
   const event = parseXenditInvoiceCallback(input.body);
   if (!event) throw new ApiError(400, 'BAD_REQUEST');
   const rawBody = Buffer.from(JSON.stringify({ provider_invoice_id: event.invoiceId, status: event.status,
    ...(event.externalId ? { provider_external_id: event.externalId } : {}),
    amount_minor: event.amountMinor, currency: event.currency }));
   const timestamp = Math.floor(Date.now() / 1000).toString();
   const eventId = `xendit_${createHash('sha256').update(input.body).digest('hex')}`;
   return this.callback({ provider: 'xendit-invoice', eventId, timestamp, rawBody,
    signature: webhookSignature(options.callbackSecret, { eventId, timestamp, rawBody }) });
  },  async refund(actor: Principal, input: unknown, requestId: string) {
   const data = parse(refundInput, input);
   return withTransaction(pool, async db => {
    const businessId = (await db.query<{ business_id: string }>(
     'SELECT business_id FROM soundpub.payment_invoices WHERE id=$1', [data.invoice_id])).rows[0]?.business_id;
     if (!businessId) {
       const current = (await paymentPrincipals(db, [actor.id])).get(actor.id);
      if (!current || !allows(current, 'admin')) throw new ApiError(403, 'FORBIDDEN');
      throw new ApiError(404, 'NOT_FOUND');
     }
     const ownerSnapshot = await authority(db, actor, businessId, false, true);
    const invoice = (await db.query<Invoice>('SELECT * FROM soundpub.payment_invoices WHERE id=$1 FOR UPDATE', [data.invoice_id])).rows[0];
    if (!invoice || invoice.business_id !== businessId) throw new ApiError(409, 'CONFLICT');
     assertPaymentIdentity(invoice, ownerSnapshot);
    const prior = (await db.query<{ idempotency_key: string; reason: string }>('SELECT * FROM soundpub.payment_refunds WHERE invoice_id=$1', [invoice.id])).rows[0];
    if (prior) {
     if (prior.idempotency_key !== data.idempotency_key || prior.reason !== data.reason) throw new ApiError(409, 'CONFLICT');
     return invoice;
    }
    if (invoice.provider !== 'mock') throw new ApiError(503, 'PAYMENT_PROVIDER_UNAVAILABLE');
    if (!invoice.provider_invoice_id) throw new ApiError(409, 'PAYMENT_INVOICE_UNAVAILABLE');
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
     const current = (await paymentPrincipals(db, [actor.id])).get(actor.id);
     if (!current || !allows(current, 'admin')) throw new ApiError(403, 'FORBIDDEN');
    const invoices = (await db.query<Invoice>('SELECT * FROM soundpub.payment_invoices ORDER BY id FOR UPDATE')).rows;
    const results = [];
    for (const invoice of invoices) results.push(await reconcileInvoice(db, invoice, provider));
    const unresolved_callbacks = (await db.query(`SELECT event_id,provider_invoice_id,disposition FROM soundpub.payment_callback_receipts
     WHERE disposition IN ('unknown_invoice','mismatch','invalid_transition','unsupported') ORDER BY event_id`)).rows;
    return { mode: 'DRY_RUN' as const, results, unresolved_callbacks,
     reconciled: results.every(r => r.reconciled) && unresolved_callbacks.length === 0 };
   });
  },
  async listAdminInvoices(actor: Principal, input: unknown = {}) {
   const query = z.strictObject({ status: z.enum(['all','pending','paid','failed','refunded']).default('all'),
     limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).max(100_000).default(0) });
   const parsed = query.safeParse(input);
   if (!parsed.success) throw new ApiError(400, 'BAD_REQUEST');
   const { status, limit, offset } = parsed.data;
   return withTransaction(pool, async db => {
    const current = (await paymentPrincipals(db, [actor.id])).get(actor.id);
    if (!current || !allows(current, 'admin')) throw new ApiError(403, 'FORBIDDEN');
    const params = status === 'all' ? [limit, offset] : [status.toUpperCase(), limit, offset];
    const where = status === 'all' ? '' : 'WHERE invoice.status=$1';
    const pageOffset = status === 'all' ? '$2' : '$3';
    const totalResult = await db.query<{ count: string }>(`SELECT count(*)::text AS count FROM soundpub.payment_invoices invoice ${where}`,
      status === 'all' ? [] : [status.toUpperCase()]);
    const rows = (await db.query(`SELECT invoice.id,invoice.business_id AS release_id,invoice.payer_owner_id AS user_id,
      invoice.amount_minor,invoice.currency,invoice.status,invoice.provider_invoice_id,invoice.created_at,invoice.updated_at,
      invoice.invoice_number,release.title AS release_title,release.artist_name AS release_artist,
      profile.full_name AS user_name,owner.email AS user_email,
      (SELECT count(*)::integer FROM soundpub.tracks track WHERE track.release_id=release.id) AS track_count,
      release.price_per_track_snapshot::text AS price_per_track,
      (SELECT event.created_at FROM soundpub.payment_effects event
        WHERE event.invoice_id=invoice.id AND event.kind='PAYMENT_CHARGE') AS paid_at
      FROM soundpub.payment_invoices invoice JOIN soundpub.releases release ON release.id=invoice.business_id
      JOIN soundpub.backend_users owner ON owner.id=invoice.payer_owner_id
      LEFT JOIN soundpub.profiles profile ON profile.id=owner.id ${where}
      ORDER BY invoice.created_at DESC,invoice.id DESC LIMIT ${status === 'all' ? '$1' : '$2'} OFFSET ${pageOffset}`,
      params)).rows;
    return { invoices: rows, total: Number(totalResult.rows[0]?.count ?? 0), limit, offset };
   });
  },
  async downloadInvoice(actor: Principal, invoiceId: string, requestId: string) {
   if (!options.documentStore) throw new ApiError(503, 'NOT_READY');
   const id = parse(z.uuid(), invoiceId);
   const current = await withTransaction(pool, async db => {
    const principal = (await paymentPrincipals(db, [actor.id])).get(actor.id);
    if (!principal || !allows(principal, 'admin')) throw new ApiError(403, 'FORBIDDEN');
    const row = (await db.query(`SELECT invoice.*,release.title AS release_title,release.artist_name AS artist_name,
      release.price_per_track_snapshot::text AS price_per_track,owner.email AS payer_email,profile.full_name AS payer_name,
      (SELECT count(*)::integer FROM soundpub.tracks track WHERE track.release_id=release.id) AS track_count,
      (SELECT event.created_at FROM soundpub.payment_effects event
       WHERE event.invoice_id=invoice.id AND event.kind='PAYMENT_CHARGE') AS paid_at
      FROM soundpub.payment_invoices invoice JOIN soundpub.releases release ON release.id=invoice.business_id
      JOIN soundpub.backend_users owner ON owner.id=invoice.payer_owner_id
      LEFT JOIN soundpub.profiles profile ON profile.id=owner.id
      WHERE invoice.id=$1 FOR UPDATE OF invoice`, [id])).rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new ApiError(404, 'NOT_FOUND');
    if (row.status !== 'PAID') throw new ApiError(409, 'INVOICE_NOT_PAID');
    if (!row.paid_at || !row.price_per_track || Number(row.track_count) < 1) throw new ApiError(409, 'INVOICE_DATA_UNAVAILABLE');
    const paidAt = new Date(String(row.paid_at));
    const invoiceNumber = String(row.invoice_number || `SPB-${paidAt.toISOString().slice(0, 7).replace('-', '')}-${id.slice(0, 8).toUpperCase()}`);
    const path = String(row.invoice_pdf_path || `${String(row.financial_owner_id)}/${id}/${invoiceNumber}.pdf`);
    return { row, paidAt, invoiceNumber, path };
   });
   if (!current.row.invoice_pdf_path) {
    const pdf = await renderInvoicePdf({ invoiceNumber: current.invoiceNumber, amountMinor: String(current.row.amount_minor),
      paidAt: current.paidAt, reference: String(current.row.provider_invoice_id), releaseTitle: String(current.row.release_title),
      artistName: String(current.row.artist_name), trackCount: Number(current.row.track_count),
      pricePerTrackMinor: toMinor(String(current.row.price_per_track)), payerName: String(current.row.payer_name || ''),
      payerEmail: String(current.row.payer_email || '') });
    await options.documentStore.put(current.path, pdf);
    await withTransaction(pool, async db => {
      const result = await db.query(`UPDATE soundpub.payment_invoices SET invoice_number=$2,invoice_pdf_path=$3,
        invoice_pdf_generated_at=COALESCE(invoice_pdf_generated_at,now()) WHERE id=$1 AND status='PAID'
        AND (invoice_number IS NULL OR (invoice_number=$2 AND invoice_pdf_path=$3))`,
      [id, current.invoiceNumber, current.path]);
      if (result.rowCount !== 1) throw new ApiError(409, 'CONFLICT');
     });
   }
   const url = await options.documentStore.signedDownload(current.path, `${current.invoiceNumber}.pdf`, 600);
   await withTransaction(pool, async db => {
    const principal = (await paymentPrincipals(db, [actor.id])).get(actor.id);
    if (!principal || !allows(principal, 'admin')) throw new ApiError(403, 'FORBIDDEN');
    const invoice = (await db.query<{ status: PaymentStatus; invoice_pdf_path: string | null }>(
      'SELECT status,invoice_pdf_path FROM soundpub.payment_invoices WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!invoice) throw new ApiError(404, 'NOT_FOUND');
    if (invoice.status !== 'PAID') throw new ApiError(409, 'INVOICE_NOT_PAID');
    if (invoice.invoice_pdf_path !== current.path) throw new ApiError(409, 'CONFLICT');
    await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
      VALUES($1,'payment.invoice_pdf_downloaded','payment_invoice',$2,$3,$4::jsonb)`,
    [actor.id,id,requestId,JSON.stringify({ invoice_number: current.invoiceNumber, document_path: current.path })]);
   });
   return { invoice_number: current.invoiceNumber, url };
  },
 };
}
export type PaymentsService = ReturnType<typeof createPaymentsService>;



