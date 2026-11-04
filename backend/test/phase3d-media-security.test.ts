import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Readable } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import type { PoolClient } from 'pg';
import { mediaAuthority } from '../src/media/authority.js';
import { createMediaService, type MediaObjectStore } from '../src/media/index.js';
import { createPublicCatalogService } from '../src/public-catalog/index.js';
import { labelsInTransaction } from '../src/labels/index.js';
import { concurrencyPostgres, waitForBlock } from './support/concurrency-postgres.js';
import { assertMediaSignature, dto, validateUpload, type MediaRow } from '../src/media/contracts.js';
import { ApiError, buildApp, type ApiDependencies, type Principal } from '../src/api/index.js';
import { MemoryMetadataRepository, MemoryObjectStorage, S3DevObjectStorage, StorageError } from '../src/storage/index.js';

const data = Buffer.from('synthetic private media');
const input = { data, mimeType: 'text/plain', checksum: createHash('sha256').update(data).digest('hex') };
const payload = { dataBase64: data.toString('base64'), mimeType: input.mimeType, checksum: input.checksum };
const owner = { id: 'synthetic-owner' };
const forbidden = (error: unknown) => error instanceof StorageError && error.code === 'FORBIDDEN';

function fixture() {
  const metadata = new MemoryMetadataRepository();
  const storage = new MemoryObjectStorage({ metadata, allowedMimeTypes: ['text/plain', 'image/png'], maxSizeBytes: 1024 });
  let principal: Principal | null = { ...owner, roles: ['artist'], status: 'active' };
  let calls = 0;
  const invoke = async <T>(actor: Principal, action: (actor: { id: string; role?: string }) => Promise<T>) => {
    calls++;
    try {
      return await action(actor.roles.some(role => role === 'admin' || role === 'superadmin')
        ? { id: actor.id, role: 'admin' } : { id: actor.id });
    } catch (error) {
      if (error instanceof StorageError) throw new ApiError(error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 400, error.code);
      throw error;
    }
  };
  const deps: ApiDependencies = {
    auth: { authenticate: async token => token === 'same-token' ? principal : null },
    readiness: { check: async () => true }, admin: { suspendUser: async () => {} },
    webhooks: { receive: async () => false }, rateLimiter: { consume: async () => ({ allowed: true }) },
    storage: {
      upload: (actor, value) => invoke(actor, trusted => storage.upload(trusted, value)),
      signedUrl: (actor, id, seconds) => invoke(actor, trusted => storage.signedUrl(trusted, id, seconds)),
    },
  };
  return { storage, metadata, app: buildApp(deps), setPrincipal(value: Principal | null) { principal = value; }, calls: () => calls };
}

const headers = { authorization: 'Bearer same-token' };

test('Phase3D foundation: private objects deny stranger/anonymous read, delete, existence and signing', async t => {
  const { storage, metadata, app } = fixture(); t.after(() => app.close());
  const object = await storage.upload(owner, input);
  assert.equal(object.visibility, 'private');
  for (const actor of [{ id: 'synthetic-stranger' }, { id: '', role: 'admin' }]) {
    await assert.rejects(storage.download(actor, object.id), forbidden);
    await assert.rejects(storage.delete(actor, object.id), forbidden);
    await assert.rejects(storage.objectExists(actor, object.id), forbidden);
    await assert.rejects(storage.signedUrl(actor, object.id, 300), forbidden);
  }
  assert.deepEqual(await metadata.get(object.id), object);
  assert.deepEqual((await storage.download(owner, object.id)).data, Uint8Array.from(data));
});

