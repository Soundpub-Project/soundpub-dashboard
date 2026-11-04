import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createPool, createRepositories, migrate, withTransaction } from '../src/db/index.js';
import { pollOutbox } from '../src/worker/index.js';
import { receiveWebhook, webhookSignature } from '../src/integrations/webhook.js';
import { sampleQueue } from '../src/observability/index.js';

const url = process.env.DB_TEST_URL;

test('migration repeatability, checksum, advisory lock, rollback, schema and repositories', { skip: !url }, async () => {
  // Dedicated disposable DB only: this test drops its soundpub schema.
  const target = new URL(url!);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname), 'DB_TEST_URL must use loopback');
  assert.match(target.pathname, /^\/soundpub_test[a-zA-Z0-9_]*$/, 'Dedicated soundpub_test database required');
  assert.equal(target.search, '', 'DB_TEST_URL must not override connection properties');
  assert.equal(target.hash, '', 'DB_TEST_URL must not include a fragment');
  const pool = createPool({ connectionString: url!, max: 4 });
  const directory = await mkdtemp(join(tmpdir(), 'soundpub-db-'));
  try {
    await pool.query('DROP SCHEMA IF EXISTS soundpub CASCADE');
    const migrations = ['0001_foundation.sql', '0002_app_grants.sql', '0003_restrict_runtime.sql', '0004_runtime_least_privilege.sql', '0005_role_authority_lock.sql'];
    for (const name of migrations) {
      await writeFile(join(directory, name), await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
    }
    const results = await Promise.all([migrate(pool, { directory }), migrate(pool, { directory })]);
    assert.equal(results.flat().length, migrations.length);
    assert.deepEqual(await migrate(pool, { directory }), []);
    const id = randomUUID();
    await assert.rejects(withTransaction(pool, async client => {
      await createRepositories(client).users.create({ id, status: 'active' });
      throw new Error('deliberate rollback');
    }), /deliberate rollback/);
    assert.equal(await createRepositories(pool).users.findById(id), null);
    await withTransaction(pool, async client => {
      await createRepositories(client).users.create({ id, status: 'active' });
      await createRepositories(client).outbox.enqueue({ topic: 'test', payload: { id }, idempotencyKey: 'first' });
    });
    assert.equal((await createRepositories(pool).users.findById(id))?.status, 'active');
    assert.equal(await createRepositories(pool).outbox.enqueue({ topic: 'test', payload: {}, idempotencyKey: 'first' }), null);
    assert.deepEqual(await sampleQueue(pool), { pending: 1, processing: 0, dead: 0, sampleLimit: 1000 });
    const idempotency = createRepositories(pool).idempotency;
    const idempotencyInput = { scope: 'test', key: 'request-1', requestHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 60_000) };
    assert.deepEqual(await idempotency.begin(idempotencyInput), { state: 'new' });
    assert.deepEqual(await idempotency.begin(idempotencyInput), { state: 'processing' });
    assert.deepEqual(await idempotency.begin({ ...idempotencyInput, requestHash: 'b'.repeat(64) }), { state: 'conflict' });
    assert.equal(await idempotency.complete({ scope: 'test', key: 'request-1', responseStatus: 202, responseBody: { id: 'one' } }), true);
    assert.deepEqual(await idempotency.begin(idempotencyInput), { state: 'completed', responseStatus: 202, responseBody: { id: 'one' } });
    await pool.query(`UPDATE soundpub.idempotency_keys SET created_at = now() - interval '2 minutes',
      expires_at = now() - interval '1 minute' WHERE scope = $1 AND key = $2`, ['test', 'request-1']);
    const reclaimedInput = { ...idempotencyInput, requestHash: 'b'.repeat(64) };
    const claims = await Promise.all([idempotency.begin(reclaimedInput), idempotency.begin(reclaimedInput)]);
    assert.deepEqual(claims.map(claim => claim.state).sort(), ['new', 'processing']);
    const reclaimed = (await pool.query(`SELECT request_hash,response_status,response_body FROM soundpub.idempotency_keys
      WHERE scope = $1 AND key = $2`, ['test', 'request-1'])).rows[0];
    assert.equal(reclaimed.request_hash, reclaimedInput.requestHash);
    assert.equal(reclaimed.response_status, null);
    assert.equal(reclaimed.response_body, null);
    assert.deepEqual(await idempotency.begin(idempotencyInput), { state: 'conflict' });
    await assert.rejects(withTransaction(pool, async db => {
      await db.query(`UPDATE soundpub.idempotency_keys SET created_at = now() - interval '2 minutes',
        expires_at = now() - interval '1 minute' WHERE scope = $1 AND key = $2`, ['test', 'request-1']);
      assert.deepEqual(await createRepositories(db).idempotency.begin(idempotencyInput), { state: 'new' });
      throw new Error('reclaim rollback');
    }), /reclaim rollback/);
    assert.deepEqual(await idempotency.begin(reclaimedInput), { state: 'processing' });
    let deliveries = 0;
    assert.equal(await pollOutbox(pool, { test: async () => { deliveries++; } }), 'processed');
    assert.equal(await pollOutbox(pool, { test: async () => { deliveries++; } }), 'idle');
    assert.equal(deliveries, 1);
    const webhook = { provider: 'mock', eventId: 'event-1', rawBody: new TextEncoder().encode('{}'), timestamp: String(Math.floor(Date.now() / 1000)) };
    const signed = { ...webhook, signature: webhookSignature('synthetic-test-secret', webhook) };
    let effects = 0;
    const effect = async () => { effects++; };
    assert.equal(await receiveWebhook(pool, signed, 'synthetic-test-secret', effect), 'accepted');
    assert.equal(await receiveWebhook(pool, signed, 'synthetic-test-secret', effect), 'duplicate');
    assert.equal(effects, 1);
    const repository = createRepositories(pool);
    await repository.identities.bind({ application_user_id: id, provider: 'mock', issuer: 'local', subject: 'one', verified_at: null });
    assert.equal(await repository.principals.findByIdentity({ issuer: 'local', subject: 'one' }), null);
    await pool.query('UPDATE soundpub.external_identities SET verified_at = now()');
    await pool.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'user',now())", [id]);
    assert.deepEqual(await repository.principals.findByIdentity({ issuer: 'local', subject: 'one' }), { id, status: 'active', roles: ['user'] });
    const guard = await pool.connect();
    const revoker = await pool.connect();
    try {
      await guard.query('BEGIN');
      await guard.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [id]);
      await revoker.query('BEGIN');
      await revoker.query("SET LOCAL lock_timeout = '150ms'");
      await assert.rejects(revoker.query('DELETE FROM soundpub.user_roles WHERE user_id = $1', [id]),
        (error: unknown) => (error as { code?: string }).code === '55P03');
    } finally {
      await revoker.query('ROLLBACK');
      await guard.query('ROLLBACK');
      revoker.release();
      guard.release();
    }
    await assert.rejects(repository.identities.bind({ application_user_id: id, provider: 'mock', issuer: 'local', subject: 'one', verified_at: new Date() }));
    const sql = await readFile(new URL('../migrations/0001_foundation.sql', import.meta.url), 'utf8');
    await writeFile(join(directory, '0001_foundation.sql'), `${sql}\n-- changed`);
    await assert.rejects(migrate(pool, { directory }), /checksum mismatch/);
    await writeFile(join(directory, '0001_foundation.sql'), sql);
    await writeFile(join(directory, '0006_failure.sql'), 'CREATE TABLE soundpub.rollback_probe(id integer); SELECT 1/0;');
    await assert.rejects(migrate(pool, { directory }));
    assert.equal((await pool.query("SELECT to_regclass('soundpub.rollback_probe') AS name")).rows[0].name, null);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM soundpub.schema_migrations')).rows[0].count, migrations.length);
    await writeFile(join(directory, '0006_failure.sql'), 'CREATE TABLE soundpub.rollback_probe(id integer);');
    assert.deepEqual(await migrate(pool, { directory }), ['0006_failure.sql']);
    await writeFile(join(directory, '0007_control.sql'), 'COMMIT;');
    await assert.rejects(migrate(pool, { directory }), /must not control transactions/);
  } finally {
    await pool.query('DROP SCHEMA IF EXISTS soundpub CASCADE');
    await pool.end();
    await rm(directory, { recursive: true, force: true });
  }
});






