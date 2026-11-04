import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/api/index.js';
import { createPool, createRepositories, migrate, withTransaction } from '../src/db/index.js';
import { createUsersService } from '../src/users/index.js';
import { usersRepository } from '../src/users/repository.js';
import type { Principal, Role } from '../src/auth/index.js';
import pg from 'pg';
import { setTimeout } from 'node:timers/promises';
import { createOpaqueToken, digestOpaqueToken, verifyPassword } from '../src/auth/local-crypto.js';

const url = process.env.USERS_DB_TEST_URL;
test('Users migrations, runtime repositories, services, local API contracts and authorization', { skip: !url }, async t => {
  const target = new URL(url!);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
  assert.match(target.pathname, /^\/soundpub_test_users[a-zA-Z0-9_]*$/);
  assert.equal(target.search, '');
  assert.equal(target.hash, '');
  const pool = createPool({ connectionString: url!, max: 6 });
  const runtime = createPool({ connectionString: url!, max: 6,
    options: '-c role=soundpub_app -c search_path=soundpub,public -c application_name=soundpub-users-test' });
  const ids = Object.fromEntries(['user', 'artist', 'label', 'copyright', 'whitelabel', 'admin', 'superadmin',
    'peer', 'inactive', 'suspended', 'roleless', 'unverified', 'otherLabel', 'blank'].map((key, index) =>
    [key, `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`])) as Record<string, string>;
  const id = (key: string) => ids[key]!;
  const service = createUsersService(runtime);
  const principals = createRepositories(runtime).principals;
  const actor = (key: string, roles: Role[] = [key as Role]): Principal => ({ id: id(key), roles, status: 'active' });
  const app = buildApp({ users: service,
    auth: { authenticate: token => principals.findByIdentity({ issuer: 'synthetic-users', subject: token }) },
    readiness: { check: async () => true }, rateLimiter: { consume: async () => ({ allowed: true }) },
    admin: { suspendUser: async input => { await service.setStatus(input.actor, input.userId, { status: 'suspended' }, input.requestId, input.reason); } },
    webhooks: { receive: async () => false },
  });
  const request = (token: string, method: 'GET' | 'PATCH' | 'PUT' | 'POST' | 'DELETE', path: string, payload?: object) => app.inject({
    url: `/api/v1/${path}`, method, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}),
  });
  const failure = (status: number) => (error: unknown) => (error as { statusCode?: number }).statusCode === status;
  try {
    await pool.query('DROP SCHEMA IF EXISTS soundpub CASCADE');
    assert.ok((await migrate(pool)).includes('0006_user_profiles.sql'));
    assert.deepEqual(await migrate(pool), []);
    for (const [key, userId] of Object.entries(ids)) {
      await pool.query(`INSERT INTO soundpub.backend_users(id,email,status,created_at,migration_source)
        VALUES ($1,$2,$3,'2026-01-01T00:00:00.123456Z','{"private":"never expose"}')`,
      [userId, `${key}@example.test`, ['inactive', 'suspended'].includes(key) ? key : 'active']);
      await pool.query(`INSERT INTO soundpub.external_identities(application_user_id,provider,issuer,subject,verified_at)
        VALUES ($1,'mock','synthetic-users',$2,now())`, [userId, key]);
      if (key !== 'blank') await pool.query('INSERT INTO soundpub.profiles(id,full_name,phone,address) VALUES ($1,$2,$3,$4)',
        [userId, `Name ${key}`, '123', 'Synthetic address']);
      if (key !== 'roleless') await pool.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at)
        VALUES ($1,$2,CASE WHEN $3 THEN NULL ELSE now() END)`,
      [userId, ['peer'].includes(key) ? 'admin' : key === 'otherLabel' ? 'label' :
        ['inactive', 'suspended', 'unverified', 'blank'].includes(key) ? 'user' : key, key === 'unverified']);
    }
    await t.test('private profile DTO and all supported owners on synthetic local data', async () => {
      for (const token of ['user', 'artist', 'label', 'copyright', 'whitelabel', 'admin', 'superadmin', 'blank']) {
        const response = await request(token, 'GET', 'profile');
        assert.equal(response.statusCode, 200, response.body);
        const body = response.json();
        assert.equal(body.profile.id, id(token));
        assert.equal(body.profile.email, `${token}@example.test`);
        assert.equal(body.profile.status, 'active');
        assert.equal(body.profile.balance, '0.00');
        assert.equal(body.profile.created_at, '2026-01-01T00:00:00.123456Z');
        assert.deepEqual(body.roles, [token === 'blank' ? 'user' : token]);
        for (const secret of ['migration_source', 'subject', 'binding_provenance', 'parent_label_reference_id']) assert.ok(!response.body.includes(secret));
      }
      for (const token of ['bad', 'inactive', 'suspended', 'roleless', 'unverified']) {
        assert.equal((await request(token, 'GET', 'profile')).statusCode, token === 'bad' ? 401 : 403);
        assert.equal((await request(token, 'GET', 'me')).statusCode, token === 'bad' ? 401 : 403);
      }
      assert.equal((await app.inject('/api/v1/profile')).statusCode, 401);
      assert.equal((await app.inject('/api/v1/me')).statusCode, 401);
      assert.deepEqual((await request('user', 'GET', 'me')).json(), { id: id('user'), roles: ['user'] });
      assert.equal((await request('user', 'GET', `users/${id('artist')}`)).statusCode, 404);
      assert.equal((await request('user', 'GET', 'profile?id=' + id('artist'))).json().profile.id, id('user'));
    });
    await t.test('owner-only partial edits persist; immutable/privileged fields reject', async () => {
      const saved = await request('user', 'PATCH', 'profile', { full_name: '  Edited  ', phone: null });
      assert.equal(saved.statusCode, 200, saved.body);
      assert.equal(saved.json().profile.full_name, 'Edited');
      assert.equal(saved.json().profile.phone, null);
      assert.equal(saved.json().profile.address, 'Synthetic address');
      assert.equal((await request('artist', 'GET', 'profile')).json().profile.full_name, 'Name artist');
      for (const payload of [{}, { full_name: ' ' }, { status: 'active' }, { id: id('artist') },
        { roles: ['admin'] }, { balance: '99.00' }, { email: 'fake@example.test' }, { parent_label_id: id('label') },
        { avatar_url: 'javascript:alert(1)' }, { address: 'a'.repeat(2001) }]) {
        assert.equal((await request('user', 'PATCH', 'profile', payload)).statusCode, 400, JSON.stringify(payload));
      }
      assert.equal((await request('blank', 'PATCH', 'profile', { full_name: 'First edit' })).statusCode, 200);
      const audit = (await pool.query("SELECT metadata FROM soundpub.audit_logs WHERE action='profile.updated' AND actor_user_id=$1", [id('user')])).rows[0];
      assert.deepEqual(audit.metadata, { fields: ['full_name', 'phone'] });
    });
    await t.test('admin list filters, deterministic cursor pagination, no N+1 or private columns', async () => {
      for (const token of ['user', 'artist', 'label', 'copyright', 'whitelabel']) {
        assert.equal((await request(token, 'GET', 'admin/users')).statusCode, 403);
      }
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const response = await request('admin', 'GET', `admin/users?limit=3${cursor ? `&cursor=${cursor}` : ''}`);
        assert.equal(response.statusCode, 200, response.body);
        const body = response.json();
        seen.push(...body.items.map((item: { id: string }) => item.id));
        assert.ok(body.items.every((item: object) => !('migration_source' in item)));
        cursor = body.nextCursor;
      } while (cursor);
      assert.equal(seen.length, Object.keys(ids).length);
      assert.equal(new Set(seen).size, seen.length);
      assert.deepEqual(seen, Object.values(ids).sort().reverse());
      const filtered = await request('admin', 'GET', 'admin/users?status=active&role=artist&search=Name');
      assert.deepEqual(filtered.json().items.map((item: { id: string }) => item.id), [id('artist')]);
      const first = (await request('admin', 'GET', 'admin/users?limit=2&status=active&search=Name')).json();
      assert.ok(first.nextCursor);
      const nextPath = `admin/users?limit=2&status=active&search=Name&cursor=${first.nextCursor}`;
      const next = await request('admin', 'GET', nextPath);
      assert.equal(next.statusCode, 200);
      assert.deepEqual((await request('admin', 'GET', nextPath)).json(), next.json());
      assert.ok(next.json().items.every((item: { id: string }) => !first.items.some((previous: { id: string }) => previous.id === item.id)));
      for (const filters of ['', '&status=inactive&search=Name', '&status=active&search=Other', '&status=active&search=Name&role=user']) {
        assert.equal((await request('admin', 'GET', `admin/users?cursor=${first.nextCursor}${filters}`)).statusCode, 400);
      }
      const literal = await request('admin', 'GET', 'admin/users?search=%25%27%20OR%201%3D1');
      assert.equal(literal.statusCode, 200);
      assert.deepEqual(literal.json().items, []);
      for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'cursor=', 'cursor=garbage', 'cursor=e30', 'role=root', 'sort=email', 'tenantId=forged']) {
        assert.equal((await request('admin', 'GET', `admin/users?${query}`)).statusCode, 400, query);
      }
      const yearZero = Buffer.from(JSON.stringify({ createdAt: '0000-01-01T00:00:00Z', id: id('user') })).toString('base64url');
      assert.equal((await request('admin', 'GET', `admin/users?cursor=${yearZero}`)).statusCode, 400);
    });
    await t.test('admin creates atomic local accounts with hierarchy, label and duplicate guards', async () => {
      const userEmail = 'created.user@example.test';
      const userPassword = 'created-user-password';
      const created = await request('admin', 'POST', 'admin/users', {
        email: userEmail, password: userPassword, fullName: 'Created User', phone: '555', role: 'user', parentLabelId: null,
      });
      assert.equal(created.statusCode, 200, created.body);
      assert.equal(created.json().email, userEmail);
      assert.equal(created.json().full_name, 'Created User');
      assert.deepEqual(created.json().roles, ['user']);
      const createdId = created.json().id;
      const credential = (await pool.query<{ password_hash: string }>(
        'SELECT password_hash FROM soundpub.local_auth_credentials WHERE user_id=$1', [createdId])).rows[0];
      assert.ok(credential);
      assert.equal(await verifyPassword(userPassword, credential.password_hash), true);
      assert.equal((await pool.query(`SELECT count(*)::int AS count FROM soundpub.audit_logs
        WHERE actor_user_id=$1 AND resource_id=$2 AND action='user.created'`, [id('admin'), createdId])).rows[0].count, 1);

      assert.equal((await request('admin', 'POST', 'admin/users', {
        email: userEmail.toUpperCase(), password: userPassword, fullName: 'Duplicate', role: 'user',
      })).statusCode, 409);
      assert.equal((await request('admin', 'POST', 'admin/users', {
        email: 'forbidden.admin@example.test', password: userPassword, fullName: 'Forbidden Admin', role: 'admin',
      })).statusCode, 403);
      const privileged = await request('superadmin', 'POST', 'admin/users', {
        email: 'created.admin@example.test', password: userPassword, fullName: 'Created Admin', role: 'admin',
      });
      assert.equal(privileged.statusCode, 200, privileged.body);
      assert.deepEqual(privileged.json().roles, ['admin']);
      assert.equal((await request('admin', 'POST', 'admin/users', {
        email: 'forbidden.superadmin@example.test', password: userPassword, fullName: 'Forbidden Superadmin', role: 'superadmin',
      })).statusCode, 403);
      const createdSuperadmin = await request('superadmin', 'POST', 'admin/users', {
        email: 'created.superadmin@example.test', password: userPassword, fullName: 'Created Superadmin', role: 'superadmin',
      });
      assert.equal(createdSuperadmin.statusCode, 200, createdSuperadmin.body);
      assert.deepEqual(createdSuperadmin.json().roles, ['superadmin']);

      const artist = await request('admin', 'POST', 'admin/users', {
        email: 'created.artist@example.test', password: userPassword, fullName: 'Created Artist',
        role: 'artist', parentLabelId: id('label'),
      });
      assert.equal(artist.statusCode, 200, artist.body);
      assert.equal(artist.json().parent_label_id, id('label'));
      assert.equal((await pool.query('SELECT 1 FROM soundpub.artists WHERE artist_user_id=$1 AND label_id=$2',
        [artist.json().id, id('label')])).rowCount, 1);
      assert.equal((await request('admin', 'POST', 'admin/users', {
        email: 'orphan.artist@example.test', password: userPassword, fullName: 'Orphan Artist', role: 'artist',
      })).statusCode, 400);
      assert.equal((await request('admin', 'POST', 'admin/users', {
        email: 'invalid.parent@example.test', password: userPassword, fullName: 'Invalid Parent',
        role: 'user', parentLabelId: id('label'),
      })).statusCode, 400);

      const labelArtist = await request('label', 'POST', 'admin/users', {
        email: 'label.artist@example.test', password: userPassword, fullName: 'Label Artist',
        role: 'artist', parentLabelId: id('label'),
      });
      assert.equal(labelArtist.statusCode, 200, labelArtist.body);
      assert.equal(labelArtist.json().parent_label_id, id('label'));
      assert.equal((await request('label', 'POST', 'admin/users', {
        email: 'label.user@example.test', password: userPassword, fullName: 'Forbidden Label User',
        role: 'user', parentLabelId: null,
      })).statusCode, 403);
      assert.equal((await request('label', 'POST', 'admin/users', {
        email: 'other.label.artist@example.test', password: userPassword, fullName: 'Other Label Artist',
        role: 'artist', parentLabelId: id('otherLabel'),
      })).statusCode, 403);
    });
    await t.test('superadmin deletes inactive dependency-free users while preserving audit attribution', async () => {
      const created = await request('superadmin', 'POST', 'admin/users', {
        email: 'delete.me@example.test', password: 'delete-user-password', fullName: 'Delete Me', role: 'user',
      });
      assert.equal(created.statusCode, 200, created.body);
      const targetId = created.json().id;
      const path = `admin/users/${targetId}`;
      assert.equal((await request('superadmin', 'DELETE', path)).statusCode, 409);
      assert.equal((await request('superadmin', 'PATCH', `${path}/status`, { status: 'inactive' })).statusCode, 200);
      assert.equal((await request('admin', 'DELETE', path)).statusCode, 403);
      const notificationId = (await pool.query(`INSERT INTO soundpub.notifications(recipient_user_id,kind,title,body)
        VALUES ($1,'USER_NOTIFICATION','Synthetic','Dependency') RETURNING id`, [targetId])).rows[0].id;
      assert.equal((await request('superadmin', 'DELETE', path)).statusCode, 409);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM soundpub.audit_logs WHERE action='user.deleted' AND resource_id=$1", [targetId])).rows[0].n, 0);
      await pool.query('DELETE FROM soundpub.notifications WHERE id=$1', [notificationId]);
      const deleted = await request('superadmin', 'DELETE', path);
      assert.equal(deleted.statusCode, 200, deleted.body);
      assert.deepEqual(deleted.json(), { deleted: true });
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM soundpub.backend_users WHERE id=$1', [targetId])).rows[0].n, 0);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM soundpub.audit_logs WHERE action='user.deleted' AND actor_user_id=$1 AND resource_id=$2", [id('superadmin'), targetId])).rows[0].n, 1);
      const preserved = (await pool.query("SELECT actor_user_id,metadata FROM soundpub.audit_logs WHERE action='synthetic.target.action' AND resource_id=$1", [targetId])).rows[0];
      assert.equal(preserved.actor_user_id, null);
      assert.equal(preserved.metadata.deletedActorUserId, targetId);
      assert.equal((await request('superadmin', 'DELETE', `admin/users/${id('admin')}`)).statusCode, 409);
      assert.equal((await request('superadmin', 'DELETE', `admin/users/${id('superadmin')}`)).statusCode, 403);
    });    await t.test('status transitions, hierarchy, audit and suspend compatibility', async () => {
      const path = `admin/users/${id('user')}/status`;
      assert.equal((await request('user', 'PATCH', path, { status: 'inactive' })).statusCode, 403);
      assert.equal((await request('admin', 'PATCH', path, { status: 'inactive' })).statusCode, 200);
      assert.equal((await request('user', 'GET', 'profile')).statusCode, 403);
      assert.equal((await request('admin', 'PATCH', path, { status: 'active' })).statusCode, 200);
      assert.equal((await request('user', 'GET', 'profile')).statusCode, 200);
      for (const key of ['admin', 'peer', 'superadmin']) {
        assert.equal((await request('admin', 'PATCH', `admin/users/${id(key)}/status`, { status: 'suspended' })).statusCode, 403);
      }
      assert.equal((await request('superadmin', 'PATCH', `admin/users/${id('peer')}/status`, { status: 'inactive' })).statusCode, 200);
      assert.equal((await request('superadmin', 'PATCH', `admin/users/${id('peer')}/status`, { status: 'active' })).statusCode, 200);
      assert.equal((await request('admin', 'PATCH', path, { status: 'active', actorId: id('superadmin') })).statusCode, 400);
      assert.equal((await request('admin', 'PATCH', path, { status: 'unknown' })).statusCode, 400);
      assert.equal((await request('admin', 'PATCH', 'admin/users/bad/status', { status: 'active' })).statusCode, 400);
      assert.equal((await request('admin', 'PATCH', 'admin/users/ffffffff-ffff-4fff-8fff-ffffffffffff/status', { status: 'active' })).statusCode, 404);
      const suspended = await request('admin', 'POST', `admin/users/${id('user')}/suspend`, { reason: 'Synthetic abuse' });
      assert.equal(suspended.statusCode, 200, suspended.body);
      assert.deepEqual(suspended.json(), { status: 'suspended' });
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM soundpub.outbox_events WHERE topic='audit.notification'")).rows[0].n, 1);
      await request('admin', 'PATCH', path, { status: 'active' });
    });
    await t.test('admin password reset enforces hierarchy, revokes sessions and audits', async () => {
      const path = `admin/users/${id('user')}/password`;
      assert.equal((await request('user', 'PUT', path, { newPassword: 'Synthetic-reset-password-2026' })).statusCode, 403);
      assert.equal((await request('admin', 'PUT', `admin/users/${id('admin')}/password`,
        { newPassword: 'Synthetic-reset-password-2026' })).statusCode, 403);
      assert.equal((await request('admin', 'PUT', `admin/users/${id('peer')}/password`,
        { newPassword: 'Synthetic-reset-password-2026' })).statusCode, 403);
      assert.equal((await request('admin', 'PUT', path, { newPassword: 'short' })).statusCode, 400);
      const sessionToken = createOpaqueToken();
      await pool.query(`INSERT INTO soundpub.auth_sessions(user_id,token_sha256,csrf_sha256,idle_expires_at,expires_at)
        VALUES ($1,$2,$3,now()+interval '1 hour',now()+interval '1 hour')`,
      [id('user'), digestOpaqueToken(sessionToken), digestOpaqueToken(createOpaqueToken())]);
      const reset = await request('admin', 'PUT', path, { newPassword: 'Synthetic-reset-password-2026' });
      assert.equal(reset.statusCode, 200, reset.body);
      const credential = (await pool.query<{ password_hash: string; login_email: string }>(`SELECT password_hash,login_email
        FROM soundpub.local_auth_credentials WHERE user_id=$1`, [id('user')])).rows[0]!;
      assert.equal(credential.login_email, 'user@example.test');
      assert.equal(await verifyPassword('Synthetic-reset-password-2026', credential.password_hash), true);
      assert.equal((await pool.query('SELECT revoked_at IS NOT NULL AS revoked FROM soundpub.auth_sessions WHERE token_sha256=$1',
        [digestOpaqueToken(sessionToken)])).rows[0].revoked, true);
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM soundpub.audit_logs WHERE action='auth.password_reset' AND actor_user_id=$1 AND resource_id=$2",
        [id('admin'), id('user')])).rows[0].count, 1);
    });
    await t.test('composer code update is copyright-only, unique, normalized, audited and atomic', async () => {
      const path = `admin/users/${id('copyright')}/composer-code`;
      assert.equal((await request('user', 'PUT', path, { composerCode: 'UTR001' })).statusCode, 403);
      assert.equal((await request('admin', 'PUT', `admin/users/${id('user')}/composer-code`, { composerCode: 'UTR001' })).statusCode, 409);
      assert.equal((await request('admin', 'PUT', path, { composerCode: 'bad code' })).statusCode, 400);
      const changed = await request('admin', 'PUT', path, { composerCode: 'UTR_001-A' });
      assert.equal(changed.statusCode, 200, changed.body);
      assert.deepEqual(changed.json(), { composerCode: 'UTR_001-A' });
      assert.equal((await pool.query('SELECT composer_code FROM soundpub.profiles WHERE id=$1', [id('copyright')])).rows[0].composer_code, 'UTR_001-A');
      await pool.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'copyright',now())", [id('roleless')]);
      assert.equal((await request('admin', 'PUT', `admin/users/${id('roleless')}/composer-code`, { composerCode: 'UTR_001-A' })).statusCode, 409);
      await pool.query('DELETE FROM soundpub.user_roles WHERE user_id=$1', [id('roleless')]);
      const event = (await pool.query("SELECT actor_user_id,request_id,metadata FROM soundpub.audit_logs WHERE action='user.composer_code_changed' AND resource_id=$1", [id('copyright')])).rows[0];
      assert.equal(event.actor_user_id, id('admin'));
      assert.equal(event.request_id, changed.headers['x-request-id']);
      assert.deepEqual(event.metadata, { cleared: false });
      await pool.query(`CREATE FUNCTION soundpub.reject_composer_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.action='user.composer_code_changed' THEN RAISE EXCEPTION 'synthetic private failure'; END IF; RETURN NEW; END; $$;
        CREATE TRIGGER reject_composer_audit BEFORE INSERT ON soundpub.audit_logs FOR EACH ROW EXECUTE FUNCTION soundpub.reject_composer_audit()`);
      try {
        const failed = await request('admin', 'PUT', path, { composerCode: 'UTR002' });
        assert.equal(failed.statusCode, 500);
        assert.ok(!failed.body.includes('private failure'));
        assert.equal((await pool.query('SELECT composer_code FROM soundpub.profiles WHERE id=$1', [id('copyright')])).rows[0].composer_code, 'UTR_001-A');
      } finally { await pool.query('DROP TRIGGER reject_composer_audit ON soundpub.audit_logs; DROP FUNCTION soundpub.reject_composer_audit()'); }
      assert.deepEqual((await request('admin', 'PUT', path, { composerCode: null })).json(), { composerCode: null });
    });
    await t.test('role replacement is atomic, scope-aware, hierarchy checked and audited', async () => {
      const path = `admin/users/${id('user')}/roles`;
      for (const [token, roles, status] of [['user', ['artist'], 403], ['admin', ['admin'], 403],
        ['admin', ['superadmin'], 403], ['admin', [], 400],
        ['admin', ['user', 'user'], 400], ['admin', ['root'], 400]] as const) {
        assert.equal((await request(token, 'PUT', path, { roles })).statusCode, status);
      }
      for (const key of ['admin', 'peer', 'superadmin']) {
        assert.equal((await request('admin', 'PUT', `admin/users/${id(key)}/roles`, { roles: ['user'] })).statusCode, 403);
      }
      await pool.query(`INSERT INTO soundpub.user_roles(user_id,role,tenant_id,verified_at) VALUES ($1,'label',$2,now())`, [id('user'), id('label')]);
      const changed = await request('admin', 'PUT', path, { roles: ['artist'], parentLabelId: id('label') });
      assert.equal(changed.statusCode, 200, changed.body);
      assert.deepEqual(changed.json(), { roles: ['artist'], parentLabelId: id('label') });
      assert.deepEqual((await request('user', 'GET', 'profile')).json().roles, ['artist']);
      assert.deepEqual((await request('user', 'GET', 'me')).json(), { id: id('user'), roles: ['artist'] });
      assert.equal((await request('user', 'GET', 'profile')).json().profile.parent_label_name, 'Name label');
      assert.deepEqual((await pool.query(`SELECT parent_label_id,artist_profile_completed FROM soundpub.profiles WHERE id=$1`, [id('user')])).rows[0], {
        parent_label_id: id('label'), artist_profile_completed: false,
      });
      assert.deepEqual((await pool.query(`SELECT user_id,artist_name FROM soundpub.artist_profiles WHERE user_id=$1`, [id('user')])).rows[0], {
        user_id: id('user'), artist_name: 'Edited',
      });
      assert.deepEqual((await pool.query(`SELECT label_id,artist_user_id,name FROM soundpub.artists WHERE artist_user_id=$1`, [id('user')])).rows[0], {
        label_id: id('label'), artist_user_id: id('user'), name: 'Edited',
      });
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM soundpub.user_roles WHERE user_id=$1 AND tenant_id IS NOT NULL', [id('user')])).rows[0].n, 1);
      assert.equal((await request('admin', 'PUT', path, { roles: ['artist'], parentLabelId: id('otherLabel') })).statusCode, 409);
      assert.equal((await request('admin', 'PUT', `admin/users/${id('blank')}/roles`, { roles: ['artist'] })).statusCode, 400);
      assert.equal((await request('admin', 'PUT', `admin/users/${id('blank')}/roles`, { roles: ['artist'], parentLabelId: id('copyright') })).statusCode, 400);
      assert.equal((await request('admin', 'PUT', path, { roles: ['artist'], parentLabelId: null })).statusCode, 409);
      assert.deepEqual((await request('user', 'GET', 'profile')).json().roles, ['artist'], 'blocked transfer must not change roles');
      assert.equal((await request('admin', 'PUT', path, { roles: ['user'] })).statusCode, 409);
      assert.equal((await request('admin', 'PUT', `admin/users/${id('label')}/roles`, { roles: ['user'] })).statusCode, 409);
      assert.deepEqual((await request('user', 'GET', 'profile')).json().roles, ['artist']);
      assert.deepEqual((await request('label', 'GET', 'profile')).json().roles, ['label']);
      await pool.query("UPDATE soundpub.backend_users SET status='inactive' WHERE id=$1", [id('label')]);
      assert.equal((await request('admin', 'PUT', path, { roles: ['artist'], parentLabelId: id('label') })).statusCode, 400);
      await pool.query("UPDATE soundpub.backend_users SET status='active' WHERE id=$1", [id('label')]);
      const events = (await pool.query("SELECT actor_user_id,request_id,metadata FROM soundpub.audit_logs WHERE action='user.roles_changed' AND resource_id=$1", [id('user')])).rows;
      assert.equal(events.length, 1);
      assert.equal(events[0].actor_user_id, id('admin'));
      assert.equal(events[0].request_id, changed.headers['x-request-id']);
      assert.deepEqual(events[0].metadata.previousRoles, ['user']);
      assert.deepEqual(events[0].metadata.roles, ['artist']);
      assert.equal(events[0].metadata.previousParentLabelId, null);
      assert.equal(events[0].metadata.parentLabelId, id('label'));
      // Audit failure must roll back both role and profile change.
      await pool.query(`CREATE FUNCTION soundpub.reject_user_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'synthetic private failure'; END; $$;
        CREATE TRIGGER reject_user_audit BEFORE INSERT ON soundpub.audit_logs FOR EACH ROW EXECUTE FUNCTION soundpub.reject_user_audit()`);
      try {
        const failed = await request('admin', 'PUT', `admin/users/${id('blank')}/roles`, { roles: ['artist'], parentLabelId: id('label') });
        assert.equal(failed.statusCode, 500);
        assert.ok(!failed.body.includes('private failure'));
        assert.deepEqual((await request('blank', 'GET', 'profile')).json().roles, ['user']);
        assert.equal((await request('blank', 'GET', 'profile')).json().profile.parent_label_id, null);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM soundpub.artist_profiles WHERE user_id=$1', [id('blank')])).rows[0].n, 0);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM soundpub.artists WHERE artist_user_id=$1', [id('blank')])).rows[0].n, 0);
        assert.equal((await request('admin', 'PATCH', `admin/users/${id('blank')}/status`, { status: 'inactive' })).statusCode, 500);
        assert.equal((await request('blank', 'GET', 'profile')).statusCode, 200);
        const before = (await request('blank', 'GET', 'profile')).json();
        assert.equal((await request('blank', 'PATCH', 'profile', { full_name: 'Must roll back' })).statusCode, 500);
        assert.deepEqual((await request('blank', 'GET', 'profile')).json(), before);
      } finally { await pool.query('DROP TRIGGER reject_user_audit ON soundpub.audit_logs; DROP FUNCTION soundpub.reject_user_audit()'); }
    });
    await t.test('historical parent references block role removal without exposing reference data', async () => {
      const reference = (await pool.query(`INSERT INTO soundpub.identity_references
        (source_system,source_user_id,reference_kind,source_table,source_column,source_record_locator,reason)
        VALUES ('synthetic',$1,'parent_label','profiles','parent_label_id','synthetic','excluded') RETURNING id`, [id('otherLabel')])).rows[0].id;
      await pool.query('UPDATE soundpub.profiles SET parent_label_reference_id=$2 WHERE id=$1', [id('artist'), reference]);
      try {
        const response = await request('admin', 'PUT', `admin/users/${id('artist')}/roles`, { roles: ['user'] });
        assert.equal(response.statusCode, 409);
        assert.deepEqual((await request('artist', 'GET', 'profile')).json().roles, ['artist']);
        assert.equal((await pool.query('SELECT parent_label_reference_id FROM soundpub.profiles WHERE id=$1', [id('artist')])).rows[0].parent_label_reference_id, reference);
      } finally {
        await pool.query('UPDATE soundpub.profiles SET parent_label_reference_id=NULL WHERE id=$1', [id('artist')]);
        await pool.query('DELETE FROM soundpub.identity_references WHERE id=$1', [reference]);
      }
    });
    await t.test('concurrent role replacements serialize without merging grants', async () => {
      const path = `admin/users/${id('blank')}/roles`;
      const changes = await Promise.all([
        request('admin', 'PUT', path, { roles: ['copyright'] }),
        request('superadmin', 'PUT', path, { roles: ['user'] }),
      ]);
      assert.deepEqual(changes.map(response => response.statusCode), [200, 200]);
      const events = (await pool.query(`SELECT metadata FROM soundpub.audit_logs
        WHERE action='user.roles_changed' AND resource_id=$1 ORDER BY id`, [id('blank')])).rows;
      assert.equal(events.length, 2);
      const finalRoles = (await request('blank', 'GET', 'profile')).json().roles;
      assert.ok(JSON.stringify(finalRoles) === JSON.stringify(['copyright']) ||
        JSON.stringify(finalRoles) === JSON.stringify(['user']));
      const first = events.find(event => JSON.stringify(event.metadata.previousRoles) === JSON.stringify(['user']));
      assert.ok(first);
      const second = events.find(event => event !== first)!;
      assert.deepEqual(second.metadata.previousRoles, [...first.metadata.roles].sort());
      assert.deepEqual(finalRoles, [...second.metadata.roles].sort());
    });
    await t.test('repository constraints and runtime least privilege', async () => {
      await assert.rejects(runtime.query('UPDATE soundpub.profiles SET balance=999 WHERE id=$1', [id('user')]), /permission denied/);
      assert.equal((await runtime.query("SELECT has_column_privilege('soundpub_app','soundpub.profiles','composer_code','UPDATE') AS permitted")).rows[0].permitted, true);
      assert.equal((await runtime.query("SELECT has_column_privilege('soundpub_app','soundpub.profiles','parent_label_id','UPDATE') AS permitted")).rows[0].permitted, true);
      await assert.rejects(runtime.query('INSERT INTO soundpub.profiles(id,balance) VALUES ($1,999)', [id('blank')]), /permission denied/);
      await assert.rejects(runtime.query('DELETE FROM soundpub.audit_logs'), /permission denied/);
      assert.equal((await runtime.query("SELECT has_column_privilege('soundpub_app','soundpub.backend_users','id','INSERT') AS permitted")).rows[0].permitted, true);
      await assert.rejects(runtime.query("INSERT INTO soundpub.backend_users(id,email,status) VALUES (gen_random_uuid(),'forged@example.test','active')"), /permission denied/);
      await assert.rejects(pool.query('UPDATE soundpub.profiles SET parent_label_id=id WHERE id=$1', [id('user')]), /check constraint/);
      await assert.rejects(pool.query('UPDATE soundpub.profiles SET parent_label_id=$2 WHERE id=$1', [id('user'), 'ffffffff-ffff-4fff-8fff-ffffffffffff']), /foreign key/);
      const row = await withTransaction(runtime, db => usersRepository(db).find(id('user')));
      assert.equal(row?.full_name, 'Edited');
      assert.deepEqual(row?.roles, ['artist']);
    });
    await t.test('service rechecks current roles/status rather than stale or forged actor claims', async () => {
      await assert.rejects(service.list(actor('user', ['superadmin']), {}), failure(403));
      await assert.rejects(service.setRoles(actor('user', ['superadmin']), id('blank'), { roles: ['admin'] }, 'stale'), failure(403));
      await pool.query("UPDATE soundpub.backend_users SET status='suspended' WHERE id=$1", [id('admin')]);
      await assert.rejects(service.setStatus(actor('admin'), id('blank'), { status: 'inactive' }, 'stale'), failure(403));
      await assert.rejects(service.updateProfile(actor('admin'), { full_name: 'Forged' }, 'stale'), failure(403));
      await pool.query("UPDATE soundpub.backend_users SET status='active' WHERE id=$1", [id('admin')]);
      const blocker = await pool.connect();
      try {
        await blocker.query('BEGIN');
        await blocker.query('DELETE FROM soundpub.user_roles WHERE user_id=$1 AND tenant_id IS NULL', [id('admin')]);
        const queued = service.setStatus(actor('admin'), id('blank'), { status: 'inactive' }, 'revoked');
        let waiting = false;
        for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
          waiting = Boolean((await pool.query(`SELECT 1 FROM pg_stat_activity WHERE application_name='soundpub-users-test'
            AND wait_event_type='Lock'`)).rowCount);
          if (!waiting) await setTimeout(5);
        }
        assert.ok(waiting, 'mutation must wait for in-flight role revocation');
        await blocker.query('COMMIT');
        await assert.rejects(queued, failure(403));
        assert.equal((await pool.query('SELECT status FROM soundpub.backend_users WHERE id=$1', [id('blank')])).rows[0].status, 'active');
      } finally { await blocker.query('ROLLBACK'); blocker.release(); }
      await pool.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'admin',now())", [id('admin')]);
      const previousRoles = (await request('blank', 'GET', 'profile')).json().roles;
      // Unverified global privileges cannot be erased by an ordinary admin.
      await pool.query("INSERT INTO soundpub.user_roles(user_id,role) VALUES ($1,'superadmin')", [id('blank')]);
      assert.equal((await request('admin', 'PUT', `admin/users/${id('blank')}/roles`, { roles: ['user'] })).statusCode, 403);
      assert.equal((await request('admin', 'PATCH', `admin/users/${id('blank')}/status`, { status: 'inactive' })).statusCode, 403);
      assert.deepEqual((await request('blank', 'GET', 'profile')).json().roles, previousRoles);
    });
    await t.test('OpenAPI publishes adapter routes, explicit DTOs, schemas and security', async () => {
      const paths = (await app.inject('/openapi.json')).json().paths;
      for (const [path, method] of [['/api/v1/profile', 'get'], ['/api/v1/profile', 'patch'],
        ['/api/v1/admin/users', 'get'], ['/api/v1/admin/users', 'post'],
        ['/api/v1/admin/users/{id}/status', 'patch'], ['/api/v1/admin/users/{id}/roles', 'put'],
        ['/api/v1/admin/users/{id}/composer-code', 'put'], ['/api/v1/admin/users/{id}', 'delete']]) {
        const operation = paths[path!][method!];
        assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
        for (const status of [200, 400, 401, 403, 404, 409, 429, 500]) assert.ok(operation.responses[status]);
      }
      assert.equal(paths['/api/v1/admin/users/{id}/roles'].put.requestBody.content['application/json'].schema.properties.roles.uniqueItems, true);
      assert.equal(paths['/api/v1/profile'].patch.requestBody.content['application/json'].schema.additionalProperties, false);
      assert.equal(paths['/api/v1/profile'].get.responses['200'].content['application/json'].schema.properties.profile.properties.phone.nullable, true);
    });
    await t.test('bounded query count and local latency/response-size baseline', async baseline => {
      let queries = 0;
      let queryMs = 0;
      const originalQuery = pg.Client.prototype.query;
      const spy = baseline.mock.method(pg.Client.prototype, 'query', function (this: pg.Client, ...args: unknown[]) {
        queries++;
        const started = performance.now();
        const result = originalQuery.apply(this, args as Parameters<typeof originalQuery>);
        return Promise.resolve(result).finally(() => { queryMs += performance.now() - started; });
      });
      try {
        for (const path of ['profile', 'admin/users?limit=1', 'admin/users?limit=100']) {
          queries = 0;
          queryMs = 0;
          const started = performance.now();
          const response = await request('admin', 'GET', path);
          const latencyMs = performance.now() - started;
          assert.equal(response.statusCode, 200);
          assert.equal(queries, 8, 'identity + roles + BEGIN + user lock + role lock + roles + projection + COMMIT');
          baseline.diagnostic(JSON.stringify({ path, queries, queryMs: Number(queryMs.toFixed(2)),
            latencyMs: Number(latencyMs.toFixed(2)), responseBytes: Buffer.byteLength(response.body) }));
        }
      } finally { spy.mock.restore(); }
    });
  } finally {
    await app.close();
    await runtime.end();
    await pool.query('DROP SCHEMA IF EXISTS soundpub CASCADE');
    await pool.end();
  }
});


