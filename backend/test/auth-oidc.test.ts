import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { createConfiguredIdentityProvider, OidcIdentityProvider } from '../src/auth/providers.js';

const issuer = 'https://sso.example.test/realms/partner';
const audience = 'soundpub-dashboard';
const jwksUrl = 'https://sso.example.test/realms/partner/protocol/openid-connect/certs';
const now = Date.UTC(2026, 10, 4, 12, 0, 0);
const keyPair = (kid: string) => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { ...pair, jwk: { ...pair.publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' } };
};
const first = keyPair('key-one');
const second = keyPair('key-two');

function token(pair: typeof first, claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}) {
  const encodedHeader = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: pair.jwk.kid, ...header })).toString('base64url');
  const encodedClaims = Buffer.from(JSON.stringify({ iss: issuer, sub: 'partner-user-123', aud: audience,
    exp: Math.floor(now / 1000) + 300, ...claims })).toString('base64url');
  const signature = sign('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedClaims}`), pair.privateKey).toString('base64url');
  return `${encodedHeader}.${encodedClaims}.${signature}`;
}

test('OIDC provider verifies RS256 issuer, audience, expiry and caches JWKS', async () => {
  let requests = 0;
  const provider = new OidcIdentityProvider({ environment: 'production', issuer, audience, jwksUrl }, async (url, options) => {
    requests++;
    assert.equal(url, jwksUrl);
    assert.equal(options?.redirect, 'error');
    return Response.json({ keys: [first.jwk] });
  }, () => now);
  assert.deepEqual(await provider.verifyAccessToken(token(first)), { issuer, subject: 'partner-user-123' });
  assert.deepEqual(await provider.verifyAccessToken(token(first, { sub: 'next-user' })), { issuer, subject: 'next-user' });
  assert.equal(requests, 1);
  for (const invalid of [
    token(first, { iss: 'https://evil.example.test/realms/partner' }),
    token(first, { aud: 'other-client' }),
    token(first, { exp: Math.floor(now / 1000) - 31 }),
    token(first, { nbf: Math.floor(now / 1000) + 31 }),
    token(second),
  ]) assert.equal(await provider.verifyAccessToken(invalid), null);
  assert.equal(await provider.verifyAccessToken('not.a.jwt'), null);
});

