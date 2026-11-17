import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { buildApp } from '../src/api/index.js';
import { hashPassword } from '../src/auth/local-crypto.js';
import { createPool, migrate } from '../src/db/index.js';
import { createLocalAuthService } from '../src/local-auth/index.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

const ownerUrl = process.env.LOCAL_AUTH_DB_TEST_URL;
const runtimeUrl = process.env.LOCAL_AUTH_DB_RUNTIME_URL;

test('local auth persists lockout and protects cookie sessions with CSRF', { skip: !ownerUrl }, async () => {
  assert.ok(runtimeUrl, 'LOCAL_AUTH_DB_RUNTIME_URL required');
  for (const value of [ownerUrl!, runtimeUrl]) {
    const url = new URL(value);
    assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
    assert.match(url.pathname, /^\/soundpub_test_local_auth[a-zA-Z0-9_]*$/);
    assert.equal(url.search, '');
  }
  assert.equal(new URL(ownerUrl!).host, new URL(runtimeUrl).host);
  assert.equal(new URL(ownerUrl!).pathname, new URL(runtimeUrl).pathname);

  const owner = createPool({ connectionString: ownerUrl });
  const runtime = createPool({ connectionString: runtimeUrl });
  const activeId = '00000000-0000-4000-8000-000000000201';
  const lockedId = '00000000-0000-4000-8000-000000000202';
  const inactiveId = '00000000-0000-4000-8000-000000000203';
  const suspendedId = '00000000-0000-4000-8000-000000000204';
  const password = 'Synthetic-only-password-2026';
  const newPassword = 'Synthetic-new-password-2026';
  let suspendCalls = 0;

  try {
    await owner.query('DROP SCHEMA IF EXISTS soundpub CASCADE');
    assert.ok((await migrate(owner)).includes('0019_local_auth.sql'));
    const passwordHash = await hashPassword(password);
    for (const [id, email, status] of [
      [activeId, 'active@example.test', 'active'],
      [lockedId, 'lock@example.test', 'active'],
      [inactiveId, 'inactive@example.test', 'inactive'],
      [suspendedId, 'suspended@example.test', 'suspended'],
    ] as const) {
      await owner.query('INSERT INTO soundpub.backend_users(id,email,status) VALUES ($1,$2,$3)', [id, email, status]);
      await owner.query(`INSERT INTO soundpub.local_auth_credentials(user_id,login_email,password_hash)
        VALUES ($1,$2,$3)`, [id, email, passwordHash]);
    }
    await owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'admin',now())", [activeId]);

    const localAuth = createLocalAuthService(runtime, { deliverySecret: 'synthetic-auth-delivery-secret-32-chars' });
    await assert.rejects(localAuth.login({ email: 'lock@example.test', password: 'wrong-password-value' }, 'direct-probe'),
      (error: unknown) => (error as { code?: string }).code === 'UNAUTHORIZED');
    await owner.query('UPDATE soundpub.local_auth_credentials SET failed_attempts=0,locked_until=NULL WHERE user_id=$1', [lockedId]);
    await owner.query("DELETE FROM soundpub.audit_logs WHERE action='auth.login_failed' AND actor_user_id=$1", [lockedId]);

    const app = buildApp({
      localAuth,
      auth: { authenticate: async () => null },
      readiness: { check: async () => true },
      rateLimiter: { consume: async () => ({ allowed: true }) },
      admin: { suspendUser: async () => { suspendCalls += 1; } },
      webhooks: { receive: async () => false },
    });
    const login = (email: string, candidate: string) => app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { email, password: candidate },
    });

    const unknown = await login('missing@example.test', 'wrong-password-value');
    const wrong = await login('active@example.test', 'wrong-password-value');
    assert.equal(unknown.statusCode, 401);
    assert.equal(wrong.statusCode, 401);
    assert.equal(unknown.json().error.code, wrong.json().error.code);
    assert.equal(unknown.json().error.message, wrong.json().error.message);

    const successful = await login('active@example.test', password);
    assert.equal(successful.statusCode, 200, successful.body);
    const cookie = successful.headers['set-cookie'];
    assert.equal(typeof cookie, 'string');
    assert.match(cookie as string, /^soundpub_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=21600$/);
    assert.deepEqual(successful.json().user, { id: activeId, roles: ['admin'] });
    const firstCsrf = successful.json().csrfToken as string;
    const token = (cookie as string).slice('soundpub_session='.length, (cookie as string).indexOf(';'));
    assert.deepEqual(await localAuth.authenticate(token), { id: activeId, roles: ['admin'], status: 'active' });

    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: cookie as string } });
    assert.equal(me.statusCode, 200, me.body);
    assert.deepEqual(me.json(), { id: activeId, roles: ['admin'] });

    const session = await app.inject({ method: 'GET', url: '/api/v1/auth/session', headers: { cookie: cookie as string } });
    assert.equal(session.statusCode, 200, session.body);
    const currentCsrf = session.json().csrfToken as string;
    assert.notEqual(currentCsrf, firstCsrf);
    const target = '00000000-0000-4000-8000-000000000299';
    const withoutCsrf = await app.inject({ method: 'POST', url: `/api/v1/admin/users/${target}/suspend`,
      headers: { cookie: cookie as string }, payload: { reason: 'Synthetic test' } });
    assert.equal(withoutCsrf.statusCode, 401);
    const staleCsrf = await app.inject({ method: 'POST', url: `/api/v1/admin/users/${target}/suspend`,
      headers: { cookie: cookie as string, 'x-csrf-token': firstCsrf }, payload: { reason: 'Synthetic test' } });
    assert.equal(staleCsrf.statusCode, 401);
    const withCsrf = await app.inject({ method: 'POST', url: `/api/v1/admin/users/${target}/suspend`,
      headers: { cookie: cookie as string, 'x-csrf-token': currentCsrf }, payload: { reason: 'Synthetic test' } });
    assert.equal(withCsrf.statusCode, 200, withCsrf.body);
    assert.equal(suspendCalls, 1);

    const wrongCurrent = await app.inject({ method: 'POST', url: '/api/v1/auth/password',
      headers: { cookie: cookie as string, 'x-csrf-token': currentCsrf },
      payload: { currentPassword: 'wrong-password-value', newPassword } });
    assert.equal(wrongCurrent.statusCode, 401);
    const samePassword = await app.inject({ method: 'POST', url: '/api/v1/auth/password',
      headers: { cookie: cookie as string, 'x-csrf-token': currentCsrf },
      payload: { currentPassword: password, newPassword: password } });
    assert.equal(samePassword.statusCode, 409);
    const changed = await app.inject({ method: 'POST', url: '/api/v1/auth/password',
      headers: { cookie: cookie as string, 'x-csrf-token': currentCsrf } });
    assert.equal(changed.statusCode, 400);
    const changedWithBody = await app.inject({ method: 'POST', url: '/api/v1/auth/password',
      headers: { cookie: cookie as string, 'x-csrf-token': currentCsrf },
      payload: { currentPassword: password, newPassword } });
    assert.equal(changedWithBody.statusCode, 200, changedWithBody.body);
    assert.match(changedWithBody.headers['set-cookie'] as string, /Max-Age=0$/);
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/auth/session',
      headers: { cookie: cookie as string } })).statusCode, 401);
    assert.equal((await login('active@example.test', password)).statusCode, 401);
    const relogin = await login('active@example.test', newPassword);
    assert.equal(relogin.statusCode, 200, relogin.body);
    const reloginCookie = relogin.headers['set-cookie'] as string;
    const reloginCsrf = relogin.json().csrfToken as string;
    const logout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout',
      headers: { cookie: reloginCookie, 'x-csrf-token': reloginCsrf } });
    assert.equal(logout.statusCode, 200, logout.body);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      assert.equal((await login('lock@example.test', 'wrong-password-value')).statusCode, 401);
    }
    const locked = await owner.query<{ failed_attempts: number; locked: boolean }>(`SELECT failed_attempts,
      locked_until > now() AS locked FROM soundpub.local_auth_credentials WHERE user_id=$1`, [lockedId]);
    assert.deepEqual(locked.rows[0], { failed_attempts: 0, locked: true });
    assert.equal((await login('lock@example.test', password)).statusCode, 429);
    assert.equal((await login('inactive@example.test', password)).statusCode, 403);
    assert.equal((await login('suspended@example.test', password)).statusCode, 403);
    assert.equal((await owner.query("SELECT count(*)::int AS count FROM soundpub.audit_logs WHERE action='auth.login_failed' AND actor_user_id=$1",
      [lockedId])).rows[0].count, 5);

    await app.close();
  } finally {
    await owner.query('DROP SCHEMA IF EXISTS soundpub CASCADE');
    await runtime.end();
    await owner.end();
  }
});