test('Phase3D foundation: wrong MIME bytes and checksum fail before metadata insertion', async t => {
  const { storage, metadata, app } = fixture(); t.after(() => app.close());
  let inserts = 0;
  const insert = metadata.insert.bind(metadata);
  metadata.insert = async value => { inserts++; await insert(value); };
  for (const invalid of [
    { ...input, mimeType: 'image/png' },
    { ...input, mimeType: 'text/html' },
    { ...input, checksum: '0'.repeat(64) },
    { ...input, checksum: 'malformed' },
    { ...input, data: Buffer.from('different bytes') },
  ]) await assert.rejects(storage.upload(owner, invalid), (error: unknown) => error instanceof StorageError && error.code === 'INVALID_INPUT');
  assert.equal(inserts, 0);
});

test('Phase3D HTTP: anonymous, invalid token, inactive and suspended actors never reach storage', async t => {
  const f = fixture(); t.after(() => f.app.close());
  const object = await f.storage.upload(owner, input);
  for (const request of [
    { method: 'POST' as const, url: '/api/v1/storage/objects', payload },
    { method: 'GET' as const, url: `/api/v1/storage/objects/${object.id}/url` },
  ]) {
    assert.equal((await f.app.inject(request)).statusCode, 401);
    assert.equal((await f.app.inject({ ...request, headers: { authorization: 'Bearer invalid' } })).statusCode, 401);
    for (const status of ['inactive', 'suspended'] as const) {
      f.setPrincipal({ ...owner, roles: ['admin'], status });
      assert.equal((await f.app.inject({ ...request, headers })).statusCode, 403);
    }
  }
  assert.equal(f.calls(), 0);
});

test('Phase3D HTTP: unchanged token loses admin grant after role removal, suspension or identity deletion', async t => {
  const f = fixture(); t.after(() => f.app.close());
  const object = await f.storage.upload(owner, input);
  const sign = () => f.app.inject({ url: `/api/v1/storage/objects/${object.id}/url`, headers });
  f.setPrincipal({ id: 'synthetic-admin', roles: ['admin'], status: 'active' });
  assert.equal((await sign()).statusCode, 200);
  f.setPrincipal({ id: 'synthetic-admin', roles: ['user'], status: 'active' });
  assert.equal((await sign()).statusCode, 403);
  f.setPrincipal({ id: 'synthetic-admin', roles: ['admin'], status: 'suspended' });
  assert.equal((await sign()).statusCode, 403);
  f.setPrincipal(null);
  assert.equal((await sign()).statusCode, 401);
  assert.equal(f.calls(), 2);
});

test('Phase3D HTTP: body/header authority spoofing and private object ID guessing fail', async t => {
  const f = fixture(); t.after(() => f.app.close());
  const object = await f.storage.upload(owner, input);
  for (const extra of [{ ownerId: 'victim' }, { role: 'admin' }, { roles: ['admin'] }, { visibility: 'public' }]) {
    assert.equal((await f.app.inject({ method: 'POST', url: '/api/v1/storage/objects', headers, payload: { ...payload, ...extra } })).statusCode, 400);
  }
  assert.equal(f.calls(), 0);
  f.setPrincipal({ id: 'synthetic-stranger', roles: ['artist'], status: 'active' });
  const denied = await f.app.inject({ url: `/api/v1/storage/objects/${object.id}/url`, headers: { ...headers, 'x-role': 'admin', 'x-user-id': owner.id } });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.json().url, undefined);
  assert.ok(!denied.body.includes('memory://'));
});

test('Phase3D HTTP: wrong MIME/checksum rejected and valid upload remains private', async t => {
  const f = fixture(); t.after(() => f.app.close());
  for (const invalid of [{ ...payload, mimeType: 'image/png' }, { ...payload, checksum: '0'.repeat(64) }]) {
    assert.equal((await f.app.inject({ method: 'POST', url: '/api/v1/storage/objects', headers, payload: invalid })).statusCode, 400);
  }
  const uploaded = await f.app.inject({ method: 'POST', url: '/api/v1/storage/objects', headers, payload });
  assert.equal(uploaded.statusCode, 200);
  assert.equal(uploaded.json().visibility, 'private');
  assert.equal(uploaded.json().ownerId, owner.id);
});

