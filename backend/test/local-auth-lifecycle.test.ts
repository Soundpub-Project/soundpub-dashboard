import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildApp } from '../src/api/index.js';
import { hashPassword } from '../src/auth/local-crypto.js';
import { createLocalAuthService } from '../src/local-auth/index.js';
import { decryptDeliveryToken } from '../src/local-auth/delivery-crypto.js';
import { OUTBOX_TOPICS } from '../src/worker/topics.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

const migration = readFileSync(new URL('../migrations/0056_local_auth_lifecycle.sql', import.meta.url), 'utf8');

test('local auth lifecycle migration and worker registry enforce checkpoint policy', () => {
  assert.match(migration, /auth_one_time_tokens_bounded_ttl/);
  assert.match(migration, /purpose = 'email_verification'.*interval '24 hours'/s);
  assert.match(migration, /purpose = 'password_reset'.*interval '1 hour'/s);
  assert.ok(OUTBOX_TOPICS.includes('auth.email_verification.requested'));
  assert.ok(OUTBOX_TOPICS.includes('auth.password_reset.requested'));
  assert.ok(OUTBOX_TOPICS.includes('auth.password_reset.completed'));
});

test('lifecycle routes keep request responses generic and expose strict OpenAPI', async () => {
  const calls: string[] = [];
  const service = {
    login: async () => { throw new Error('unused'); }, authenticate: async () => null,
    rotateCsrf: async () => { throw new Error('unused'); }, logout: async () => {}, changePassword: async () => {},
    requestEmailVerification: async () => { calls.push('verify-request'); },
    confirmEmailVerification: async () => { calls.push('verify-confirm'); },
    requestPasswordRecovery: async () => { calls.push('recovery-request'); },
    resetRecoveredPassword: async () => { calls.push('recovery-reset'); },
  } as unknown as ReturnType<typeof createLocalAuthService>;
  const app = buildApp({ localAuth: service, auth: { authenticate: async () => null },
    readiness: { check: async () => true }, rateLimiter: { consume: async () => ({ allowed: true }) },
    admin: { suspendUser: async () => {} }, webhooks: { receive: async () => false } });
  const email = { email: 'unknown@example.test' };
  for (const url of ['/api/v1/auth/email-verification/request','/api/v1/auth/password-recovery/request']) {
    const response = await app.inject({ method: 'POST', url, payload: email });
    assert.equal(response.statusCode, 202, response.body);
    assert.deepEqual(response.json(), { status: 'accepted' });
  }
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/password-recovery/request',
    payload: { email: 'x@example.test', extra: true } })).statusCode, 400);
  const openapi = (await app.inject({ method: 'GET', url: '/openapi.json' })).json();
  assert.equal(openapi.paths['/api/v1/auth/password-recovery/request'].post.responses['202'].description, 'Success');
  assert.deepEqual(calls, ['verify-request','recovery-request']);
  await app.close();
});

