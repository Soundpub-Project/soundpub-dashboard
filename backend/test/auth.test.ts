import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthHooks, createIdentityResolver, createPrincipalResolver } from '../src/auth/index.ts';
import type { IdentityConfig, Principal } from '../src/auth/index.ts';

test('dev/mock identity is explicit server config, copied, and forbidden in production', async () => {
  for (const mode of ['dev', 'mock'] as const) {
    assert.throws(() => createIdentityResolver({ environment: 'production', mode,
      identity: { issuer: 'local', subject: 'alice' } }));
    assert.throws(() => createIdentityResolver({ environment: 'test', mode }));
    const identity = { issuer: 'local', subject: 'alice' };
    const resolve = createIdentityResolver({ environment: 'test', mode, identity });
    identity.subject = 'mallory';
    assert.deepEqual(await resolve(), { issuer: 'local', subject: 'alice' });
    assert.ok(Object.isFrozen(await resolve()));
  }
  assert.equal(await createIdentityResolver({ environment: 'production', mode: 'anonymous' })(), null);
  assert.throws(() => createIdentityResolver({ environment: 'staging', mode: 'mock' } as unknown as IdentityConfig));
});

test('repository receives identity only; anonymous skips DB; invalid users fail closed', async () => {
  let calls = 0;
  let row: unknown = { id: 'db-user', status: 'active', roles: ['artist'] };
  const resolve = createPrincipalResolver({ async findByIdentity(identity) {
    calls++;
    assert.deepEqual(identity, { issuer: 'local', subject: 'alice' });
    return row as Principal;
  } });
  assert.equal(await resolve(null), null);
  assert.equal(calls, 0);
  const principal = await resolve({ issuer: 'local', subject: 'alice' });
  assert.deepEqual(principal, row);
  assert.ok(Object.isFrozen(principal?.roles));
  for (const invalid of [null, { id: '', status: 'active', roles: ['admin'] },
    { id: 'u', status: 'unknown', roles: ['admin'] },
    { id: 'u', status: 'active', roles: ['unknown'] },
    { id: 'u', status: 'active', roles: 'admin' }]) {
    row = invalid;
    assert.equal(await resolve({ issuer: 'local', subject: 'alice' }), null);
  }
});

test('hooks ignore client actors/roles; server ownership and DB status decide', async () => {
  let row: Principal | null = { id: 'alice', roles: ['user'], status: 'active' };
  const hooks = createAuthHooks({
    resolveIdentity: createIdentityResolver({ environment: 'test', mode: 'mock',
      identity: { issuer: 'local', subject: 'alice' } }),
    resolvePrincipal: createPrincipalResolver({ async findByIdentity() { return row; } }),
  });
  const request = { headers: { authorization: 'Bearer fake' },
    body: { actor: 'admin', roles: ['superadmin'], ownerId: 'alice' } };
  assert.equal(hooks.getPrincipal(request), null);
  await assert.rejects(hooks.authorize('admin')(request), { statusCode: 403 });
  await assert.rejects(hooks.authorize('owner', async () => 'bob')(request), { statusCode: 403 });
  await hooks.authorize('owner', async () => 'alice')(request);
  row = { id: 'alice', roles: ['superadmin'], status: 'suspended' };
  await assert.rejects(hooks.authorize('superadmin')(request), { statusCode: 403 });
  row = null;
  await assert.rejects(hooks.authorize('authenticated')(request), { statusCode: 401 });
  assert.equal(hooks.getPrincipal(request), null);
});

test('repository errors propagate and clear previous principal', async () => {
  let fail = false;
  const hooks = createAuthHooks({ resolveIdentity: async () => ({ issuer: 'local', subject: 'alice' }),
    resolvePrincipal: createPrincipalResolver({ async findByIdentity() {
      if (fail) throw new Error('DB unavailable');
      return { id: 'alice', roles: ['admin'], status: 'active' };
    } }) });
  const request = {};
  await hooks.authorize('admin')(request);
  fail = true;
  await assert.rejects(hooks.authorize('admin')(request), /DB unavailable/);
  assert.equal(hooks.getPrincipal(request), null);
});
