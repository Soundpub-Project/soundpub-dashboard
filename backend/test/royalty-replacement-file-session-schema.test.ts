import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { S3Client } from '@aws-sdk/client-s3';
import { MemoryMetadataRepository, S3DevObjectStorage, StorageError } from '../src/storage/index.js';

const migration = readFileSync(new URL('../migrations/0035_royalty_replacement_file_sessions.sql', import.meta.url), 'utf8');
const royaltyStore = readFileSync(new URL('../src/royalties/store.ts', import.meta.url), 'utf8');
const fixedId = '11111111-2222-4333-8444-555555555555';
const checksum = 'ab'.repeat(32);
const invalidInput = (error: unknown) => error instanceof StorageError && error.code === 'INVALID_INPUT';

test('replacement file-session migration enforces operation shape and requester-scoped idempotency', () => {
  assert.match(migration, /ADD COLUMN operation_kind text NOT NULL DEFAULT 'IMPORT'/);
  assert.match(migration, /operation_kind IN \('IMPORT','REPLACEMENT'\)/);
  assert.match(migration, /operation_kind='IMPORT' AND replaces_batch_id IS NULL AND replacement_reason IS NULL/);
  assert.match(migration, /operation_kind='REPLACEMENT' AND replaces_batch_id IS NOT NULL\s+AND replacement_reason IS NOT NULL/);
  assert.match(migration, /ON soundpub\.royalty_import_sessions\(requester_id,request_key\)\s+WHERE request_key IS NOT NULL/);
  assert.match(migration, /ADD COLUMN session_id uuid UNIQUE REFERENCES soundpub\.royalty_import_sessions\(id\)/);
});

test('replacement guard binds optional session without requiring finalized batch_id', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION soundpub\.royalty_replacement_guard\(\)/);
  assert.match(migration, /replacement_session\.operation_kind='REPLACEMENT'/);
  assert.match(migration, /replacement_session\.replaces_batch_id=NEW\.old_batch_id/);
  assert.match(migration, /replacement_session\.replacement_reason=NEW\.reason/);
  assert.match(migration, /replacement_session\.requester_id=NEW\.actor_id/);
  assert.match(migration, /ROYALTY_REPLACEMENT_SESSION_MISMATCH/);
  assert.doesNotMatch(migration, /replacement_session\.batch_id/);
});

test('royalty object store forwards caller-provided session ID to signed storage', () => {
  assert.match(royaltyStore, /requestForId\(ownerId: string, id: string/);
  assert.match(royaltyStore, /requestForId: \(ownerId, id, input\) => storage\.signedUploadUrlForId\(\{ id: ownerId \}, id/);
  assert.match(royaltyStore, /request: \(ownerId, input\) => storage\.signedUploadUrl\(/);
});

test('fixed-ID signed upload validates UUID and stores matching private metadata', async t => {
  t.mock.method(S3Client.prototype, 'send', async (command: { constructor: { name: string } }) => {
    if (['HeadBucketCommand', 'DeleteBucketPolicyCommand'].includes(command.constructor.name)) return {};
    throw new Error(`Unexpected command: ${command.constructor.name}`);
  });
  const metadata = new MemoryMetadataRepository();
  const storage = await S3DevObjectStorage.create({
    environment: 'test', endpoint: 'http://minio:9000', publicEndpoint: 'http://localhost:9000',
    credentials: { accessKeyId: 'synthetic-access', secretAccessKey: 'synthetic-secret' },
    bucket: 'synthetic-royalty', prefix: 'royalty-imports', metadata,
    allowedMimeTypes: ['text/csv'], maxSizeBytes: 1024,
  });
  t.after(() => storage.close());

  const signed = await storage.signedUploadUrlForId({ id: 'owner-id' }, fixedId,
    { mimeType: 'text/csv', size: 12, checksum }, 300);
  assert.equal(signed.metadata.id, fixedId);
  assert.equal(signed.metadata.ownerId, 'owner-id');
  assert.equal(new URL(signed.url).pathname, `/synthetic-royalty/royalty-imports/staging/${fixedId}`);
  assert.deepEqual(await metadata.get(fixedId), signed.metadata);

  for (const id of ['', 'not-a-uuid', `${fixedId}/escape`]) {
    await assert.rejects(storage.signedUploadUrlForId({ id: 'owner-id' }, id,
      { mimeType: 'text/csv', size: 12, checksum }, 300), invalidInput);
  }
  await assert.rejects(storage.signedUploadUrlForId({ id: 'owner-id' }, fixedId,
    null as unknown as { mimeType: string; size: number; checksum: string }, 300), invalidInput);
  await assert.rejects(storage.signedUploadUrlForId({ id: 'owner-id' }, fixedId,
    { mimeType: 'text/plain', size: 12, checksum }, 300), invalidInput);
});
