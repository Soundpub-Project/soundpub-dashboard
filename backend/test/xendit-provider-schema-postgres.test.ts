import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { concurrencyPostgres } from './support/concurrency-postgres.js';
import { createPaymentsService } from '../src/payments/index.js';

test('Xendit invoice schema gates creation and permits only provider evidence updates', {
  skip: process.env.RUN_DOCKER_TESTS !== '1', timeout: 120_000,
}, async () => {
  const database = await concurrencyPostgres();
  try {
    const labelId = randomUUID(), artistId = randomUUID(), catalogArtistId = randomUUID();
    const releaseId = randomUUID(), invoiceId = randomUUID();
    await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active'),($2,'active')", [labelId, artistId]);
    await database.owner.query('INSERT INTO soundpub.profiles(id,parent_label_id) VALUES($1,NULL),($2,$1)', [labelId, artistId]);
    await database.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,'artist',now())", [artistId]);
    await database.owner.query("INSERT INTO soundpub.finance_accounts(owner_id,currency) VALUES($1,'IDR')", [artistId]);
    await database.owner.query(`INSERT INTO soundpub.artists(id,label_id,artist_user_id,name,verified_at)
      VALUES($1,$2,$3,'Synthetic',now())`, [catalogArtistId, labelId, artistId]);
    await database.owner.query(`INSERT INTO soundpub.releases(id,label_id,artist_id,artist_user_id,created_by,title,artist_name,
      price_per_track_snapshot,total_payment_snapshot,pricing_snapshot_mode,pricing_snapshot_track_count)
      VALUES($1,$2,$3,$4,$4,'Synthetic','Synthetic',50000,50000,'per_track',1)`,
    [releaseId, labelId, catalogArtistId, artistId]);
    await database.owner.query("INSERT INTO soundpub.tracks(release_id,title,artist_name,position) VALUES($1,'Synthetic','Synthetic',1)", [releaseId]);
    await database.owner.query(`INSERT INTO soundpub.payment_invoices(id,business_id,provider,provider_external_id,amount_minor,
      currency,status,idempotency_key,payer_owner_id,financial_owner_id,artist_id,ownership_policy)
      VALUES($1,$2,'xendit',$3,5000000,'IDR','CREATING','xendit-create',$4,$4,$5,'LOGIN_ACCOUNT')`,
    [invoiceId, releaseId, `release-invoice-${invoiceId}`, artistId, catalogArtistId]);
    await database.runtime.query(`UPDATE soundpub.payment_invoices SET provider_invoice_id='xnd_invoice_001',
      provider_invoice_url='https://checkout.xendit.co/web/synthetic',provider_status='PENDING',status='PENDING'
      WHERE id=$1`, [invoiceId]);
    assert.deepEqual((await database.owner.query(`SELECT provider,status,provider_status FROM soundpub.payment_invoices WHERE id=$1`,
      [invoiceId])).rows[0], { provider: 'xendit', status: 'PENDING', provider_status: 'PENDING' });
    await database.owner.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
      VALUES($1,'payment.invoice_created','payment_invoice',$2,'xendit-create',jsonb_build_object('idempotency_reference','xendit-create',
        'business_reference',$3::text,'amount_minor','5000000','currency','IDR'))`, [artistId, invoiceId, releaseId]);
    const payments = createPaymentsService(database.runtime, { callbackSecret: 'synthetic-webhook-secret-with-at-least-32-characters',
      xenditWebhookToken: 'synthetic-xendit-callback-token-at-least-32' });
    const paidCallback = Buffer.from(JSON.stringify({ id: 'xnd_invoice_001', external_id:`release-invoice-${invoiceId}`,
      status: 'PAID', amount: 50000, currency: 'IDR' }));
    assert.equal(await payments.xenditCallback({ body: paidCallback, token: 'synthetic-xendit-callback-token-at-least-32' }), 'accepted');
    assert.equal(await payments.xenditCallback({ body: paidCallback, token: 'synthetic-xendit-callback-token-at-least-32' }), 'duplicate');
    assert.deepEqual((await database.owner.query(`SELECT status,provider_status FROM soundpub.payment_invoices WHERE id=$1`,
      [invoiceId])).rows[0], { status: 'PAID', provider_status: 'PAID' });
    assert.equal((await database.owner.query(`SELECT count(*)::int AS count FROM soundpub.payment_effects WHERE invoice_id=$1`, [invoiceId])).rows[0].count, 1);
    assert.equal((await database.owner.query(`SELECT count(*)::int AS count FROM soundpub.finance_events WHERE business_reference=$1`, [invoiceId])).rows[0].count, 1);
    const status = await payments.status({ id: artistId, roles: ['artist'], status: 'active' }, releaseId);
    assert.equal(status.reconciliation?.reconciled, true);
    assert.deepEqual(status.reconciliation?.issues, []);
    await assert.rejects(database.runtime.query(`UPDATE soundpub.payment_invoices SET provider_invoice_url='https://evil.example/pay'
      WHERE id=$1`, [invoiceId]));
    await assert.rejects(database.runtime.query(`UPDATE soundpub.payment_invoices SET provider_invoice_id=NULL,status='CREATING'
      WHERE id=$1`, [invoiceId]));
  } finally {
    await database.close();
  }
});
