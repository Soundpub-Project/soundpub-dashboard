import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthorizer, createPrincipalResolver } from '../src/auth/index.ts';
import type { Policy, Principal, Role } from '../src/auth/index.ts';

test('role matrix: anonymous, all roles, inactive, suspended', () => {
  const allows = createAuthorizer();
  const policies: Policy[] = ['authenticated', 'owner', 'owner-or-admin', 'admin', 'superadmin'];
  const cases: [string, Principal | null, boolean[], boolean[]][] = [
    ['anonymous', null, [false, false, false, false, false], [false, false, false, false, false]],
    ...(['user', 'artist', 'label', 'label_custom', 'copyright', 'whitelabel'] as Role[]).map(role => [role,
      { id: 'alice', roles: [role], status: 'active' },
      [true, true, true, false, false], [true, false, false, false, false]] as typeof cases[number]),
    ['admin', { id: 'alice', roles: ['admin'], status: 'active' },
      [true, true, true, true, false], [true, false, true, true, false]],
    ['superadmin', { id: 'alice', roles: ['superadmin'], status: 'active' },
      [true, true, true, true, true], [true, false, true, true, true]],
    ['inactive', { id: 'alice', roles: ['superadmin'], status: 'inactive' },
      [false, false, false, false, false], [false, false, false, false, false]],
    ['suspended', { id: 'alice', roles: ['superadmin'], status: 'suspended' },
      [false, false, false, false, false], [false, false, false, false, false]],
    ...(['inactive', 'suspended'] as const).map(status => [`label_custom ${status}`,
      { id: 'alice', roles: ['label_custom'], status },
      [false, false, false, false, false], [false, false, false, false, false]] as typeof cases[number]),
  ];
  for (const [name, principal, own, other] of cases) {
    assert.deepEqual(policies.map(policy => allows(principal, policy, 'alice')), own, `${name}: own`);
    assert.deepEqual(policies.map(policy => allows(principal, policy, 'bob')), other, `${name}: other`);
  }
});

test('principal resolver accepts label_custom without granting other roles', async () => {
  const principal: Principal = { id: 'alice', roles: ['label_custom'], status: 'active' };
  const resolve = createPrincipalResolver({ async findByIdentity() { return principal; } });
  const resolved = await resolve({ issuer: 'synthetic', subject: 'alice' });
  assert.deepEqual(resolved, principal);
  assert.ok(Object.isFrozen(resolved?.roles));
  assert.equal(createAuthorizer()(resolved, 'admin'), false);
  assert.equal(createAuthorizer()(resolved, 'owner-or-admin', 'bob'), false);
});

test('unknown policies, missing ownership, empty roles, malformed principals deny', () => {
  const allows = createAuthorizer();
  const principal: Principal = { id: 'alice', roles: ['user'], status: 'active' };
  assert.equal(allows(principal, undefined as unknown as Policy, 'alice'), false);
  assert.equal(allows(principal, 'unknown' as Policy, 'alice'), false);
  assert.equal(allows(principal, 'owner'), false);
  assert.equal(allows(principal, 'owner-or-admin'), false);
  for (const malformed of [{ ...principal, roles: [] }, { ...principal, id: '' },
    { ...principal, roles: ['root'] }, { ...principal, status: 'unknown' }]) {
    assert.equal(allows(malformed as Principal, 'authenticated'), false);
  }
});