test('Keycloak partner tokens require authorized client and nonempty client roles', async () => {
  const clientId = 'Soundpub';
  const provider = new OidcIdentityProvider({ environment: 'production', issuer, audience, jwksUrl, clientId },
    async () => Response.json({ keys: [first.jwk] }), () => now);
  const valid = { azp: clientId, resource_access: { [clientId]: { roles: ['artist'] } } };
  assert.deepEqual(await provider.verifyAccessToken(token(first, valid)), { issuer, subject: 'partner-user-123' });
  for (const invalid of [
    { ...valid, azp: 'another-client' },
    { ...valid, resource_access: { [clientId]: { roles: [] } } },
    { ...valid, resource_access: { 'another-client': { roles: ['artist'] } } },
    { ...valid, resource_access: { [clientId]: { roles: [42] } } },
    { azp: clientId },
  ]) assert.equal(await provider.verifyAccessToken(token(first, invalid)), null);
  assert.throws(() => new OidcIdentityProvider({ environment: 'production', issuer, audience, jwksUrl, clientId: 'bad id' }));
  assert.ok(createConfiguredIdentityProvider({ NODE_ENV: 'production', IDENTITY_PROVIDER: 'oidc',
    OIDC_ISSUER: issuer, OIDC_AUDIENCE: audience, OIDC_JWKS_URL: jwksUrl, OIDC_CLIENT_ID: clientId }) instanceof OidcIdentityProvider);
  assert.throws(() => createConfiguredIdentityProvider({ NODE_ENV: 'production', IDENTITY_PROVIDER: 'oidc',
    OIDC_ISSUER: issuer, OIDC_AUDIENCE: audience, OIDC_JWKS_URL: jwksUrl, OIDC_CLIENT_ID: '' }));
});
test('OIDC authorization code exchange binds PKCE, redirect and verified access token', async () => {
  const clientId = 'Soundpub';
  const accessToken = token(first, { azp: clientId, resource_access: { [clientId]: { roles: ['artist'] } } });
  const calls: Array<{ url: string; options?: RequestInit }> = [];
  const provider = new OidcIdentityProvider({ environment: 'production', issuer, audience, jwksUrl, clientId,
    clientSecret: 'synthetic-client-secret' }, async (url, options) => {
      calls.push({ url: String(url), options });
      return String(url).endsWith('/token') ? Response.json({ access_token: accessToken }) : Response.json({ keys: [first.jwk] });
    }, () => now);
  const input = { code: 'authorization-code-2026', redirectUri: 'https://dashboard.example.test/auth',
    codeVerifier: 'v'.repeat(43) };
  const authorizationUrl = provider.createAuthorizationUrl({ redirectUri: input.redirectUri, state: 's'.repeat(43),
    codeChallenge: 'c'.repeat(43) }, ['https://dashboard.example.test']);
  assert.ok(authorizationUrl);
  const authorization = new URL(authorizationUrl);
  assert.equal(authorization.searchParams.get('client_id'), clientId);
  assert.equal(authorization.searchParams.get('state'), 's'.repeat(43));
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.deepEqual(await provider.exchangeAuthorizationCode(input, ['https://dashboard.example.test']),
    { issuer, subject: 'partner-user-123' });
  assert.equal(calls[0]?.url, `${issuer}/protocol/openid-connect/token`);
  assert.equal(calls[0]?.options?.method, 'POST');
  assert.equal(calls[0]?.options?.redirect, 'error');
  const body = calls[0]?.options?.body as URLSearchParams;
  assert.equal(body.get('client_id'), clientId);
  assert.equal(body.get('client_secret'), 'synthetic-client-secret');
  assert.equal(body.get('redirect_uri'), input.redirectUri);
  assert.equal(body.get('code_verifier'), input.codeVerifier);
  assert.equal(calls[1]?.url, jwksUrl);
  for (const invalid of [
    { ...input, code: 'short' }, { ...input, codeVerifier: 'short' },
    { ...input, redirectUri: 'https://evil.example.test/auth' },
    { ...input, redirectUri: 'https://dashboard.example.test/other' },
    { ...input, redirectUri: 'https://dashboard.example.test/auth?token=leak' },
  ]) assert.equal(await provider.exchangeAuthorizationCode(invalid, ['https://dashboard.example.test']), null);
  assert.equal(provider.createAuthorizationUrl({ redirectUri: 'https://evil.example.test/auth', state: 's'.repeat(43),
    codeChallenge: 'c'.repeat(43) }, ['https://dashboard.example.test']), null);
  const oversized = new OidcIdentityProvider({ environment: 'production', issuer, audience, jwksUrl, clientId },
    async (url) => String(url).endsWith('/token')
      ? new Response(JSON.stringify({ access_token: 'x'.repeat(70_000) }), { headers: { 'content-type': 'application/json' } })
      : Response.json({ keys: [first.jwk] }), () => now);
  assert.equal(await oversized.exchangeAuthorizationCode(input, ['https://dashboard.example.test']), null);
  assert.throws(() => new OidcIdentityProvider({ environment: 'production', issuer, audience, jwksUrl,
    clientSecret: 'secret-without-client' }));
});
test('OIDC provider exposes canonical issuer without trailing slash', () => {
  const provider = new OidcIdentityProvider({ environment: 'production', issuer: `${issuer}/`, audience, jwksUrl });
  assert.equal(provider.configuredIssuer(), issuer);
});
test('OIDC provider refreshes JWKS once for unknown rotated kid', async () => {
  let requests = 0;
  const provider = new OidcIdentityProvider({ environment: 'production', issuer, audience, jwksUrl }, async () => {
    requests++;
    return Response.json({ keys: requests === 1 ? [first.jwk] : [second.jwk] });
  }, () => now);
  assert.deepEqual(await provider.verifyAccessToken(token(first)), { issuer, subject: 'partner-user-123' });
  assert.deepEqual(await provider.verifyAccessToken(token(second)), { issuer, subject: 'partner-user-123' });
  assert.equal(requests, 2);
});

test('OIDC provider fails closed on bad JWKS, signature and endpoint configuration', async () => {
  const badParts = token(first).split('.');
  badParts[2] = (badParts[2]![0] === 'A' ? 'B' : 'A') + badParts[2]!.slice(1);
  const badSignature = badParts.join('.');
  const provider = new OidcIdentityProvider({ environment: 'production', issuer, audience, jwksUrl },
    async () => Response.json({ keys: [first.jwk] }), () => now);
  assert.equal(await provider.verifyAccessToken(badSignature), null);
  for (const response of [new Response(null, { status: 503 }), Response.json({}), Response.json({ keys: [] }),
    Response.json({ keys: [{ kid: 'bad', kty: 'EC' }] })]) {
    const unavailable = new OidcIdentityProvider({ environment: 'production', issuer, audience, jwksUrl }, async () => response, () => now);
    assert.equal(await unavailable.verifyAccessToken(token(first)), null);
  }
  assert.throws(() => new OidcIdentityProvider({ environment: 'production', issuer: 'http://sso.example.test/realm', audience, jwksUrl }));
  assert.throws(() => new OidcIdentityProvider({ environment: 'production', issuer, audience, jwksUrl: 'https://evil.example.test/certs' }));
  assert.throws(() => new OidcIdentityProvider({ environment: 'development', issuer: 'http://sso.example.test/realm', audience, jwksUrl: 'http://sso.example.test/certs' }));
  assert.throws(() => new OidcIdentityProvider({ environment: 'production', issuer, audience: '', jwksUrl }));
  assert.ok(createConfiguredIdentityProvider({ NODE_ENV: 'production', IDENTITY_PROVIDER: 'oidc',
    OIDC_ISSUER: issuer, OIDC_AUDIENCE: audience, OIDC_JWKS_URL: jwksUrl }) instanceof OidcIdentityProvider);
});