test('Phase3D signed completion: pending access, foreign completion, MIME/size/checksum rejection', async t => {
  const objects = new Map<string, { data: Buffer; mime: string }>();
  const commands: string[] = [];
  const missing = () => Object.assign(new Error('synthetic missing object'), { name: 'NoSuchKey' });
  t.mock.method(S3Client.prototype, 'send', async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
    const { name } = command.constructor;
    commands.push(name);
    const key = String(command.input.Key);
    switch (name) {
      case 'HeadBucketCommand': case 'DeleteBucketPolicyCommand': return {};
      case 'HeadObjectCommand': if (!objects.has(key)) throw missing(); return {};
      case 'GetObjectCommand': {
        const object = objects.get(key); if (!object) throw missing();
        return { Body: Readable.from([object.data]), ContentLength: object.data.length, ContentType: object.mime };
      }
      case 'PutObjectCommand': objects.set(key, { data: Buffer.from(command.input.Body as Uint8Array), mime: String(command.input.ContentType) }); return {};
      case 'DeleteObjectCommand': objects.delete(key); return {};
      default: throw new Error(`Unexpected synthetic transport command: ${name}`);
    }
  });
  let ready = 0;
  const metadata = Object.assign(new MemoryMetadataRepository(), { markReady: async () => { ready++; } });
  const storage = await S3DevObjectStorage.create({
    environment: 'test', endpoint: 'http://127.0.0.1:9000', publicEndpoint: 'http://127.0.0.1:9000',
    credentials: { accessKeyId: 'synthetic-access', secretAccessKey: 'synthetic-secret' },
    bucket: 'synthetic-phase3d', metadata, allowedMimeTypes: ['text/plain'], maxSizeBytes: 1024,
  });
  t.after(() => storage.close());
  const intent = await storage.signedUploadUrl(owner, { ...input, size: data.length }, 60);
  const id = intent.metadata.id;
  const staging = `private/staging/${id}`;
  const final = `private/objects/${id}`;
  const notFound = (error: unknown) => error instanceof StorageError && error.code === 'NOT_FOUND';
  await assert.rejects(storage.download(owner, id), notFound);
  await assert.rejects(storage.signedUrl(owner, id, 60), notFound);
  const before = commands.length;
  await assert.rejects(storage.completeUpload({ id: 'synthetic-stranger' }, id), forbidden);
  assert.equal(commands.length, before, 'denied completion must not read or write provider bytes');
  for (const invalid of [
    { data, mime: 'text/html' },
    { data: Buffer.concat([data, Buffer.from('!')]), mime: input.mimeType },
    { data: Buffer.alloc(data.length, 0x78), mime: input.mimeType },
  ]) {
    objects.set(staging, invalid);
    await assert.rejects(storage.completeUpload(owner, id), (error: unknown) => error instanceof StorageError && error.code === 'INVALID_INPUT');
    assert.equal(ready, 0);
    assert.equal(objects.has(final), false);
    await assert.rejects(storage.signedUrl(owner, id, 60), notFound);
  }
  objects.set(staging, { data, mime: input.mimeType });
  await storage.completeUpload(owner, id);
  assert.equal(ready, 1);
  assert.equal(objects.has(staging), false);
  assert.deepEqual(objects.get(final)?.data, data);
  objects.set(staging, { data: Buffer.alloc(data.length, 0x78), mime: input.mimeType });
  await assert.rejects(storage.completeUpload(owner, id), (error: unknown) => error instanceof StorageError && error.code === 'INVALID_INPUT');
  assert.deepEqual(objects.get(final)?.data, data, 'replayed invalid upload must preserve verified bytes');
});

