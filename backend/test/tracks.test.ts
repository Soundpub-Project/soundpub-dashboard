import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';
import type { Principal } from '../src/auth/index.js';
import { ApiError } from '../src/api/types.js';
import { createTracksService, trackCreate, trackPatch, trackReorder, type TracksOptions } from '../src/tracks/index.js';

const actorId = '10000000-0000-4000-8000-000000000001';
const releaseId = '20000000-0000-4000-8000-000000000001';
const trackId = '30000000-0000-4000-8000-000000000001';
const secondId = '30000000-0000-4000-8000-000000000002';
const actor: Principal = { id: actorId, roles: ['artist'], status: 'active' };
const failure = (status: number) => (error: unknown) => error instanceof ApiError && error.statusCode === status;
function fixture(config: { roles?: Principal['roles']; status?: Principal['status']; parentStatus?: string;
  missingParent?: boolean; auditFailure?: boolean; conflict?: boolean; foreignOwner?: boolean;
  historicalLabel?: boolean; currentLabel?: boolean; artistVerified?: boolean; archived?: boolean } = {}, options: TracksOptions = {}) {
  const queries: { sql: string; values: unknown[] }[] = [];
  let released = false;
  let parent = { id: releaseId, artist_user_id: config.foreignOwner ? secondId : actorId,
    label_id: config.historicalLabel ? actorId : null, status: config.parentStatus ?? 'draft', version: 1,
    archived_at: config.archived ? '2026-01-01' : null };
  let tracks = [trackId, secondId].map((id, index) => ({ id, release_id: releaseId, title: 'Track', artist_name: 'Artist',
    position: index + 1, version: 1, genre: null, composer: null, lyricist: null, lyrics: null, isrc: null,
    duration: null, explicit_lyrics: false, created_at: '2026-01-01', updated_at: '2026-01-01' }));
  let snapshot = structuredClone({ parent, tracks });
  const client = {
    async query(sql: string, values: unknown[] = []) {
      queries.push({ sql, values });
      let rows: unknown[] = []; let rowCount = 0;
      if (sql === 'BEGIN') snapshot = structuredClone({ parent, tracks });
      else if (sql === 'ROLLBACK') ({ parent, tracks } = structuredClone(snapshot));
      else if (sql.includes('SELECT id, status FROM soundpub.backend_users')) rows = [{ id: actorId, status: config.status ?? 'active' }];
      else if (sql.includes('SELECT user_id, role')) rows = (config.roles ?? ['artist']).map(role => ({ user_id: actorId, role }));
      else if (sql.includes('AS verified,')) rows = [{ verified: config.artistVerified ?? true, label_id: config.currentLabel ? actorId : null }];
      else if (sql.startsWith('SELECT release_id')) rows = tracks.filter(t => t.id === values[0]).map(t => ({ release_id: t.release_id }));
      else if (sql.includes('FROM soundpub.releases')) rows = config.missingParent ? [] : [parent];
      else if (sql.startsWith('SELECT') && sql.includes('FROM soundpub.tracks')) {
        rows = sql.includes('WHERE id=$1') ? tracks.filter(t => t.id === values[0] && t.release_id === values[1]) : [...tracks].sort((a, b) => a.position - b.position);
      } else if (sql.startsWith('INSERT INTO soundpub.tracks')) {
        tracks.push({ ...tracks[0]!, id: values[0] as string, title: values[2] as string, artist_name: values[3] as string,
          position: Math.max(0, ...tracks.map(t => t.position)) + 1 }); rowCount = 1;
      } else if (sql.startsWith('UPDATE soundpub.tracks SET title=')) {
        const track = tracks.find(t => t.id === values[0] && t.version === values[2]);
        if (track && !config.conflict) { track.title = values[3] as string; track.version++; rowCount = 1; }
      } else if (sql.startsWith('UPDATE soundpub.tracks t')) {
        (values[1] as string[]).forEach((id, i) => { const track = tracks.find(t => t.id === id)!;
          track.position = i + 1; track.version++; });
        assert.equal(new Set(tracks.map(t => t.position)).size, tracks.length);
      } else if (sql.startsWith('DELETE FROM soundpub.tracks')) {
        const before = tracks.length; tracks = tracks.filter(t => t.id !== values[0] || t.version !== values[2]); rowCount = before - tracks.length;
      } else if (sql.startsWith('UPDATE soundpub.releases')) {
        if (parent.version === values[1]) { parent.version++; rowCount = 1; }
      } else if (sql.startsWith('INSERT INTO soundpub.audit_logs') && config.auditFailure) throw new Error('synthetic audit failure');
      return { rows: structuredClone(rows), rowCount: rowCount || rows.length };
    },
    release() { released = true; },
  };
  return { service: createTracksService({ connect: async () => client } as unknown as Pool, options), queries,
    state: () => ({ parent, tracks }), released: () => released };
}

