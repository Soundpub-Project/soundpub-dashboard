import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { concurrencyPostgres } from './support/concurrency-postgres.js';
import { createPaymentsService, toMinor, nextPaymentStatus, paymentSubmissionDependency } from '../src/payments/index.js';
import { webhookSignature } from '../src/integrations/webhook.js';
import type { Principal } from '../src/auth/index.js';

test('money and state rules reject ambiguous precision and terminal regressions', () => {
 assert.equal(toMinor('50000.00'), '5000000');
 for (const value of ['1.001','-1','0','NaN','1e4','90071992547410']) assert.throws(() => toMinor(value));
 assert.equal(nextPaymentStatus('PAID','PENDING'), 'PAID');
 assert.equal(nextPaymentStatus('REFUNDED','PAID'), 'REFUNDED');
 assert.equal(nextPaymentStatus('FAILED','PAID'), 'FAILED');
 assert.equal(nextPaymentStatus('EXPIRED','PAID'), 'EXPIRED');
});

test('durable payments: races, signed callbacks, refund, rollback, authority and readiness', { skip: process.env.RUN_DOCKER_TESTS !== '1', timeout: 120000 }, async () => {
 const fixture = await concurrencyPostgres();
 try {
  const { owner, runtime } = fixture;
  const artist: Principal = { id: randomUUID(), roles: ['artist'], status: 'active' };
  const admin: Principal = { id: randomUUID(), roles: ['admin'], status: 'active' };
  const outsider: Principal = { id: randomUUID(), roles: ['artist'], status: 'active' };
  for (const actor of [artist,admin,outsider]) {
   await owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [actor.id]);
   await owner.query('INSERT INTO soundpub.profiles(id) VALUES ($1)', [actor.id]);
   await owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())', [actor.id,actor.roles[0]]);
  }
  await owner.query('UPDATE soundpub.profiles SET parent_label_id=$1 WHERE id=$2', [admin.id, artist.id]);
  const catalogArtistId = (await owner.query(`INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at)
    VALUES($1,$2,'Synthetic',now()) RETURNING id`, [admin.id, artist.id])).rows[0].id as string;
  async function release(price: string | null = '50000.00') {
   const id = (await owner.query(`INSERT INTO soundpub.releases(label_id,artist_id,artist_user_id,created_by,title,artist_name,
    price_per_track_snapshot,total_payment_snapshot) VALUES ($1,$2,$3,$3,'Synthetic','Synthetic',$4,$4) RETURNING id`,
   [admin.id,catalogArtistId,artist.id,price])).rows[0].id as string;
   await owner.query("INSERT INTO soundpub.tracks(release_id,title,artist_name,position) VALUES($1,'Synthetic','Synthetic',1)", [id]);
   return id;
  }
  const secret = 'synthetic-only-callback-secret-32-characters';
  const service = createPaymentsService(runtime, { callbackSecret: secret });
  const releaseId = await release();
  const [invoice, replay] = await Promise.all([
   service.createInvoice(artist, { release_id: releaseId, idempotency_key: 'create-1' }, 'request-1'),
   service.createInvoice(artist, { release_id: releaseId, idempotency_key: 'create-1' }, 'request-2'),
  ]);
  assert.equal(invoice.id,replay.id);
  const invoiceGate = await owner.connect();
  await invoiceGate.query('BEGIN');
  await invoiceGate.query('SELECT id FROM soundpub.payment_invoices WHERE id=$1 FOR UPDATE',[invoice.id]);
  const blockedStatus = service.status(artist,releaseId);
  try {
   const deadline = Date.now()+5000;
   for (;;) {
    const waiters = (await owner.query(`SELECT count(*) FROM pg_stat_activity
     WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%payment_invoices%'`)).rows[0].count;
    if (Number(waiters)>=1) break;
    assert.ok(Date.now()<deadline,'Payment status must reach invoice lock');
    await setTimeout(10);
   }
   const releaseProbe = await owner.connect();
   try {
    await releaseProbe.query('BEGIN');
    await releaseProbe.query('SELECT id FROM soundpub.releases WHERE id=$1 FOR SHARE NOWAIT',[releaseId]);
    await releaseProbe.query('ROLLBACK');
   } catch (error) {
    await releaseProbe.query('ROLLBACK');
    throw error;
   } finally { releaseProbe.release(); }
  } finally { await invoiceGate.query('ROLLBACK'); invoiceGate.release(); }
  assert.equal((await blockedStatus).invoice?.id,invoice.id);
  await assert.rejects(service.createInvoice(artist, { release_id: releaseId, idempotency_key: 'x', amount_minor: '1' }, 'bad'));
  await assert.rejects(service.status(outsider,releaseId));
  const unpriced = await release(null);
  assert.equal((await service.createInvoice(artist, { release_id: unpriced, idempotency_key: 'legacy-default-price' }, 'default-price')).amount_minor, '5000000');
  const stalePrice = await release();
  await owner.query('UPDATE soundpub.releases SET price_per_track_snapshot=NULL,total_payment_snapshot=NULL,pricing_snapshot_mode=NULL,pricing_snapshot_track_count=NULL WHERE id=$1',[stalePrice]);
  assert.equal((await service.createInvoice(artist, { release_id: stalePrice, idempotency_key: 'missing-unit-price' }, 'default-price')).amount_minor, '5000000');
  const staleCount = await release();
  await owner.query("INSERT INTO soundpub.tracks(release_id,title,artist_name,position) VALUES($1,'Second','Synthetic',2)",[staleCount]);
  assert.equal((await service.createInvoice(artist, { release_id: staleCount, idempotency_key: 'stale-track-count' }, 'stale-count')).amount_minor, '10000000');
  const other = await release();
  await assert.rejects(service.createInvoice(artist, { release_id: other, idempotency_key: 'create-1' }, 'bad'));
  function envelope(eventId: string, status: string, amount = invoice.amount_minor, reference = invoice.provider_invoice_id) {
   const rawBody = Buffer.from(JSON.stringify({ provider_invoice_id: reference, status, amount_minor: amount, currency: 'IDR' }));
   const input = { provider: 'mock-payment', eventId, timestamp: String(Math.floor(Date.now()/1000)), rawBody, signature: '' };
   input.signature = webhookSignature(secret,input);
   return input;
  }
  const ownerGate = await owner.connect();
  await ownerGate.query('BEGIN');
  await ownerGate.query('SELECT id FROM soundpub.backend_users WHERE id=$1 FOR UPDATE',[artist.id]);
  const blockedCallback = service.callback(envelope('lock-order-pending','PENDING'));
  try {
   const deadline = Date.now()+5000;
   for (;;) {
    const waiters = (await owner.query(`SELECT count(*) FROM pg_stat_activity
     WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%backend_users%'`)).rows[0].count;
    if (Number(waiters)>=1) break;
    assert.ok(Date.now()<deadline,'Payment callback must reach beneficiary lock');
    await setTimeout(10);
   }
   const resourceProbe = await owner.connect();
   try {
    await resourceProbe.query('BEGIN');
    await resourceProbe.query('SELECT id FROM soundpub.releases WHERE id=$1 FOR UPDATE NOWAIT',[releaseId]);
    await resourceProbe.query('SELECT id FROM soundpub.payment_invoices WHERE id=$1 FOR UPDATE NOWAIT',[invoice.id]);
    await resourceProbe.query('ROLLBACK');
   } catch (error) {
    await resourceProbe.query('ROLLBACK');
    throw error;
   } finally { resourceProbe.release(); }
  } finally { await ownerGate.query('ROLLBACK'); ownerGate.release(); }
  assert.equal(await blockedCallback,'accepted');
  const paid = envelope('paid-1','PAID');
  await assert.rejects(service.callback({ ...paid, signature: '0'.repeat(64) }));
  await assert.rejects(service.callback({ ...paid, rawBody: Buffer.from('{}') }));
  const stale = { ...paid, timestamp: '1' };
  stale.signature = webhookSignature(secret,stale);
  await assert.rejects(service.callback(stale));
  assert.deepEqual((await Promise.all([service.callback(paid),service.callback(paid)])).sort(), ['accepted','duplicate']);
  await service.callback(envelope('paid-2','PAID'));
  const writtenDocuments: { path: string; bytes: Uint8Array }[] = [];
  const signedDownloads: { path: string; filename: string; expires: number }[] = [];
  const documentService = createPaymentsService(runtime, { callbackSecret: secret, documentStore: {
   async put(path, bytes) { writtenDocuments.push({ path, bytes }); },
   async signedDownload(path, filename, expires) {
    signedDownloads.push({ path, filename, expires });
    return 'https://private-storage.test/signed?signature=synthetic-secret';
   },
   close() {},
  } });
  const invoiceRows = await documentService.listAdminInvoices(admin);
  assert.ok(invoiceRows.invoices.some((row: { id: string }) => row.id === invoice.id));
  await assert.rejects(documentService.listAdminInvoices(artist), { code: 'FORBIDDEN' });
  const invoicePdf = await documentService.downloadInvoice(admin, invoice.id, 'invoice-download-request');
  assert.match(invoicePdf.invoice_number, /^SPB-[0-9]{6}-[A-F0-9]{8}$/);
  assert.equal(writtenDocuments.length, 1);
  assert.equal(Buffer.from(writtenDocuments[0]!.bytes).subarray(0, 5).toString(), '%PDF-');
  assert.equal(signedDownloads[0]?.expires, 600);
  assert.equal(signedDownloads[0]?.filename, `${invoicePdf.invoice_number}.pdf`);
  assert.ok(!JSON.stringify((await runtime.query(`SELECT metadata FROM soundpub.audit_logs
    WHERE action='payment.invoice_pdf_downloaded' AND resource_id=$1`, [invoice.id])).rows).includes('synthetic-secret'));
  const sameInvoicePdf = await documentService.downloadInvoice(admin, invoice.id, 'invoice-download-retry');
  assert.equal(sameInvoicePdf.invoice_number, invoicePdf.invoice_number);
  assert.equal(writtenDocuments.length, 1);
  await assert.rejects(documentService.downloadInvoice(artist, invoice.id, 'forbidden-download'), { code: 'FORBIDDEN' });
  const unpaidRelease = await release();
  const unpaidInvoice = await documentService.createInvoice(artist,
   { release_id: unpaidRelease, idempotency_key: 'invoice-pending-document' }, 'invoice-pending');
  await assert.rejects(documentService.downloadInvoice(admin, unpaidInvoice.id, 'unpaid-download'), { code: 'INVOICE_NOT_PAID' });
  assert.equal(writtenDocuments.length, 1);
  await service.callback(envelope('unsupported','SOMETHING_NEW'));
  assert.equal((await runtime.query("SELECT disposition FROM soundpub.payment_callback_receipts WHERE event_id='unsupported'")).rows[0].disposition,'unsupported');
  assert.equal((await service.reconcile(admin)).reconciled,false);
  assert.ok((await service.reconcile(admin)).unresolved_callbacks.some(row => row.disposition === 'unsupported'));
  await service.callback(envelope('pending-old','PENDING'));
  assert.equal((await service.status(artist,releaseId)).invoice?.status,'PAID');
  await owner.query('UPDATE soundpub.releases SET price_per_track_snapshot=NULL WHERE id=$1',[releaseId]);
  assert.ok((await service.status(artist,releaseId)).reconciliation?.issues.includes('RELEASE_PRICE_MISMATCH'));
  await owner.query("UPDATE soundpub.releases SET price_per_track_snapshot='50000.00' WHERE id=$1",[releaseId]);
  await owner.query("INSERT INTO soundpub.tracks(release_id,title,artist_name,position) VALUES($1,'Unexpected','Synthetic',2)",[releaseId]);
  assert.ok((await service.status(artist,releaseId)).reconciliation?.issues.includes('RELEASE_PRICE_MISMATCH'));
  await owner.query('DELETE FROM soundpub.tracks WHERE release_id=$1 AND position=2',[releaseId]);
  await owner.query("UPDATE soundpub.payment_mock_invoices SET status='PENDING' WHERE provider_invoice_id=$1",[invoice.provider_invoice_id]);
  assert.ok((await service.status(artist,releaseId)).reconciliation?.issues.includes('STATE_MISMATCH'));
  await owner.query("UPDATE soundpub.payment_mock_invoices SET status='PAID' WHERE provider_invoice_id=$1",[invoice.provider_invoice_id]);
  assert.equal((await runtime.query("SELECT count(*) FROM soundpub.payment_effects WHERE kind='PAYMENT_CHARGE'")).rows[0].count,'1');
  await owner.query("UPDATE soundpub.payment_effects SET reference='mismatched-evidence' WHERE invoice_id=$1 AND kind='PAYMENT_CHARGE'",[invoice.id]);
  assert.ok((await service.status(artist,releaseId)).reconciliation?.issues.includes('FINANCE_LEDGER_MISMATCH'));
  await owner.query("UPDATE soundpub.payment_effects SET reference='paid-1' WHERE invoice_id=$1 AND kind='PAYMENT_CHARGE'",[invoice.id]);
  await assert.rejects(service.callback(envelope('paid-1','FAILED')));
  await service.callback(envelope('unknown-1','PAID',invoice.amount_minor,'mock_unknown'));
  assert.equal((await runtime.query("SELECT disposition FROM soundpub.payment_callback_receipts WHERE event_id='unknown-1'")).rows[0].disposition,'unknown_invoice');
  const db = await runtime.connect();
  try {
   await db.query('BEGIN');
   assert.equal(await paymentSubmissionDependency.isReleasePaymentSatisfied({ db, release: { id: releaseId } as never, tracks: [] }),true);
   await db.query('ROLLBACK');
  } finally { db.release(); }
  const refund = { invoice_id: invoice.id, idempotency_key: 'refund-1', reason: 'Synthetic reversal' };
  await assert.rejects(service.refund(artist,refund,'bad'));
  const gate = await owner.connect();
  await gate.query('BEGIN');
  await gate.query('SELECT id FROM soundpub.payment_invoices WHERE id=$1 FOR UPDATE',[invoice.id]);
  const contenders = [service.refund(admin,refund,'refund-request'), service.callback(envelope('paid-late','PAID'))];
  try {
   const deadline = Date.now()+5000;
   for (;;) {
    const blocked = (await owner.query(`SELECT count(*) FROM pg_stat_activity
     WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%payment_invoices%'`)).rows[0].count;
    if (Number(blocked)>=2) break;
    assert.ok(Date.now()<deadline,'Both contenders must reach invoice lock before release');
    await setTimeout(10);
   }
  } finally { await gate.query('ROLLBACK'); gate.release(); }
  const race = await Promise.all(contenders);
  assert.equal(race.length,2);
  assert.equal((await service.refund(admin,refund,'replay')).status,'REFUNDED');
  await assert.rejects(service.refund(admin,{ ...refund, idempotency_key: 'different' },'bad'));
  assert.equal((await runtime.query("SELECT count(*) FROM soundpub.payment_effects WHERE kind='PAYMENT_REFUND'")).rows[0].count,'1');
  assert.equal((await service.reconcile(admin)).results.every(row => row.reconciled),true);
  assert.equal((await service.reconcile(admin)).unresolved_callbacks.length,2);
  await service.callback(envelope('mismatch','PAID','1'));
  assert.equal((await service.reconcile(admin)).reconciled,false);
  const callbackRefundRelease = await release();
  const callbackRefundInvoice = await service.createInvoice(artist,
   { release_id: callbackRefundRelease, idempotency_key: 'callback-refund-invoice' }, 'callback-refund-invoice');
  const callbackEnvelope = (eventId: string, status: string) => {
   const rawBody = Buffer.from(JSON.stringify({ provider_invoice_id: callbackRefundInvoice.provider_invoice_id,
    status, amount_minor: callbackRefundInvoice.amount_minor, currency: 'IDR' }));
   const input = { provider: 'mock-payment', eventId, timestamp: String(Math.floor(Date.now()/1000)), rawBody, signature: '' };
   input.signature = webhookSignature(secret,input);
   return input;
  };
  await service.callback(callbackEnvelope('callback-refund-paid','PAID'));
  await service.callback(callbackEnvelope('refund:undefined','REFUNDED'));
  assert.equal((await service.status(artist,callbackRefundRelease)).reconciliation?.reconciled,true);
  await owner.query("UPDATE soundpub.backend_users SET status='suspended' WHERE id=$1",[artist.id]);
  await assert.rejects(service.status(artist,releaseId));
  await owner.query("DELETE FROM soundpub.user_roles WHERE user_id=$1",[admin.id]);
  await assert.rejects(service.reconcile(admin));
  // Force audit failure: provider/local invoice creation must roll back together.
  await owner.query("UPDATE soundpub.backend_users SET status='active' WHERE id=$1",[artist.id]);
  await owner.query('REVOKE INSERT ON soundpub.audit_logs FROM soundpub_app');
  const rollbackId = await release();
  await assert.rejects(service.createInvoice(artist,{ release_id: rollbackId,idempotency_key:'rollback' },'rollback'));
  assert.equal((await owner.query('SELECT count(*) FROM soundpub.payment_invoices WHERE business_id=$1',[rollbackId])).rows[0].count,'0');
  await owner.query('GRANT INSERT ON soundpub.audit_logs TO soundpub_app');
  await assert.rejects(runtime.query('DELETE FROM soundpub.payment_effects'));
  await assert.rejects(runtime.query('UPDATE soundpub.payment_effects SET amount_minor=1'));
 } finally { await fixture.close(); }
});



