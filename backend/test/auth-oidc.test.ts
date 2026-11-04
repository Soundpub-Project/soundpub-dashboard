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