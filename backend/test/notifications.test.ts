import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { createNotificationsService } from '../src/notifications/index.js';
import { registerNotificationsRoutes } from '../src/api/notifications.js';
import type { Principal } from '../src/auth/index.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

test('notifications: own inbox, broadcast read isolation, strict API, current authority and audit atomicity', { skip: process.env.RUN_DOCKER_TESTS !== '1' }, async () => {
  const fixture = await concurrencyPostgres();
  const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
  try {
    const { owner, runtime } = fixture;
    const ids = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003'];
    const [adminId, userId, otherId] = ids as [string, string, string];
    for (const id of ids) {
      await owner.query(`INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')`, [id]);
      await owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())`, [id, id === adminId ? 'admin' : 'user']);
    }
    const admin: Principal = { id: adminId, status: 'active', roles: ['admin'] };
    const user: Principal = { id: userId, status: 'active', roles: ['user'] };
    const other: Principal = { id: otherId, status: 'active', roles: ['user'] };
    const service = createNotificationsService(runtime);
    const personal = await service.create(admin, { title: 'Private', body: 'Synthetic', recipient_user_id: userId }, 'create');
    const broadcast = await service.create(admin, { title: 'Global', body: 'Synthetic' }, 'broadcast', true);
    assert.equal((await service.list(user)).items.length, 2);
    assert.deepEqual((await service.list(other)).items.map(n => n.id), [broadcast.id]);
    assert.deepEqual((await service.list(admin)).items.map(n => n.id), [broadcast.id]);
    for (const actor of [other, admin]) await assert.rejects(service.setRead(actor, personal.id), { code: 'NOT_FOUND' });
    assert.deepEqual(await service.unreadCount(user), { count: 2 });
    const first = await service.setRead(user, broadcast.id);
    assert.deepEqual(await service.setRead(user, broadcast.id), first);
    assert.deepEqual(await service.unreadCount(other), { count: 1 });
    assert.deepEqual(await service.setRead(user, broadcast.id, false), { id: broadcast.id, read_at: null });
    const concurrent = await Promise.all([service.setRead(user, personal.id), service.setRead(user, personal.id)]);
    assert.deepEqual(concurrent[0], concurrent[1]);
    assert.deepEqual(await service.readAll(user), { updated: 1 });
    assert.deepEqual(await service.readAll(user), { updated: 0 });
    assert.deepEqual(await service.unreadCount(user), { count: 0 });
    const page = await service.list(user, { limit: 1 });
    assert.ok(page.nextCursor);
    const next = await service.list(user, { limit: 1, cursor: page.nextCursor });
    assert.equal(next.items.length, 1); assert.notEqual(next.items[0]!.id, page.items[0]!.id);
    assert.equal(next.nextCursor, null);
    for (const input of [{ recipient_user_id: otherId }, { limit: 201 }, { cursor: 'bad' }]) {
      await assert.rejects(service.list(user, input), { code: 'BAD_REQUEST' });
    }
    await assert.rejects(service.create(user, { title: 'Denied', body: 'Denied' }, 'deny', true), { code: 'FORBIDDEN' });
    await assert.rejects(service.list(user, {}, true), { code: 'FORBIDDEN' });
    await assert.rejects(service.create(admin, { title: 'x', body: 'x', sendEmail: true }, 'deny', true), { code: 'BAD_REQUEST' });
    await owner.query(`UPDATE soundpub.notifications SET metadata_safe='{"token":"SYNTHETIC_DO_NOT_EXPOSE"}' WHERE id=$1`, [personal.id]);
    assert.deepEqual((await service.list(user)).items.find(n => n.id === personal.id)!.metadata_safe, {});
    for (const status of ['inactive', 'suspended']) {
      await owner.query('UPDATE soundpub.backend_users SET status=$2 WHERE id=$1', [userId, status]);
      await assert.rejects(service.list(user), { code: 'FORBIDDEN' });
      await assert.rejects(service.readAll(user), { code: 'FORBIDDEN' });
    }
    await owner.query(`UPDATE soundpub.backend_users SET status='active' WHERE id=$1`, [userId]);
    await owner.query(`UPDATE soundpub.user_roles SET verified_at=NULL WHERE user_id=$1`, [adminId]);
    await assert.rejects(service.remove(admin, broadcast.id, 'stale'), { code: 'FORBIDDEN' });
    await owner.query(`UPDATE soundpub.user_roles SET verified_at=now() WHERE user_id=$1`, [adminId]);
    await owner.query(`CREATE FUNCTION soundpub.reject_notification_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.resource_type='notification' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_notification_audit BEFORE INSERT ON soundpub.audit_logs FOR EACH ROW EXECUTE FUNCTION soundpub.reject_notification_audit()`);
    await assert.rejects(service.create(admin, { title: 'Rollback', body: 'Rollback' }, 'rollback', true));
    assert.equal((await owner.query(`SELECT count(*)::int AS count FROM soundpub.notifications WHERE title='Rollback'`)).rows[0].count, 0);
    await owner.query('DROP TRIGGER reject_notification_audit ON soundpub.audit_logs');

    const paths = {};
    registerNotificationsRoutes(app, service, async request => {
      if (request.headers.authorization === 'Bearer user') return user;
      if (request.headers.authorization === 'Bearer admin') return admin;
      throw Object.assign(new Error('UNAUTHORIZED'), { statusCode: 401 });
    }, paths, { type: 'object', additionalProperties: true });
    const inject = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, token = 'user', payload?: object) =>
      app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });
    assert.equal((await inject('GET', '/api/v1/notifications')).statusCode, 200);
    assert.equal((await inject('GET', '/api/v1/notifications', 'anonymous')).statusCode, 401);
    assert.equal((await inject('GET', `/api/v1/notifications?recipient_user_id=${otherId}`)).statusCode, 400);
    assert.equal((await inject('GET', '/api/v1/notifications?limit=0')).statusCode, 400);
    assert.equal((await inject('POST', '/api/v1/notifications/not-uuid/read')).statusCode, 400);
    assert.equal((await inject('GET', '/api/v1/admin/notifications')).statusCode, 403);
    assert.equal((await inject('POST', '/api/v1/admin/announcements', 'admin', { title: 'API', body: 'Synthetic' })).statusCode, 200);
    assert.equal((await inject('PATCH', `/api/v1/admin/notifications/${broadcast.id}`, 'admin', { title: 'Edited', body: 'Synthetic' })).statusCode, 200);
    assert.equal((await inject('DELETE', `/api/v1/admin/notifications/${broadcast.id}`, 'admin')).statusCode, 200);
    assert.equal((await owner.query('SELECT count(*)::int AS count FROM soundpub.notification_reads WHERE notification_id=$1', [broadcast.id])).rows[0].count, 0);
    assert.equal(Object.keys(paths).length, 8);
  } finally { await app.close(); await fixture.close(); }
});
