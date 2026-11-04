import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createPool, migrate, withTransaction } from '../src/db/index.js';

const ownerUrl = process.env.RELEASE_TRACK_DB_TEST_URL;
const runtimeUrl = process.env.RELEASE_TRACK_DB_RUNTIME_URL;

test('release/track integrity, snapshots, ordering, concurrency and runtime grants', { skip: !ownerUrl }, async () => {
  assert.ok(runtimeUrl, 'RELEASE_TRACK_DB_RUNTIME_URL required');
  for (const value of [ownerUrl!, runtimeUrl!]) {
    const url = new URL(value);
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
    assert.match(url.pathname, /^\/soundpub_test_release_tracks[a-zA-Z0-9_]*$/);
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
  }
  assert.equal(new URL(ownerUrl!).host, new URL(runtimeUrl!).host);
  assert.equal(new URL(ownerUrl!).pathname, new URL(runtimeUrl!).pathname);
  const owner = createPool({ connectionString: ownerUrl });
  const runtime = createPool({ connectionString: runtimeUrl });
  const [label, nextLabel, artist, release, track, second] = Array.from({ length: 6 }, () => randomUUID());
  try {
    assert.equal((await runtime.query('SELECT current_user')).rows[0].current_user, 'soundpub_app');
    await owner.query('DROP SCHEMA IF EXISTS soundpub CASCADE');
    assert.ok((await migrate(owner)).includes('0008_release_tracks.sql'));
    assert.deepEqual(await migrate(owner), []);
    for (const id of [label, nextLabel, artist]) {
      await owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [id]);
      await owner.query('INSERT INTO soundpub.profiles(id) VALUES ($1)', [id]);
    }
    await owner.query('UPDATE soundpub.profiles SET parent_label_id=$1 WHERE id=$2', [label, artist]);
    const canonical = randomUUID();
    await owner.query('INSERT INTO soundpub.artists(id,label_id,artist_user_id,name,verified_at) VALUES ($1,$2,$3,$4,now())', [canonical, label, artist, 'Synthetic artist']);
    await runtime.query(`INSERT INTO soundpub.releases(id,label_id,artist_user_id,created_by,title,artist_name)
      VALUES ($1,$2,$3,$3,'Synthetic release','Synthetic artist')`, [release, label, artist]);
    await runtime.query(`INSERT INTO soundpub.tracks(id,release_id,artist_user_id,title,artist_name,position)
      VALUES ($1,$2,$3,'One','Artist',1),($4,$2,$3,'Two','Artist',2)`, [track, release, artist, second]);
    assert.equal((await runtime.query('SELECT artist_id FROM soundpub.releases WHERE id=$1', [release])).rows[0].artist_id, canonical);
    assert.equal((await runtime.query('SELECT artist_id FROM soundpub.tracks WHERE id=$1', [track])).rows[0].artist_id, canonical);
    await assert.rejects(owner.query('UPDATE soundpub.releases SET artist_id=NULL WHERE id=$1', [release]), { code: '23514' });
    await assert.rejects(owner.query('UPDATE soundpub.tracks SET artist_id=NULL WHERE id=$1', [track]), { code: '23514' });
    await assert.rejects(runtime.query(`INSERT INTO soundpub.tracks(release_id,artist_id,title,artist_name,position)
      VALUES ($1,$2,'Mismatch','Artist',3)`, [release, randomUUID()]), { code: '23514' });
    await owner.query('UPDATE soundpub.profiles SET parent_label_id=$1 WHERE id=$2', [nextLabel, artist]);
    const historical = (await runtime.query('SELECT label_id,artist_user_id,created_by,version FROM soundpub.releases WHERE id=$1', [release])).rows[0];
    assert.deepEqual(historical, { label_id: label, artist_user_id: artist, created_by: artist, version: 1 });
    await assert.rejects(owner.query('UPDATE soundpub.releases SET label_id=$1 WHERE id=$2', [nextLabel, release]), { code: '23514' });
    await assert.rejects(runtime.query('UPDATE soundpub.releases SET label_id=$1 WHERE id=$2', [nextLabel, release]), { code: '42501' });
    await assert.rejects(runtime.query('UPDATE soundpub.tracks SET version=99 WHERE id=$1', [track]), { code: '42501' });
    await assert.rejects(runtime.query('DELETE FROM soundpub.releases WHERE id=$1', [release]), { code: '42501' });
    await assert.rejects(owner.query('DELETE FROM soundpub.profiles WHERE id=$1', [label]), { code: '23503' });
    await assert.rejects(owner.query('DELETE FROM soundpub.releases WHERE id=$1', [release]), { code: '23503' });
    await assert.rejects(runtime.query(`INSERT INTO soundpub.tracks(release_id,title,artist_name,position)
      VALUES ($1,'Orphan','Artist',1)`, [randomUUID()]), { code: '23514' });
    await assert.rejects(runtime.query('UPDATE soundpub.tracks SET position=1 WHERE id=$1', [second]), { code: '23505' });
    await withTransaction(runtime, async db => {
      await db.query('UPDATE soundpub.tracks SET position=3-position WHERE release_id=$1', [release]);
    });
    assert.deepEqual((await runtime.query('SELECT id FROM soundpub.tracks WHERE release_id=$1 ORDER BY position', [release])).rows.map(row => row.id), [second, track]);
    const writes = await Promise.all([1, 2].map(i => runtime.query(
      'UPDATE soundpub.releases SET title=$1 WHERE id=$2 AND version=1 RETURNING version', [`Winner ${i}`, release])));
    assert.equal(writes.reduce((sum, result) => sum + result.rowCount!, 0), 1);
    assert.equal(writes.flatMap(result => result.rows)[0].version, 2);
    for (const status of ['draft', 'pending', 'pending_paid', 'processing', 'active', 'rejected', 'revision_submitted', 'inactive']) {
      await runtime.query('UPDATE soundpub.releases SET status=$1 WHERE id=$2', [status, release]);
    }
    await assert.rejects(runtime.query("UPDATE soundpub.releases SET status='published' WHERE id=$1", [release]), { code: '23514' });
    await assert.rejects(runtime.query("UPDATE soundpub.tracks SET artists='{}'::jsonb WHERE id=$1", [track]), { code: '23514' });
    await assert.rejects(runtime.query('UPDATE soundpub.tracks SET duration=-1 WHERE id=$1', [track]), { code: '23514' });
    await assert.rejects(runtime.query('UPDATE soundpub.tracks SET position=0 WHERE id=$1', [track]), { code: '23514' });
    await assert.rejects(runtime.query("UPDATE soundpub.releases SET distribution_service='custom_label' WHERE id=$1", [release]), { code: '23514' });
    await withTransaction(runtime, async db => {
      await db.query('DELETE FROM soundpub.tracks WHERE id=$1', [second]);
      throw new Error('rollback');
    }).then(() => assert.fail('rollback required'), error => assert.match(error.message, /rollback/));
    assert.equal((await runtime.query('SELECT count(*)::int AS n FROM soundpub.tracks')).rows[0].n, 2);
  } finally {
    await runtime.end();
    await owner.query('DROP SCHEMA IF EXISTS soundpub CASCADE');
    await owner.end();
  }
});