const integration = dockerTestsEnabled ? test : test.skip;
integration('verification and recovery are purpose-bound, one-time, atomic and revoke sessions', async () => {
  const database = await concurrencyPostgres();
  const owner = database.owner;
  const runtime = database.runtime;
  const userId = '00000000-0000-4000-8000-000000000551';
  const email = 'lifecycle@example.test';
  const oldPassword = 'Synthetic-old-password-2026';
  const newPassword = 'Synthetic-new-password-2026';
  try {
    await owner.query(`INSERT INTO soundpub.backend_users(id,email,status) VALUES($1,$2,'active')`, [userId,email]);
    await owner.query(`INSERT INTO soundpub.local_auth_credentials(user_id,login_email,password_hash) VALUES($1,$2,$3)`,
      [userId,email,await hashPassword(oldPassword)]);
    const deliverySecret = 'synthetic-auth-delivery-secret-32-chars';
    const service = createLocalAuthService(runtime, { deliverySecret });
    const app = buildApp({ localAuth: service, auth: { authenticate: async () => null },
      readiness: { check: async () => true }, rateLimiter: { consume: async () => ({ allowed: true }) },
      admin: { suspendUser: async () => {} }, webhooks: { receive: async () => false } });

    const unknown = await app.inject({ method:'POST', url:'/api/v1/auth/password-recovery/request',
      payload:{ email:'missing@example.test' } });
    const known = await app.inject({ method:'POST', url:'/api/v1/auth/password-recovery/request', payload:{ email } });
    assert.equal(unknown.statusCode, 202);
    assert.equal(known.statusCode, 202);
    assert.deepEqual(unknown.json(), known.json());
    const resetPayload = (await owner.query(`SELECT payload FROM soundpub.outbox_events
      WHERE topic='auth.password_reset.requested' ORDER BY created_at DESC LIMIT 1`)).rows[0].payload;
    assert.equal(resetPayload.token, undefined);
    const resetToken = decryptDeliveryToken(resetPayload, deliverySecret);
    assert.equal((await app.inject({ method:'POST', url:'/api/v1/auth/email-verification/confirm',
      payload:{ token:resetToken } })).statusCode, 400);

    const login = await app.inject({ method:'POST', url:'/api/v1/auth/login', payload:{ email,password:oldPassword } });
    assert.equal(login.statusCode, 200, login.body);
    const cookie = login.headers['set-cookie'] as string;
    const reset = await app.inject({ method:'POST', url:'/api/v1/auth/password-recovery/reset',
      payload:{ token:resetToken,newPassword } });
    assert.equal(reset.statusCode, 200, reset.body);
    assert.equal((await app.inject({ method:'POST', url:'/api/v1/auth/password-recovery/reset',
      payload:{ token:resetToken,newPassword:'Synthetic-third-password-2026' } })).statusCode, 400);
    assert.equal((await app.inject({ method:'GET', url:'/api/v1/auth/session', headers:{ cookie } })).statusCode, 401);
    assert.equal((await app.inject({ method:'POST', url:'/api/v1/auth/login', payload:{ email,password:oldPassword } })).statusCode, 401);
    assert.equal((await app.inject({ method:'POST', url:'/api/v1/auth/login', payload:{ email,password:newPassword } })).statusCode, 200);

    await app.inject({ method:'POST', url:'/api/v1/auth/email-verification/request', payload:{ email } });
    const verifyPayload = (await owner.query(`SELECT payload FROM soundpub.outbox_events
      WHERE topic='auth.email_verification.requested' ORDER BY created_at DESC LIMIT 1`)).rows[0].payload;
    assert.equal(verifyPayload.token, undefined);
    const verifyToken = decryptDeliveryToken(verifyPayload, deliverySecret);
    assert.equal((await app.inject({ method:'POST', url:'/api/v1/auth/email-verification/confirm',
      payload:{ token:verifyToken } })).statusCode, 200);
    assert.equal((await owner.query('SELECT email_verified_at IS NOT NULL verified FROM soundpub.backend_users WHERE id=$1',[userId])).rows[0].verified,true);

    await owner.query(`CREATE FUNCTION soundpub.reject_auth_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.topic='auth.password_reset.requested' THEN RAISE EXCEPTION 'synthetic auth outbox failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_auth_outbox BEFORE INSERT ON soundpub.outbox_events FOR EACH ROW EXECUTE FUNCTION soundpub.reject_auth_outbox()`);
    const before = (await owner.query(`SELECT
      (SELECT count(*) FROM soundpub.auth_one_time_tokens) tokens,
      (SELECT count(*) FROM soundpub.audit_logs) audits`)).rows[0];
    assert.equal((await app.inject({ method:'POST', url:'/api/v1/auth/password-recovery/request', payload:{ email } })).statusCode,500);
    assert.deepEqual((await owner.query(`SELECT
      (SELECT count(*) FROM soundpub.auth_one_time_tokens) tokens,
      (SELECT count(*) FROM soundpub.audit_logs) audits`)).rows[0],before);
    await app.close();
  } finally { await database.close(); }
});