test('strict contracts forbid parent reassignment, ownership, status, position and version forgery', () => {
  for (const field of ['artist_id', 'release_id', 'artist_user_id', 'label_id', 'status', 'position', 'created_by', 'audio_url']) {
    assert.equal(trackPatch.safeParse({ title: 'Title', version: 1, release_version: 1, [field]: releaseId }).success, false);
  }
  assert.equal(trackCreate.safeParse({ title: ' ', artist_name: 'Artist', release_version: 1 }).success, false);
  assert.equal(trackPatch.safeParse({ version: 1, release_version: 1 }).success, false);
  assert.equal(trackReorder.safeParse({ release_version: 1, track_ids: [trackId, trackId] }).success, false);
  assert.equal(trackCreate.safeParse({ title: 'Title', artist_name: 'Artist', release_version: 0 }).success, false);
});

test('backend authority overrides caller claims; missing and foreign parents fail closed', async () => {
  for (const config of [{ roles: ['user'] as const }, { foreignOwner: true }, { missingParent: true }]) {
    const f = fixture(config);
    await assert.rejects(f.service.list({ ...actor, roles: ['superadmin'] }, releaseId), failure(404));
    assert.equal(f.queries.at(-1)?.sql, 'ROLLBACK');
  }
  const suspended = fixture({ status: 'suspended' });
  await assert.rejects(suspended.service.get(actor, trackId), failure(403));
  const invalid = fixture();
  await assert.rejects(invalid.service.get(actor, 'invalid'), failure(400));
  assert.equal(invalid.queries.length, 0);
});

test('list/detail stable; create appends uniquely and increments parent version with audit', async () => {
  const f = fixture();
  assert.deepEqual((await f.service.list(actor, releaseId)).items.map(t => t.id), [trackId, secondId]);
  assert.equal((await f.service.get(actor, trackId)).id, trackId);
  const start = f.queries.length;
  const result = await f.service.create(actor, releaseId, { title: 'New', artist_name: 'Artist', release_version: 1 }, 'request');
  assert.equal(result.track.position, 3); assert.equal(result.release_version, 2);
  const writes = f.queries.slice(start);
  assert.ok(writes.findIndex(q => q.sql.includes('FROM soundpub.releases') && q.sql.includes('FOR UPDATE')) <
    writes.findIndex(q => q.sql.startsWith('INSERT INTO soundpub.tracks')));
  assert.ok(writes.some(q => q.sql.includes("'track'") && q.values[1] === 'track.created'));
  assert.equal(writes.at(-1)?.sql, 'COMMIT');
});

test('former label denied after transfer; current verified roster grants authority independent of history', async () => {
  const label = { ...actor, roles: ['label'] as const };
  const former = fixture({ roles: ['label'], foreignOwner: true, historicalLabel: true });
  await assert.rejects(former.service.update(label, trackId, { title: 'Forged', version: 1, release_version: 1 }, 'request'), failure(404));
  assert.equal(former.queries.some(q => q.sql.startsWith('UPDATE')), false);
  const current = fixture({ roles: ['label'], foreignOwner: true, currentLabel: true });
  await current.service.update(label, trackId, { title: 'Valid', version: 1, release_version: 1 }, 'request');
  assert.equal(current.state().tracks[0]!.title, 'Valid');
  assert.ok(current.queries.some(q => q.sql.includes('FROM soundpub.profiles') && q.sql.includes('FOR UPDATE')));
  const unverified = fixture({ artistVerified: false });
  await assert.rejects(unverified.service.list(actor, releaseId), failure(404));
});

test('draft, pending and rejected permit edits with trigger-owned versions', async () => {
  for (const parentStatus of ['draft', 'pending', 'rejected']) {
    const f = fixture({ parentStatus });
    const result = await f.service.update(actor, trackId, { title: 'New', version: 1, release_version: 1 }, 'request');
    assert.equal(result.track.version, 2); assert.equal(result.release_version, 2);
    assert.equal(f.queries.some(q => /\bversion\s*=/.test(q.sql.split('WHERE')[0]!)), false);
  }
});

