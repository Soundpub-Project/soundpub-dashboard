import assert from 'node:assert/strict';
import test from 'node:test';
import { createOpaqueToken, digestOpaqueToken, hashPassword, verifyPassword } from '../src/auth/local-crypto.js';

test('local password hashes are salted, strict and verifiable', async () => {
  const password = 'correct horse battery staple';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.match(first, /^scrypt\$v=1\$ln=17,r=8,p=1\$/);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('wrong password value', first), false);
  assert.equal(await verifyPassword(password, 'invalid'), false);
  for (const invalid of ['short', 'contains\0null', 'x'.repeat(1025)]) {
    await assert.rejects(hashPassword(invalid), /Invalid password/);
  }
});

test('opaque tokens have fixed entropy and deterministic non-secret digests', () => {
  const first = createOpaqueToken();
  const second = createOpaqueToken();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.equal(digestOpaqueToken(first).length, 32);
  assert.deepEqual(digestOpaqueToken(first), digestOpaqueToken(first));
  assert.notDeepEqual(digestOpaqueToken(first), digestOpaqueToken(second));
  assert.throws(() => digestOpaqueToken('invalid'));
});
