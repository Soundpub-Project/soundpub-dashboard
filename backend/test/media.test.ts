import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { ApiError } from '../src/api/types.js';
import { registerMediaRoutes } from '../src/api/media.js';
import { createMediaService, createMediaReadinessAdapter, validateUpload, assertMediaSignature, type MediaObjectStore, type MediaRow } from '../src/media/index.js';
import { createSubmissionService } from '../src/submissions/index.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

const artistId = '00000000-0000-4000-8000-000000000901';
const labelId = '00000000-0000-4000-8000-000000000902';
const releaseId = '00000000-0000-4000-8000-000000000903';
const trackId = '00000000-0000-4000-8000-000000000904';
const artist = { id: artistId, status: 'active' as const, roles: ['artist'] as const };
const label = { id: labelId, status: 'active' as const, roles: ['label'] as const };
const png = Buffer.alloc(24);
Buffer.from([137,80,78,71,13,10,26,10]).copy(png); png.write('IHDR', 12);
const checksum = createHash('sha256').update(png).digest('hex');
const input = { category: 'RELEASE_COVER', resource_type: 'release', resource_id: releaseId,
  mime_type: 'image/png', size: png.length, checksum, filename: 'synthetic.png' };
const denied = (code: string) => (error: unknown) => error instanceof ApiError && error.code === code;

test('media trust boundary: strict owner, binding, limits, extensions and signatures', () => {
  assert.equal(validateUpload(input).visibility, 'PRIVATE');
  for (const patch of [{ owner_user_id: artistId }, { resource_type: 'user' }, { filename: '../x.png' },
    { filename: 'x.jpg' }, { size: 6 * 1024 ** 2 }, { visibility: 'PUBLIC' }, { variant: 'dark' }]) {
    assert.throws(() => validateUpload({ ...input, ...patch }), ApiError);
  }
  assert.throws(() => validateUpload({ ...input, category: 'COPYRIGHT_DOCUMENT' }), denied('BAD_REQUEST'));
  assertMediaSignature(png, 'image/png');
  assert.throws(() => assertMediaSignature(Buffer.from('spoof'), 'image/png'), denied('MEDIA_MIME_INVALID'));
  const wav = Buffer.alloc(44); wav.write('RIFF'); wav.write('WAVE', 8);
  assertMediaSignature(wav, 'audio/wav');
});

