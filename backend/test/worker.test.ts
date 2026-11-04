import assert from 'node:assert/strict';
import test from 'node:test';
import { once, pollOutbox, retryDelay, transaction, type SqlClient, type SqlPool } from '../src/worker/index.ts';
import { createMockProviders, providerNames } from '../src/integrations/index.ts';

function fixture(event: Record<string, unknown> | undefined = { id: '1', topic: 'email', payload: {}, idempotency_key: 'key', attempts: 0 }) {
  const statements: { sql: string; values?: unknown[] }[] = [];
  let released = false;
  let guard = false;
  const db = {
    async query(sql: string, values?: unknown[]) {
      statements.push({ sql, values });
      if (sql.includes('FOR UPDATE SKIP LOCKED')) return { rows: event ? [event] : [], rowCount: event ? 1 : 0 };
      if (sql.startsWith('INSERT INTO integration_effects')) {
        if (guard) return { rows: [], rowCount: 0 };
        guard = true;
        return { rows: [{ idempotency_key: 'key' }], rowCount: 1 };
      }
      if (sql === 'ROLLBACK TO SAVEPOINT delivery') guard = false;
      return { rows: [], rowCount: 0 };
    },
    release() { released = true; },
  };
  return { pool: { connect: async () => db } as SqlPool, db: db as SqlClient, statements, get released() { return released; } };
}

test('worker claims with SKIP LOCKED and commits guard with success', async () => {
  const f = fixture();
  let calls = 0;
  assert.equal(await pollOutbox(f.pool, { email: async () => { calls++; } }), 'processed');
  assert.equal(calls, 1);
  assert.match(f.statements[1].sql, /status = 'pending'.*available_at <= now()/s);
  assert.equal(f.statements.at(-1)?.sql, 'COMMIT');
  assert.equal(f.released, true);
  assert.equal(await once(f.db, 'outbox', 'key', async () => { calls++; }), false);
  assert.equal(calls, 1);
});

test('failed delivery rolls back effect guard then schedules bounded retry or dead letter', async () => {
  for (const attempts of [0, 4]) {
    const f = fixture({ id: '1', topic: 'email', payload: {}, idempotency_key: 'key', attempts });
    assert.equal(await pollOutbox(f.pool, { email: async () => { throw new Error('secret'); } }), attempts === 4 ? 'dead' : 'retry');
    const rollback = f.statements.findIndex(s => s.sql === 'ROLLBACK TO SAVEPOINT delivery');
    const update = f.statements.findIndex(s => s.sql.includes('last_error = $5'));
    assert.ok(rollback > 0 && update > rollback);
    assert.equal(f.statements[update].values?.[2], attempts + 1);
    assert.ok(!JSON.stringify(f.statements).includes('secret'));
    assert.equal(await once(f.db, 'outbox', 'key', async () => {}), true);
  }
  assert.equal(retryDelay(1), 1000);
  assert.equal(retryDelay(3), 4000);
  assert.equal(retryDelay(1000), 300000);
  assert.throws(() => retryDelay(0));
});

test('idle, unknown topic, invalid options and transaction failure release connections', async () => {
  const idle = fixture();
  // Empty claim result, without changing production API.
  idle.pool.connect = async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release() {} });
  assert.equal(await pollOutbox(idle.pool, {}), 'idle');
  assert.equal(await pollOutbox(fixture().pool, {}), 'retry');
  await assert.rejects(pollOutbox(fixture().pool, {}, { maxAttempts: 0 }));
  const f = fixture();
  await assert.rejects(transaction(f.pool, async () => { throw new Error('failure'); }), /failure/);
  assert.equal(f.statements.at(-1)?.sql, 'ROLLBACK');
  assert.equal(f.released, true);
});

test('all six mock providers deduplicate requests and reject changed payloads', async () => {
  const providers = createMockProviders();
  for (const name of providerNames) {
    const provider = providers[name];
    const request = { idempotencyKey: 'event-1', operation: 'test', payload: { value: 1 } };
    const result = await provider.execute(request);
    assert.equal(result.mock, true);
    assert.equal(result.provider, name);
    assert.deepEqual(await provider.execute(request), result);
    assert.equal(provider.deliveryCount, 1);
    await assert.rejects(provider.execute({ ...request, payload: { value: 2 } }), /different request/);
    await assert.rejects(provider.execute({ ...request, idempotencyKey: '' }), /required/);
  }
});

test('connection with failed rollback is discarded', async () => {
  let discarded = false;
  const pool = { connect: async () => ({
    async query(sql: string) {
      if (sql === 'ROLLBACK') throw new Error('connection lost');
      return { rows: [], rowCount: 0 };
    },
    release(discard?: boolean) { discarded = discard === true; },
  }) } as SqlPool;
  await assert.rejects(transaction(pool, async () => { throw new Error('original'); }), /original/);
  assert.equal(discarded, true);
});
