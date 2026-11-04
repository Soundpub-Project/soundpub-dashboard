import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { ApiError } from '../src/api/types.js';
import { createMediaService, createMediaReadinessAdapter, type MediaObjectStore } from '../src/media/index.js';
import { createSubmissionService, MockSubmissionProvider } from '../src/submissions/index.js';
import { concurrencyPostgres, waitForBlock } from './support/concurrency-postgres.js';

function barrier() {
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  async function bounded(promise: Promise<void>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([promise, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Mock store barrier timed out')), 8000);
      })]);
    } finally { clearTimeout(timer); }
  }
  return { get entered() { return bounded(entered); }, release, async stop() {
    enter();
    await bounded(released);
  } };
}
const denied = (code: string) => (error: unknown) => error instanceof ApiError && error.code === code;
// Observe rejection immediately, including while a competing transaction is paused.
const outcome = <T>(promise: Promise<T>) => promise.then(value => ({ value, error: undefined }), error => ({ value: undefined, error }));

async function fixture() {
  const database = await concurrencyPostgres();
  const lanes = [0, 1].map(() => new pg.Pool({ ...database.runtime.options, max: 1 }));
  try {
    const artist = { id: randomUUID(), roles: ['artist'] as const, status: 'active' as const };
    const label = randomUUID(), release = randomUUID(), track = randomUUID();
    for (const [id, role] of [[label, 'label'], [artist.id, 'artist']]) {
      await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [id]);
      await database.owner.query("INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,'Synthetic')", [id]);
      await database.owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())', [id, role]);
    }
    await database.owner.query('UPDATE soundpub.profiles SET parent_label_id=$1 WHERE id=$2', [label, artist.id]);
    await database.owner.query("INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at) VALUES ($1,$2,'Synthetic',now())", [label, artist.id]);
    await database.owner.query(`INSERT INTO soundpub.releases(id,label_id,artist_user_id,title,artist_name,release_type,genre,release_date)
      VALUES ($1,$2,$3,'Synthetic','Synthetic','single','Pop','2026-12-01')`, [release, label, artist.id]);
    await database.owner.query("INSERT INTO soundpub.tracks(id,release_id,title,artist_name,position) VALUES ($1,$2,'Synthetic','Synthetic',1)", [track, release]);
    const bytes = new Set<string>(), removed: string[] = [], verified: string[] = [], signed: string[] = [];
    let pause: { method: 'verify' | 'download' | 'remove'; id: string; gate: ReturnType<typeof barrier> } | undefined;
    const gates: ReturnType<typeof barrier>[] = [];
    async function stop(method: 'verify' | 'download' | 'remove', id: string) {
      if (pause?.method === method && pause.id === id) await pause.gate.stop();
    }
    const store: MediaObjectStore = {
      bucket: 'synthetic-phase3d-concurrency', key: id => `media/objects/${id}`,
      async request(ownerId, input) {
        const id = randomUUID(); bytes.add(id);
        return { metadata: { id, ownerId, mimeType: input.mime_type, size: input.size, checksum: input.checksum,
          visibility: 'private', createdAt: new Date().toISOString() }, url: 'http://127.0.0.1/mock-upload', method: 'PUT', headers: {} };
      },
      async verify(row) { verified.push(row.id); await stop('verify', row.id); assert.ok(bytes.has(row.id)); },
      async download(row) { await stop('download', row.id); assert.ok(bytes.has(row.id)); signed.push(row.id); return 'http://127.0.0.1/mock-private-capability'; },
      async remove(row) { await stop('remove', row.id); bytes.delete(row.id); removed.push(row.id); },
      async removeStaging() {}, async inspect(row) { return bytes.has(row.id) ? 'ok' : 'missing'; },
      async listKeys() { return [...bytes].map(id => store.key(id)); }, async isReady() { return true; }, close() {},
    };
    const media = lanes.map(pool => createMediaService(pool, store));
    const pids = await Promise.all(lanes.map(async pool => (await pool.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number));
    async function upload(category: 'USER_AVATAR' | 'RELEASE_COVER' | 'TRACK_AUDIO') {
      const audio = category === 'TRACK_AUDIO';
      return (await media[0]!.requestUpload(artist, { category,
        resource_type: audio ? 'track' : category === 'USER_AVATAR' ? 'user' : 'release',
        resource_id: audio ? track : category === 'USER_AVATAR' ? artist.id : release,
        mime_type: audio ? 'audio/wav' : 'image/png', filename: audio ? 'synthetic.wav' : 'synthetic.png',
        size: 44, checksum: 'a'.repeat(64) })).object.id;
    }
    return { database, lanes, artist, release, track, media, pids, bytes, removed, verified, signed, upload,
      pause(method: 'verify' | 'download' | 'remove', id: string) { const gate = barrier(); gates.push(gate); pause = { method, id, gate }; return gate; },
      async status(id: string) { return (await database.owner.query('SELECT status FROM soundpub.media_objects WHERE id=$1', [id])).rows[0].status; },
      async close() { gates.forEach(gate => gate.release()); await Promise.all(lanes.map(pool => pool.end())); await database.close(); },
    };
  } catch (error) { await Promise.all(lanes.map(pool => pool.end())); await database.close(); throw error; }
}

