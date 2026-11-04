import assert from 'node:assert/strict';
import test from 'node:test';
import { createReleasesService } from '../src/releases/index.js';
import { createTracksService } from '../src/tracks/index.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

const label = '00000000-0000-4000-8000-000000000301';
const artist = '00000000-0000-4000-8000-000000000302';
const actor = { id: label, roles: ['label'] as const, status: 'active' as const };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const conflicts = (results: PromiseSettledResult<unknown>[]) => {
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
  assert.equal(rejected.reason?.statusCode, 409);
};

test('Phase 3C deterministic aggregate races serialize on release version', { skip: process.env.RUN_DOCKER_TESTS !== '1' }, async () => {
  const database = await concurrencyPostgres();
  const releases = createReleasesService(database.runtime);
  const tracks = createTracksService(database.runtime);
  async function seed(releaseId: string, trackIds: string[] = []) {
    await database.owner.query(`INSERT INTO soundpub.releases
      (id,label_id,artist_user_id,created_by,title,artist_name,release_type,status,cover_url)
      VALUES ($1,$2,$3,$2,'Synthetic','Artist','single','draft','https://example.invalid/cover.png')`,
    [releaseId, label, artist]);
    for (const [position, trackId] of trackIds.entries()) await database.owner.query(`INSERT INTO soundpub.tracks
      (id,release_id,artist_user_id,title,artist_name,position,audio_url) VALUES ($1,$2,$3,$4,'Artist',$5,'https://example.invalid/audio.wav')`,
    [trackId, releaseId, artist, `Track ${position + 1}`, position + 1]);
  }
  try {
    for (const [user, role] of [[label, 'label'], [artist, 'artist']]) {
      await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [user]);
      await database.owner.query('INSERT INTO soundpub.profiles(id,full_name,parent_label_id) VALUES ($1,$2,$3)', [user, role, user === artist ? label : null]);
      await database.owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())', [user, role]);
    }
    await database.owner.query('INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at) VALUES ($1,$2,$3,now())', [label, artist, 'Artist']);

    const edit = id(310); await seed(edit);
    conflicts(await Promise.allSettled([
      releases.update(actor, edit, { version: 1, title: 'Winner A' }, 'edit-a'),
      releases.update(actor, edit, { version: 1, title: 'Winner B' }, 'edit-b'),
    ]));

    const transition = id(320); await seed(transition, [id(321)]);
    conflicts(await Promise.allSettled([
      releases.update(actor, transition, { version: 1, title: 'Edit' }, 'transition-edit'),
      releases.update(actor, transition, { version: 1, status: 'pending' }, 'transition-status'),
    ]));

    const reorder = id(330); await seed(reorder, [id(331), id(332)]);
    conflicts(await Promise.allSettled([
      tracks.reorder(actor, reorder, { release_version: 1, track_ids: [id(332), id(331)] }, 'reorder-a'),
      tracks.reorder(actor, reorder, { release_version: 1, track_ids: [id(331), id(332)] }, 'reorder-b'),
    ]));

    const remove = id(340); await seed(remove, [id(341), id(342)]);
    conflicts(await Promise.allSettled([
      tracks.delete(actor, id(341), { version: 1, release_version: 1 }, 'delete-track'),
      releases.update(actor, remove, { version: 1, status: 'pending' }, 'delete-transition'),
    ]));

    const create = id(350); await seed(create);
    const createResults = await Promise.allSettled([
      tracks.create(actor, create, { title: 'A', artist_name: 'Artist', release_version: 1 }, 'create-a'),
      tracks.create(actor, create, { title: 'B', artist_name: 'Artist', release_version: 1 }, 'create-b'),
    ]);
    conflicts(createResults);

    const authority = id(370); await seed(authority);
    const blocker = await database.owner.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query("UPDATE soundpub.backend_users SET status='suspended' WHERE id=$1", [label]);
      const blocked = releases.update(actor, authority, { version: 1, title: 'Forbidden' }, 'authority-loser');
      const blockerPid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const lock = await database.owner.query(`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE pid<>$1 AND wait_event_type='Lock' AND query LIKE 'SELECT id, status FROM soundpub.backend_users%') AS waiting`, [blockerPid]);
        if (lock.rows[0].waiting) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.ok(waiting, 'Release mutation must wait for actor status lock');
      await blocker.query('COMMIT');
      await assert.rejects(blocked, error => (error as { statusCode?: number }).statusCode === 403);
      assert.equal((await database.owner.query('SELECT title FROM soundpub.releases WHERE id=$1', [authority])).rows[0].title, 'Synthetic');
    } finally { await blocker.query('ROLLBACK'); blocker.release(); }
    await database.owner.query("UPDATE soundpub.backend_users SET status='active' WHERE id=$1", [label]);

    const blockedDelete = id(360); await seed(blockedDelete);
    const [releaseDelete, trackCreate] = await Promise.allSettled([
      releases.delete(actor, blockedDelete, 'release-delete'),
      tracks.create(actor, blockedDelete, { title: 'Kept', artist_name: 'Artist', release_version: 1 }, 'track-create'),
    ]);
    assert.equal(releaseDelete.status, 'rejected');
    assert.equal((releaseDelete as PromiseRejectedResult).reason.statusCode, 409);
    assert.equal(trackCreate.status, 'fulfilled');
    assert.equal((await database.owner.query('SELECT count(*)::int AS n FROM soundpub.tracks WHERE release_id=$1', [blockedDelete])).rows[0].n, 1);
  } finally { await database.close(); }
});
