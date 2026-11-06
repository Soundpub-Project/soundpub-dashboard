import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ApiError } from '../src/api/types.js';
import { createReleasesService } from '../src/releases/index.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

const integration = dockerTestsEnabled ? test : test.skip;
integration('admin activation stores complete UPC and ISRC set atomically', async () => {
  const db = await concurrencyPostgres();
  try {
    const label = randomUUID(), artist = randomUUID(), admin = randomUUID();
    const release = randomUUID(), trackA = randomUUID(), trackB = randomUUID();
    for (const [id, role] of [[label, 'label'], [artist, 'artist'], [admin, 'admin']] as const) {
      await db.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [id]);
      await db.owner.query('INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,$2)', [id, role]);
      await db.owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())', [id, role]);
    }
    await db.owner.query('UPDATE soundpub.profiles SET parent_label_id=$1 WHERE id=$2', [label, artist]);
    await db.owner.query('INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at) VALUES ($1,$2,$3,now())',
      [label, artist, 'Artist']);
    await db.owner.query(`INSERT INTO soundpub.releases(id,artist_user_id,label_id,created_by,title,artist_name,status)
      VALUES ($1,$2,$3,$3,'Release','Artist','processing')`, [release, artist, label]);
    await db.owner.query(`INSERT INTO soundpub.tracks(id,release_id,title,artist_name,position) VALUES
      ($1,$3,'A','Artist',1),($2,$3,'B','Artist',2)`, [trackA, trackB, release]);
    const service = createReleasesService(db.runtime);
    const actor = { id: admin, status: 'active' as const, roles: ['admin'] as const };
    const labelActor = { id: label, status: 'active' as const, roles: ['label'] as const };
    const before = (await db.owner.query('SELECT version FROM soundpub.releases WHERE id=$1', [release])).rows[0].version;
    const tracks = (await db.owner.query('SELECT id,version FROM soundpub.tracks WHERE release_id=$1 ORDER BY position', [release])).rows;
    const payload = { version: before, upc: '1234567890123', tracks: [
      { id: tracks[0].id, version: tracks[0].version, isrc: 'idabc2600001' },
      { id: tracks[1].id, version: tracks[1].version, isrc: 'ID-ABC-26-00002' },
    ] };
    await assert.rejects(service.activate(labelActor, release, payload, 'denied'),
      (error: unknown) => error instanceof ApiError && error.code === 'FORBIDDEN');
    const activated = await service.activate(actor, release, payload, 'activate-request');
    assert.equal(activated.status, 'active');
    assert.equal(activated.upc, '1234567890123');
    assert.deepEqual((await db.owner.query('SELECT isrc FROM soundpub.tracks WHERE release_id=$1 ORDER BY position', [release])).rows,
      [{ isrc: 'IDABC2600001' }, { isrc: 'IDABC2600002' }]);
    assert.equal((await db.owner.query("SELECT count(*)::int count FROM soundpub.audit_logs WHERE action='release.activated' AND resource_id=$1",
      [release])).rows[0].count, 1);
  } finally { await db.close(); }
});