test('Phase3D media contract: private binding, MIME, size, checksum and legal category validation', () => {
  const valid = { category: 'RELEASE_COVER', resource_type: 'release', resource_id: '00000000-0000-4000-8000-000000000001',
    mime_type: 'image/png', size: 24, checksum: 'a'.repeat(64), filename: 'cover.png' };
  assert.equal(validateUpload(valid).visibility, 'PRIVATE');
  for (const patch of [{ visibility: 'PUBLIC' }, { owner_user_id: 'forged' }, { checksum: 'bad' },
    { resource_type: 'track' }, { mime_type: 'audio/wav' }, { filename: '../cover.png' },
    { size: 0 }, { size: 5 * 1024 ** 2 + 1 }]) {
    assert.throws(() => validateUpload({ ...valid, ...patch }), (error: unknown) => error instanceof ApiError && error.statusCode === 400);
  }
  assert.throws(() => validateUpload({ ...valid, category: 'COPYRIGHT_DOCUMENT' }), (error: unknown) => error instanceof ApiError && error.code === 'BAD_REQUEST');
  for (const mime of ['image/png', 'image/jpeg', 'image/webp', 'audio/wav', 'audio/flac', 'audio/aiff', 'audio/mpeg']) {
    assert.throws(() => assertMediaSignature(Buffer.from('synthetic forged bytes'), mime), (error: unknown) => error instanceof ApiError && error.code === 'MEDIA_MIME_INVALID');
  }
});

test('Phase3D media DTO: valid DB row projects safe fields without leaking storage authority', () => {
  const row: MediaRow = {
    id: '00000000-0000-4000-8000-000000000001', category: 'RELEASE_COVER', resource_type: 'release',
    resource_id: '00000000-0000-4000-8000-000000000002', variant: 'default', visibility: 'PRIVATE',
    mime_type: 'image/png', size: 24, checksum: 'a'.repeat(64), status: 'ACTIVE',
    created_at: '2026-10-29T00:00:00.000Z', updated_at: '2026-10-29T00:00:00.000Z',
    owner_user_id: 'synthetic-owner', bucket: 'synthetic-private', object_key: 'media/objects/synthetic',
    expires_at: new Date('2026-10-29T00:05:00.000Z'), release_id: '00000000-0000-4000-8000-000000000002', track_id: null, profile_id: null,
  };
  const result = dto(row);
  for (const key of ['owner_user_id', 'bucket', 'object_key', 'expires_at', 'release_id', 'track_id', 'profile_id']) assert.equal(key in result, false);
  assert.equal(result.id, row.id);
});

