import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { createCopyrightRegistrationsService } from '../src/copyright-registrations/index.js';
import { copyrightRegistrationRedirects, createCopyrightInvoiceDeliveryHandler } from '../src/copyright-registrations/xendit-outbox.js';
import type { XenditInvoiceClient } from '../src/payments/xendit-client.js';
import { pollOutbox } from '../src/worker/index.js';
import { runFinanceReconciliation } from '../src/reconciliation/index.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

test('copyright Xendit invoice survives outbox delivery, callback replay and mismatch',
  { skip: process.env.RUN_DOCKER_TESTS !== '1', timeout: 120000 }, async () => {
    const database = await concurrencyPostgres();
    try {
      assert.ok((await database.owner.query(`SELECT 1 FROM pg_indexes
        WHERE schemaname='soundpub' AND indexname='copyright_registrations_review_page_idx'`)).rowCount);
      const ownerId = randomUUID(), registrationId = randomUUID(), paymentId = randomUUID();
      const actor = { id: ownerId, status: 'active' as const, roles: ['user'] as const };
      await database.owner.query("INSERT INTO soundpub.backend_users(id,email,status) VALUES($1,'copyright@example.test','active')", [ownerId]);
      await database.owner.query('INSERT INTO soundpub.profiles(id) VALUES($1)', [ownerId]);
      await database.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,'user',now())", [ownerId]);
      await database.owner.query(`INSERT INTO soundpub.copyright_registrations
        (id,registration_code,owner_id,applicant_type,legal_name,email,phone,status,terms_version,terms_checksum,terms_accepted_at)
        VALUES($1,$2,$3,'PERSONAL','Copyright Owner','copyright@example.test','081234567890','AWAITING_PAYMENT',
        'copyright-registration-terms-v1',$4,now())`,
      [registrationId, `CR-${registrationId.replaceAll('-', '').slice(0,12).toUpperCase()}`, ownerId, 'a'.repeat(64)]);
      await database.owner.query(`INSERT INTO soundpub.copyright_registration_payments
        (id,registration_id,owner_id,amount_minor,idempotency_key,request_hash)
        VALUES($1,$2,$3,5000000,'synthetic-copyright-intent',$4)`,
      [paymentId,registrationId,ownerId,createHash('sha256').update('synthetic').digest('hex')]);
      const token = 'synthetic-copyright-xendit-token-32', secret = 'synthetic-copyright-callback-secret-32';
      const service = createCopyrightRegistrationsService(database.runtime, {
        environment: 'test', callbackSecret: secret, xenditEnabled: true, xenditWebhookToken: token,
      });
      const created = await service.requestPaymentInvoice(actor,registrationId,{},'copyright-xendit-invoice-1','copyright-xendit-invoice-1');
      assert.deepEqual({ provider: created.provider, provider_invoice_id: created.provider_invoice_id,
        provider_invoice_url: created.provider_invoice_url, payment_status: created.payment_status },
      { provider:'xendit',provider_invoice_id:null,provider_invoice_url:null,payment_status:'pending' });
      assert.equal((await database.owner.query("SELECT status FROM soundpub.copyright_registration_payments WHERE id=$1", [paymentId])).rows[0].status, 'CREATING');
      assert.equal((await database.owner.query("SELECT count(*)::int count FROM soundpub.outbox_events WHERE topic='copyright_registration.payment_invoice_create'")).rows[0].count,1);
      const replay=await service.requestPaymentInvoice(actor,registrationId,{},'copyright-xendit-invoice-1','replay');
      assert.deepEqual(replay, created);
      assert.equal(await service.hasXenditExternalId(`sp-cr-${paymentId}`),true);
      assert.equal(await service.hasXenditInvoice('xnd_copyright_synthetic'),false);
      const earlyBody=Buffer.from(JSON.stringify({id:'xnd_copyright_synthetic',external_id:`sp-cr-${paymentId}`,
        status:'PAID',amount:50000,currency:'IDR'}));
      assert.equal((await database.owner.query("SELECT count(*)::int count FROM soundpub.webhook_events WHERE provider='xendit-registration'")).rows[0].count,0);
      let providerCalls=0;
      const client={ async createOrRecover(request: { external_id: string; amount: number; payer_email: string }) {
        providerCalls++;
        assert.equal(request.external_id,`sp-cr-${paymentId}`);
        assert.equal(request.amount,50000);
        assert.equal(request.payer_email,'copyright@example.test');
        await assert.rejects(service.xenditCallback({body:earlyBody,token}),{code:'PAYMENT_PROVIDER_UNAVAILABLE'});
        assert.equal((request as unknown as { success_redirect_url: string }).success_redirect_url,
          'http://127.0.0.1:8281/dashboard/copyright-registration/status');
        assert.equal((await database.owner.query("SELECT status FROM soundpub.outbox_events WHERE topic='copyright_registration.payment_invoice_create'")).rows[0].status,'processing');
        return {id:'xnd_copyright_synthetic',external_id:request.external_id,
          invoice_url:'https://checkout.xendit.co/web/synthetic-copyright',amount:request.amount,currency:'IDR' as const,status:'PENDING'};
      } } as unknown as XenditInvoiceClient;
      const handlers={'copyright_registration.payment_invoice_requested':async () => {},
        'copyright_registration.payment_changed':async () => {},
        'copyright_registration.payment_invoice_create':createCopyrightInvoiceDeliveryHandler(database.runtime,client,
        copyrightRegistrationRedirects('http://127.0.0.1:8281/dashboard/invoices','http://127.0.0.1:8281/dashboard/invoices'))};
      await database.owner.query(`CREATE FUNCTION soundpub.reject_copyright_provider_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.action='copyright_registration.payment_provider_ready' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF;
        RETURN NEW; END $$`);
      await database.owner.query(`CREATE TRIGGER reject_copyright_provider_audit BEFORE INSERT ON soundpub.audit_logs
        FOR EACH ROW EXECUTE FUNCTION soundpub.reject_copyright_provider_audit()`);
      let firstDelivery: string | undefined;
      for (let attempt=0; attempt<3 && providerCalls<1; attempt++) {
        firstDelivery=await pollOutbox(database.runtime,handlers);
        assert.notEqual(firstDelivery,'idle');
      }
      assert.equal(firstDelivery,'retry');
      assert.equal(providerCalls,1);
      assert.equal((await database.owner.query('SELECT status FROM soundpub.copyright_registration_payments WHERE id=$1',[paymentId])).rows[0].status,'CREATING');
      await database.owner.query('DROP TRIGGER reject_copyright_provider_audit ON soundpub.audit_logs');
      await database.owner.query(`UPDATE soundpub.outbox_events SET available_at=now()
        WHERE topic='copyright_registration.payment_invoice_create'`);
      for (let attempt=0; attempt<3 && providerCalls<2; attempt++) {
        assert.equal(await pollOutbox(database.runtime,handlers),'processed');
      }
      assert.equal(providerCalls,2);
      assert.equal((await database.owner.query(`SELECT count(*)::int count FROM soundpub.audit_logs
        WHERE action='copyright_registration.payment_provider_ready' AND resource_id=$1`,[paymentId])).rows[0].count,1);
      for (let attempt=0; attempt<3; attempt++) {
        if (await pollOutbox(database.runtime,handlers)==='idle') break;
      }
      assert.equal(await pollOutbox(database.runtime,handlers),'idle');
      assert.equal(providerCalls,2);
      const pending=await service.get(actor,registrationId) as { payment: { provider: string; provider_invoice_url: string } };
      assert.equal(pending.payment.provider,'xendit');
      assert.equal(pending.payment.provider_invoice_url,'https://checkout.xendit.co/web/synthetic-copyright');
      const body=(amount:number)=>Buffer.from(JSON.stringify({id:'xnd_copyright_synthetic',external_id:`sp-cr-${paymentId}`,
        status:'PAID',amount,currency:'IDR'}));
      await assert.rejects(service.xenditCallback({body:body(50000),token:'invalid'}),{code:'UNAUTHORIZED'});
      await assert.rejects(service.xenditCallback({body:Buffer.from(JSON.stringify({id:'xnd_copyright_synthetic',
        external_id:'not-ours',status:'PAID',amount:50000,currency:'IDR'})),token}),{code:'CONFLICT'});
      assert.equal((await database.owner.query("SELECT count(*)::int count FROM soundpub.webhook_events WHERE provider='xendit-registration'")).rows[0].count,0);
      assert.equal(await service.xenditCallback({body:body(1),token}),'accepted');
      assert.equal((await database.owner.query("SELECT status FROM soundpub.copyright_registration_payments WHERE id=$1",[paymentId])).rows[0].status,'PROVIDER_PENDING');
      assert.equal((await database.owner.query("SELECT disposition FROM soundpub.copyright_registration_payment_callback_receipts WHERE amount_minor=100")).rows[0].disposition,'AMOUNT_MISMATCH');
      assert.deepEqual(body(50000), earlyBody);
      assert.equal(await service.xenditCallback({body:body(50000),token}),'accepted');
      assert.equal(await service.xenditCallback({body:body(50000),token}),'duplicate');
      const paid=await service.get(actor,registrationId) as { status: string; payment: { payment_status: string } };
      assert.equal(paid.status,'paid_pending_review');
      assert.equal(paid.payment.payment_status,'paid');
      assert.equal((await database.owner.query("SELECT count(*)::int count FROM soundpub.copyright_registration_status_history WHERE registration_id=$1 AND new_status='PAID_PENDING_REVIEW'",[registrationId])).rows[0].count,1);
      assert.equal((await database.owner.query("SELECT count(*)::int count FROM soundpub.outbox_events WHERE topic='copyright_registration.payment_changed'")).rows[0].count,1);
      await assert.rejects(service.xenditCallback({body:Buffer.from('{'),token}),{code:'BAD_REQUEST'});
      await assert.rejects(service.xenditCallback({body:Buffer.from(JSON.stringify({id:'xnd_copyright_synthetic',external_id:`sp-cr-${paymentId}`,
        status:'UNKNOWN',amount:50000,currency:'IDR'})),token}),{code:'BAD_REQUEST'});
      assert.equal(await service.xenditCallback({body:Buffer.from(JSON.stringify({id:'xnd_copyright_synthetic',external_id:`sp-cr-${paymentId}`,
        status:'EXPIRED',amount:50000,currency:'IDR'})),token}),'accepted');
      assert.equal((await database.owner.query("SELECT status FROM soundpub.copyright_registration_payments WHERE id=$1",[paymentId])).rows[0].status,'PAID');
      assert.equal((await database.owner.query("SELECT count(*)::int count FROM soundpub.copyright_registration_payment_callback_receipts WHERE payment_id=$1 AND disposition='INVALID_TRANSITION'",[paymentId])).rows[0].count,1);
    } finally { await database.close(); }
  });

