import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { decryptDeliveryToken, encryptDeliveryToken } from '../src/local-auth/delivery-crypto.js';
import { createAuthDeliveryHandler } from '../src/local-auth/delivery-handler.js';
import { createMockProvider, type ProviderRequest } from '../src/integrations/index.js';
import { pollOutbox } from '../src/worker/index.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

const integration = dockerTestsEnabled ? test : test.skip;
test('auth delivery key ring decrypts active and previous envelopes, rejects unknown IDs and preserves legacy compatibility', () => {
  const active = 'synthetic-active-delivery-secret-32-chars';
  const previous = 'synthetic-previous-delivery-secret-32-chars';
  const ring = { active, previous };
  assert.equal(decryptDeliveryToken(encryptDeliveryToken('active-token', active, 'active'), ring), 'active-token');
  assert.equal(decryptDeliveryToken(encryptDeliveryToken('previous-token', previous, 'previous'), ring), 'previous-token');
  assert.equal(decryptDeliveryToken(encryptDeliveryToken('legacy-token', previous), previous), 'legacy-token');
  const oldEnvelope = encryptDeliveryToken('pending-token', previous);
  delete oldEnvelope.token_key_id;
  assert.equal(decryptDeliveryToken(oldEnvelope, { active, legacy: previous }), 'pending-token');
  assert.throws(() => decryptDeliveryToken(encryptDeliveryToken('unknown-token', previous, 'unknown'), ring),
    /Unknown auth delivery key ID/);
  assert.throws(() => encryptDeliveryToken('bad', active, '../bad'), /Invalid auth delivery key ID/);
});

integration('auth delivery retries retain encrypted token; success atomically redacts envelope and prevents replay', async () => {
  const database = await concurrencyPostgres();
  const secret = 'synthetic-worker-delivery-secret-32-chars';
  try {
    for (const [topic, operation] of [
      ['auth.email_verification.requested', 'send-email-verification'],
      ['auth.password_reset.requested', 'send-password-reset'],
    ] as const) {
      const token = `synthetic-token-${randomUUID()}`;
      const eventId = randomUUID();
      const envelope = { email: 'synthetic@example.test', ...encryptDeliveryToken(token, secret) };
      await database.owner.query(`INSERT INTO soundpub.outbox_events(id,topic,payload,idempotency_key)
        VALUES($1,$2,$3,$4)`, [eventId, topic, JSON.stringify(envelope), eventId]);
      const provider = createMockProvider('email');
      const requests: ProviderRequest[] = [];
      let failDelivery = true;
      const handlers = { [topic]: createAuthDeliveryHandler({ async execute(request) {
        requests.push(request);
        if (failDelivery) throw new Error(`Synthetic private failure ${token}`);
        return provider.execute(request);
      } }, secret, operation) };
      assert.equal(await pollOutbox(database.runtime, handlers), 'retry');
      let row = (await database.owner.query('SELECT * FROM soundpub.outbox_events WHERE id=$1', [eventId])).rows[0];
      assert.deepEqual(row.payload, envelope);
      assert.equal(row.last_error, 'Delivery failed');
      assert.equal((await database.owner.query('SELECT 1 FROM soundpub.integration_effects WHERE idempotency_key=$1', [eventId])).rowCount, 0);
      failDelivery = false;
      await database.owner.query('UPDATE soundpub.outbox_events SET available_at=now() WHERE id=$1', [eventId]);
      assert.equal(await pollOutbox(database.runtime, handlers), 'processed');
      row = (await database.owner.query('SELECT * FROM soundpub.outbox_events WHERE id=$1', [eventId])).rows[0];
      assert.deepEqual(row.payload, { email: envelope.email });
      assert.equal(row.status, 'processed');
      assert.equal(row.last_error, null);
      assert.equal(JSON.stringify(row).includes(token), false);
      assert.deepEqual(requests[1], { idempotencyKey: eventId, operation, payload: { email: envelope.email, token } });
      assert.equal(provider.deliveryCount, 1);
      await database.owner.query("UPDATE soundpub.outbox_events SET status='pending',available_at=now() WHERE id=$1", [eventId]);
      assert.equal(await pollOutbox(database.runtime, handlers), 'processed');
      assert.equal(requests.length, 2);
      assert.equal(provider.deliveryCount, 1);
    }
  } finally { await database.close(); }
});