test('Phase3D media authority: fresh roles/status/roster override stale principal; release locks enforced', async () => {
  let current: Principal = { id: 'label-current', roles: ['label'], status: 'active' };
  let labelId = current.id;
  let status = 'draft';
  let archived: string | null = null;
  const target: Principal = { id: 'artist-current', roles: ['artist'], status: 'active' };
  const queries: string[] = [];
  // Synthetic SQL transport: actual repository + authority functions run; no DB connection.
  const db = { async query(sql: string, args: unknown[] = []) {
    queries.push(sql);
    let rows: unknown[];
    if (sql.startsWith('SELECT release_id')) rows = [{ release_id: 'release-current' }];
    else if (sql.startsWith('SELECT artist_id, artist_user_id')) rows = [{ artist_id: 'catalog-current', artist_user_id: target.id }];
    else if (sql.includes('SELECT id, status FROM soundpub.backend_users')) rows = [current, target];
    else if (sql.includes('pg_advisory_xact_lock')) rows = [];
    else if (sql.includes('SELECT user_id, role')) rows = [current, target].flatMap(p => p.roles.map(role => ({ user_id: p.id, role })));
    else if (sql.startsWith('SELECT role FROM')) rows = (args[0] === target.id ? target : current).roles.map(role => ({ role }));
    else if (sql.includes('WHERE u.id = $1 AND')) rows = [{ label_user_id: labelId }];
    else if (sql.startsWith('SELECT * FROM soundpub.artists')) rows = [{ id: 'catalog-current', artist_user_id: target.id, label_id: labelId, management_mode: 'LOGIN_ACCOUNT' }];
    else if (sql.startsWith('SELECT * FROM soundpub.releases')) rows = [{ artist_id: 'catalog-current', artist_user_id: target.id, status, archived_at: archived }];
    else if (sql.startsWith('SELECT id FROM soundpub.artists') || sql.startsWith('SELECT id FROM soundpub.tracks')) rows = [{ id: 'synthetic' }];
    else throw new Error(`Unhandled synthetic authority query: ${sql}`);
    return { rows, rowCount: rows.length };
  } } as unknown as PoolClient;
  const stale: Principal = { id: current.id, roles: ['admin'], status: 'active' };
  const binding = { resource_type: 'release' as const, resource_id: 'release-current' };
  assert.equal((await mediaAuthority(db, stale, binding, true)).current.roles[0], 'label');
  labelId = 'replacement-label';
  await assert.rejects(mediaAuthority(db, stale, binding, true), (error: unknown) => error instanceof ApiError && error.statusCode === 404);
  labelId = current.id;
  current = { ...current, roles: ['user'] };
  await assert.rejects(mediaAuthority(db, stale, binding, false), (error: unknown) => error instanceof ApiError && error.statusCode === 404);
  current = { ...current, roles: ['admin'], status: 'suspended' };
  await assert.rejects(mediaAuthority(db, stale, binding, false), (error: unknown) => error instanceof ApiError && error.statusCode === 403);
  current = { ...current, roles: ['label'], status: 'active' };
  for (status of ['submitted', 'approved', 'active']) {
    await assert.rejects(mediaAuthority(db, stale, binding, true), (error: unknown) => error instanceof ApiError && error.code === 'MEDIA_RESOURCE_LOCKED');
    await mediaAuthority(db, stale, binding, false);
  }
  status = 'draft'; archived = '2026-10-29';
  await assert.rejects(mediaAuthority(db, stale, binding, true), (error: unknown) => error instanceof ApiError && error.code === 'MEDIA_RESOURCE_LOCKED');
  assert.ok(queries.some(sql => sql.includes('FOR UPDATE')));
});

async function domainFixture() {
  const database = await concurrencyPostgres();
  try {
    const artist = { id: randomUUID(), roles: ['artist'] as const, status: 'active' as const };
    const other = { ...artist, id: randomUUID() };
    const labelId = randomUUID();
    await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [labelId]);
    await database.owner.query("INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,'Synthetic label')", [labelId]);
    await database.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'label',now())", [labelId]);
    for (const actor of [artist, other]) {
      await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [actor.id]);
      await database.owner.query("INSERT INTO soundpub.profiles(id,full_name,parent_label_id) VALUES ($1,'Synthetic',$2)", [actor.id,labelId]);
      await database.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'artist',now())", [actor.id]);
      await database.owner.query("INSERT INTO soundpub.artists(artist_user_id,label_id,name,verified_at) VALUES ($1,$2,'Synthetic',now())", [actor.id,labelId]);
    }
    const releaseId = randomUUID();
    const trackId = randomUUID();
    await database.owner.query("INSERT INTO soundpub.releases(id,artist_user_id,label_id,title,artist_name) VALUES ($1,$2,$3,'Synthetic','Synthetic')", [releaseId,artist.id,labelId]);
    await database.owner.query("INSERT INTO soundpub.tracks(id,release_id,title,artist_name,position) VALUES ($1,$2,'Synthetic','Synthetic',1)", [trackId,releaseId]);
    let providerCalls = 0;
    const store: MediaObjectStore = {
      bucket: 'synthetic-private', key: id => `media/objects/${id}`,
      async request(ownerId, value) {
        providerCalls++;
        return { metadata: { id: randomUUID(), ownerId, mimeType: value.mime_type, size: value.size, checksum: value.checksum,
          visibility: 'private', createdAt: new Date().toISOString() }, url: 'http://127.0.0.1/synthetic-put', method: 'PUT', headers: {} };
      },
      async verify() { providerCalls++; }, async download() { providerCalls++; return 'http://127.0.0.1/synthetic-private-capability'; },
      async inspect() { return 'ok'; }, async remove() {}, async removeStaging() {}, async listKeys() { return []; },
      async isReady() { return true; }, close() {},
    };
    const media = createMediaService(database.runtime, store);
    const upload = { category: 'TRACK_AUDIO', resource_type: 'track', resource_id: trackId,
      mime_type: 'audio/wav', size: 44, checksum: 'a'.repeat(64), filename: 'synthetic.wav' };
    return { database, artist, other, labelId, releaseId, trackId, media, upload, providerCalls: () => providerCalls };
  } catch (error) { await database.close(); throw error; }
}