test('Phase3D race: two avatar replacements serialize; newest request wins and stale retry conflicts', { skip: process.env.RUN_DOCKER_TESTS !== '1' }, async t => {
  const f = await fixture(); t.after(() => f.close());
  const old = await f.upload('USER_AVATAR'); await f.media[0]!.completeUpload(f.artist, old);
  const first = await f.upload('USER_AVATAR'), second = await f.upload('USER_AVATAR');
  const gate = f.pause('verify', second);
  const winner = outcome(f.media[0]!.completeUpload(f.artist, second));
  await gate.entered;
  const loser = outcome(f.media[1]!.completeUpload(f.artist, first));
  try { await waitForBlock(f.database.owner, f.pids[1]!, f.pids[0]!); } finally { gate.release(); }
  assert.equal((await winner).value?.status, 'ACTIVE');
  assert.ok(denied('CONFLICT')((await loser).error));
  assert.equal(await f.status(old), 'REPLACED'); assert.equal(await f.status(first), 'PENDING');
  assert.equal(await f.status(second), 'ACTIVE');
  assert.equal((await f.database.owner.query('SELECT avatar_media_id FROM soundpub.profiles WHERE id=$1', [f.artist.id])).rows[0].avatar_media_id, second);
  assert.ok(!f.verified.includes(first));
  assert.equal((await f.database.owner.query("SELECT count(*)::int AS n FROM soundpub.media_objects WHERE status='ACTIVE' AND profile_id=$1", [f.artist.id])).rows[0].n, 1);
});

