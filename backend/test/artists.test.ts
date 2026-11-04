import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';
import type { Principal, Role } from '../src/auth/index.js';
import { ApiError } from '../src/api/types.js';
import { artistCreate, artistPatch, artistDto, canManageArtist, createArtistsService,
  type ArtistDto, type ArtistsOptions } from '../src/artists/index.js';

const actorId = '00000000-0000-4000-8000-000000000001';
const artistId = '00000000-0000-4000-8000-000000000002';
const otherLabelId = '00000000-0000-4000-8000-000000000003';
const requestId = '00000000-0000-4000-8000-000000000004';
const principal = (id: string, roles: Role[], status: Principal['status'] = 'active'): Principal => ({ id, roles, status });
const target = principal(artistId, ['artist']);
const label = principal(actorId, ['label']);
const failure = (status: number, code?: string) => (error: unknown) =>
  error instanceof ApiError && error.statusCode === status && (!code || error.code === code);
const artist: ArtistDto = {
  id: artistId, profile_id: requestId, catalog_artist_id: requestId, label_user_id: actorId,
  full_name: 'Artist', phone: null, address: null, status: 'active', artist_name: 'Artist', artist_type: 'solo',
  bio: null, genre: null, legal_name: null, country: null, city: null, language: null, gender: null,
  date_of_birth: null, profile_image_url: null, social_links: {}, verified: false, verified_at: null,
  artist_profile_completed: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

// Transaction doubles exercise orchestration and denial paths; DB constraints need disposable-Postgres integration.
function fixture(current: Principal = label, config: {
  bound?: boolean; auditFailure?: boolean; duplicateRequest?: boolean; requestStatus?: string;
  targetRoles?: Role[];
} = {}, options: ArtistsOptions = {}) {
  const queries: { sql: string; values: unknown[] }[] = [];
  let released = false;
  let createdId: string | undefined;
  const row = { ...artist, label_user_id: config.bound === false ? null : actorId };
  const deletion = { id: requestId, artist_id: artistId, label_id: actorId, reason: 'Review',
    status: config.requestStatus ?? 'pending', created_at: artist.created_at, updated_at: artist.updated_at };
  const client = {
    async query(sql: string, values: unknown[] = []) {
      queries.push({ sql, values });
      let rows: unknown[] = [];
      if (sql.includes('SELECT id, status FROM soundpub.backend_users')) {
        rows = [current, principal(artistId, config.targetRoles ?? ['artist']), principal(otherLabelId, ['label'])]
          .filter(user => (values[0] as string[]).includes(user.id)).map(({ id, status }) => ({ id, status }));
      } else if (sql.includes('SELECT user_id, role')) {
        rows = [current, principal(artistId, config.targetRoles ?? ['artist']), principal(otherLabelId, ['label'])]
          .filter(user => (values[0] as string[]).includes(user.id))
          .flatMap(user => user.roles.map(role => ({ user_id: user.id, role })));
      } else if (sql.startsWith('SELECT role FROM soundpub.user_roles')) {
        rows = (config.targetRoles ?? ['artist']).map(role => ({ role }));
      } else if (sql.startsWith('SELECT u.id, ap.id')) {
        rows = sql.includes('ORDER BY u.id') ? [row, { ...row, id: otherLabelId }]
          : [{ ...row, id: values[0] === createdId ? createdId : artistId }];
      } else if (sql.startsWith('INSERT INTO soundpub.backend_users')) createdId = values[0] as string;
      else if (sql.startsWith('INSERT INTO soundpub.audit_logs') && config.auditFailure) throw new Error('synthetic audit failure');
      else if (sql.startsWith('INSERT INTO soundpub.artist_deletion_requests')) rows = config.duplicateRequest ? [] : [deletion];
      else if (sql.includes('FROM soundpub.artist_deletion_requests')) rows = [deletion];
      else if (sql.startsWith('UPDATE soundpub.artist_deletion_requests')) rows = [{ ...deletion, status: values[1] }];
      return { rows, rowCount: rows.length || (sql.startsWith('UPDATE soundpub.profiles SET parent_label_id') ? 1 : 0) };
    },
    release() { released = true; },
  };
  const pool = { connect: async () => client } as unknown as Pool;
  return { service: createArtistsService(pool, options), queries, released: () => released };
}

test('artist capability matrix requires owner, verified roster, or explicit admin hierarchy', () => {
  assert.equal(canManageArtist(target, target, null), true);
  assert.equal(canManageArtist(label, target, actorId), true);
  assert.equal(canManageArtist(label, target, null), false);
  assert.equal(canManageArtist(label, target, otherLabelId), false);
  for (const role of ['user', 'artist', 'copyright'] as const) {
    assert.equal(canManageArtist(principal(actorId, [role]), target, actorId), false);
  }
  assert.equal(canManageArtist(principal(actorId, ['whitelabel']), target, actorId), true);
  for (const status of ['inactive', 'suspended'] as const) {
    assert.equal(canManageArtist({ ...label, status }, target, actorId), false);
  }
  const peer = principal(artistId, ['artist', 'admin']);
  assert.equal(canManageArtist(label, peer, actorId, true), false);
  assert.equal(canManageArtist(principal(actorId, ['admin']), peer, null), true);
  assert.equal(canManageArtist(principal(actorId, ['admin']), peer, null, true), false);
  assert.equal(canManageArtist(principal(actorId, ['superadmin']), peer, null, true), true);
});

test('contracts reject identity, verification, membership, status and balance mass assignment', () => {
  for (const patch of [{}, { artist_name: ' ' }, { user_id: artistId }, { id: artistId },
    { verified: true }, { verified_at: '2026-01-01' }, { spotify_data: {} }, { artist_profile_completed: true },
    { label_user_id: actorId }, { parent_label_id: actorId }, { status: 'active' }, { balance: '12.00' },
    { date_of_birth: '2026-02-30' }, { date_of_birth: '2999-01-01' },
    { social_links: { website: 'javascript:alert(1)' } }, { profile_image_url: 'https://user:secret@example.test/a.png' }]) {
    assert.equal(artistPatch.safeParse(patch).success, false, JSON.stringify(patch));
  }
  assert.equal(artistCreate.safeParse({ artist_name: 'Artist', email: 'forged@example.test' }).success, false);
  assert.equal(artistCreate.safeParse({ artist_name: 'Artist', password: 'forged' }).success, false);
  assert.deepEqual(artistPatch.parse({ artist_name: ' Name ', social_links: { spotify: true, website: 'https://example.test' } }),
    { artist_name: 'Name', social_links: { spotify: true, website: 'https://example.test' } });
  assert.deepEqual(artistDto.parse(artist), artist);
});

test('invalid inputs reject before DB work; stale and reference-only roster authority deny', async () => {
  const invalid = fixture();
  await assert.rejects(invalid.service.get(label, 'bad'), failure(400));
  await assert.rejects(invalid.service.update(label, artistId, { verified: true } as never, 'audit'), failure(400));
  assert.equal(invalid.queries.length, 0);
  const stale = fixture({ ...label, status: 'suspended' });
  await assert.rejects(stale.service.get(label, artistId), failure(403));
  assert.equal(stale.queries.at(-1)?.sql, 'ROLLBACK');
  const unbound = fixture(label, { bound: false });
  await assert.rejects(unbound.service.update(label, artistId, { bio: 'forged' }, 'audit'), failure(404));
  assert.equal(unbound.queries.some(q => q.sql.startsWith('UPDATE')), false);
  const privileged = fixture(label, { targetRoles: ['artist', 'admin'] });
  await assert.rejects(privileged.service.update(label, artistId, { bio: 'forged' }, 'audit'), failure(404));
});

test('managed creation binds only caller roster and creates no provider identity or credentials', async () => {
  const denied = fixture();
  await assert.rejects(denied.service.create(label, { artist_name: 'Artist', label_user_id: otherLabelId }, 'audit'), failure(403));
  assert.equal(denied.queries.some(q => q.sql.startsWith('INSERT')), false);
  const created = fixture();
  const result = await created.service.create(label, { artist_name: 'New Artist', genre: 'Pop' }, 'audit');
  assert.notEqual(result.id, artistId);
  const roster = created.queries.find(q => q.sql.startsWith('INSERT INTO soundpub.artists('));
  assert.deepEqual(roster?.values, [actorId, result.id, 'New Artist']);
  assert.ok(created.queries.some(q => q.sql.includes("VALUES ($1,'artist',now())")));
  assert.equal(created.queries.some(q => /external_identities|password|email/.test(q.sql)), false);
  assert.equal(created.queries.at(-1)?.sql, 'COMMIT');
});

test('artist update uses UUID roster binding and audit failure rolls entire transaction back', async () => {
  const failed = fixture(label, { auditFailure: true });
  await assert.rejects(failed.service.update(label, artistId, { artist_name: 'New Name', phone: '123' }, 'audit'), /synthetic audit failure/);
  assert.equal(failed.queries.at(-1)?.sql, 'ROLLBACK');
  assert.equal(failed.released(), true);
  assert.equal(failed.queries.some(q => q.sql === 'COMMIT'), false);
  const rename = failed.queries.find(q => q.sql.startsWith('UPDATE soundpub.artists'));
  assert.deepEqual(rename?.values, [artistId, 'New Name']);
  assert.ok(rename?.sql.includes('WHERE artist_user_id=$1'));
});

test('detachment rolls back when optional guard denies', async () => {
  const blocked = fixture(label, {}, { assertCanDetach: async () => { throw new ApiError(409, 'CONFLICT'); } });
  await assert.rejects(blocked.service.removeFromLabel(label, artistId, 'audit'), failure(409));
  for (const instance of [blocked]) {
    assert.equal(instance.queries.some(q => /^(UPDATE|DELETE|INSERT)/.test(q.sql)), false);
    assert.equal(instance.queries.at(-1)?.sql, 'ROLLBACK');
  }
});

test('detachment preserves local user, artist profile and history; audit commits atomically', async () => {
  let guarded = false;
  const detached = fixture(label, {}, { assertCanDetach: async (_db, id) => { assert.equal(id, artistId); guarded = true; } });
  assert.deepEqual(await detached.service.removeFromLabel(label, artistId, 'audit'), { id: artistId, label_user_id: null });
  assert.equal(guarded, true);
  assert.deepEqual(detached.queries.filter(q => q.sql.startsWith('DELETE')).map(q => q.sql),
    ['DELETE FROM soundpub.artists WHERE artist_user_id=$1 AND label_id=$2']);
  assert.equal(detached.queries.some(q => /\b(releases|royalties|tracks|external_identities)\b/.test(q.sql)), false);
  assert.equal(detached.queries.at(-1)?.sql, 'COMMIT');
});

test('deletion requests validate reason, derive label, reject duplicates; approval records review only', async () => {
  const request = fixture();
  await assert.rejects(request.service.requestDeletion(label, artistId, { reason: ' ' }, 'audit'), failure(400));
  const result = await request.service.requestDeletion(label, artistId, { reason: ' Review ' }, 'audit');
  assert.equal(result.status, 'pending');
  assert.deepEqual(request.queries.find(q => q.sql.startsWith('INSERT INTO soundpub.artist_deletion_requests'))?.values,
    [artistId, actorId, 'Review']);
  const duplicate = fixture(label, { duplicateRequest: true });
  await assert.rejects(duplicate.service.requestDeletion(label, artistId, { reason: 'Review' }, 'audit'), failure(409));
  const admin = principal(actorId, ['admin']);
  const review = fixture(admin);
  assert.equal((await review.service.reviewDeletionRequest(admin, requestId, { status: 'approved' }, 'audit')).status, 'approved');
  assert.equal(review.queries.some(q => q.sql.startsWith('DELETE')), false);
  assert.equal(review.queries.some(q => q.sql.startsWith('UPDATE soundpub.backend_users')), false);
  const terminal = fixture(admin, { requestStatus: 'rejected' });
  await assert.rejects(terminal.service.reviewDeletionRequest(admin, requestId, { status: 'approved' }, 'audit'), failure(409));
  await assert.rejects(request.service.reviewDeletionRequest(label, requestId, { status: 'approved' }, 'audit'), failure(403));
});

test('artist cursor binds caller, filters and domain; pagination stays bounded', async () => {
  const listed = fixture();
  const page = await listed.service.list(label, { limit: '1', search: 'Artist' });
  assert.equal(page.items.length, 1);
  assert.ok(page.nextCursor);
  const query = listed.queries.find(q => q.sql.includes('ORDER BY u.id'));
  assert.deepEqual(query?.values, [actorId, false, true, 'Artist', null, null, 2]);
  await assert.rejects(listed.service.list(label, { cursor: page.nextCursor }), failure(400));
  await assert.rejects(listed.service.list(principal(otherLabelId, ['label']), { search: 'Artist', cursor: page.nextCursor }), failure(400));
  await assert.rejects(listed.service.listDeletionRequests(label, { cursor: page.nextCursor }), failure(400));
  for (const value of [{ limit: '101' }, { cursor: 'garbage' }, { tenantId: actorId }]) {
    await assert.rejects(listed.service.list(label, value as never), failure(400));
  }
});


