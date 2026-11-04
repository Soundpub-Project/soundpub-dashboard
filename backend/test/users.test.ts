import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool, PoolClient } from 'pg';
import { createAuthorizer, ROLES, type Principal, type Role } from '../src/auth/index.js';
import { buildApp } from '../src/api/index.js';
import { canCreateUser, canManageUser, createUsersService } from '../src/users/index.js';
import { composerCodePut, listQuery, profilePatch, rolesPut, userCreate } from '../src/users/contracts.js';

test('Users role hierarchy denies self and ordinary admin privilege escalation', () => {
  const actor: Principal = { id: 'actor', status: 'active', roles: ['admin'] };
  for (const role of ROLES) {
    assert.equal(canManageUser(actor, 'target', [role]), !['admin', 'superadmin'].includes(role));
    assert.equal(canManageUser(actor, 'target', ['user'], [role]), !['admin', 'superadmin'].includes(role));
    assert.equal(canManageUser({ ...actor, roles: [role] }, 'actor', ['user']), false);
  }
  const superadmin: Principal = { ...actor, roles: ['superadmin'] };
  assert.equal(canManageUser(superadmin, 'target', ['admin']), true);
  assert.equal(canManageUser(superadmin, 'target', ['user'], ['admin']), true);
  assert.equal(canManageUser(superadmin, 'target', ['superadmin']), true);
  assert.equal(canManageUser(superadmin, 'target', ['user'], ['superadmin']), true);
  for (const status of ['inactive', 'suspended'] as const) {
    assert.equal(canManageUser({ ...superadmin, status }, 'target', ['user']), false);
  }
  const allows = createAuthorizer();
  for (const role of ['copyright', 'whitelabel'] as const) {
    const principal = { ...actor, roles: [role] };
    assert.equal(allows(principal, 'owner', actor.id), true);
    assert.equal(allows(principal, 'owner-or-admin', 'other'), false);
    assert.equal(allows(principal, 'admin'), false);
  }
});

test('Label account creation is restricted to its own artists', () => {
  const label: Principal = { id: 'label-id', status: 'active', roles: ['label'] };
  assert.equal(canCreateUser(label, { role: 'artist', parentLabelId: label.id }), true);
  assert.equal(canCreateUser(label, { role: 'artist', parentLabelId: 'other-label' }), false);
  assert.equal(canCreateUser(label, { role: 'user', parentLabelId: label.id }), false);
  assert.equal(canCreateUser({ ...label, status: 'suspended' }, { role: 'artist', parentLabelId: label.id }), false);
});

test('label_custom cannot create accounts or manage users; admin hierarchy stays explicit', () => {
  const custom: Principal = { id: 'custom-id', status: 'active', roles: ['label_custom'] };
  for (const role of ROLES) {
    for (const parentLabelId of [undefined, null, custom.id, 'other-label']) {
      assert.equal(canCreateUser(custom, { role, parentLabelId }), false, `${role}: ${parentLabelId}`);
      assert.equal(canCreateUser({ ...custom, roles: ['user', 'label_custom'] }, { role, parentLabelId }), false);
    }
    assert.equal(canManageUser(custom, 'target', [role]), false);
    for (const adminRole of ['admin', 'superadmin'] as const) {
      const admin: Principal = { ...custom, id: 'admin-id', roles: [adminRole] };
      assert.equal(canCreateUser(admin, { role }), adminRole === 'superadmin' || !['admin', 'superadmin'].includes(role));
      assert.equal(canManageUser(admin, 'target', ['label_custom'], [role]),
        adminRole === 'superadmin' || !['admin', 'superadmin'].includes(role));
      assert.equal(canManageUser(admin, 'target', ['label_custom', role], ['user']),
        adminRole === 'superadmin' || !['admin', 'superadmin'].includes(role));
      assert.equal(canManageUser(admin, admin.id, ['label_custom'], [role]), false);
    }
  }
  for (const role of ['label', 'whitelabel'] as const) {
    assert.equal(canCreateUser({ ...custom, roles: [role] }, { role: 'artist', parentLabelId: custom.id }), true);
    assert.equal(canCreateUser({ ...custom, roles: [role] }, { role: 'label_custom', parentLabelId: custom.id }), false);
    assert.equal(canCreateUser({ ...custom, roles: [role, 'unknown' as Role] }, { role: 'artist', parentLabelId: custom.id }), false);
  }
  for (const status of ['inactive', 'suspended'] as const) {
    assert.equal(canCreateUser({ ...custom, status }, { role: 'artist', parentLabelId: custom.id }), false);
    assert.equal(canCreateUser({ ...custom, roles: ['superadmin'], status }, { role: 'label_custom' }), false);
  }
});