test('media restricted PostgreSQL lifecycle, readiness, revocation, replacement, cleanup and HTTP', { skip: process.env.RUN_DOCKER_TESTS !== '1' }, async () => {
  const database = await concurrencyPostgres();
  const staged = new Set<string>();
  const final = new Set<string>();
  let verificationFailure: Error | undefined;
  let gate: Promise<void> | undefined;
  let enter: (() => void) | undefined;
  const store: MediaObjectStore = {
    bucket: 'synthetic-media', key: id => `media/objects/${id}`,
    async request(ownerId, value) {
      const id = randomUUID();
      return { metadata: { id, ownerId, mimeType: value.mime_type, size: value.size,
        checksum: value.checksum, visibility: 'private', createdAt: new Date().toISOString() },
      url: `http://localhost/upload/${id}`, method: 'PUT', headers: {} };
    },
    async verify(row) {
      enter?.(); if (gate) await gate;
      if (verificationFailure) throw verificationFailure;
      if (!staged.has(row.id)) throw new ApiError(409, 'MEDIA_BYTES_MISSING');
      final.add(row.id);
    },
    async download(row) { return `http://localhost/download/${row.id}`; },
    async remove(row) { staged.delete(row.id); final.delete(row.id); },
    async removeStaging(row) { staged.delete(row.id); },
    async inspect(row) { return final.has(row.id) ? 'ok' : 'missing'; },
    async listKeys() { return [...final].map(id => `media/objects/${id}`).concat('media/objects/unknown'); },
    close() {},
    async isReady() { return true; },
  };
  const media = createMediaService(database.runtime, store);
  const submission = createSubmissionService(database.runtime, { media: createMediaReadinessAdapter() });
  const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
  app.setErrorHandler((error, _request, reply) => reply.code(error instanceof ApiError ? error.statusCode : (error as { statusCode?: number }).statusCode ?? 500).send({ code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR' }));
  const paths = {};
  registerMediaRoutes(app, media, async request => {
    if (request.headers.authorization !== 'Bearer synthetic') throw new ApiError(401, 'UNAUTHORIZED');
    return artist;
  }, paths);
  const request = async (value: object = input, actor = artist) => media.requestUpload(actor, value, 'synthetic');
  const complete = async (value: object = input) => {
    const upload = await request(value); staged.add(upload.object.id);
    return media.completeUpload(artist, upload.object.id, 'synthetic');
  };
  const row = async (id: string) => (await database.owner.query<MediaRow>('SELECT * FROM soundpub.media_objects WHERE id=$1', [id])).rows[0]!;
  try {
    for (const [id, role] of [[artistId, 'artist'], [labelId, 'label']]) {
      await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [id]);
      await database.owner.query("INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,'Synthetic')", [id]);
      await database.owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())', [id,role]);
    }
    await database.owner.query('UPDATE soundpub.profiles SET parent_label_id=$1 WHERE id=$2', [labelId,artistId]);
    await database.owner.query("INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at) VALUES ($1,$2,'Synthetic',now())", [labelId,artistId]);
    await database.owner.query(`INSERT INTO soundpub.releases(id,artist_user_id,label_id,title,artist_name)
      VALUES ($1,$2,$3,'Synthetic','Synthetic')`, [releaseId,artistId,labelId]);
    await database.owner.query("INSERT INTO soundpub.tracks(id,release_id,title,artist_name,position) VALUES ($1,$2,'Synthetic','Synthetic',1)", [trackId,releaseId]);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/storage/uploads', payload: input })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/storage/uploads', headers: { authorization: 'Bearer synthetic' }, payload: { ...input, owner_user_id: artistId } })).statusCode, 400);
    const http = await app.inject({ method: 'POST', url: '/api/v1/storage/uploads', headers: { authorization: 'Bearer synthetic' }, payload: input });
    assert.equal(http.statusCode, 200, http.body);
    const pending = http.json().object;
    await assert.rejects(media.download(artist,pending.id), denied('NOT_FOUND'));
    await assert.rejects(media.completeUpload(artist,pending.id), denied('MEDIA_BYTES_MISSING'));
    staged.add(pending.id);
    const cover = await media.completeUpload(artist,pending.id);
    assert.equal(cover.status,'ACTIVE'); assert.ok(!('bucket' in cover));
    assert.equal((await media.download(artist,cover.id)).url, `http://localhost/download/${cover.id}`);
    assert.equal((await submission.readiness(artist,releaseId)).blockers.some(v => v.code === 'COVER_REQUIRED'), false);
    const bad = await request(); staged.add(bad.object.id);
    verificationFailure = new Error('Synthetic final S3 PUT failed');
    await assert.rejects(media.completeUpload(artist,bad.object.id), /Synthetic final S3 PUT failed/);
    assert.equal((await row(bad.object.id)).status,'PENDING');
    assert.equal((await row(cover.id)).status,'ACTIVE');
    verificationFailure = new ApiError(400,'MEDIA_CHECKSUM_MISMATCH');
    await assert.rejects(media.completeUpload(artist,bad.object.id), denied('MEDIA_CHECKSUM_MISMATCH'));
    verificationFailure = undefined;
    assert.equal((await row(bad.object.id)).status,'FAILED');
    assert.equal((await row(cover.id)).status,'ACTIVE');
    const next = await complete();
    assert.equal((await row(cover.id)).status,'REPLACED');
    await assert.rejects(media.download(artist,cover.id),denied('NOT_FOUND'));
    assert.equal(final.has(cover.id),true);
    const audio = await complete({ ...input, category: 'TRACK_AUDIO', resource_type: 'track', resource_id: trackId,
      mime_type: 'audio/wav', filename: 'x.wav' });
    assert.equal((await submission.readiness(artist,releaseId)).blockers.some(v => ['COVER_REQUIRED','AUDIO_REQUIRED','MEDIA_UNAVAILABLE'].includes(v.code)),false);
    await database.owner.query("UPDATE soundpub.releases SET status='pending' WHERE id=$1",[releaseId]);
    await assert.rejects(media.delete(artist,audio.id),denied('MEDIA_RESOURCE_LOCKED'));
    await assert.rejects(request(),denied('MEDIA_RESOURCE_LOCKED'));
    await database.owner.query("UPDATE soundpub.releases SET status='draft' WHERE id=$1",[releaseId]);
    const revoked = await media.requestUpload(label,input); staged.add(revoked.object.id);
    await database.owner.query('UPDATE soundpub.artists SET verified_at=NULL WHERE artist_user_id=$1',[artistId]);
    await assert.rejects(media.completeUpload(label,revoked.object.id),denied('NOT_FOUND'));
    await database.owner.query('UPDATE soundpub.artists SET verified_at=now() WHERE artist_user_id=$1',[artistId]);
    await database.owner.query("UPDATE soundpub.backend_users SET status='suspended' WHERE id=$1",[artistId]);
    await assert.rejects(media.download(artist,next.id),denied('FORBIDDEN'));
    await database.owner.query("UPDATE soundpub.backend_users SET status='active' WHERE id=$1",[artistId]);
    await assert.rejects(request({ ...input, resource_id: randomUUID() }),denied('NOT_FOUND'));
    const first = await request(); const second = await request();
    staged.add(first.object.id); staged.add(second.object.id);
    await database.owner.query(`UPDATE soundpub.media_objects SET created_at = CASE WHEN id=$1 THEN now()+interval '1 day'
      ELSE now()-interval '1 day' END WHERE id IN ($1,$2)`, [first.object.id, second.object.id]);
    const concurrent = await Promise.allSettled([media.completeUpload(artist,second.object.id),media.completeUpload(artist,first.object.id)]);
    assert.equal(concurrent[0].status,'fulfilled');
    assert.equal((await row(second.object.id)).status,'ACTIVE');
    assert.equal((await row(first.object.id)).status,'PENDING');
    // Deterministic finalize vs cleanup barrier: cleanup cannot remove locked pending row.
    const blocked = await request(); staged.add(blocked.object.id);
    let release!: () => void; gate = new Promise(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const finalizing = media.completeUpload(artist,blocked.object.id);
    await entered;
    const cleaning = media.cleanup();
    release(); await finalizing; await cleaning; gate = undefined; enter = undefined;
    assert.equal((await row(blocked.object.id)).status,'ACTIVE');
    const reconciliation = await media.reconcile();
    assert.ok(reconciliation.issues.some(issue => issue.reason === 'unknown_object'));
    await database.owner.query("UPDATE soundpub.media_objects SET expires_at=now()-interval '10 minutes',cleanup_after=now()-interval '1 minute' WHERE status <> 'ACTIVE'");
    assert.ok((await media.cleanup()).deleted > 0);
    assert.equal(final.has(cover.id),false);
    assert.equal(final.has(blocked.object.id),true);
    await media.delete(artist,blocked.object.id);
    assert.equal((await database.owner.query('SELECT cover_media_id FROM soundpub.releases WHERE id=$1',[releaseId])).rows[0].cover_media_id,null);
    const avatar = await complete({ ...input, category: 'USER_AVATAR', resource_type: 'user', resource_id: artistId });
    assert.equal((await database.owner.query('SELECT avatar_media_id FROM soundpub.profiles WHERE id=$1',[artistId])).rows[0].avatar_media_id,avatar.id);
    const logo = await media.requestUpload(label,{ ...input, category: 'LABEL_LOGO', resource_type: 'label', resource_id: labelId, variant: 'dark' });
    staged.add(logo.object.id); await media.completeUpload(label,logo.object.id);
    assert.equal((await database.owner.query('SELECT logo_dark_media_id FROM soundpub.profiles WHERE id=$1',[labelId])).rows[0].logo_dark_media_id,logo.object.id);
    await assert.rejects(request({ ...input, category: 'LABEL_LOGO', resource_type: 'label', resource_id: labelId }),denied('NOT_FOUND'));
    await media.delete(artist,audio.id);
    await database.runtime.query('DELETE FROM soundpub.tracks WHERE id=$1',[trackId]);
    assert.equal((await row(audio.id)).track_id,null);
  } finally { await app.close(); await database.close(); }
});


