import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createPaymentsService } from '../src/payments/index.js';
import { createXenditInvoiceOutboxHandler } from '../src/payments/xendit-outbox.js';
import type { XenditInvoiceClient } from '../src/payments/xendit-client.js';
import { pollOutbox } from '../src/worker/index.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

test('Xendit release invoice commits outbox before provider call and persists checkout evidence',
  { skip: process.env.RUN_DOCKER_TESTS !== '1', timeout: 120000 }, async () => {
    const database = await concurrencyPostgres();
    try {
      const actorId = randomUUID();
      const labelId = randomUUID();
      const actor = { id: actorId, roles: ['artist'] as const, status: 'active' as const };
      await database.owner.query("INSERT INTO soundpub.backend_users(id,email,status) VALUES($1,'artist@example.test','active'),($2,'label@example.test','active')", [actorId, labelId]);
      await database.owner.query('INSERT INTO soundpub.profiles(id) VALUES($1),($2)', [actorId, labelId]);
      await database.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,'artist',now()),($2,'label',now())", [actorId, labelId]);
      await database.owner.query('UPDATE soundpub.profiles SET parent_label_id=$1 WHERE id=$2', [labelId, actorId]);
      const artistId = (await database.owner.query(`INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at)
        VALUES($1,$2,'Synthetic Artist',now()) RETURNING id`, [labelId, actorId])).rows[0].id as string;
      const releaseId = (await database.owner.query(`INSERT INTO soundpub.releases(label_id,artist_id,artist_user_id,created_by,
        title,artist_name,price_per_track_snapshot,total_payment_snapshot)
        VALUES($1,$2,$3,$3,'Synthetic Release','Synthetic Artist','50000.00','50000.00') RETURNING id`,
      [labelId, artistId, actorId])).rows[0].id as string;
      await database.owner.query("INSERT INTO soundpub.tracks(release_id,title,artist_name,position) VALUES($1,'Synthetic Track','Synthetic Artist',1)", [releaseId]);
      const payments = createPaymentsService(database.runtime, {
        callbackSecret: 'synthetic-xendit-integration-callback-secret', xenditEnabled: true,
        xenditWebhookToken: 'synthetic-xendit-webhook-token-at-least-32',
      });
      const invoice = await payments.createInvoice(actor, { release_id: releaseId, idempotency_key: 'synthetic-xendit-create' }, 'synthetic-xendit-create');
      assert.equal(invoice.provider, 'xendit');
      assert.equal(invoice.status, 'CREATING');
      assert.equal((await database.owner.query("SELECT count(*)::int AS count FROM soundpub.outbox_events WHERE topic='payment.invoice_create' AND status='pending'")).rows[0].count, 1);
      let providerCalls = 0;
      let earlyCallbackRetriable = false;
      const client = {
        async createOrRecover(request: { external_id: string; amount: number; currency: 'IDR' }) {
          providerCalls++;
          assert.equal(request.external_id, invoice.provider_external_id);
          assert.equal(request.amount, Number(invoice.amount_minor) / 100);
          const committed = (await database.owner.query(`SELECT event.status AS outbox_status,invoice.status AS invoice_status
            FROM soundpub.outbox_events event JOIN soundpub.payment_invoices invoice
              ON invoice.id=(event.payload->>'invoice_id')::uuid
            WHERE event.idempotency_key=$1`, [`xendit-invoice-create:${invoice.id}`])).rows[0];
          assert.deepEqual(committed, { outbox_status: 'processing', invoice_status: 'CREATING' });
          await assert.rejects(payments.xenditCallback({
            body: Buffer.from(JSON.stringify({ id:'xnd_synthetic_invoice', external_id:request.external_id,
              status:'PAID', amount:request.amount, currency:'IDR' })),
            token:'synthetic-xendit-webhook-token-at-least-32',
          }), { code:'PAYMENT_PROVIDER_UNAVAILABLE' });
          earlyCallbackRetriable = true;
          return { id: 'xnd_synthetic_invoice', external_id: request.external_id,
            invoice_url: 'https://checkout.xendit.co/web/synthetic', amount: request.amount,
            currency: 'IDR' as const, status: 'PENDING' };
        },
      } as unknown as XenditInvoiceClient;
      const handler = createXenditInvoiceOutboxHandler(database.runtime, client, {
        success: 'http://127.0.0.1:8281/payment/success', failure: 'http://127.0.0.1:8281/payment/failure',
      });
      assert.equal(await pollOutbox(database.runtime, { 'payment.invoice_create': handler }), 'processed');
      assert.equal(providerCalls, 1);
      assert.equal(earlyCallbackRetriable, true);
      const persisted = (await database.owner.query(`SELECT provider_invoice_id,provider_invoice_url,provider_status,status
        FROM soundpub.payment_invoices WHERE id=$1`, [invoice.id])).rows[0];
      assert.deepEqual(persisted, { provider_invoice_id: 'xnd_synthetic_invoice',
        provider_invoice_url: 'https://checkout.xendit.co/web/synthetic', provider_status: 'PENDING', status: 'PENDING' });
      const paidCallback = Buffer.from(JSON.stringify({ id:'xnd_synthetic_invoice', external_id:invoice.provider_external_id,
        status:'PAID', amount:50000, currency:'IDR' }));
      await assert.rejects(payments.xenditCallback({ body:Buffer.from(JSON.stringify({ id:'xnd_unknown',
        external_id:'not-ours', status:'PAID', amount:50000, currency:'IDR' })),
        token:'synthetic-xendit-webhook-token-at-least-32' }),{code:'PAYMENT_PROVIDER_UNAVAILABLE'});
      await assert.rejects(payments.xenditCallback({ body:Buffer.from(JSON.stringify({ id:'xnd_synthetic_invoice',
        external_id:'not-ours', status:'PAID', amount:50000, currency:'IDR' })),
        token:'synthetic-xendit-webhook-token-at-least-32' }),{code:'CONFLICT'});
      assert.equal((await database.owner.query("SELECT count(*)::int count FROM soundpub.webhook_events WHERE provider='xendit-invoice'")).rows[0].count,0);
      assert.equal(await payments.xenditCallback({ body:paidCallback, token:'synthetic-xendit-webhook-token-at-least-32' }),'accepted');
      assert.equal(await payments.xenditCallback({ body:paidCallback, token:'synthetic-xendit-webhook-token-at-least-32' }),'duplicate');
      assert.equal((await database.owner.query('SELECT status FROM soundpub.payment_invoices WHERE id=$1',[invoice.id])).rows[0].status,'PAID');
      assert.equal((await database.owner.query('SELECT count(*)::int count FROM soundpub.finance_events WHERE business_reference=$1',[invoice.id])).rows[0].count,1);
      assert.equal((await database.owner.query("SELECT status FROM soundpub.outbox_events WHERE topic='payment.invoice_create'")).rows[0].status, 'processed');
      assert.equal((await database.owner.query("SELECT count(*)::int AS count FROM soundpub.audit_logs WHERE action='payment.invoice_provider_ready' AND resource_id=$1", [invoice.id])).rows[0].count, 1);
      assert.equal(providerCalls, 1);
      for (const terminal of ['FAILED', 'EXPIRED'] as const) {
        const terminalRelease = (await database.owner.query(`INSERT INTO soundpub.releases(label_id,artist_id,artist_user_id,created_by,
          title,artist_name,price_per_track_snapshot,total_payment_snapshot)
          VALUES($1,$2,$3,$3,'Synthetic Terminal','Synthetic Artist','50000.00','50000.00') RETURNING id`,
        [labelId,artistId,actorId])).rows[0].id as string;
        await database.owner.query("INSERT INTO soundpub.tracks(release_id,title,artist_name,position) VALUES($1,'Synthetic Track','Synthetic Artist',1)",[terminalRelease]);
        const terminalInvoice = await payments.createInvoice(actor,
          { release_id:terminalRelease,idempotency_key:`terminal-${terminal.toLowerCase()}` },`terminal-${terminal.toLowerCase()}`);
        const terminalProviderId = `xnd_terminal_${terminal.toLowerCase()}`;
        const terminalHandler = createXenditInvoiceOutboxHandler(database.runtime, {
          async createOrRecover(request: { external_id:string;amount:number;currency:'IDR' }) {
            assert.equal(request.external_id,terminalInvoice.provider_external_id);
            return {id:terminalProviderId,external_id:request.external_id,amount:request.amount,currency:request.currency,
              invoice_url:`https://checkout.xendit.co/web/${terminalProviderId}`,status:'PENDING' as const};
          },
        } as unknown as XenditInvoiceClient, {
          success:'http://127.0.0.1:8281/payment/success',failure:'http://127.0.0.1:8281/payment/failure',
        });
        if (typeof terminalHandler === 'function') throw new Error('Expected external delivery handler');
        await terminalHandler.handle({ id:randomUUID(),topic:'payment.invoice_create',
          payload:{invoice_id:terminalInvoice.id},idempotency_key:`xendit-invoice-create:${terminalInvoice.id}`,attempts:0 });
        const callback=(status:string)=>Buffer.from(JSON.stringify({id:terminalProviderId,
          external_id:terminalInvoice.provider_external_id,status,amount:50000,currency:'IDR'}));
        const token='synthetic-xendit-webhook-token-at-least-32';
        assert.equal(await payments.xenditCallback({body:callback(terminal),token}),'accepted');
        assert.equal(await payments.xenditCallback({body:callback('PAID'),token}),'accepted');
        assert.equal(await payments.xenditCallback({body:callback('PAID'),token}),'duplicate');
        assert.deepEqual((await database.owner.query(`SELECT status,provider_status,reconciliation_required
          FROM soundpub.payment_invoices WHERE id=$1`,[terminalInvoice.id])).rows[0],
          {status:terminal,provider_status:'PAID',reconciliation_required:true});
        assert.equal((await database.owner.query('SELECT count(*)::int count FROM soundpub.payment_effects WHERE invoice_id=$1',
          [terminalInvoice.id])).rows[0].count,0);
        assert.equal((await database.owner.query(`SELECT count(*)::int count FROM soundpub.finance_events WHERE business_reference=$1`,
          [terminalInvoice.id])).rows[0].count,0);
        assert.equal((await database.owner.query(`SELECT count(*)::int count FROM soundpub.payment_callback_receipts
          WHERE provider_invoice_id=$1 AND disposition='invalid_transition'`,[terminalProviderId])).rows[0].count,1);
      }
    } finally { await database.close(); }
  });
