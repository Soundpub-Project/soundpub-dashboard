import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/api/index.js';
import { hashPassword } from '../src/auth/local-crypto.js';
import { createPool, migrate } from '../src/db/index.js';
import { createLocalAuthService } from '../src/local-auth/index.js';

const ownerUrl = process.env.LOCAL_AUTH_DB_TEST_URL;
const runtimeUrl = process.env.LOCAL_AUTH_DB_RUNTIME_URL;

function cookieToken(setCookie: string) {
  return setCookie.slice('soundpub_session='.length, setCookie.indexOf(';'));
}

test('secure impersonation revokes parent, enforces read-only access, restores fresh authority, and audits actor',
  { skip: !ownerUrl }, async () => {
    assert.ok(runtimeUrl, 'LOCAL_AUTH_DB_RUNTIME_URL required');
    for (const value of [ownerUrl!, runtimeUrl]) {
      const url = new URL(value);
      assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
      assert.match(url.pathname, /^\/soundpub_test_local_auth[a-zA-Z0-9_]*$/);
      assert.equal(url.search, '');
    }
    const owner = createPool({ connectionString: ownerUrl });
    const runtime = createPool({ connectionString: runtimeUrl });
    const superadminId = '00000000-0000-4000-8000-000000000701';
    const artistId = '00000000-0000-4000-8000-000000000702';
    const adminId = '00000000-0000-4000-8000-000000000703';
    const inactiveId = '00000000-0000-4000-8000-000000000704';
    const secondSuperadminId = '00000000-0000-4000-8000-000000000705';
    const password = 'Synthetic-impersonation-password-2026';
    let closeApp: (() => Promise<unknown>) | undefined;
    try {
      await owner.query('DROP SCHEMA IF EXISTS soundpub CASCADE');
      const applied = await migrate(owner);
      assert.ok(applied.includes('0061_auth_impersonations.sql'));
      assert.ok(applied.includes('0062_auth_impersonation_history_snapshots.sql'));
      const passwordHash = await hashPassword(password);
      for (const [id, email, status, role] of [
        [superadminId, 'superadmin@example.test', 'active', 'superadmin'],
        [artistId, 'artist@example.test', 'active', 'artist'],
        [adminId, 'admin@example.test', 'active', 'admin'],
        [inactiveId, 'inactive-artist@example.test', 'inactive', 'artist'],
        [secondSuperadminId, 'second-superadmin@example.test', 'active', 'superadmin'],
      ] as const) {
        await owner.query('INSERT INTO soundpub.backend_users(id,email,status) VALUES($1,$2,$3)', [id, email, status]);
        await owner.query(`INSERT INTO soundpub.local_auth_credentials(user_id,login_email,password_hash)
          VALUES($1,$2,$3)`, [id, email, passwordHash]);
        await owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,$2,now())`, [id, role]);
      }
      const localAuth = createLocalAuthService(runtime, { deliverySecret: 'synthetic-auth-delivery-secret-32-chars' });
      const app = buildApp({
        localAuth,
        auth: { authenticate: async () => ({ id: secondSuperadminId, status: 'active', roles: ['superadmin'] }) },
        readiness: { check: async () => true },
        rateLimiter: { consume: async () => ({ allowed: true }) },
        admin: { suspendUser: async () => undefined },
        webhooks: { receive: async () => false },
      });
      closeApp = () => app.close();
      const login = async (email: string) => {
        const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
        assert.equal(response.statusCode, 200, response.body);
        return { cookie: response.headers['set-cookie'] as string, csrf: response.json().csrfToken as string };
      };
      const start = (session: { cookie: string; csrf: string }, targetUserId: string, currentPassword = password) => app.inject({
        method: 'POST', url: '/api/v1/admin/impersonations',
        headers: { cookie: session.cookie, 'x-csrf-token': session.csrf },
        payload: { targetUserId, reason: 'Investigasi tiket SUPPORT-1234', currentPassword },
      });

      const artistSession = await login('artist@example.test');
      assert.equal((await start(artistSession, superadminId)).statusCode, 403);
      const actor = await login('superadmin@example.test');
      assert.equal((await start(actor, artistId, 'wrong-password')).statusCode, 401);
      assert.equal((await start(actor, superadminId)).statusCode, 409);
      assert.equal((await start(actor, adminId)).statusCode, 403);
      assert.equal((await start(actor, inactiveId)).statusCode, 403);

      const started = await start(actor, artistId);
      assert.equal(started.statusCode, 200, started.body);
      const childCookie = started.headers['set-cookie'] as string;
      const childCsrf = started.json().csrfToken as string;
      assert.match(childCookie, /Max-Age=900$/);
      assert.deepEqual(started.json().user, { id: artistId, roles: ['artist'] });
      assert.deepEqual(started.json().impersonation, {
        active: true, actorUserId: superadminId, targetUserId: artistId,
        reason: 'Investigasi tiket SUPPORT-1234', expiresAt: started.json().expiresAt,
      });
      assert.equal(JSON.stringify(started.json()).includes(password), false);
      assert.equal((await app.inject({ method: 'GET', url: '/api/v1/auth/session',
        headers: { cookie: actor.cookie } })).statusCode, 401);
      const competingActor = await login('second-superadmin@example.test');
      const conflict = await start(competingActor, artistId);
      assert.equal(conflict.statusCode, 409, conflict.body);
      const childMe = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: childCookie } });
      assert.equal(childMe.statusCode, 200, childMe.body);
      assert.deepEqual(childMe.json(), { id: artistId, roles: ['artist'] });
      const bearerChildMe = await app.inject({ method: 'GET', url: '/api/v1/me', headers: {
        cookie: childCookie, authorization: 'Bearer valid-superadmin-token',
      } });
      assert.equal(bearerChildMe.statusCode, 200, bearerChildMe.body);
      assert.deepEqual(bearerChildMe.json(), { id: artistId, roles: ['artist'] });
      const blocked = await app.inject({ method: 'POST', url: `/api/v1/admin/users/${adminId}/suspend`,
        headers: { cookie: childCookie, 'x-csrf-token': childCsrf }, payload: { reason: 'Must be blocked' } });
      assert.equal(blocked.statusCode, 403, blocked.body);
      assert.equal(blocked.json().error.code, 'IMPERSONATION_READ_ONLY');
      assert.equal((await start({ cookie: childCookie, csrf: childCsrf }, inactiveId)).json().error.code,
        'IMPERSONATION_READ_ONLY');

      const staleStop = await app.inject({ method: 'POST', url: '/api/v1/admin/impersonations/stop',
        headers: { cookie: childCookie, 'x-csrf-token': 'x'.repeat(43) } });
      assert.equal(staleStop.statusCode, 403, staleStop.body);
      assert.equal(staleStop.headers['set-cookie'], undefined);
      assert.equal((await app.inject({ method: 'GET', url: '/api/v1/me',
        headers: { cookie: childCookie } })).statusCode, 200);

      const refreshed = await app.inject({ method: 'GET', url: '/api/v1/auth/session', headers: { cookie: childCookie } });
      assert.equal(refreshed.statusCode, 200, refreshed.body);
      assert.equal(refreshed.json().impersonation.actorUserId, superadminId);
      const stopped = await app.inject({ method: 'POST', url: '/api/v1/admin/impersonations/stop',
        headers: { cookie: childCookie, 'x-csrf-token': refreshed.json().csrfToken } });
      assert.equal(stopped.statusCode, 200, stopped.body);
      assert.deepEqual(stopped.json().user, { id: superadminId, roles: ['superadmin'] });
      assert.equal(stopped.json().impersonation, null);
      assert.match(stopped.headers['set-cookie'] as string, /Max-Age=21600$/);
      assert.equal((await app.inject({ method: 'GET', url: '/api/v1/auth/session',
        headers: { cookie: childCookie } })).statusCode, 401);

      const audits = await owner.query<{ action: string; actor_user_id: string; target: string }>(`
        SELECT action,actor_user_id,metadata->>'target_user_id' AS target FROM soundpub.audit_logs
        WHERE action IN ('auth.impersonation_started','auth.impersonation_stopped') ORDER BY created_at`);
      assert.deepEqual(audits.rows, [
        { action: 'auth.impersonation_started', actor_user_id: superadminId, target: artistId },
        { action: 'auth.impersonation_stopped', actor_user_id: superadminId, target: artistId },
      ]);
      assert.ok((await owner.query<{ count: number }>(`SELECT count(*)::int AS count FROM soundpub.audit_logs
        WHERE action='auth.impersonation_read' AND actor_user_id=$1 AND metadata->>'target_user_id'=$2`,
      [superadminId, artistId])).rows[0]!.count >= 2);

      const restored = { cookie: stopped.headers['set-cookie'] as string, csrf: stopped.json().csrfToken as string };
      const second = await start(restored, artistId);
      assert.equal(second.statusCode, 200, second.body);
      await owner.query(`DELETE FROM soundpub.user_roles WHERE user_id=$1 AND role='superadmin'`, [superadminId]);
      const deniedStop = await app.inject({ method: 'POST', url: '/api/v1/admin/impersonations/stop',
        headers: { cookie: second.headers['set-cookie'] as string, 'x-csrf-token': second.json().csrfToken } });
      assert.equal(deniedStop.statusCode, 403, deniedStop.body);
      assert.match(deniedStop.headers['set-cookie'] as string, /Max-Age=0$/);
      assert.equal(await localAuth.authenticate(cookieToken(second.headers['set-cookie'] as string)), null);
      const invalidationAudit = await owner.query<{ count: number }>(`SELECT count(*)::int AS count
        FROM soundpub.audit_logs WHERE action='auth.impersonation_invalidated' AND actor_user_id=$1`, [superadminId]);
      assert.equal(invalidationAudit.rows[0]!.count, 1);

      await owner.query(`UPDATE soundpub.backend_users SET status='inactive' WHERE id=$1`, [artistId]);
      await owner.query('DELETE FROM soundpub.user_roles WHERE user_id=$1', [artistId]);
      await owner.query('DELETE FROM soundpub.backend_users WHERE id=$1', [artistId]);
      const retainedHistory = await owner.query(`SELECT actor_user_id,target_user_id,
        actor_user_id_snapshot,target_user_id_snapshot,impersonated_session_id
        FROM soundpub.auth_impersonations ORDER BY created_at LIMIT 1`);
      assert.equal(retainedHistory.rows[0]!.actor_user_id, superadminId);
      assert.equal(retainedHistory.rows[0]!.target_user_id, null);
      assert.equal(retainedHistory.rows[0]!.actor_user_id_snapshot, superadminId);
      assert.equal(retainedHistory.rows[0]!.target_user_id_snapshot, artistId);
      assert.equal(retainedHistory.rows[0]!.impersonated_session_id, null);

      const activeHistory = await owner.query(`SELECT id FROM soundpub.auth_impersonations
        WHERE ended_at IS NULL ORDER BY created_at DESC LIMIT 1`);
      assert.equal(activeHistory.rowCount, 0);
      await owner.query('DELETE FROM soundpub.backend_users WHERE id=$1', [superadminId]);
      const actorDeletedHistory = await owner.query(`SELECT actor_user_id,initiating_session_id,
        actor_user_id_snapshot,target_user_id_snapshot FROM soundpub.auth_impersonations ORDER BY created_at LIMIT 1`);
      assert.equal(actorDeletedHistory.rows[0]!.actor_user_id, null);
      assert.equal(actorDeletedHistory.rows[0]!.initiating_session_id, null);
      assert.equal(actorDeletedHistory.rows[0]!.actor_user_id_snapshot, superadminId);
      assert.equal(actorDeletedHistory.rows[0]!.target_user_id_snapshot, artistId);
    } finally {
      await closeApp?.();
      await owner.query('DROP SCHEMA IF EXISTS soundpub CASCADE');
      await runtime.end();
      await owner.end();
    }
  });