test('media custom authority Docker-free: canonical ownership, fresh revocation and binding locks', async () => {
  const { mediaAuthority } = await import('../src/media/authority.js');
  type Principal = import('../src/auth/index.js').Principal;
  let actor: Principal = { id: 'pic', roles: ['label_custom'], status: 'active' };
  let owner: Principal = actor;
  let unit = { id: 'unit', owner_user_id: 'pic', status: 'active' };
  let catalog = { id: 'catalog', artist_user_id: null, label_id: 'pic', label_custom_unit_id: 'unit', management_mode: 'LABEL_CUSTOM_MANAGED', verified_at: 'now' as string | null };
  let release = { artist_id: 'catalog', artist_user_id: null, status: 'draft', archived_at: null as string | null };
  let trackMatches = true;
  let lockedArtist: typeof catalog | undefined;
  const queries: string[] = [];
  const db = { async query(sql: string, args: unknown[] = []) {
    queries.push(sql);
    let rows: unknown[] = [];
    if (sql.startsWith('SELECT release_id')) rows = [{ release_id: 'release' }];
    else if (sql.startsWith('SELECT artist_id,')) rows = [release];
    else if (sql.includes('SELECT id, status FROM soundpub.backend_users')) rows = [actor, ...(actor.id === owner.id ? [] : [owner])];
    else if (sql.includes('SELECT user_id, role')) rows = [actor, owner].flatMap(p => p.roles.map(role => ({ user_id: p.id, role })));
    else if (sql.includes('pg_advisory_xact_lock')) rows = [];
    else if (sql.startsWith('SELECT * FROM soundpub.artists')) rows = [sql.includes('FOR UPDATE') ? lockedArtist ?? catalog : catalog];
    else if (sql.startsWith('SELECT * FROM soundpub.label_custom_units')) rows = [unit];
    else if (sql.startsWith('SELECT * FROM soundpub.releases')) rows = [release];
    else if (sql.startsWith('SELECT id FROM soundpub.tracks')) { assert.equal(args[2], catalog.id); rows = trackMatches ? [{ id: 'track' }] : []; }
    else if (sql.startsWith('SELECT role FROM')) rows = owner.roles.map(role => ({ role }));
    else if (sql.startsWith('SELECT id FROM soundpub.profiles')) rows = [{ id: owner.id }];
    else throw Error(`Unhandled SQL: ${sql}`);
    return { rows, rowCount: rows.length };
  } } as unknown as import('pg').PoolClient;
  const stale: Principal = { ...actor, roles: ['admin'] };
  const binding = { resource_type: 'track' as const, resource_id: 'track' };
  await mediaAuthority(db, stale, binding, true);
  await mediaAuthority(db, stale, { resource_type: 'label', resource_id: owner.id }, true);
  assert.ok(queries.findIndex(q => q.includes('backend_users')) < queries.findIndex(q => q.includes('label_custom_units')));
  assert.ok(queries.some(q => q.includes('artists WHERE id=$1 FOR UPDATE')));
  assert.ok(queries.some(q => q.includes('label_custom_units') && q.includes('FOR UPDATE')));
  const hidden = (e: unknown) => e instanceof ApiError && e.statusCode === 404;
  unit.status = 'inactive';
  for (const write of [true, false]) await assert.rejects(mediaAuthority(db, stale, binding, write), hidden);
  await assert.rejects(mediaAuthority(db, stale, { resource_type: 'label', resource_id: owner.id }, true), hidden);
  unit.status = 'active'; catalog.verified_at = null;
  await assert.rejects(mediaAuthority(db, stale, binding, false), hidden);
  catalog.verified_at = 'now'; owner = { ...owner, roles: ['user'] }; actor = owner;
  await assert.rejects(mediaAuthority(db, stale, binding, true), hidden);
  owner = { ...owner, roles: ['label_custom'] }; actor = { ...owner, id: 'foreign-pic' };
  await assert.rejects(mediaAuthority(db, actor, binding, false), hidden);
  actor = { ...actor, roles: ['label'] };
  await assert.rejects(mediaAuthority(db, actor, binding, true), hidden);
  actor = { ...actor, roles: ['admin'] };
  await mediaAuthority(db, actor, binding, true);
  actor = { ...actor, status: 'suspended' };
  await assert.rejects(mediaAuthority(db, { ...actor, status: 'active' }, binding, false), (e: unknown) => e instanceof ApiError && e.statusCode === 403);
  actor = owner;
  lockedArtist = { ...catalog, label_custom_unit_id: 'different-unit' };
  await assert.rejects(mediaAuthority(db, stale, binding, true), denied('CONFLICT'));
  lockedArtist = undefined; trackMatches = false;
  await assert.rejects(mediaAuthority(db, stale, binding, true), hidden);
  trackMatches = true;
  release = { ...release, artist_id: 'forged-catalog' };
  await assert.rejects(mediaAuthority(db, stale, binding, true), denied('CONFLICT'));
  release = { ...release, artist_id: catalog.id, status: 'active' };
  await assert.rejects(mediaAuthority(db, stale, binding, true), denied('MEDIA_RESOURCE_LOCKED'));
  await mediaAuthority(db, stale, binding, false);
});


