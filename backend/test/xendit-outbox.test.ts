import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';
import type { OutboxEvent } from '../src/worker/index.js';
import type { XenditInvoiceClient } from '../src/payments/xendit-client.js';
import { createXenditInvoiceOutboxHandler } from '../src/payments/xendit-outbox.js';

test('Xendit invoice outbox calls provider outside transaction and persists verified response', async () => {
  const timeline: string[] = [];
  const sql: { statement: string; values?: unknown[] }[] = [];
  const pool = {
    async query(statement: string, values?: unknown[]) {
      sql.push({ statement, values });
      timeline.push('load');
      return { rows: [{ id: '123e4567-e89b-42d3-a456-426614174000', amount_minor: '5000000', provider_external_id: 'stable-id', payer_email: 'payer@example.test' }], rowCount: 1 };
    },
    async connect() {
      return {
        async query(statement: string, values?: unknown[]) {
          sql.push({ statement, values });
          timeline.push(statement === 'BEGIN' ? 'begin' : statement === 'COMMIT' ? 'commit' : 'persist');
          return { rows: [], rowCount: statement.startsWith('UPDATE soundpub.payment_invoices') ? 1 : 0 };
        },
        release() {},
      };
    },
  } as unknown as Pool;
  const client = {
    async createOrRecover(request: Record<string, unknown>) {
      timeline.push('provider');
      assert.equal(request.external_id, 'stable-id');
      assert.equal(request.amount, 50000);
      assert.equal(request.payer_email, 'payer@example.test');
      assert.equal(request.success_redirect_url, 'http://127.0.0.1:8281/paid');
      return { id: 'xnd-id', external_id: 'stable-id', invoice_url: 'https://checkout.xendit.co/web/test',
        amount: 50000, currency: 'IDR', status: 'PENDING' };
    },
  } as unknown as XenditInvoiceClient;
  const handler = createXenditInvoiceOutboxHandler(pool, client,
    { success: 'http://127.0.0.1:8281/paid', failure: 'http://127.0.0.1:8281/failed' });
  assert.equal(typeof handler, 'object');
  if (typeof handler === 'function') throw new Error('External handler contract expected');
  const event: OutboxEvent = { id: 'event-id', topic: 'payment.invoice_create',
    payload: { invoice_id: '123e4567-e89b-42d3-a456-426614174000' }, idempotency_key: 'outbox-idempotency', attempts: 0 };
  await handler.handle(event);
  assert.deepEqual(timeline, ['load', 'provider', 'begin', 'persist', 'persist', 'commit']);
  const update = sql.find(entry => entry.statement.startsWith('UPDATE soundpub.payment_invoices'));
  assert.deepEqual(update?.values, ['123e4567-e89b-42d3-a456-426614174000', 'xnd-id', 'https://checkout.xendit.co/web/test', 'PENDING', 'PENDING', 'stable-id']);
});