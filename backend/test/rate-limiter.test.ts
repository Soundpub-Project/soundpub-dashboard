import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Pool } from 'pg';
import { createSharedRateLimiter, rateLimitForRoute } from '../src/api/rate-limiter.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

const migration = readFileSync(new URL('../migrations/0058_shared_rate_limits.sql', import.meta.url), 'utf8');

test('shared limiter migration stores only hashed keys and grants narrow runtime access', () => {
  assert.match(migration, /key_hash text PRIMARY KEY CHECK \(length\(key_hash\) = 64\)/);
  assert.match(migration, /REVOKE ALL ON soundpub\.rate_limit_windows FROM PUBLIC, soundpub_app/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON soundpub\.rate_limit_windows TO soundpub_app/);
  assert.equal(rateLimitForRoute('/api/v1/auth/login'), 10);
  assert.equal(rateLimitForRoute('/api/v1/me'), 60);
  assert.equal(rateLimitForRoute('/api/v1/catalog'), 300);
});

test('shared limiter fails closed when storage is unavailable', async () => {
  const unavailable = { query: async () => { throw new Error('database unavailable'); } } as unknown as Pool;
  await assert.rejects(createSharedRateLimiter(unavailable).consume({ key: '198.51.100.1', route: '/api/v1/auth/login' }),
    /database unavailable/);
});

const integration = dockerTestsEnabled ? test : test.skip;
integration('shared limiter is atomic across service instances and resets expired windows', async () => {
  const database = await concurrencyPostgres();
  try {
    const first = createSharedRateLimiter(database.runtime);
    const second = createSharedRateLimiter(database.runtime);
    const key = '203.0.113.44';
    const route = '/api/v1/auth/login';
    const outcomes = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      (index % 2 ? first : second).consume({ key, route })));
    assert.equal(outcomes.filter(result => result.allowed).length, 10);
    assert.equal(outcomes.filter(result => !result.allowed).length, 2);
    assert.ok(outcomes.filter(result => !result.allowed).every(result => (result.retryAfterSeconds ?? 0) > 0));
    const row = (await database.owner.query('SELECT key_hash,hits FROM soundpub.rate_limit_windows')).rows[0];
    assert.equal(row.hits, 12);
    assert.equal(row.key_hash.length, 64);
    assert.notEqual(row.key_hash, key);
    assert.deepEqual(await second.consume({ key, route: '/api/v1/me' }), { allowed: true });
    assert.deepEqual(await first.consume({ key: '198.51.100.2', route }), { allowed: true });
    assert.equal((await database.owner.query('SELECT count(*) FROM soundpub.rate_limit_windows')).rows[0].count, '3');
    await database.owner.query("UPDATE soundpub.rate_limit_windows SET reset_at=clock_timestamp()-interval '1 second'");
    assert.deepEqual(await first.consume({ key, route }), { allowed: true });
    assert.equal((await database.owner.query('SELECT hits FROM soundpub.rate_limit_windows')).rows[0].hits, 1);
    await database.owner.query("UPDATE soundpub.rate_limit_windows SET reset_at=clock_timestamp()-interval '2 minutes'");
    assert.deepEqual(await createSharedRateLimiter(database.runtime).consume({ key: '198.51.100.9', route }), { allowed: true });
    assert.equal((await database.owner.query('SELECT count(*) FROM soundpub.rate_limit_windows')).rows[0].count, '1');
    await assert.rejects(database.runtime.query("INSERT INTO soundpub.rate_limit_windows(key_hash,hits,reset_at) VALUES('raw-ip',1,now())"));
  } finally { await database.close(); }
});
