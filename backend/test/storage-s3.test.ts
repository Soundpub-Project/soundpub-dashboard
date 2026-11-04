import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import test from 'node:test';
import { S3Client } from '@aws-sdk/client-s3';
import { MemoryMetadataRepository, MemoryObjectStorage, S3DevObjectStorage, StorageError } from '../src/storage/index.js';
import type { S3DevStorageOptions } from '../src/storage/index.js';

const owner = { id: 'synthetic-owner' };
const stranger = { id: 'synthetic-stranger' };
const admin = { id: 'synthetic-admin', role: 'admin' };
const data = Buffer.from('synthetic');
const input = { data, mimeType: 'text/plain', checksum: createHash('sha256').update(data).digest('hex') };
const code = (expected: StorageError['code']) => (error: unknown) => error instanceof StorageError && error.code === expected;
const options = (metadata = new MemoryMetadataRepository()): S3DevStorageOptions => ({
  environment: 'test', endpoint: 'http://minio:9000', publicEndpoint: 'http://localhost:9000',
  credentials: { accessKeyId: 'synthetic-access', secretAccessKey: 'synthetic-secret' },
  bucket: 'synthetic-dev', metadata, allowedMimeTypes: ['text/plain'], maxSizeBytes: data.length,
});

test('S3 dev adapter: private setup, persistence, scoped signing, validation and authorization', async t => {
  // Synthetic S3 transport; real AWS presigner runs without contacting Docker.
  const objects = new Map<string, { data: Buffer; mime: string }>();
  const commands: string[] = [];
  let bucket = false;
  let failPolicy = false;
  const notFound = () => Object.assign(new Error('missing'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
  t.mock.method(S3Client.prototype, 'send', async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
    const name = command.constructor.name;
    commands.push(name);
    const request = command.input;
    const key = String(request.Key);
    switch (name) {
      case 'HeadBucketCommand': if (!bucket) throw notFound(); return {};
      case 'CreateBucketCommand': bucket = true; return {};
      case 'DeleteBucketPolicyCommand': if (failPolicy) throw new Error('policy denied'); return {};
      case 'PutObjectCommand':
        objects.set(key, { data: Buffer.from(request.Body as Uint8Array), mime: String(request.ContentType) });
        return {};
      case 'HeadObjectCommand': if (!objects.has(key)) throw notFound(); return {};
      case 'GetObjectCommand': {
        const object = objects.get(key);
        if (!object) throw notFound();
        return { Body: Readable.from([object.data]), ContentLength: object.data.length, ContentType: object.mime };
      }
      case 'DeleteObjectCommand': objects.delete(key); return {};
      default: throw new Error(`Unexpected command: ${name}`);
    }
  });

  const metadata = new MemoryMetadataRepository();
  const storage = await S3DevObjectStorage.create(options(metadata));
  t.after(() => storage.close());
  assert.deepEqual(commands.slice(0, 3), ['HeadBucketCommand', 'CreateBucketCommand', 'DeleteBucketPolicyCommand']);
  const object = await storage.upload(owner, input);
  assert.equal(object.visibility, 'private');
  assert.deepEqual((await storage.getObject(owner, object.id)).data, data);

  const restarted = await S3DevObjectStorage.create(options(metadata));
  t.after(() => restarted.close());
  assert.deepEqual((await restarted.download(admin, object.id)).data, data);
  for (const actor of [stranger, { id: '', role: 'admin' }]) {
    await assert.rejects(storage.download(actor, object.id), code('FORBIDDEN'));
    await assert.rejects(storage.delete(actor, object.id), code('FORBIDDEN'));
    await assert.rejects(storage.signedDownloadUrl(actor, object.id, 60), code('FORBIDDEN'));
  }
  await assert.rejects(storage.download(owner, '../escape'), code('NOT_FOUND'));
  await assert.rejects(storage.download(owner, '00000000-0000-0000-0000-000000000000'), code('NOT_FOUND'));

  const download = new URL(await storage.signedDownloadUrl(owner, object.id, 60));
  assert.equal(download.origin, 'http://localhost:9000');
  assert.equal(download.pathname, `/synthetic-dev/private/objects/${object.id}`);
  assert.equal(download.searchParams.get('X-Amz-Expires'), '60');
  assert.match(download.searchParams.get('X-Amz-SignedHeaders')!, /host/);
  assert.match(download.searchParams.get('X-Amz-Signature')!, /^[a-f0-9]{64}$/);
  for (const ttl of [0, -1, 3601, 1.5]) await assert.rejects(storage.signedUrl(owner, object.id, ttl), code('INVALID_INPUT'));

  const signed = await storage.signedUploadUrl(owner, { ...input, size: data.length }, 60);
  const upload = new URL(signed.url);
  assert.equal(upload.origin, 'http://localhost:9000');
  assert.equal(upload.pathname, `/synthetic-dev/private/staging/${signed.metadata.id}`);
  assert.equal(signed.method, 'PUT');
  assert.equal(signed.headers['x-amz-checksum-sha256'], Buffer.from(input.checksum, 'hex').toString('base64'));
  for (const header of ['host', 'content-length', 'content-type', 'x-amz-checksum-sha256']) {
    assert.ok(upload.searchParams.get('X-Amz-SignedHeaders')!.split(';').includes(header));
  }
  await assert.rejects(storage.download(owner, signed.metadata.id), code('NOT_FOUND'));
  await assert.rejects(storage.signedUrl(owner, signed.metadata.id, 60), code('NOT_FOUND'));
  const stagingKey = `private/staging/${signed.metadata.id}`;
  objects.set(stagingKey, { data, mime: 'text/plain' });
  await assert.rejects(storage.completeUpload(stranger, signed.metadata.id), code('FORBIDDEN'));
  await storage.completeUpload(admin, signed.metadata.id);
  assert.deepEqual((await storage.download(owner, signed.metadata.id)).data, data);
  // Replayed signed PUT stays isolated from verified download key.
  objects.set(stagingKey, { data: Buffer.alloc(data.length), mime: 'text/plain' });
  await assert.rejects(storage.completeUpload(owner, signed.metadata.id), code('INVALID_INPUT'));
  assert.deepEqual((await storage.download(owner, signed.metadata.id)).data, data);
  objects.set(stagingKey, { data, mime: 'text/html' });
  await assert.rejects(storage.completeUpload(owner, signed.metadata.id), code('INVALID_INPUT'));
  objects.set(stagingKey, { data: Buffer.alloc(data.length + 1), mime: 'text/plain' });
  await assert.rejects(storage.completeUpload(owner, signed.metadata.id), code('INVALID_INPUT'));

  for (const invalid of [
    { ...input, mimeType: 'text/html' }, { ...input, data: Buffer.alloc(data.length + 1) },
    { ...input, checksum: '0'.repeat(64) }, { ...input, checksum: 'bad' },
  ]) await assert.rejects(storage.upload(owner, invalid), code('INVALID_INPUT'));
  await assert.rejects(storage.signedUploadUrl({ id: '' }, { ...input, size: data.length }, 60), code('FORBIDDEN'));
  await assert.rejects(storage.signedUploadUrl(owner, { ...input, size: data.length + 1 }, 60), code('INVALID_INPUT'));

  await storage.delete(owner, signed.metadata.id);
  assert.equal(objects.has(stagingKey), false);
  await storage.delete(admin, object.id);
  assert.equal(await metadata.get(object.id), undefined);
  await assert.rejects(storage.download(owner, object.id), code('NOT_FOUND'));
  assert.equal(objects.size, 0);

  failPolicy = true;
  await assert.rejects(S3DevObjectStorage.create(options()), /policy denied/);
  await assert.rejects(S3DevObjectStorage.create({ ...options(), environment: 'production' as 'test' }), code('INVALID_INPUT'));
});

test('MIME bytes gate direct uploads and signed completion before writes or readiness', async t => {
  const valid: [string, Buffer][] = [
    ['image/png', Buffer.from('89504e470d0a1a0a', 'hex')],
    ['image/jpeg', Buffer.from('ffd8ffe0', 'hex')],
    ['application/pdf', Buffer.from('%PDF-1.7\n')],
    ['text/plain', Buffer.from('Tiếng Việt\n日本語\t🎵')],
    ['text/plain', Buffer.from('\ufeffUTF-8 BOM\r\n')],
    ['text/plain', Buffer.alloc(0)],
  ];
  const invalid: [string, Buffer][] = [
    ['image/png', Buffer.from('plain text')],
    ['image/jpeg', Buffer.from('%PDF-1.7')],
    ['application/pdf', valid[0]![1]],
    ['application/pdf', Buffer.from('prefix%PDF-1.7')],
    ['text/plain', Buffer.from('text\0hidden')],
    ['text/plain', Buffer.from([0xc3, 0x28])],
    ['text/plain', Buffer.from([0x80])],
    ['text/plain', Buffer.from([0xc0, 0xaf])],
    ['text/plain', Buffer.from([0xed, 0xa0, 0x80])],
    ['text/plain', Buffer.from([0xe2, 0x82])],
    ['text/plain', valid[0]![1]],
    ['application/octet-stream', Buffer.from('unsupported')],
  ];
  for (const [mimeType, bytes] of valid.slice(0, 3)) {
    const length = mimeType === 'image/png' ? 8 : mimeType === 'image/jpeg' ? 3 : 5;
    for (let size = 0; size < length; size++) invalid.push([mimeType, bytes.subarray(0, size)]);
    const changed = Buffer.from(bytes);
    changed[0] = changed[0]! ^ 1;
    invalid.push([mimeType, changed]);
  }
  const objects = new Map<string, { data: Buffer; mime: string }>();
  t.mock.method(S3Client.prototype, 'send', async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
    const request = command.input;
    const key = String(request.Key);
    switch (command.constructor.name) {
      case 'HeadBucketCommand': case 'DeleteBucketPolicyCommand': return {};
      case 'PutObjectCommand':
        objects.set(key, { data: Buffer.from(request.Body as Uint8Array), mime: String(request.ContentType) });
        return {};
      case 'GetObjectCommand': {
        const object = objects.get(key)!;
        return { Body: Readable.from([object.data]), ContentLength: object.data.length, ContentType: object.mime };
      }
      case 'DeleteObjectCommand': objects.delete(key); return {};
      default: throw new Error('Unexpected S3 command');
    }
  });
  let ready = 0;
  const metadata = Object.assign(new MemoryMetadataRepository(), { markReady: async () => { ready++; } });
  const inserts = t.mock.method(metadata, 'insert');
  const config = { allowedMimeTypes: [...new Set([...valid, ...invalid].map(([mime]) => mime))], maxSizeBytes: 128 };
  const s3 = await S3DevObjectStorage.create({ ...options(), ...config, metadata });
  t.after(() => s3.close());
  const memory = new MemoryObjectStorage(config);
  for (const [mimeType, bytes] of [...valid, ...invalid]) {
    const accepted = valid.some(([mime, data]) => mime === mimeType && data.equals(bytes));
    const input = { data: bytes, mimeType, checksum: createHash('sha256').update(bytes).digest('hex') };
    for (const storage of [s3, memory]) {
      const beforeInserts = inserts.mock.callCount();
      const beforeReady = ready;
      if (accepted) {
        const object = await storage.upload(owner, input);
        assert.deepEqual(Buffer.from((await storage.download(owner, object.id)).data), bytes);
        await storage.delete(owner, object.id);
      } else {
        await assert.rejects(storage.upload(owner, input), code('INVALID_INPUT'), `${mimeType}: direct ${bytes.toString('hex')}`);
        assert.equal(inserts.mock.callCount(), beforeInserts);
        assert.equal(ready, beforeReady);
        assert.equal(objects.size, 0);
      }
    }
    const intent = await s3.signedUploadUrl(owner, { ...input, size: bytes.length }, 60);
    const staging = `private/staging/${intent.metadata.id}`;
    const final = `private/objects/${intent.metadata.id}`;
    objects.set(staging, { data: bytes, mime: mimeType });
    const beforeReady = ready;
    if (accepted) {
      await s3.completeUpload(owner, intent.metadata.id);
      assert.equal(ready, beforeReady + 1);
      assert.equal(objects.has(staging), false);
      assert.deepEqual(objects.get(final)?.data, bytes);
    } else {
      // Correct checksum and matching Content-Type must not let forged bytes become downloadable.
      await assert.rejects(s3.completeUpload(owner, intent.metadata.id), code('INVALID_INPUT'), `${mimeType}: signed ${bytes.toString('hex')}`);
      assert.equal(ready, beforeReady);
      assert.equal(objects.has(final), false);
      assert.deepEqual(objects.get(staging)?.data, bytes);
    }
    await s3.delete(owner, intent.metadata.id);
    assert.equal(objects.size, 0);
  }
});
