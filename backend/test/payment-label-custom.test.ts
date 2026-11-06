import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { createPaymentsService, paymentSubmissionDependency } from '../src/payments/index.js';
import { webhookSignature } from '../src/integrations/webhook.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

const integration = dockerTestsEnabled ? test : test.skip;
integration('Label Custom PIC owns invoice, payment ledger and submission readiness', async () => {
  const database = await concurrencyPostgres();
  try {
    const pic = randomUUID(), otherPic = randomUUID(), admin = randomUUID();
    for (const [id, role] of [[pic, 'label_custom'], [otherPic, 'label_custom'], [admin, 'admin']] as const) {
      await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active')", [id]);
      await database.owner.query('INSERT INTO soundpub.profiles(id,full_name) VALUES($1,$2)', [id, role]);
      await database.owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,$2,now())', [id, role]);
    }
    const unit = (await database.owner.query(`INSERT INTO soundpub.label_custom_units(owner_user_id,unit_code,name)
      VALUES($1,'CUSTOM-PAYMENT','Custom Payment') RETURNING id`, [pic])).rows[0].id as string;
    await database.owner.query(`INSERT INTO soundpub.label_custom_units(owner_user_id,unit_code,name)
      VALUES($1,'OTHER-PAYMENT','Other Payment')`, [otherPic]);
    const artist = (await database.owner.query(`INSERT INTO soundpub.artists(label_id,label_custom_unit_id,management_mode,
      name,contact_email,contact_phone,verified_at) VALUES($1,$2,'LABEL_CUSTOM_MANAGED','Managed Artist',
      'managed@example.test','08123456789',now()) RETURNING id`, [pic, unit])).rows[0].id as string;
    const release = (await database.owner.query(`INSERT INTO soundpub.releases(artist_id,label_id,created_by,title,artist_name,
      price_per_track_snapshot,total_payment_snapshot) VALUES($1,$2,$2,'Managed Release','Managed Artist','50000.00','50000.00')
      RETURNING id`, [artist, pic])).rows[0].id as string;
    await database.owner.query("INSERT INTO soundpub.tracks(release_id,title,artist_name,position) VALUES($1,'Track','Managed Artist',1)", [release]);

    const secret = 'synthetic-label-custom-payment-secret-32';
    const payments = createPaymentsService(database.runtime, { callbackSecret: secret });
    await assert.rejects(payments.createInvoice({ id:otherPic,roles:['label_custom'],status:'active' },
      { release_id:release,idempotency_key:'cross-unit' }, 'cross-unit'), { code:'NOT_FOUND' });
    const invoice = await payments.createInvoice({ id:pic,roles:['label_custom'],status:'active' },
      { release_id:release,idempotency_key:'custom-invoice' }, 'custom-invoice');
    assert.equal(invoice.payer_owner_id, pic);
    assert.equal(invoice.financial_owner_id, pic);
    assert.equal(invoice.artist_id, artist);
    assert.equal(invoice.ownership_policy, 'LABEL_CUSTOM_PIC');
    await assert.rejects(payments.status({ id:otherPic,roles:['label_custom'],status:'active' }, release),
      { code:'NOT_FOUND' });
    assert.equal((await payments.createInvoice({ id:pic,roles:['label_custom'],status:'active' },
      { release_id:release,idempotency_key:'custom-invoice' }, 'invoice-replay')).id, invoice.id);
    for (const [field, value] of [
      ['payer_owner_id', otherPic], ['financial_owner_id', otherPic],
      ['artist_id', randomUUID()], ['ownership_policy', 'LOGIN_ACCOUNT'],
    ] as const) {
      await assert.rejects(database.runtime.query(`UPDATE soundpub.payment_invoices SET ${field}=$2 WHERE id=$1`,
        [invoice.id, value]), { code:'42501' }, `${field}: runtime column grant`);
      await assert.rejects(database.owner.query(`UPDATE soundpub.payment_invoices SET ${field}=$2 WHERE id=$1`,
        [invoice.id, value]), (error: NodeJS.ErrnoException) =>
        error.code === '23514' && error.message.includes('PAYMENT_OWNER_IMMUTABLE'), field);
    }
    assert.deepEqual((await database.owner.query(`SELECT payer_owner_id,financial_owner_id,artist_id,ownership_policy
      FROM soundpub.payment_invoices WHERE id=$1`, [invoice.id])).rows[0], {
      payer_owner_id:pic,financial_owner_id:pic,artist_id:artist,ownership_policy:'LABEL_CUSTOM_PIC',
    });
    await assert.rejects(database.owner.query(`UPDATE soundpub.payment_invoices
      SET payer_owner_id=$2,financial_owner_id=$2 WHERE id=$1`, [invoice.id, otherPic]),
    (error: NodeJS.ErrnoException) => error.code === '23514' && error.message.includes('PAYMENT_OWNER_IMMUTABLE'));

    const rawBody = Buffer.from(JSON.stringify({ provider_invoice_id:invoice.provider_invoice_id,
      status:'PAID',amount_minor:invoice.amount_minor,currency:invoice.currency }));
    const callback = { provider:'mock-payment',eventId:'custom-paid',timestamp:String(Math.floor(Date.now()/1000)),rawBody,signature:'' };
    callback.signature = webhookSignature(secret, callback);
    assert.equal(await payments.callback(callback), 'accepted');
    assert.deepEqual((await database.owner.query(`SELECT owner_id,kind,amount_minor::text amount_minor
      FROM soundpub.finance_events WHERE business_reference=$1`, [invoice.id])).rows,
    [{ owner_id:pic,kind:'PAYMENT_CHARGE',amount_minor:invoice.amount_minor }]);

    const client = await database.runtime.connect();
    try {
      await client.query('BEGIN');
      assert.equal(await paymentSubmissionDependency.isReleasePaymentSatisfied({ db:client,
        release:{ id:release } as never,tracks:[] }), true);
      await client.query('ROLLBACK');
    } finally { client.release(); }
    assert.equal((await payments.status({ id:admin,roles:['admin'],status:'active' }, release)).invoice?.id, invoice.id);

    const refund = { invoice_id:invoice.id,idempotency_key:'custom-refund',reason:'Synthetic PIC refund' };
    for (const id of [pic, otherPic]) {
      await assert.rejects(payments.refund({ id,roles:['label_custom'],status:'active' }, refund, 'denied-refund'),
        { code:'FORBIDDEN' });
    }
    const administrator = { id:admin,roles:['admin'] as const,status:'active' as const };
    assert.equal((await payments.refund(administrator, refund, 'custom-refund')).status, 'REFUNDED');
    assert.equal((await payments.refund(administrator, refund, 'refund-replay')).status, 'REFUNDED');
    for (const changed of [{ ...refund,reason:'Changed reason' }, { ...refund,idempotency_key:'changed-refund' }]) {
      await assert.rejects(payments.refund(administrator, changed, 'conflicting-refund'), { code:'CONFLICT' });
    }
    assert.equal(await payments.callback(callback), 'duplicate');
    const late = { ...callback,eventId:'custom-paid-late',signature:'' };
    late.signature = webhookSignature(secret, late);
    assert.equal(await payments.callback(late), 'accepted');
    assert.equal((await payments.status(administrator, release)).invoice?.status, 'REFUNDED');
    assert.deepEqual((await database.owner.query(`SELECT owner_id,kind,amount_minor::text amount_minor
      FROM soundpub.finance_events WHERE business_reference=$1 ORDER BY kind`, [invoice.id])).rows, [
      { owner_id:pic,kind:'PAYMENT_CHARGE',amount_minor:invoice.amount_minor },
      { owner_id:pic,kind:'PAYMENT_REFUND',amount_minor:invoice.amount_minor },
    ]);
    assert.equal((await payments.status(administrator, release)).reconciliation?.reconciled, true);

    const revokedRelease = (await database.owner.query(`INSERT INTO soundpub.releases(artist_id,label_id,created_by,title,artist_name,
      price_per_track_snapshot,total_payment_snapshot) VALUES($1,$2,$2,'Revoked PIC Release','Managed Artist','50000.00','50000.00')
      RETURNING id`, [artist, pic])).rows[0].id as string;
    await database.owner.query("INSERT INTO soundpub.tracks(release_id,title,artist_name,position) VALUES($1,'Track','Managed Artist',1)", [revokedRelease]);
    const revokedInvoice = await payments.createInvoice({ id:pic,roles:['label_custom'],status:'active' },
      { release_id:revokedRelease,idempotency_key:'revoked-owner-invoice' }, 'revoked-owner-invoice');
    const suspended = { ...callback,eventId:'suspended-owner-paid',signature:'',rawBody:Buffer.from(JSON.stringify({
      provider_invoice_id:revokedInvoice.provider_invoice_id,status:'PAID',amount_minor:revokedInvoice.amount_minor,
      currency:revokedInvoice.currency,
    })) };
    suspended.signature = webhookSignature(secret, suspended);
    const gate = await database.owner.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await gate.query('BEGIN');
      const blocker = (await gate.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
      // A non-key UPDATE must block settlement's owner status read, not merely an explicit FOR UPDATE.
      await gate.query("UPDATE soundpub.backend_users SET status='suspended' WHERE id=$1", [pic]);
      pending = payments.callback(suspended);
      void pending.catch(() => {});
      const deadline = Date.now() + 5000;
      for (;;) {
        const blocked = await database.owner.query(`SELECT pid FROM pg_stat_activity
          WHERE datname=current_database() AND usename='soundpub_app' AND wait_event_type='Lock'
          AND query LIKE '%SELECT status FROM soundpub.backend_users%'
          AND $1::integer=ANY(pg_blocking_pids(pid))`, [blocker]);
        if (blocked.rows.length === 1) break;
        assert.ok(Date.now() < deadline, 'Callback must wait on uncommitted owner suspension within 5 seconds');
        await setTimeout(10);
      }
      await gate.query('COMMIT');
      assert.equal(await pending, 'accepted');
    } finally {
      await gate.query('ROLLBACK');
      gate.release();
      if (pending) await Promise.allSettled([pending]);
    }
    assert.deepEqual((await database.owner.query(`SELECT disposition FROM soundpub.payment_callback_receipts
      WHERE event_id=$1`, [suspended.eventId])).rows, [{ disposition:'mismatch' }]);
    assert.deepEqual((await database.owner.query(`SELECT status,reconciliation_required FROM soundpub.payment_invoices
      WHERE id=$1`, [revokedInvoice.id])).rows[0], { status:'PENDING',reconciliation_required:true });
    assert.equal((await database.owner.query('SELECT count(*)::int n FROM soundpub.payment_effects WHERE invoice_id=$1',
      [revokedInvoice.id])).rows[0].n, 0);
    assert.equal((await database.owner.query('SELECT count(*)::int n FROM soundpub.finance_events WHERE business_reference=$1',
      [revokedInvoice.id])).rows[0].n, 0);
    await database.owner.query("UPDATE soundpub.backend_users SET status='active' WHERE id=$1", [pic]);
    await database.owner.query("DELETE FROM soundpub.user_roles WHERE user_id=$1 AND role='label_custom'", [pic]);
    const revoked = { ...callback,eventId:'revoked-owner-paid',signature:'',rawBody:Buffer.from(JSON.stringify({
      provider_invoice_id:revokedInvoice.provider_invoice_id,status:'PAID',amount_minor:revokedInvoice.amount_minor,
      currency:revokedInvoice.currency,
    })) };
    revoked.signature = webhookSignature(secret, revoked);
    assert.equal(await payments.callback(revoked), 'accepted');
    assert.equal(await payments.callback(revoked), 'duplicate');
    assert.deepEqual((await database.owner.query(`SELECT disposition FROM soundpub.payment_callback_receipts
      WHERE event_id=$1`, [revoked.eventId])).rows, [{ disposition:'mismatch' }]);
    assert.deepEqual((await database.owner.query(`SELECT status,reconciliation_required FROM soundpub.payment_invoices
      WHERE id=$1`, [revokedInvoice.id])).rows[0], { status:'PENDING',reconciliation_required:true });
    assert.equal((await database.owner.query('SELECT count(*)::int n FROM soundpub.payment_effects WHERE invoice_id=$1',
      [revokedInvoice.id])).rows[0].n, 0);
    assert.equal((await database.owner.query('SELECT count(*)::int n FROM soundpub.finance_events WHERE business_reference=$1',
      [revokedInvoice.id])).rows[0].n, 0);
    assert.equal((await database.owner.query('SELECT status FROM soundpub.payment_mock_invoices WHERE provider_invoice_id=$1',
      [revokedInvoice.provider_invoice_id])).rows[0].status, 'PENDING');
  } finally { await database.close(); }
});