test('label_custom is accepted in account, role assignment and list contracts', () => {
  assert.equal(userCreate.parse({ email: 'custom@example.test', password: 'twelve-chars!',
    fullName: 'Custom Label', role: 'label_custom' }).role, 'label_custom');
  assert.deepEqual(rolesPut.parse({ roles: ['label_custom'] }), { roles: ['label_custom'] });
  assert.deepEqual(listQuery.parse({ role: 'label_custom' }), { role: 'label_custom' });
});

test('label_custom authenticates through API but cannot create any /admin/users account', async () => {
  let connections = 0;
  const pool = { async connect() { connections++; throw new Error('Unexpected database access'); } } as unknown as Pool;
  const actor: Principal = { id: '00000000-0000-4000-8000-000000000001', status: 'active', roles: ['label_custom'] };
  const app = buildApp({
    auth: { authenticate: async () => actor }, users: createUsersService(pool),
    readiness: { check: async () => true }, rateLimiter: { consume: async () => ({ allowed: true }) },
    admin: { suspendUser: async () => assert.fail('Unexpected admin action') },
    webhooks: { receive: async () => false },
  });
  const headers = { authorization: 'Bearer synthetic' };
  try {
    const me = await app.inject({ url: '/api/v1/me', headers });
    assert.equal(me.statusCode, 200, me.body);
    assert.deepEqual(me.json(), { id: actor.id, roles: ['label_custom'] });
    for (const role of ROLES) {
      const response = await app.inject({ method: 'POST', url: '/api/v1/admin/users', headers, payload: {
        email: 'forbidden@example.test', password: 'twelve-chars!', fullName: 'Forbidden', role,
        parentLabelId: role === 'artist' ? actor.id : null,
      } });
      assert.equal(response.statusCode, 403, `${role}: ${response.body}`);
      assert.equal(response.json().error.code, 'FORBIDDEN');
    }
    assert.equal((await app.inject({ url: '/api/v1/admin/users', headers })).statusCode, 403);
    assert.equal(connections, 0);
  } finally { await app.close(); }
});

function scriptedPool(steps: [RegExp, object[]][]) {
  let released = false;
  const client = {
    async query(sql: string, values?: unknown[]) {
      const step = steps.shift();
      assert.ok(step, `Unexpected query: ${sql}`);
      assert.match(sql, step[0]);
      if (sql.includes('AS blocked')) {
        assert.match(sql, /FROM soundpub\.label_custom_units WHERE owner_user_id = \$1\s+AND NOT \('label_custom' = ANY\(\$2::text\[\]\)\)/);
        assert.match(sql, /FROM soundpub\.artists WHERE label_id = \$1\s+AND artist_user_id IS NOT NULL\s+AND NOT \(\$2::text\[\] && ARRAY\['label', 'whitelabel'\]::text\[\]\)/);
        assert.ok(Array.isArray(values?.[1]));
      }
      return { rows: step[1], rowCount: step[1].length };
    },
    release() { released = true; },
  } as unknown as PoolClient;
  return { pool: { connect: async () => client } as unknown as Pool,
    done() { assert.equal(steps.length, 0); assert.equal(released, true); } };
}

test('role replacement preserves custom units, permits admin management and rechecks persisted roles', async () => {
  const actorId = '00000000-0000-4000-8000-000000000001';
  const targetId = '00000000-0000-4000-8000-000000000002';
  for (const adminRole of ['admin', 'superadmin'] as const) {
    for (const [previousRole, nextRoles, blocked] of [
      ['label_custom', ['label'], true], ['label_custom', ['user'], false],
      ['label_custom', ['user', 'label_custom'], false], ['user', ['label_custom'], false],
    ] as [Role, Role[], boolean][]) {
      const actor: Principal = { id: actorId, roles: [adminRole], status: 'active' };
      const script = scriptedPool([
        [/^BEGIN$/, []],
        [/SELECT id, status/, [{ id: actorId, status: 'active' }, { id: targetId, status: 'active' }]],
        [/pg_advisory_xact_lock/, []],
        [/SELECT user_id, role/, [{ user_id: actorId, role: adminRole }, { user_id: targetId, role: previousRole }]],
        [/SELECT role FROM soundpub.user_roles/, [{ role: previousRole }]],
        [/SELECT u.id/, [{ id: targetId, parent_label_id: null }]],
        [/SELECT EXISTS/, [{ blocked }]],
        ...(blocked ? [[/^ROLLBACK$/, []] as [RegExp, object[]]] : [
          [/INSERT INTO soundpub.profiles/, []], [/DELETE FROM soundpub.user_roles/, []],
          [/INSERT INTO soundpub.user_roles/, []], [/INSERT INTO soundpub.audit_logs/, []], [/^COMMIT$/, []],
        ] as [RegExp, object[]][]),
      ]);
      const result = createUsersService(script.pool).setRoles(actor, targetId, { roles: nextRoles }, 'synthetic');
      if (blocked) await assert.rejects(result, { statusCode: 409 });
      else assert.deepEqual(await result, { roles: nextRoles, parentLabelId: null });
      script.done();
    }
    const staleActor: Principal = { id: actorId, roles: [adminRole], status: 'active' };
    const script = scriptedPool([
      [/^BEGIN$/, []],
      [/SELECT id, status/, [{ id: actorId, status: 'active' }, { id: targetId, status: 'active' }]],
      [/pg_advisory_xact_lock/, []],
      [/SELECT user_id, role/, [{ user_id: actorId, role: 'label_custom' }, { user_id: targetId, role: 'user' }]],
      [/^ROLLBACK$/, []],
    ]);
    await assert.rejects(createUsersService(script.pool).setRoles(staleActor, targetId, { roles: ['admin'] }, 'stale'), { statusCode: 403 });
    script.done();
  }
});