test('Phase3D domain: concurrent transfer invalidates in-flight and reused stale authority', { skip: process.env.RUN_DOCKER_TESTS !== '1' }, async t => {
  const f = await domainFixture(); t.after(() => f.database.close());
  const destination = randomUUID();
  const admin = { id: randomUUID(), roles: ['admin'] as const, status: 'active' as const };
  for (const [id, role] of [[destination, 'label'], [admin.id, 'admin']]) {
    await f.database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [id]);
    await f.database.owner.query("INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,'Synthetic')", [id]);
    await f.database.owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())', [id,role]);
  }
  const stale = { id: f.labelId, roles: ['label'] as const, status: 'active' as const };
  const blocker = await f.database.owner.connect();
  const waiter = await f.database.runtime.connect();
  try {
    await blocker.query('BEGIN'); await waiter.query('BEGIN');
    const blockerPid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const waiterPid = (await waiter.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await labelsInTransaction(blocker).transfer(admin, f.artist.id,
      { labelId: destination, expectedParentLabelId: f.labelId, confirmationPhrase: 'PINDAH LABEL' }, 'agent-c-transfer');
    // Attach rejection handler before releasing blocker: no unhandled rejection race.
    const pending = assert.rejects(mediaAuthority(waiter, stale, { resource_type: 'release', resource_id: f.releaseId }, true),
      (error: unknown) => error instanceof ApiError && error.statusCode === 404);
    await waitForBlock(f.database.owner, waiterPid, blockerPid);
    await blocker.query('COMMIT');
    await pending; await waiter.query('ROLLBACK');
    await assert.rejects(f.media.requestUpload(stale, f.upload), (error: unknown) => error instanceof ApiError && error.statusCode === 404);
    assert.equal(f.providerCalls(), 0);
    assert.equal((await f.media.requestUpload({ ...stale, id: destination }, f.upload)).object.status, 'PENDING');
    assert.equal((await f.database.owner.query('SELECT label_id FROM soundpub.releases WHERE id=$1', [f.releaseId])).rows[0].label_id, f.labelId, 'historical release ownership preserved');
  } finally {
    await blocker.query('ROLLBACK'); await waiter.query('ROLLBACK'); blocker.release(); waiter.release();
  }
});

