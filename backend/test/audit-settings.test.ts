import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { ApiError } from '../src/api/types.js';
import type { Principal, Role } from '../src/auth/index.js';
import { registerAuditSettingsRoutes } from '../src/api/audit-settings.js';
import { createAuditSettingsService } from '../src/audit-settings/index.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

test('audit/settings: restricted local DB, HTTP allowlists, no secrets, concurrency and rollback', { skip: process.env.RUN_DOCKER_TESTS !== '1' }, async t => {
  const database = await concurrencyPostgres();
  const service = createAuditSettingsService(database.runtime);
  const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
  const actors = new Map<string, Principal>();
  const roles: Role[] = ['user', 'artist', 'label', 'admin', 'superadmin', 'copyright', 'whitelabel'];
  app.setErrorHandler((error, _request, reply) => {
    const status = error instanceof ApiError ? error.statusCode : (error as { statusCode?: number }).statusCode ?? 500;
    reply.code(status).send({ error: { code: error instanceof ApiError ? error.code : status === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR' } });
  });
  const paths: Record<string, Record<string, unknown>> = {};
  registerAuditSettingsRoutes(app, service, async request => {
    const actor = actors.get((request.headers.authorization ?? '').replace('Bearer ', ''));
    if (!actor) throw new ApiError(401, 'UNAUTHORIZED');
    return actor;
  }, paths, { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' } } } } });
  const call = (token: string, method: 'GET' | 'PATCH' | 'POST' | 'DELETE', path: string, payload?: object) => app.inject({
    method, url: `/api/v1/${path}`, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}),
  });
  const marker = 'NEVER_EXPOSE_SYNTHETIC_SECRET';
  try {
    for (const [index, role] of [...roles, 'inactive', 'suspended'].entries()) {
      const id = `00000000-0000-4000-8000-${String(700 + index).padStart(12, '0')}`;
      const status = role === 'inactive' || role === 'suspended' ? role : 'active';
      await database.owner.query('INSERT INTO soundpub.backend_users(id,status) VALUES ($1,$2)', [id, status]);
      await database.owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())',
        [id, roles.includes(role as Role) ? role : 'admin']);
      // Deliberately stale identity: DB check must override active status and admin claims.
      actors.set(role, { id, status: 'active', roles: roles.includes(role as Role) ? [role as Role] : ['admin'] });
    }
    const admin = actors.get('admin')!;
    const user = actors.get('user')!;
    const auditId = '00000000-0000-4000-8000-000000000900';
    await database.owner.query(`INSERT INTO soundpub.audit_logs(id,actor_user_id,action,resource_type,resource_id,request_id,metadata)
      VALUES ($1,$2::uuid,'profile.updated','backend_user',$2::uuid::text,$3,$4::jsonb)`,
    [auditId, user.id, marker, JSON.stringify({ password: marker, nested: { access_token: marker } })]);
    await database.owner.query(`INSERT INTO soundpub.audit_logs(action,resource_type,resource_id) VALUES ($1,$1,$1)`, [marker]);
    await database.owner.query('UPDATE soundpub.application_settings SET settings=$1::jsonb',
      [JSON.stringify({ smtp_password: marker, SPOTIFY_CLIENT_SECRET: marker, favicon: marker,
        auth_notice_config: { enabled: true, password: marker } })]);
    await t.test('public output excludes persisted secrets and invalid allowed values', async () => {
      const response = await call('', 'GET', 'settings/public');
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().settings.favicon, null);
      assert.equal(response.json().settings.auth_notice_config.enabled, false);
      assert.ok(!response.body.includes(marker));
      assert.ok(!response.body.includes('maintenance_enabled'));
      assert.equal((await call('', 'GET', 'settings/public?key=smtp_password')).statusCode, 400);
    });
    await t.test('auth matrix and forged actor inputs', async () => {
      for (const token of ['', ...roles, 'inactive', 'suspended']) {
        const permitted = ['admin', 'superadmin'].includes(token);
        for (const path of ['admin/audit', `admin/audit/${auditId}`, 'admin/settings']) {
          const result = await call(token, 'GET', path);
          assert.equal(result.statusCode, token === '' ? 401 : permitted ? 200 : 403, `${token} ${path} ${result.body}`);
          assert.ok(!result.body.includes(marker));
        }
        assert.equal((await call(token, 'GET', 'settings/me')).statusCode,
          token === '' ? 401 : ['inactive', 'suspended'].includes(token) ? 403 : 200);
      }
      assert.equal((await call('user', 'GET', `admin/audit?actor=${admin.id}`)).statusCode, 403);
      assert.equal((await call('user', 'GET', `settings/me?user_id=${admin.id}`)).statusCode, 400);
      for (const input of ['limit=101', 'limit=0', 'offset=-1', 'actor=bad', 'action=%27%20OR%201=1',
        'select=*', 'order=metadata', 'from=2026-01-02T00:00:00Z&to=2026-01-01T00:00:00Z']) {
        assert.equal((await call('admin', 'GET', `admin/audit?${input}`)).statusCode, 400, input);
      }
      assert.equal((await call('admin', 'GET', 'admin/audit/not-a-uuid')).statusCode, 400);
      assert.equal((await call('admin', 'GET', 'admin/audit/00000000-0000-4000-8000-000000000999')).statusCode, 404);
    });
    await t.test('audit fixed projection, filtering, bounded pages and no mutations', async () => {
      const first = (await call('admin', 'GET', 'admin/audit?limit=1')).json();
      assert.equal(first.items.length, 1);
      assert.equal(first.nextOffset, 1);
      const second = (await call('admin', 'GET', 'admin/audit?limit=1&offset=1')).json();
      assert.equal(second.items.length, 1);
      assert.notEqual(first.items[0].id, second.items[0].id);
      assert.equal(second.nextOffset, null);
      const response = await call('admin', 'GET', `admin/audit?actor=${user.id}&action=profile.updated&resource=backend_user&resource_id=${user.id}&limit=1`);
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().items.length, 1);
      await database.owner.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id)
        VALUES ($1,'payment.callback','payment_invoice',$2), ($1,'finance.adjustment.requested','finance_adjustment',$2),
          ($1,'label_custom.artist_archived','label_custom_unit',$2), ($1,'takedown.target.transitioned','takedown',$2),
          ($1,'destination.pending','payout_readiness',$2), ($1,'payout.pending','payout',$2),
          ($1,'unregistered.event','unregistered_resource',$2)`,
      [admin.id, '00000000-0000-4000-8000-000000000902']);
      const eventLabels = (await call('admin', 'GET', `admin/audit?actor=${admin.id}&limit=100`)).json().items;
      for (const [action, resource] of [['payment.callback', 'payment_invoice'],
        ['finance.adjustment.requested', 'finance_adjustment'], ['label_custom.artist_archived', 'label_custom_unit'],
        ['takedown.target.transitioned', 'takedown'], ['destination.pending', 'payout_readiness'],
        ['payout.pending', 'payout']]) {
        assert.ok(eventLabels.some((item: { action: string; resource_type: string }) => item.action === action && item.resource_type === resource));
      }
      assert.ok(eventLabels.some((item: { action: string; resource_type: string }) => item.action === 'other' && item.resource_type === 'other'));
      const detail = (await call('admin', 'GET', `admin/audit/${auditId}`)).json();
      assert.deepEqual(Object.keys(detail).sort(), ['id', 'actor_user_id', 'action', 'resource_type', 'resource_id', 'created_at'].sort());
      assert.deepEqual(response.json().items[0], detail);
      for (const method of ['POST', 'PATCH', 'DELETE'] as const) {
        assert.equal((await call('admin', method, `admin/audit/${auditId}`, {})).statusCode, 404);
      }
      await assert.rejects(database.runtime.query('DELETE FROM soundpub.audit_logs WHERE id=$1', [auditId]), /permission denied/);
      await assert.rejects(database.runtime.query("UPDATE soundpub.audit_logs SET metadata='{}' WHERE id=$1", [auditId]), /permission denied/);
    });
    await t.test('media audit labels are explicit, private payloads stay omitted', async () => {
      const mediaId = '00000000-0000-4000-8000-000000000901';
      for (const action of ['media.upload_requested', 'media.finalized', 'media.deleted', `media.${marker}`]) {
        const inserted = await database.owner.query(`INSERT INTO soundpub.audit_logs
          (actor_user_id,action,resource_type,resource_id,request_id,metadata)
          VALUES ($1,$2,'media',$3,$4,$5::jsonb) RETURNING id`,
        [user.id, action, mediaId, marker, JSON.stringify({ token: marker, object_key: marker })]);
        const response = await call('admin', 'GET', `admin/audit/${inserted.rows[0].id}`);
        assert.equal(response.statusCode, 200, response.body);
        assert.equal(response.json().resource_type, 'media');
        assert.equal(response.json().resource_id, mediaId);
        assert.equal(response.json().action, action.includes(marker) ? 'other' : action);
        assert.ok(!response.body.includes(marker));
      }
      const listed = await call('admin', 'GET', `admin/audit?resource=media&action=media.finalized&resource_id=${mediaId}`);
      assert.equal(listed.statusCode, 200, listed.body);
      assert.equal(listed.json().items.length, 1);
      assert.equal(listed.json().items[0].action, 'media.finalized');
      assert.ok(!listed.body.includes(marker));
    });
    await t.test('owner-only preferences, strict writes and admin allowlist', async () => {
      const result = await call('user', 'PATCH', 'settings/me', { version: 1, settings: { email_notif_release: false } });
      assert.equal(result.statusCode, 200, result.body);
      assert.equal(result.json().version, 2);
      assert.equal(result.json().settings.email_notif_release, false);
      assert.equal((await call('artist', 'GET', 'settings/me')).json().settings.email_notif_release, true);
      for (const settings of [{ smtp_password: marker }, { roles: ['admin'] }, { user_id: admin.id },
        { email_notif_release: 'false' }, {}, { email_notif_release: false, secret: marker }]) {
        assert.equal((await call('user', 'PATCH', 'settings/me', { version: 2, settings })).statusCode, 400);
      }
      for (const settings of [{ smtp_password: marker }, { storage_provider: 'gcs' }, { favicon: 'javascript:alert(1)' },
        { auth_notice_config: { enabled: true, token: marker } }, {}]) {
        assert.equal((await call('admin', 'PATCH', 'admin/settings', { version: 1, settings })).statusCode, 400);
      }
      assert.equal((await call('user', 'PATCH', 'admin/settings', { version: 1, settings: { maintenance_enabled: true } })).statusCode, 403);
      assert.equal((await call('admin', 'PATCH', 'admin/settings', { version: 1, settings: { maintenance_enabled: true } })).statusCode, 403);
      assert.equal((await call('admin', 'PATCH', 'admin/settings', { version: 1, settings: { min_payout_amount: '0.00' } })).statusCode, 200);
      assert.equal((await call('superadmin', 'PATCH', 'admin/settings', { version: 2, settings: { maintenance_enabled: true } })).statusCode, 200);
      assert.equal((await call('admin', 'PATCH', 'admin/settings', { version: 3, settings: { release_price_per_track: '1.00', maintenance_enabled: false } })).statusCode, 403);
      assert.ok(!(await call('admin', 'GET', 'admin/settings')).body.includes(marker));
      const saved = (await database.owner.query('SELECT settings FROM soundpub.application_settings')).rows[0].settings;
      assert.ok(!JSON.stringify(saved).includes(marker));
    });
    await t.test('concurrent versions commit once; stale DB privileges fail closed', async () => {
      const writes = await Promise.all([false, true].map(value => call('user', 'PATCH', 'settings/me',
        { version: 2, settings: { email_notif_announcement: value } })));
      assert.deepEqual(writes.map(value => value.statusCode).sort(), [200, 409]);
      await database.owner.query('DELETE FROM soundpub.user_roles WHERE user_id=$1', [admin.id]);
      assert.equal((await call('admin', 'GET', 'admin/audit')).statusCode, 403);
      assert.equal((await call('admin', 'PATCH', 'admin/settings', { version: 3, settings: { min_payout_amount: '20.00' } })).statusCode, 403);
    });
    await t.test('audit failure rolls back setting writes', async () => {
      await database.owner.query(`CREATE FUNCTION soundpub.reject_settings_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.action='user_settings.updated' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER reject_settings_audit BEFORE INSERT ON soundpub.audit_logs FOR EACH ROW EXECUTE FUNCTION soundpub.reject_settings_audit()`);
      const before = await service.userSettings(user);
      await assert.rejects(service.updateUserSettings(user, { version: before.version,
        settings: { email_notif_release: true } }, 'synthetic-rollback'), /synthetic audit failure/);
      assert.deepEqual(await service.userSettings(user), before);
    });
    assert.equal(Object.keys(paths).length, 5);
  } finally { await app.close(); await database.close(); }
});
