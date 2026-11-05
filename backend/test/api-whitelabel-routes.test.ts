import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/api/index.js';
import type { UsersService } from '../src/users/index.js';

const whitelabelId = '00000000-0000-4000-8000-000000000001';
const artistId = '00000000-0000-4000-8000-000000000002';
const actor = { id: whitelabelId, roles: ['whitelabel'] as const, status: 'active' as const };

test('whitelabel routes publish correct OpenAPI methods and dispatch authenticated requests', async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const users = {
    whitelabelDashboard: async (...args: unknown[]) => {
      calls.push({ method: 'dashboard', args });
      return { label_id: whitelabelId, subscription_status: 'active', currency: 'IDR', total_artists: 1,
        total_releases: 0, total_revenue: '0.00', artists_with_access: 0, artists_without_access: 1 };
    },
    createWhitelabelArtist: async (...args: unknown[]) => {
      calls.push({ method: 'createArtist', args });
      return { id: artistId, email: 'artist@example.test', full_name: 'Artist', phone: null, address: null,
        avatar_url: null, logo_url: null, logo_url_light: null, logo_url_dark: null, parent_label_id: whitelabelId,
        parent_label_name: 'Whitelabel', composer_code: null, balance: '0.00', status: 'active', email_verified: false,
        password_set: false, subscription_status: null, subscription_upgraded_at: null, sso_provider: null,
        artist_profile_completed: false, created_at: '2026-11-05T00:00:00Z', updated_at: '2026-11-05T00:00:00Z',
        roles: ['artist'] };
    },
    setWhitelabelArtistPassword: async (...args: unknown[]) => {
      calls.push({ method: 'setPassword', args });
      return { status: 'ok' };
    },
  } as unknown as UsersService;
  const app = buildApp({ users, auth: { authenticate: async token => token === 'whitelabel' ? actor : null },
    readiness: { check: async () => true }, rateLimiter: { consume: async () => ({ allowed: true }) },
    admin: { suspendUser: async () => {} }, webhooks: { receive: async () => false } });

  try {
    const paths = (await app.inject('/openapi.json')).json().paths;
    const expected = [
      ['/api/v1/whitelabel/dashboard', 'get'],
      ['/api/v1/whitelabel/artists', 'post'],
      ['/api/v1/whitelabel/artists/{id}/password', 'put'],
    ] as const;
    for (const [path, method] of expected) {
      assert.deepEqual(Object.keys(paths[path]), [method]);
      assert.deepEqual(paths[path][method].security, [{ bearerAuth: [] }]);
    }

    assert.equal((await app.inject('/api/v1/whitelabel/dashboard')).statusCode, 401);
    const headers = { authorization: 'Bearer whitelabel' };
    assert.equal((await app.inject({ url: '/api/v1/whitelabel/dashboard', headers })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/v1/whitelabel/artists', method: 'POST', headers,
      payload: { email: 'artist@example.test', fullName: 'Artist' } })).statusCode, 200);
    assert.equal((await app.inject({ url: `/api/v1/whitelabel/artists/${artistId}/password`, method: 'PUT', headers,
      payload: { newPassword: 'long-password-123' } })).statusCode, 200);

    assert.deepEqual(calls.map(call => call.method), ['dashboard', 'createArtist', 'setPassword']);
    assert.deepEqual(calls[0]!.args, [actor]);
    assert.deepEqual(calls[1]!.args.slice(0, 2), [actor, { email: 'artist@example.test', fullName: 'Artist' }]);
    assert.match(calls[1]!.args[2] as string, /^[0-9a-f-]{36}$/);
    assert.deepEqual(calls[2]!.args.slice(0, 3), [actor, artistId, { newPassword: 'long-password-123' }]);
    assert.match(calls[2]!.args[3] as string, /^[0-9a-f-]{36}$/);
  } finally { await app.close(); }
});