test('all mutations reject immutable or unknown parent statuses before writes', async () => {
  const archived = fixture({ archived: true });
  await assert.rejects(archived.service.update(actor, trackId, { title: 'New', version: 1, release_version: 1 }, 'request'), failure(409));
  for (const parentStatus of ['submitted', 'approved', 'released', 'unknown']) {
    const f = fixture({ parentStatus });
    const calls = [() => f.service.create(actor, releaseId, { title: 'New', artist_name: 'Artist', release_version: 1 }, 'request'),
      () => f.service.update(actor, trackId, { title: 'New', version: 1, release_version: 1 }, 'request'),
      () => f.service.delete(actor, trackId, { version: 1, release_version: 1 }, 'request'),
      () => f.service.reorder(actor, releaseId, { release_version: 1, track_ids: [secondId, trackId] }, 'request')];
    for (const call of calls) await assert.rejects(call(), failure(409));
    assert.equal(f.queries.some(q => /^(UPDATE|INSERT|DELETE)/.test(q.sql)), false);
  }
});

test('optimistic parent/track conflicts and conditional write conflicts reject', async () => {
  for (const versions of [{ version: 2, release_version: 1 }, { version: 1, release_version: 2 }]) {
    const f = fixture();
    await assert.rejects(f.service.update(actor, trackId, { title: 'New', ...versions }, 'request'), failure(409));
    assert.equal(f.queries.some(q => q.sql.startsWith('UPDATE')), false);
  }
  const f = fixture({ conflict: true });
  await assert.rejects(f.service.update(actor, trackId, { title: 'New', version: 1, release_version: 1 }, 'request'), failure(409));
  assert.equal(f.state().parent.version, 1);
});

test('reorder demands exact membership; deferred ordering preserves uniqueness and versions', async () => {
  for (const ids of [[trackId], [trackId, releaseId]]) {
    const f = fixture();
    await assert.rejects(f.service.reorder(actor, releaseId, { release_version: 1, track_ids: ids }, 'request'), failure(400));
  }
  const f = fixture();
  const result = await f.service.reorder(actor, releaseId, { release_version: 1, track_ids: [secondId, trackId] }, 'request');
  assert.deepEqual(result.items.map(t => [t.id, t.position, t.version]), [[secondId, 1, 2], [trackId, 2, 2]]);
  assert.equal(result.release_version, 2);
  assert.ok(f.queries.some(q => q.sql.includes('FOR UPDATE')));
});

test('deletion uses FK safety and optional downstream guard, locks parent and audits', async () => {
  const direct = fixture();
  assert.deepEqual(await direct.service.delete(actor, trackId, { version: 1, release_version: 1 }, 'request'), { id: trackId, release_version: 2 });
  assert.equal(direct.state().tracks.length, 1);
  const denied = fixture({}, { assertCanDelete: async () => { throw new ApiError(409, 'CONFLICT'); } });
  await assert.rejects(denied.service.delete(actor, trackId, { version: 1, release_version: 1 }, 'request'), failure(409));
  const f = fixture({}, { assertCanDelete: async (_db, id) => {
    assert.equal(id, trackId); assert.ok(f.queries.some(q => q.sql.includes('FOR UPDATE')));
  } });
  assert.deepEqual(await f.service.delete(actor, trackId, { version: 1, release_version: 1 }, 'request'), { id: trackId, release_version: 2 });
  assert.equal(f.state().tracks.length, 1);
  assert.equal(f.queries.at(-1)?.sql, 'COMMIT');
});

test('audit failure rolls back track changes, reorder, deletion and parent version atomically', async () => {
  for (const operation of ['create', 'update', 'delete', 'reorder']) {
    const f = fixture({ auditFailure: true }, { assertCanDelete: async () => {} });
    const before = structuredClone(f.state());
    await assert.rejects(async () => {
      if (operation === 'create') await f.service.create(actor, releaseId, { title: 'New', artist_name: 'Artist', release_version: 1 }, 'request');
      if (operation === 'update') await f.service.update(actor, trackId, { title: 'New', version: 1, release_version: 1 }, 'request');
      if (operation === 'delete') await f.service.delete(actor, trackId, { version: 1, release_version: 1 }, 'request');
      if (operation === 'reorder') await f.service.reorder(actor, releaseId, { release_version: 1, track_ids: [secondId, trackId] }, 'request');
    }, /synthetic audit failure/);
    assert.deepEqual(f.state(), before); assert.equal(f.queries.at(-1)?.sql, 'ROLLBACK'); assert.equal(f.released(), true);
  }
});