test('Phase3D domain: foreign bindings and ineligible release states cannot attach media', { skip: process.env.RUN_DOCKER_TESTS !== '1' }, async t => {
  const f = await domainFixture(); t.after(() => f.database.close());
  await assert.rejects(f.media.requestUpload(f.other, f.upload), (error: unknown) => error instanceof ApiError && error.statusCode === 404);
  const intent = await f.media.requestUpload(f.artist, f.upload);
  await assert.rejects(f.media.completeUpload(f.other, intent.object.id), (error: unknown) => error instanceof ApiError && error.statusCode === 404);
  for (const status of ['pending', 'processing', 'active', 'inactive']) {
    await f.database.owner.query('UPDATE soundpub.releases SET status=$2 WHERE id=$1', [f.releaseId,status]);
    await assert.rejects(f.media.completeUpload(f.artist, intent.object.id), (error: unknown) => error instanceof ApiError && error.code === 'MEDIA_RESOURCE_LOCKED');
  }
  assert.equal(f.providerCalls(), 1, 'only authorized upload intent may touch provider');
  assert.equal((await f.database.owner.query('SELECT audio_media_id FROM soundpub.tracks WHERE id=$1', [f.trackId])).rows[0].audio_media_id, null);
  assert.equal((await f.database.owner.query('SELECT status FROM soundpub.media_objects WHERE id=$1', [intent.object.id])).rows[0].status, 'PENDING');
  await f.database.owner.query("UPDATE soundpub.releases SET status='draft' WHERE id=$1", [f.releaseId]);
  const active = await f.media.completeUpload(f.artist, intent.object.id);
  assert.equal(active.status, 'ACTIVE');
  // An ACTIVE object alone cannot grant download when attached to another resource.
  await f.database.owner.query('UPDATE soundpub.tracks SET audio_media_id=NULL WHERE id=$1', [f.trackId]);
  await assert.rejects(f.media.download(f.artist, active.id), (error: unknown) => error instanceof ApiError && error.statusCode === 404);
});

test('Phase3D domain: private audio stays authenticated and absent from anonymous public catalog', { skip: process.env.RUN_DOCKER_TESTS !== '1' }, async t => {
  const f = await domainFixture(); t.after(() => f.database.close());
  const intent = await f.media.requestUpload(f.artist, f.upload);
  await f.media.completeUpload(f.artist, intent.object.id);
  await f.database.owner.query("UPDATE soundpub.releases SET status='active',cover_url='https://private.invalid/cover' WHERE id=$1", [f.releaseId]);
  await f.database.owner.query("UPDATE soundpub.tracks SET clip_url='https://private.invalid/clip',lyrics='private lyrics' WHERE id=$1", [f.trackId]);
  const app = buildApp({ media: f.media, publicCatalog: createPublicCatalogService(f.database.runtime),
    auth: { authenticate: async token => token === 'artist' ? f.artist : token === 'other' ? f.other : null },
    readiness: { check: async () => true }, admin: { suspendUser: async () => {} },
    webhooks: { receive: async () => false }, rateLimiter: { consume: async () => ({ allowed: true }) } });
  t.after(() => app.close());
  const before = f.providerCalls();
  for (const suffix of ['', '/download']) {
    const url = `/api/v1/storage/objects/${intent.object.id}${suffix}`;
    assert.equal((await app.inject(url)).statusCode, 401);
    assert.equal((await app.inject({ url, headers: { authorization: 'Bearer other' } })).statusCode, 404);
  }
  assert.equal(f.providerCalls(), before);
  const allowed = await app.inject({ url: `/api/v1/storage/objects/${intent.object.id}/download`, headers: { authorization: 'Bearer artist' } });
  assert.equal(allowed.statusCode, 200, allowed.body);
  assert.equal(allowed.headers['cache-control'], 'no-store');
  const detail = await app.inject(`/api/v1/public/releases/${f.releaseId}`);
  assert.equal(detail.statusCode, 200, detail.body);
  assert.equal(detail.json().cover_url, null);
  assert.equal(detail.json().tracks[0].audio_url, null);
  assert.equal(detail.json().tracks[0].clip_url, null);
  for (const path of [`/api/v1/public/releases/${f.releaseId}`, '/api/v1/public/releases']) {
    const response = await app.inject(path);
    assert.equal(response.statusCode, 200);
    for (const secret of [intent.object.id, 'synthetic-private-capability', 'private.invalid', 'private lyrics', 'object_key', 'checksum']) assert.ok(!response.body.includes(secret), secret);
  }
  assert.throws(() => validateUpload({ ...f.upload, category: 'COPYRIGHT_DOCUMENT' }), (error: unknown) => error instanceof ApiError && error.code === 'BAD_REQUEST');
});
