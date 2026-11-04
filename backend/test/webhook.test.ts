import assert from 'node:assert/strict';
import test from 'node:test';
import { receiveWebhook, webhookSignature, type WebhookInput } from '../src/integrations/webhook.ts';
import type { SqlPool } from '../src/worker/index.ts';

const secret = 'test-only-secret';
function signed(body = '{"amount":1}'): WebhookInput {
  const input = { provider: 'payment', eventId: 'evt-1', rawBody: Buffer.from(body), timestamp: '1700000000', signature: '' };
  input.signature = webhookSignature(secret, input);
  return input;
}
const options = { nowMs: 1700000000000 };

function fixture() {
  let saved: string | undefined;
  let snapshot: string | undefined;
  let connections = 0;
  const pool = { async connect() {
    connections++;
    return {
      async query(sql: string, values?: unknown[]) {
        if (sql === 'BEGIN') snapshot = saved;
        if (sql === 'ROLLBACK') saved = snapshot;
        if (sql.startsWith('INSERT')) {
          if (saved) return { rows: [], rowCount: 0 };
          saved = values?.[2] as string;
          return { rows: [{ event_id: 'evt-1' }], rowCount: 1 };
        }
        if (sql.startsWith('SELECT')) return { rows: saved ? [{ payload_sha256: saved }] : [], rowCount: saved ? 1 : 0 };
        return { rows: [], rowCount: 0 };
      },
      release() {},
    };
  } } as SqlPool;
  return { pool, get connections() { return connections; } };
}

test('webhook accepts exact signed bytes once, rejects conflicting event reuse', async () => {
  const f = fixture();
  let calls = 0;
  const handle = async (payload: unknown) => { assert.deepEqual(payload, { amount: 1 }); calls++; };
  assert.equal(await receiveWebhook(f.pool, signed(), secret, handle, options), 'accepted');
  assert.equal(await receiveWebhook(f.pool, signed(), secret, handle, options), 'duplicate');
  assert.equal(calls, 1);
  await assert.rejects(receiveWebhook(f.pool, signed('{"amount":2}'), secret, handle, options), /different body/);
});

test('handler failure rolls replay guard back so delivery can retry', async () => {
  const f = fixture();
  await assert.rejects(receiveWebhook(f.pool, signed(), secret, async () => { throw new Error('retry'); }, options), /retry/);
  assert.equal(await receiveWebhook(f.pool, signed(), secret, async () => {}, options), 'accepted');
});

test('signature, raw-body, event ID, freshness and size failures never touch database', async () => {
  const f = fixture();
  for (const input of [
    { ...signed(), signature: '0'.repeat(64) },
    { ...signed(), signature: 'bad' },
    { ...signed(), rawBody: Buffer.from('{ "amount":1}') },
    { ...signed(), eventId: 'evt-2' },
    { ...signed(), timestamp: '1699999000' },
    { ...signed(), timestamp: '1700001000' },
    signed('not json'),
  ]) await assert.rejects(receiveWebhook(f.pool, input, secret, async () => {}, options));
  await assert.rejects(receiveWebhook(f.pool, signed(), secret, async () => {}, { ...options, maxBodyBytes: 1 }));
  assert.equal(f.connections, 0);
});