test('copyright Xendit failed and expired callbacks remain terminal with audit and replay evidence',
  { skip: process.env.RUN_DOCKER_TESTS !== '1', timeout: 120000 }, async () => {
    const database = await concurrencyPostgres();
    try {
      const token = 'synthetic-copyright-xendit-token-32';
      const service = createCopyrightRegistrationsService(database.runtime, {
        environment: 'test', callbackSecret: 'synthetic-copyright-callback-secret-32',
        xenditEnabled: true, xenditWebhookToken: token,
      });
      const adminId=randomUUID();
      await database.owner.query("INSERT INTO soundpub.backend_users(id,email,status) VALUES($1,'synthetic-review-admin@example.test','active')",[adminId]);
      await database.owner.query('INSERT INTO soundpub.profiles(id) VALUES($1)',[adminId]);
      await database.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,'superadmin',now())",[adminId]);
      const admin={id:adminId,status:'active' as const,roles:['superadmin'] as const};
      let reconciledTerminalCount=0;
      for (const status of ['FAILED', 'EXPIRED'] as const) {
        const ownerId = randomUUID(), registrationId = randomUUID(), paymentId = randomUUID();
        const email = `${status.toLowerCase()}@example.test`;
        const invoiceId = `xnd_copyright_${status.toLowerCase()}`;
        await database.owner.query("INSERT INTO soundpub.backend_users(id,email,status) VALUES($1,$2,'active')", [ownerId,email]);
        await database.owner.query('INSERT INTO soundpub.profiles(id) VALUES($1)', [ownerId]);
        await database.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,'user',now())", [ownerId]);
        await database.owner.query(`INSERT INTO soundpub.copyright_registrations
          (id,registration_code,owner_id,applicant_type,legal_name,email,phone,status,terms_version,terms_checksum,terms_accepted_at)
          VALUES($1,$2,$3,'PERSONAL','Copyright Owner',$4,'081234567890','AWAITING_PAYMENT',
          'copyright-registration-terms-v1',$5,now())`,
        [registrationId, `CR-${registrationId.replaceAll('-', '').slice(0,12).toUpperCase()}`, ownerId, email, 'a'.repeat(64)]);
        await database.owner.query(`INSERT INTO soundpub.copyright_registration_payments
          (id,registration_id,owner_id,amount_minor,idempotency_key,request_hash,status,provider,
           provider_external_id,provider_invoice_id,provider_invoice_url,provider_status)
          VALUES($1,$2,$3,5000000,$4,$5,'PROVIDER_PENDING','xendit',$6,$7,$8,'PENDING')`,
        [paymentId,registrationId,ownerId,`synthetic-terminal-${paymentId}`,createHash('sha256').update(paymentId).digest('hex'),
          `sp-cr-${paymentId}`,invoiceId,`https://checkout.xendit.co/web/${invoiceId}`]);
        const callback = (next: string) => Buffer.from(JSON.stringify({ id:invoiceId,external_id:`sp-cr-${paymentId}`,
          status:next,amount:50000,currency:'IDR' }));
        assert.equal(await service.xenditCallback({ body:callback(status),token }),'accepted');
        assert.equal(await service.xenditCallback({ body:callback(status),token }),'duplicate');
        const payment = await service.get({ id:ownerId,status:'active',roles:['user'] },registrationId) as {
          status: string; payment: { payment_status: string } };
        assert.equal(payment.status,'awaiting_payment');
        assert.equal(payment.payment.payment_status,status.toLowerCase());
        assert.equal((await service.list(admin,{payment_review:'required'})).items.length,reconciledTerminalCount);
        assert.equal(await service.xenditCallback({ body:callback('PAID'),token }),'accepted');
        assert.equal(await service.xenditCallback({ body:callback('PAID'),token }),'duplicate');
        assert.deepEqual((await database.owner.query('SELECT status,provider_status,reconciliation_required FROM soundpub.copyright_registration_payments WHERE id=$1',[paymentId])).rows[0],
          {status,provider_status:'PAID',reconciliation_required:true});
        assert.equal((await database.owner.query('SELECT status FROM soundpub.copyright_registrations WHERE id=$1',[registrationId])).rows[0].status,'AWAITING_PAYMENT');
        assert.equal((await database.owner.query(`SELECT count(*)::int count FROM soundpub.copyright_registration_payment_callback_receipts
          WHERE payment_id=$1 AND disposition='INVALID_TRANSITION'`,[paymentId])).rows[0].count,1);
        assert.equal((await database.owner.query(`SELECT count(*)::int count FROM soundpub.audit_logs
          WHERE action='copyright_registration.payment_manual_review' AND resource_id=$1`,[registrationId])).rows[0].count,1);
        assert.equal((await service.get({ id:ownerId,status:'active',roles:['user'] },registrationId) as {payment:{reconciliation_required:boolean}}).payment.reconciliation_required,true);
        reconciledTerminalCount++;
        assert.equal((await service.list(admin,{payment_review:'required',status:'awaiting_payment'})).items.length,reconciledTerminalCount);
        await assert.rejects(service.list({id:ownerId,status:'active',roles:['user']},{payment_review:'required'}),{code:'NOT_FOUND'});
        const reconciliation=await runFinanceReconciliation(database.auditor,{runner:'synthetic-late-provider-callback',
          now:new Date('2026-11-05T00:00:00Z')});
        assert.equal(reconciliation.outcome,'recorded');
        if(reconciliation.outcome==='recorded') {
          assert.equal(reconciliation.run.status,'FAIL');
          assert.ok(reconciliation.run.issues.some(issue=>issue.code==='COPYRIGHT_PAYMENT_MANUAL_REVIEW' && issue.resourceId===paymentId));
          assert.ok(reconciliation.run.issues.some(issue=>issue.code==='COPYRIGHT_PAYMENT_CALLBACK_UNRESOLVED' && issue.resourceId.startsWith('xendit-registration:')));
          assert.equal(reconciliation.run.snapshot.copyright_payment_manual_reviews,reconciledTerminalCount);
          assert.equal(reconciliation.run.snapshot.copyright_payment_unresolved_callbacks,reconciledTerminalCount);
        }
        await assert.rejects(database.auditor.query('SELECT provider_invoice_url FROM soundpub.copyright_registration_payments'),/permission denied/);
        assert.equal((await database.owner.query(`SELECT count(*)::int count FROM soundpub.copyright_registration_payment_callback_receipts
          WHERE payment_id=$1 AND disposition='INVALID_TRANSITION'`,[paymentId])).rows[0].count,1);
        assert.equal((await database.owner.query(`SELECT count(*)::int count FROM soundpub.audit_logs
          WHERE action='copyright_registration.payment_callback' AND resource_id=$1`,[registrationId])).rows[0].count,1);
        assert.equal((await database.owner.query(`SELECT count(*)::int count FROM soundpub.outbox_events
          WHERE topic='copyright_registration.payment_changed' AND payload->>'registrationId'=$1`,[registrationId])).rows[0].count,1);
      }
      const firstPage=await service.list(admin,{limit:'1'});
      assert.equal(firstPage.items.length,1);
      assert.ok(firstPage.next_cursor);
      const secondPage=await service.list(admin,{limit:'1',cursor:firstPage.next_cursor!});
      assert.equal(secondPage.items.length,1);
      assert.notEqual(firstPage.items[0]?.id,secondPage.items[0]?.id);
      await assert.rejects(service.list(admin,{limit:'1',cursor:firstPage.next_cursor!,status:'active'}),{code:'BAD_REQUEST'});
      assert.equal((await service.list(admin,{applicant_type:'company_label'})).items.length,0);
      const reviewRegistrationId=randomUUID(),reviewPaymentId=randomUUID();
      await database.owner.query(`INSERT INTO soundpub.copyright_registrations
        (id,registration_code,owner_id,applicant_type,legal_name,email,phone,status,terms_version,terms_checksum,terms_accepted_at)
        VALUES($1,$2,$3,'PERSONAL','Unresolved Copyright Owner','synthetic-review-admin@example.test','081234567890',
          'AWAITING_PAYMENT','copyright-registration-terms-v1',$4,now())`,
        [reviewRegistrationId,`CR-${reviewRegistrationId.replaceAll('-', '').slice(0,12).toUpperCase()}`,adminId,'a'.repeat(64)]);
      await database.owner.query(`INSERT INTO soundpub.copyright_registration_payments
        (id,registration_id,owner_id,amount_minor,idempotency_key,request_hash,status,provider,provider_external_id,provider_invoice_id,provider_status)
        VALUES($1,$2,$3,5000000,$4,$5,'RECONCILIATION_REQUIRED','mock-copyright-registration',$6,$7,'FAILED')`,
        [reviewPaymentId,reviewRegistrationId,adminId,`review-${reviewPaymentId}`,createHash('sha256').update(reviewPaymentId).digest('hex'),
          `mock-review-${reviewPaymentId}`,`mock-review-${reviewPaymentId}`]);
      const reviewQueue=await service.list(admin,{payment_review:'required'});
      assert.equal(reviewQueue.items.length,3);
      assert.ok(reviewQueue.items.some((row:{id:string})=>row.id===reviewRegistrationId));
      assert.equal((await database.owner.query('SELECT reconciliation_required FROM soundpub.copyright_registration_payments WHERE id=$1',
        [reviewPaymentId])).rows[0].reconciliation_required,false);
    } finally { await database.close(); }
  });
