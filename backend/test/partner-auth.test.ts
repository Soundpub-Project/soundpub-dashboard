import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { OidcIdentityProvider } from '../src/auth/providers.js';
import { createPartnerOAuthService } from '../src/auth/partner-oauth.js';
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
    const redirectUri = 'http://127.0.0.1:8281/auth';
    const partnerAuth = createPartnerOAuthService({
      createAuthorizationUrl(input, origins) {
        if (!origins.includes(new URL(input.redirectUri).origin) || new URL(input.redirectUri).pathname !== '/auth') return null;
        const url = new URL(`${issuer}/protocol/openid-connect/auth`);
        url.searchParams.set('state', input.state);
        url.searchParams.set('code_challenge', input.codeChallenge);
        return url.href;
      },
      async exchangeAuthorizationCode(input) {
        if (input.redirectUri !== redirectUri || input.codeVerifier.length !== 43) return null;
        const claims = input.code === 'wrong-client-code' ? { azp: 'wrong-client' }
          : input.code === 'unbound-subject-code' ? { sub: 'unbound-subject' } : {};
        const accessToken = signedAccessToken(claims);
        const candidate = input.code === 'tampered-signature-code'
          ? `${accessToken.slice(0, accessToken.lastIndexOf('.') + 1)}A${accessToken.slice(accessToken.lastIndexOf('.') + 2)}`
          : accessToken;
        return provider.verifyAccessToken(candidate);
      },
    }, { secret: 'synthetic-partner-transaction-secret-32-chars', allowedRedirectOrigins: ['http://127.0.0.1:8281'] });
    const app = buildApp({ localAuth, partnerAuth: { labelId, ...partnerAuth }, auth: { authenticate: async () => null },
      readiness: { check: async () => true }, rateLimiter: { consume: async () => ({ allowed: true }) },
      admin: { suspendUser: async () => {} }, webhooks: { receive: async () => false } });
    const begin = () => app.inject({ method: 'POST', url: '/api/v1/auth/partner/start', payload: { redirectUri } });
    const login = async (code = 'valid-authorization-code', stateOverride?: string) => {
      const started = await begin();
      assert.equal(started.statusCode, 200, started.body);
      const transactionCookie = (started.headers['set-cookie'] as string).split(';')[0]!;
      const state = new URL(started.json().authorizationUrl).searchParams.get('state')!;
      return app.inject({ method: 'POST', url: '/api/v1/auth/partner', headers: { cookie: transactionCookie },
        payload: { code, state: stateOverride ?? state } });
    };
    try {
      assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/partner/start',
        payload: { redirectUri: 'http://example.invalid/auth' } })).statusCode, 400);
      assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/partner',
        payload: { code: 'short', state: 's'.repeat(43) } })).statusCode, 400);
      assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/partner',
        payload: { code: 'valid-authorization-code', state: 'short' } })).statusCode, 400);
      assert.equal((await login('valid-authorization-code', 'x'.repeat(43))).statusCode, 401);
      assert.equal((await login('wrong-client-code')).statusCode, 401);
      assert.equal((await login('unbound-subject-code')).statusCode, 401);
      assert.equal((await login('tampered-signature-code')).statusCode, 401);
      const success = await login();
      assert.equal(success.statusCode, 200, success.body);
      assert.deepEqual(success.json().user, { id: artistId, roles: ['artist'] });
      const cookies = success.headers['set-cookie'] as string[];
      const cookie = cookies.find(value => value.startsWith('soundpub_session='))!;
      assert.match(cookie, /^soundpub_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=21600$/);
      assert.equal(success.headers['cache-control'], 'no-store');
      assert.equal(success.headers.pragma, 'no-cache');
      assert.equal((await app.inject({ method: 'GET', url: '/api/v1/auth/session', headers: { cookie: cookie.split(';')[0] } })).statusCode, 200);
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
      assert.deepEqual(partnerOperation.requestBody.content['application/json'].schema.required, ['code','state']);
      assert.equal((await app.inject({ method: 'GET', url: '/openapi.json' })).json()
        .paths['/api/v1/auth/partner/start'].post.operationId, 'startPartnerLogin');
    } finally { await app.close(); }
  } finally { await database.close(); }
});
