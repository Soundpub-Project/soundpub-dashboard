import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/api/index.js';
import type { Principal } from '../src/auth/index.js';
import { createConfiguredIdentityProvider, createIdentityAuthenticator, MockIdentityProvider, SupabaseLegacyIdentityProvider } from '../src/auth/providers.js';

const subject = '00000000-0000-4000-8000-000000000001';
const config = { environment: 'test', url: 'http://127.0.0.1:54321', apiKey: 'synthetic-anon-key' };
const identity = { issuer: `${config.url}/auth/v1`, subject };

test('legacy bridge uses trusted Auth endpoint, bearer and API key; ignores all metadata', async () => {
  const provider = new SupabaseLegacyIdentityProvider(config, async (url, options) => {
    assert.equal(url, `${config.url}/auth/v1/user`);
    assert.deepEqual(options?.headers, { apikey: config.apiKey, authorization: 'Bearer synthetic-token' });
    assert.equal(options?.redirect, 'error');
    assert.ok(options?.signal instanceof AbortSignal);
    return Response.json({ id: subject, email: 'unverified@example.test',
      role: 'superadmin', user_metadata: { id: 'forged', role: 'superadmin' },
      app_metadata: { roles: ['superadmin'] } });
  });
  assert.deepEqual(await provider.verifyAccessToken('synthetic-token'), identity);
  assert.ok(Object.isFrozen(await provider.verifyAccessToken('synthetic-token')));
});

test('invalid, expired, malformed, redirected and unavailable evidence fails closed', async () => {
  for (const status of [301, 401, 403, 429, 500]) {
    const provider = new SupabaseLegacyIdentityProvider(config, async () => new Response(null, { status }));
    assert.equal(await provider.verifyAccessToken('synthetic-token'), null);
  }
  for (const payload of [null, {}, { id: 'forged' }, { id: 123 }, { sub: subject }]) {
    const provider = new SupabaseLegacyIdentityProvider(config, async () => Response.json(payload));
    assert.equal(await provider.verifyAccessToken('synthetic-token'), null);
  }
  for (const transport of [async () => { throw new Error('private provider failure'); },
    async () => new Response('not JSON')]) {
    const provider = new SupabaseLegacyIdentityProvider(config, transport);
    assert.equal(await provider.verifyAccessToken('synthetic-token'), null);
  }
  const provider = new SupabaseLegacyIdentityProvider(config, async () => { assert.fail('invalid token must not reach transport'); });
  for (const token of ['', 'Bearer token', 'token\r\ninjected', 'x'.repeat(16385)]) {
    assert.equal(await provider.verifyAccessToken(token), null);
  }
});

test('provider configuration rejects non-isolated origins and non-development environments', () => {
  for (const url of ['https://example.test', 'http://127.0.0.1.evil.test', 'file:///tmp/auth',
    'http://user:password@localhost', 'http://localhost/auth/v1', 'http://localhost/?redirect=elsewhere', 'http://localhost/#fragment']) {
    assert.throws(() => new SupabaseLegacyIdentityProvider({ ...config, url }));
  }
  for (const environment of ['production', 'staging', 'invalid']) {
    assert.throws(() => new SupabaseLegacyIdentityProvider({ ...config, environment }));
    assert.throws(() => new MockIdentityProvider(environment));
  }
  assert.throws(() => new SupabaseLegacyIdentityProvider({ ...config, apiKey: '' }));
  assert.throws(() => createConfiguredIdentityProvider({ IDENTITY_PROVIDER: 'unknown' }));
  assert.ok(createConfiguredIdentityProvider({ NODE_ENV: 'test' }) instanceof MockIdentityProvider);
  assert.ok(createConfiguredIdentityProvider({ NODE_ENV: 'test', IDENTITY_PROVIDER: 'supabase-legacy',
    LEGACY_AUTH_URL: config.url, LEGACY_AUTH_API_KEY: config.apiKey }) instanceof SupabaseLegacyIdentityProvider);
});

test('mock mappings are immutable, exact-token only and project only issuer/subject', async () => {
  const provider = new MockIdentityProvider('test', JSON.stringify({ 'synthetic-token': { ...identity, roles: ['superadmin'] } }));
  assert.deepEqual(await provider.verifyAccessToken('synthetic-token'), identity);
  assert.equal(await provider.verifyAccessToken('unknown-token'), null);
  assert.ok(Object.isFrozen(await provider.verifyAccessToken('synthetic-token')));
  for (const raw of ['null', '[]', '{', '{"short":{}}']) assert.throws(() => new MockIdentityProvider('test', raw));
});

test('/me traverses bridge and identity repository; current DB roles/status decide every request', async () => {
  let principal: Principal | null = { id: 'local-user', roles: ['admin'], status: 'active' };
  let lookups = 0;
  const provider = new SupabaseLegacyIdentityProvider(config, async (_url, options) => {
    const headers = options?.headers as Record<string, string>;
    return headers.authorization === 'Bearer synthetic-token'
      ? Response.json({ id: subject, user_metadata: { roles: ['superadmin'] } })
      : new Response(null, { status: 401 });
  });
  const app = buildApp({
    auth: createIdentityAuthenticator(provider, { async findByIdentity(verified) {
      lookups++;
      assert.deepEqual(verified, identity);
      return principal;
    } }),
    readiness: { check: async () => true }, admin: { suspendUser: async () => {} },
    webhooks: { receive: async () => false }, rateLimiter: { consume: async () => ({ allowed: true }) },
  });
  const me = (token = 'synthetic-token') => app.inject({ url: '/api/v1/me', headers: {
    authorization: `Bearer ${token}`, 'x-user-id': 'forged', 'x-role': 'superadmin',
  } });
  try {
    assert.equal((await app.inject('/api/v1/me')).statusCode, 401);
    assert.equal((await me('forged-token')).statusCode, 401);
    assert.equal(lookups, 0);
    assert.deepEqual((await me()).json(), { id: 'local-user', roles: ['admin'] });
    principal = { id: 'local-user', roles: ['user'], status: 'active' };
    assert.deepEqual((await me()).json(), { id: 'local-user', roles: ['user'] });
    for (const status of ['inactive', 'suspended'] as const) {
      principal = { id: 'local-user', roles: ['superadmin'], status };
      assert.equal((await me()).statusCode, 403);
    }
    principal = null;
    assert.equal((await me()).statusCode, 401);
  } finally { await app.close(); }
});
