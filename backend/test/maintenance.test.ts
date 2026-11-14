import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp, type ApiDependencies, type Principal } from '../src/api/index.js';
import { publicDefaults } from '../src/audit-settings/contracts.js';

test('maintenance mode enforces protected APIs and preserves explicit exceptions', async () => {
  let enabled = true;
  let authCalls = 0;
  const principals: Record<string, Principal | null> = {
    user: { id: 'user-1', status: 'active', roles: ['user'] },
    admin: { id: 'admin-1', status: 'active', roles: ['admin'] },
    superadmin: { id: 'root-1', status: 'active', roles: ['superadmin'] },
    inactive: { id: 'admin-2', status: 'inactive', roles: ['admin'] },
    invalid: null,
  };
  const deps: ApiDependencies = {
    maintenance: { isEnabled: async () => enabled },
    auth: { authenticate: async token => { authCalls++; return principals[token] ?? null; } },
    readiness: { check: async () => true },
    admin: { suspendUser: async () => undefined },
    webhooks: { receive: async ({ signature }) => signature === 'valid' },
    rateLimiter: { consume: async () => ({ allowed: true }) },
    localAuth: {
      login: async () => ({ token: 'session-token', csrfToken: 'csrf', expiresAt: new Date().toISOString(), principal: principals.user! }),
      authenticate: async () => principals.user,
      impersonation: async () => null,
      auditImpersonatedRead: async () => undefined,
      rotateCsrf: async () => ({ csrfToken: 'csrf-2', expiresAt: new Date().toISOString(), principal: principals.user! }),
      logout: async () => undefined,
      changePassword: async () => undefined,
    } as ApiDependencies['localAuth'],
    auditSettings: {
      publicSettings: async () => ({ settings: publicDefaults }),
    } as unknown as NonNullable<ApiDependencies['auditSettings']>,
    media: {
      publicDownload: async () => 'https://media.example/logo.png',
    } as unknown as NonNullable<ApiDependencies['media']>,
    publicCatalog: {
      list: async () => ({ success: true, data: [], pagination: { total: 0, limit: 12, offset: 0, hasMore: false } }),
      get: async () => { throw new Error('not used'); },
    },
  };
  const app = buildApp(deps);
  try {
    for (const token of [undefined, 'user', 'invalid', 'inactive']) {
      const response = await app.inject({ url: '/api/v1/me',
        headers: token ? { authorization: `Bearer ${token}` } : {} });
      assert.equal(response.statusCode, 503, token);
      assert.equal(response.json().error.code, 'MAINTENANCE_MODE');
      assert.equal(response.headers['retry-after'], '60');
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.json().error.requestId, response.headers['x-request-id']);
    }
    for (const token of ['admin', 'superadmin']) {
      const before = authCalls;
      const response = await app.inject({ url: '/api/v1/me', headers: { authorization: `Bearer ${token}` } });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(authCalls, before + 1, 'maintenance and handler must share authentication result');
    }
    const publicRoutes = ['/health', '/ready', '/openapi.json', '/api/v1/public/releases', '/api/v1/settings/public'];
    for (const url of publicRoutes) assert.equal((await app.inject(url)).statusCode, 200, url);
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login',
      payload: { email: 'user@example.com', password: 'password' } });
    assert.equal(login.statusCode, 200, login.body);
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    assert.equal((await app.inject({ url: '/api/v1/auth/session', headers: { cookie } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } })).statusCode, 200);
    assert.equal((await app.inject('/api/v1/settings/public-media/favicon')).statusCode, 302);
    assert.equal((await app.inject({ method: 'OPTIONS', url: '/api/v1/me' })).statusCode, 204);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/webhooks/events',
      headers: { 'content-type': 'application/json', 'x-webhook-signature': 'valid' }, payload: '{}' })).statusCode, 200);

    enabled = false;
    assert.equal((await app.inject('/api/v1/me')).statusCode, 401);
    assert.equal((await app.inject({ url: '/api/v1/me', headers: { authorization: 'Bearer user' } })).statusCode, 200);
  } finally { await app.close(); }
});

test('rate limiting runs before impersonated read audit', async () => {
  let auditCalls = 0;
  const principal: Principal = { id: '00000000-0000-4000-8000-000000000901', status: 'active', roles: ['artist'] };
  const deps: ApiDependencies = {
    auth: { authenticate: async () => null },
    readiness: { check: async () => true },
    admin: { suspendUser: async () => undefined },
    webhooks: { receive: async () => false },
    rateLimiter: { consume: async () => ({ allowed: false, retryAfterSeconds: 5 }) },
    localAuth: {
      authenticate: async () => principal,
      impersonation: async () => ({ active: true as const,
        actorUserId: '00000000-0000-4000-8000-000000000902', targetUserId: principal.id,
        reason: 'Synthetic support investigation', expiresAt: new Date(Date.now() + 60_000).toISOString() }),
      auditImpersonatedRead: async () => { auditCalls += 1; },
    } as ApiDependencies['localAuth'],
  };
  const app = buildApp(deps);
  try {
    const response = await app.inject({ url: '/api/v1/me', headers: { cookie: 'soundpub_session=synthetic' } });
    assert.equal(response.statusCode, 429, response.body);
    assert.equal(auditCalls, 0);
  } finally { await app.close(); }
});
