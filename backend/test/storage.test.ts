import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { MemoryMetadataRepository, MemoryObjectStorage, canAccessObject, StorageError } from '../src/storage/index.ts';

const owner = { id: 'owner' };
const other = { id: 'other' };
const admin = { id: 'admin', role: 'admin' };
const data = new TextEncoder().encode('synthetic');
const input = { data, mimeType: 'text/plain', checksum: createHash('sha256').update(data).digest('hex') };
const error = (code: StorageError['code']) => (value: unknown) => value instanceof StorageError && value.code === code;
function setup() {
  let now = 100000;
  const metadata = new MemoryMetadataRepository();
  const storage = new MemoryObjectStorage({ allowedMimeTypes: ['text/plain'], maxSizeBytes: data.length, metadata, now: () => now });
  return { storage, metadata, advance: (ms: number) => { now += ms; } };
}

test('upload is private, verified, owned and copied; owner/admin can download', async () => {
  const { storage, metadata } = setup();
  const mutable = Uint8Array.from(data);
  const object = await storage.upload(owner, { ...input, data: mutable });
  mutable.fill(0);
  assert.equal(object.visibility, 'private');
  assert.equal(object.ownerId, owner.id);
  assert.equal(object.size, data.length);
  assert.equal(object.checksum, input.checksum);
  assert.deepEqual(await metadata.get(object.id), object);
  assert.deepEqual((await storage.download(owner, object.id)).data, data);
  const result = await storage.download(admin, object.id);
  result.data.fill(0);
  result.metadata.ownerId = other.id;
  assert.deepEqual((await storage.download(owner, object.id)).data, data);
  assert.equal(canAccessObject(other, object), false);
  assert.equal(canAccessObject(admin, object), true);
});

test('non-owner and anonymous access denied for download, delete and signing', async () => {
  const { storage } = setup();
  const object = await storage.upload(owner, input);
  for (const actor of [other, { id: '', role: 'admin' }]) {
    await assert.rejects(storage.download(actor, object.id), error('FORBIDDEN'));
    await assert.rejects(storage.delete(actor, object.id), error('FORBIDDEN'));
    await assert.rejects(storage.signedUrl(actor, object.id, 60), error('FORBIDDEN'));
  }
  await assert.rejects(storage.upload({ id: '' }, input), error('FORBIDDEN'));
});

test('missing objects reject download, delete and signing', async () => {
  const { storage } = setup();
  await assert.rejects(storage.download(owner, 'missing'), error('NOT_FOUND'));
  await assert.rejects(storage.delete(admin, 'missing'), error('NOT_FOUND'));
  await assert.rejects(storage.signedUrl(owner, 'missing', 60), error('NOT_FOUND'));
});

test('owner/admin signing, tamper rejection and exact expiry boundary', async () => {
  const { storage, advance } = setup();
  const object = await storage.upload(owner, input);
  const url = await storage.signedUrl(owner, object.id, 1);
  assert.deepEqual((await storage.downloadSignedUrl(url)).data, data);
  assert.deepEqual((await storage.downloadSignedUrl(await storage.signedUrl(admin, object.id, 1))).data, data);
  await assert.rejects(storage.downloadSignedUrl(url.replace(object.id, 'different')), error('INVALID_SIGNATURE'));
  const tampered = new URL(url);
  tampered.searchParams.set('expires', '999999');
  await assert.rejects(storage.downloadSignedUrl(tampered.href), error('INVALID_SIGNATURE'));
  await assert.rejects(storage.downloadSignedUrl('invalid'), error('INVALID_SIGNATURE'));
  await assert.rejects(setup().storage.downloadSignedUrl(url), error('INVALID_SIGNATURE'));
  advance(999);
  await storage.downloadSignedUrl(url);
  advance(1);
  await assert.rejects(storage.downloadSignedUrl(url), error('EXPIRED'));
  for (const ttl of [0, -1, 0.5, 3601, NaN, Infinity]) {
    await assert.rejects(storage.signedUrl(owner, object.id, ttl), error('INVALID_INPUT'));
  }
});

test('owner/admin delete metadata and bytes; existing URLs stop working', async () => {
  for (const actor of [owner, admin]) {
    const { storage, metadata } = setup();
    const object = await storage.upload(owner, input);
    const url = await storage.signedUrl(owner, object.id, 60);
    await storage.delete(actor, object.id);
    assert.equal(await metadata.get(object.id), undefined);
    await assert.rejects(storage.download(owner, object.id), error('NOT_FOUND'));
    await assert.rejects(storage.downloadSignedUrl(url), error('NOT_FOUND'));
  }
});

test('MIME allowlist, maximum size and checksum reject invalid uploads', async () => {
  const { storage } = setup();
  for (const invalid of [
    { ...input, mimeType: 'text/html' },
    { ...input, mimeType: 'text/plain; charset=utf-8' },
    { ...input, data: new Uint8Array(data.length + 1) },
    { ...input, checksum: '0'.repeat(64) },
    { ...input, checksum: 'invalid' },
  ]) await assert.rejects(storage.upload(owner, invalid), error('INVALID_INPUT'));
  await storage.upload(owner, { ...input, checksum: input.checksum.toUpperCase() });
  assert.throws(() => new MemoryObjectStorage({ allowedMimeTypes: [], maxSizeBytes: 1 }), error('INVALID_INPUT'));
  assert.throws(() => new MemoryObjectStorage({ allowedMimeTypes: ['text/plain'], maxSizeBytes: 0 }), error('INVALID_INPUT'));
});