test('superadmin can create label_custom; label_custom cannot parent artist login accounts', async () => {
  const actor: Principal = { id: '00000000-0000-4000-8000-000000000001', status: 'active', roles: ['superadmin'] };
  const parentId = '00000000-0000-4000-8000-000000000002';
  const input = { email: 'custom@example.test', password: 'twelve-chars!', fullName: 'Custom Label', role: 'label_custom' as const };
  const script = scriptedPool([
    [/^BEGIN$/, []], [/SELECT id, status/, [{ id: actor.id, status: 'active' }]],
    [/pg_advisory_xact_lock/, []], [/SELECT user_id, role/, [{ user_id: actor.id, role: 'superadmin' }]],
    [/SELECT 1 FROM soundpub.backend_users/, []], [/INSERT INTO soundpub.backend_users/, []],
    [/UPDATE soundpub.backend_users/, []], [/INSERT INTO soundpub.profiles/, []],
    [/INSERT INTO soundpub.user_roles/, []], [/INSERT INTO soundpub.local_auth_credentials/, []],
    [/INSERT INTO soundpub.audit_logs/, []], [/SELECT u.id/, [{ roles: ['label_custom'] }]], [/^COMMIT$/, []],
  ]);
  assert.deepEqual((await createUsersService(script.pool).create(actor, input, 'synthetic')).roles, ['label_custom']);
  script.done();

  const parentScript = scriptedPool([
    [/^BEGIN$/, []], [/SELECT id, status/, [{ id: actor.id, status: 'active' }, { id: parentId, status: 'active' }]],
    [/pg_advisory_xact_lock/, []], [/SELECT user_id, role/, [
      { user_id: actor.id, role: 'superadmin' }, { user_id: parentId, role: 'label_custom' },
    ]], [/^ROLLBACK$/, []],
  ]);
  await assert.rejects(createUsersService(parentScript.pool).create(actor,
    { ...input, role: 'artist', parentLabelId: parentId }, 'synthetic'), { statusCode: 400 });
  parentScript.done();
});

test('Local account creation contract accepts all roles; service enforces privileged creation', () => {
  const valid = {
    email: ' New.User@Example.Test ', password: 'twelve-chars!', fullName: 'New User',
    phone: null, role: 'user' as const, parentLabelId: null,
  };
  const parsed = userCreate.parse(valid);
  assert.equal(parsed.email, 'new.user@example.test');
  assert.equal(parsed.password, valid.password);
  assert.equal(userCreate.safeParse({ ...valid, password: 'short' }).success, false);
  assert.equal(userCreate.safeParse({ ...valid, role: 'superadmin' }).success, true);
  assert.equal(userCreate.safeParse({ ...valid, extra: true }).success, false);
});

test('profile and role inputs reject mass assignment, unsafe URLs and duplicate roles', () => {
  for (const value of [{}, { full_name: ' ' }, { id: 'other' }, { roles: ['admin'] },
    { status: 'active' }, { balance: '1000' }, { email: 'forged@example.test' },
    { parent_label_id: 'other' }, { avatar_url: 'javascript:alert(1)' }, { logo_url: 'file:///private' }]) {
    assert.equal(profilePatch.safeParse(value).success, false, JSON.stringify(value));
  }
  assert.deepEqual(profilePatch.parse({ full_name: ' Test ', phone: null }), { full_name: 'Test', phone: null });
  for (const value of [{ roles: [] }, { roles: ['user', 'user'] }, { roles: ['root'] },
    { roles: ['user'], actorId: 'forged' }, { roles: ['artist'], parentLabelId: 'bad' }]) {
    assert.equal(rolesPut.safeParse(value).success, false);
  }
});

test('composer code contract normalizes safe values and rejects ambiguous input', () => {
  assert.deepEqual(composerCodePut.parse({ composerCode: '  utr_001-a  ' }), { composerCode: 'UTR_001-A' });
  assert.deepEqual(composerCodePut.parse({ composerCode: null }), { composerCode: null });
  for (const value of [{}, { composerCode: '' }, { composerCode: 'space code' }, { composerCode: 'kode/1' },
    { composerCode: 'A'.repeat(101) }, { composerCode: 'OK', actorId: 'forged' }]) {
    assert.equal(composerCodePut.safeParse(value).success, false);
  }
});