test('media custom upload Docker-free: uploader audit identity and resource authority stay distinct', async () => {
  const pic = { id: '00000000-0000-4000-8000-000000000911', roles: ['label_custom'] as const, status: 'active' as const };
  const admin = { id: '00000000-0000-4000-8000-000000000912', roles: ['admin'] as const, status: 'active' as const };
  const catalog = { id: 'catalog', artist_user_id: null, label_id: pic.id, label_custom_unit_id: 'unit', management_mode: 'LABEL_CUSTOM_MANAGED', verified_at: 'now' };
  let unitStatus = 'active';
  let providerCalls = 0;
  let stored: MediaRow;
  const auditActors: unknown[] = [];
  const db = { release() {}, async query(sql: string, args: unknown[] = []) {
    let rows: unknown[] = [];
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows, rowCount: 0 };
    if (sql.startsWith('SELECT artist_id,')) rows = [{ artist_id: catalog.id, artist_user_id: null }];
    else if (sql.startsWith('SELECT * FROM soundpub.artists')) rows = [catalog];
    else if (sql.includes('SELECT id, status FROM soundpub.backend_users')) rows = [pic, admin];
    else if (sql.includes('SELECT user_id, role')) rows = [pic, admin].flatMap(p => p.roles.map(role => ({ user_id: p.id, role })));
    else if (sql.includes('pg_advisory_xact_lock')) rows = [];
    else if (sql.startsWith('SELECT role FROM')) rows = [{ role: 'label_custom' }];
    else if (sql.startsWith('SELECT * FROM soundpub.label_custom_units')) rows = [{ id: 'unit', owner_user_id: pic.id, status: unitStatus }];
    else if (sql.startsWith('SELECT * FROM soundpub.releases')) rows = [{ artist_id: catalog.id, artist_user_id: null, status: 'draft' }];
    else if (sql.includes('INSERT INTO soundpub.media_objects')) {
      assert.equal(args[3], admin.id, 'storage owner remains uploader, not resource PIC');
      stored = { id: args[0], owner_user_id: args[3], bucket: args[1], object_key: args[2], ...validateUpload(input), status: 'PENDING', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), expires_at: args[14], profile_id: null, release_id: releaseId, track_id: null } as MediaRow;
      rows = [stored];
    } else if (sql.includes('INSERT INTO soundpub.audit_logs')) auditActors.push(args[0]);
    else if (sql.startsWith('SELECT * FROM soundpub.media_objects')) rows = [stored!];
    else throw Error(`Unhandled SQL: ${sql}`);
    return { rows, rowCount: rows.length };
  } };
  const pool = { connect: async () => db } as unknown as import('pg').Pool;
  const store = { bucket: 'synthetic', key: (id: string) => `media/objects/${id}`, async request(ownerId: string) {
    providerCalls++;
    return { metadata: { id: randomUUID(), ownerId }, url: 'http://127.0.0.1/put', method: 'PUT', headers: {} };
  } } as unknown as MediaObjectStore;
  const service = createMediaService(pool, store);
  const intent = await service.requestUpload(admin, input);
  assert.deepEqual(auditActors, [admin.id]);
  unitStatus = 'inactive';
  for (const action of [() => service.requestUpload(admin, input), () => service.completeUpload(admin, intent.object.id),
    () => service.get(admin, intent.object.id), () => service.download(admin, intent.object.id), () => service.delete(admin, intent.object.id)]) {
    await assert.rejects(action(), denied('NOT_FOUND'));
  }
  assert.equal(providerCalls, 1, 'revocation blocks every capability and mutation before provider access');
});
