import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { OidcIdentityProvider } from '../src/auth/providers.js';
import test from 'node:test';
import { buildApp } from '../src/api/index.js';
import { createLocalAuthService } from '../src/local-auth/index.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

const labelId = '00000000-0000-4000-8000-000000000661';
const artistId = '00000000-0000-4000-8000-000000000662';
const otherLabelId = '00000000-0000-4000-8000-000000000663';
const issuer = 'https://sso.example.test/realms/partner';
const subject = 'synthetic-partner-artist';
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKey = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'partner-test', use: 'sig', alg: 'RS256' };
const clientId = 'Soundpub';
function signedAccessToken(claims: Record<string, unknown> = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: publicKey.kid, typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: issuer, sub: subject, aud: 'soundpub-dashboard',
    azp: clientId, resource_access: { [clientId]: { roles: ['artist'] } },
    exp: Math.floor(Date.now() / 1000) + 300, ...claims })).toString('base64url');
  return `${header}.${payload}.${sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), pair.privateKey).toString('base64url')}`;
}

const integration = dockerTestsEnabled ? test : test.skip;
integration('partner session requires verified ICCN binding, active artist and owning label', async () => {
  const database = await concurrencyPostgres();
  const { owner, runtime } = database;
  try {
    for (const [id, email] of [[labelId, 'partner-label@example.test'], [artistId, 'partner-artist@example.test'],
      [otherLabelId, 'other-partner-label@example.test']]) {
      await owner.query("INSERT INTO soundpub.backend_users(id,email,status) VALUES ($1,$2,'active')", [id, email]);
    }
    await owner.query("INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,'ICCN Label'),($2,'Other Label')", [labelId, otherLabelId]);
    await owner.query("INSERT INTO soundpub.profiles(id,full_name,parent_label_id,sso_provider) VALUES ($1,'Partner Artist',$2,'iccn')",
      [artistId, labelId]);
    await owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'label',now()),($2,'label',now()),($3,'artist',now())",
      [labelId, otherLabelId, artistId]);
    await owner.query("INSERT INTO soundpub.artist_profiles(user_id,artist_name) VALUES ($1,'Partner Artist')", [artistId]);
    await owner.query("INSERT INTO soundpub.artists(label_id,artist_user_id,name) VALUES ($1,$2,'Partner Artist')",
      [labelId, artistId]);
    await owner.query(`INSERT INTO soundpub.external_identities(application_user_id,provider,issuer,subject,verified_at)
      VALUES ($1,'iccn',$2,$3,now())`, [artistId, issuer, subject]);
    const localAuth = createLocalAuthService(runtime, { deliverySecret: 'synthetic-partner-delivery-secret-32-chars' });
    const identity = { issuer, subject };
    const provider = new OidcIdentityProvider({ environment: 'test', issuer, audience: 'soundpub-dashboard',
      jwksUrl: `${issuer}/protocol/openid-connect/certs`, clientId },
    async () => Response.json({ keys: [publicKey] }));
    const accessToken = signedAccessToken();
    const app = buildApp({ localAuth, partnerAuth: { labelId,
      verify: token => provider.verifyAccessToken(token) }, auth: { authenticate: async () => null },
      readiness: { check: async () => true }, rateLimiter: { consume: async () => ({ allowed: true }) },
      admin: { suspendUser: async () => {} }, webhooks: { receive: async () => false } });
    const login = () => app.inject({ method: 'POST', url: '/api/v1/auth/partner', payload: { accessToken } });
    try {
      assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/partner',
        payload: { accessToken: 'bad.token.signature' } })).statusCode, 400);
      assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/partner',
        payload: { accessToken: 'x'.repeat(100) } })).statusCode, 400);
      assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/partner',
        payload: { accessToken: signedAccessToken({ azp: 'wrong-client' }) } })).statusCode, 401);
      assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/partner',
        payload: { accessToken: signedAccessToken({ sub: 'unbound-subject' }) } })).statusCode, 401);
      const tokenParts = accessToken.split('.');
      const signature = tokenParts[2]!;
      const tamperedToken = `${tokenParts[0]}.${tokenParts[1]}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
      assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/partner',
        payload: { accessToken: tamperedToken } })).statusCode, 401);
      const success = await login();
      assert.equal(success.statusCode, 200, success.body);
      assert.deepEqual(success.json().user, { id: artistId, roles: ['artist'] });
      const cookie = success.headers['set-cookie'] as string;
      assert.match(cookie, /^soundpub_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=21600$/);
      assert.equal((await app.inject({ method: 'GET', url: '/api/v1/auth/session', headers: { cookie } })).statusCode, 200);
      assert.equal((await owner.query('SELECT count(*)::int AS count FROM soundpub.local_auth_credentials WHERE user_id=$1',
        [artistId])).rows[0].count, 0);
      assert.equal((await owner.query("SELECT count(*)::int AS count FROM soundpub.audit_logs WHERE action='auth.partner_login' AND actor_user_id=$1",
        [artistId])).rows[0].count, 1);
      await owner.query('UPDATE soundpub.external_identities SET verified_at=NULL WHERE subject=$1', [subject]);
      assert.equal((await login()).statusCode, 401);
      await owner.query('UPDATE soundpub.external_identities SET verified_at=now() WHERE subject=$1', [subject]);
      await assert.rejects(localAuth.loginPartner(identity, otherLabelId, 'wrong-label'),
        (error: unknown) => (error as { code?: string }).code === 'UNAUTHORIZED');
      await owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'admin',now())", [artistId]);
      assert.equal((await login()).statusCode, 401);
      await owner.query("DELETE FROM soundpub.user_roles WHERE user_id=$1 AND role='admin'", [artistId]);
      await owner.query('DELETE FROM soundpub.artists WHERE artist_user_id=$1', [artistId]);
      assert.equal((await login()).statusCode, 401);
      await owner.query("INSERT INTO soundpub.artists(label_id,artist_user_id,name) VALUES ($1,$2,'Partner Artist')",
        [labelId, artistId]);
      await owner.query("UPDATE soundpub.backend_users SET status='suspended' WHERE id=$1", [labelId]);
      assert.equal((await login()).statusCode, 401);
      await owner.query("UPDATE soundpub.backend_users SET status='active' WHERE id=$1", [labelId]);
      await owner.query("UPDATE soundpub.backend_users SET status='suspended' WHERE id=$1", [artistId]);
      assert.equal((await login()).statusCode, 401);
      assert.equal((await owner.query('SELECT count(*)::int AS count FROM soundpub.auth_sessions WHERE user_id=$1',
        [artistId])).rows[0].count, 1);
      const partnerOperation = (await app.inject({ method: 'GET', url: '/openapi.json' })).json()
        .paths['/api/v1/auth/partner'].post;
      assert.equal(partnerOperation.operationId, 'partnerLogin');
      assert.deepEqual(partnerOperation.requestBody.content['application/json'].schema.required, ['accessToken']);
    } finally { await app.close(); }
  } finally { await database.close(); }
});