test('local auth session timestamps remain valid across a backward database clock adjustment', {
  skip: dockerTestsEnabled ? false : 'Set RUN_DOCKER_TESTS=1 for disposable PostgreSQL',
  timeout: 120_000,
}, async t => {
  const database = await concurrencyPostgres();
  t.after(() => database.close());
  const id = randomUUID();
  const email = `clock-${id}@example.test`;
  const password = 'Synthetic-clock-password-2026';
  await database.owner.query("INSERT INTO soundpub.backend_users(id,email,status) VALUES($1,$2,'active')", [id,email]);
  await database.owner.query(`INSERT INTO soundpub.local_auth_credentials(user_id,login_email,password_hash)
    VALUES($1,$2,$3)`, [id,email,await hashPassword(password)]);
  await database.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,'admin',now())", [id]);
  const auth = createLocalAuthService(database.runtime, { deliverySecret: 'synthetic-clock-secret-32-characters' });
  const session = await auth.login({ email, password }, 'clock-login');
  await database.owner.query(`UPDATE soundpub.auth_sessions
    SET created_at=now()+interval '5 minutes',last_seen_at=now()+interval '5 minutes' WHERE user_id=$1`, [id]);
  assert.deepEqual(await auth.authenticate(session.token), { id, roles: ['admin'], status: 'active' });
  assert.ok((await auth.rotateCsrf(session.token)).csrfToken);
  assert.equal((await database.owner.query(`SELECT last_seen_at>=created_at AS valid
    FROM soundpub.auth_sessions WHERE user_id=$1`, [id])).rows[0].valid, true);
});