test('Phase3D race: cover replacement waits for release state commit and preserves previous binding', { skip: process.env.RUN_DOCKER_TESTS !== '1' }, async t => {
  const f = await fixture(); t.after(() => f.close());
  const old = await f.upload('RELEASE_COVER'); await f.media[0]!.completeUpload(f.artist, old);
  const next = await f.upload('RELEASE_COVER');
  const writer = await f.database.owner.connect();
  try {
    await writer.query('BEGIN'); const pid = (await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await writer.query("UPDATE soundpub.releases SET status='pending' WHERE id=$1", [f.release]);
    const completion = outcome(f.media[1]!.completeUpload(f.artist, next));
    await waitForBlock(f.database.owner, f.pids[1]!, pid); await writer.query('COMMIT');
    assert.ok(denied('MEDIA_RESOURCE_LOCKED')((await completion).error));
  } finally { await writer.query('ROLLBACK'); writer.release(); }
  assert.equal(await f.status(next), 'PENDING'); assert.equal(await f.status(old), 'ACTIVE');
  assert.ok(!f.verified.includes(next));
  assert.equal((await f.database.owner.query('SELECT cover_media_id FROM soundpub.releases WHERE id=$1', [f.release])).rows[0].cover_media_id, old);
});

test('Phase3D race: audio replacement blocks submission; stale version fails then fresh submission succeeds', { skip: process.env.RUN_DOCKER_TESTS !== '1' }, async t => {
  const f = await fixture(); t.after(() => f.close());
  for (const category of ['RELEASE_COVER', 'TRACK_AUDIO'] as const) await f.media[0]!.completeUpload(f.artist, await f.upload(category));
  const next = await f.upload('TRACK_AUDIO');
  const version = (await f.database.owner.query('SELECT version FROM soundpub.releases WHERE id=$1', [f.release])).rows[0].version;
  const service = createSubmissionService(f.lanes[1]!, { media: createMediaReadinessAdapter(),
    payment: { isReleasePaymentSatisfied: async () => true }, provider: new MockSubmissionProvider() });
  const gate = f.pause('verify', next), completion = outcome(f.media[0]!.completeUpload(f.artist, next));
  await gate.entered;
  const submission = outcome(service.submit(f.artist, f.release, { version }, 'phase3d-race'));
  try { await waitForBlock(f.database.owner, f.pids[1]!, f.pids[0]!); } finally { gate.release(); }
  assert.equal((await completion).value?.status, 'ACTIVE'); assert.ok(denied('CONFLICT')((await submission).error));
  const fresh = (await f.database.owner.query('SELECT version FROM soundpub.releases WHERE id=$1', [f.release])).rows[0].version;
  assert.equal((await service.submit(f.artist, f.release, { version: fresh }, 'phase3d-retry')).status, 'pending_paid');
  assert.equal((await f.database.owner.query('SELECT audio_media_id FROM soundpub.tracks WHERE id=$1', [f.track])).rows[0].audio_media_id, next);
  await assert.rejects(f.media[0]!.completeUpload(f.artist, next), denied('MEDIA_RESOURCE_LOCKED'));
});

test('Phase3D race: delete waits for in-flight download; later downloads deny without signing', { skip: process.env.RUN_DOCKER_TESTS !== '1' }, async t => {
  const f = await fixture(); t.after(() => f.close());
  const id = await f.upload('USER_AVATAR'); await f.media[0]!.completeUpload(f.artist, id);
  const gate = f.pause('download', id), download = outcome(f.media[0]!.download(f.artist, id));
  await gate.entered;
  const deletion = outcome(f.media[1]!.delete(f.artist, id));
  try { await waitForBlock(f.database.owner, f.pids[1]!, f.pids[0]!); } finally { gate.release(); }
  assert.ok((await download).value?.url); assert.equal((await deletion).value?.status, 'deleted');
  await assert.rejects(f.media[0]!.download(f.artist, id), denied('NOT_FOUND'));
  assert.deepEqual(f.signed, [id]); assert.equal(await f.status(id), 'DELETED');
  assert.ok(f.bytes.has(id), 'existing capability bytes retained until cleanup grace');
  assert.equal((await f.database.owner.query('SELECT avatar_media_id FROM soundpub.profiles WHERE id=$1', [f.artist.id])).rows[0].avatar_media_id, null);
});

test('Phase3D race: completion waits for authority removal and rejects unchanged stale principal', { skip: process.env.RUN_DOCKER_TESTS !== '1' }, async t => {
  const f = await fixture(); t.after(() => f.close());
  const id = await f.upload('USER_AVATAR'), writer = await f.database.owner.connect();
  try {
    await writer.query('BEGIN'); const pid = (await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await writer.query('SELECT id FROM soundpub.backend_users WHERE id=$1 FOR UPDATE', [f.artist.id]);
    await writer.query('DELETE FROM soundpub.user_roles WHERE user_id=$1', [f.artist.id]);
    const completion = outcome(f.media[1]!.completeUpload(f.artist, id));
    await waitForBlock(f.database.owner, f.pids[1]!, pid); await writer.query('COMMIT');
    assert.ok(denied('FORBIDDEN')((await completion).error));
  } finally { await writer.query('ROLLBACK'); writer.release(); }
  assert.equal(await f.status(id), 'PENDING'); assert.deepEqual(f.verified, []);
  await assert.rejects(f.media[0]!.completeUpload(f.artist, id), denied('FORBIDDEN'));
  assert.equal((await f.database.owner.query('SELECT avatar_media_id FROM soundpub.profiles WHERE id=$1', [f.artist.id])).rows[0].avatar_media_id, null);
});

test('Phase3D race: cleanup skips locked finalize and finalize rejects object claimed by cleanup', { skip: process.env.RUN_DOCKER_TESTS !== '1' }, async t => {
  const f = await fixture(); t.after(() => f.close());
  const id = await f.upload('USER_AVATAR');
  // Valid intent with due cleanup exercises SKIP LOCKED independently of expiry validation.
  await f.database.owner.query("UPDATE soundpub.media_objects SET cleanup_after=now()-interval '1 minute' WHERE id=$1", [id]);
  const gate = f.pause('verify', id), completion = outcome(f.media[0]!.completeUpload(f.artist, id));
  await gate.entered;
  try { assert.equal((await f.media[1]!.cleanup()).deleted, 0); } finally { gate.release(); }
  assert.equal((await completion).value?.status, 'ACTIVE'); assert.ok(f.bytes.has(id));
  const expired = await f.upload('USER_AVATAR');
  await f.database.owner.query("UPDATE soundpub.media_objects SET expires_at=now()-interval '2 minutes',cleanup_after=now()-interval '1 minute' WHERE id=$1", [expired]);
  const removing = f.pause('remove', expired), cleanup = outcome(f.media[0]!.cleanup());
  await removing.entered;
  const finalize = outcome(f.media[1]!.completeUpload(f.artist, expired));
  try { await waitForBlock(f.database.owner, f.pids[1]!, f.pids[0]!); } finally { removing.release(); }
  assert.equal((await cleanup).value?.deleted, 1); assert.ok(denied('MEDIA_UPLOAD_EXPIRED')((await finalize).error));
  assert.equal(await f.status(expired), 'DELETED'); assert.ok(!f.bytes.has(expired));
  assert.equal(await f.status(id), 'ACTIVE'); assert.deepEqual(f.removed, [expired]);
  assert.equal((await f.database.owner.query('SELECT avatar_media_id FROM soundpub.profiles WHERE id=$1', [f.artist.id])).rows[0].avatar_media_id, id);
});
