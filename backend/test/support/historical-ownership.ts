import assert from 'node:assert/strict';
import { testComposeResource } from './concurrency-postgres.js';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import type { Pool } from 'pg';
import { createPool, migrate } from '../../src/db/index.js';
import { createArtistsService } from '../../src/artists/index.js';
import type { Principal } from '../../src/auth/index.js';

export async function historicalDatabase() {
  const resource = testComposeResource('test-postgres');
  let owner: Pool | undefined;
  let runtime: Pool | undefined;
  const close = async () => {
    try { await Promise.allSettled([runtime?.end(), owner?.end()]); }
    finally { resource.close(); }
  };
  try {
    const address = resource.start();
    assert.match(address, /^127\.0\.0\.1:\d+$/);
    owner = createPool({ connectionString: `postgres://postgres:synthetic@${address}/soundpub_test` });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { await owner.query('SELECT 1'); ready = true; break; }
      catch { await setTimeout(250); }
    }
    assert.ok(ready, 'Owned disposable PostgreSQL must become ready');
    await owner.query("CREATE ROLE soundpub_owner; CREATE ROLE soundpub_app LOGIN PASSWORD 'synthetic-history-only'; CREATE ROLE soundpub_reconciler; GRANT soundpub_app TO soundpub_reconciler");
    assert.ok((await migrate(owner)).includes('0007_artists_labels.sql'));
    assert.deepEqual(await migrate(owner), []);
    await owner.query(`CREATE SCHEMA historical_fixture;
      CREATE TABLE historical_fixture.release_ownership (
        id uuid PRIMARY KEY,
        artist_user_id uuid NOT NULL REFERENCES soundpub.profiles(id) ON DELETE RESTRICT,
        label_id uuid NOT NULL REFERENCES soundpub.profiles(id) ON DELETE RESTRICT,
        source_record text NOT NULL UNIQUE,
        completed_at timestamptz NOT NULL
      );
      CREATE TABLE historical_fixture.royalty_attribution (
        id uuid PRIMARY KEY,
        release_id uuid NOT NULL REFERENCES historical_fixture.release_ownership(id) ON DELETE RESTRICT,
        artist_user_id uuid NOT NULL REFERENCES soundpub.profiles(id) ON DELETE RESTRICT,
        label_user_id uuid NOT NULL REFERENCES soundpub.profiles(id) ON DELETE RESTRICT,
        recipient_user_id uuid NOT NULL REFERENCES soundpub.profiles(id) ON DELETE RESTRICT,
        amount numeric(20,2) NOT NULL CHECK (amount > 0),
        provenance jsonb NOT NULL,
        completed_at timestamptz NOT NULL
      )`);
    runtime = createPool({ connectionString:
      `postgres://soundpub_app:synthetic-history-only@${address}/soundpub_test` });
    assert.equal((await runtime.query('SELECT current_user')).rows[0].current_user, 'soundpub_app');
    return { owner, runtime, close };
  } catch (error) { await close(); throw error; }
}

export async function historicalFixture(owner: Pool, runtime: Pool) {
  const labelA = randomUUID();
  const labelB = randomUUID();
  const admin: Principal = { id: randomUUID(), roles: ['admin'], status: 'active' };
  for (const [id, role] of [[labelA, 'label'], [labelB, 'label'], [admin.id, 'admin']]) {
    await owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [id]);
    await owner.query("INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,'Synthetic historical principal')", [id]);
    await owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())', [id, role]);
  }
  const artists = createArtistsService(runtime);
  const artist = await artists.create(admin, { artist_name: 'Same synthetic display name', label_user_id: labelA }, randomUUID());
  for (let index = 0; index < 2; index++) {
    const release = randomUUID();
    await owner.query(`INSERT INTO historical_fixture.release_ownership
      VALUES ($1,$2,$3,$4,'2024-01-01T00:00:00Z')`, [release, artist.id, labelA, `synthetic:${release}`]);
    await owner.query(`INSERT INTO historical_fixture.royalty_attribution
      VALUES ($1,$2,$3,$4,$5,123.45,'{"source":"synthetic","period":"2024-01"}','2024-02-01T00:00:00Z')`,
    [randomUUID(), release, artist.id, labelA, index === 0 ? labelA : artist.id]);
  }
  const history = async () => ({
    releases: (await owner.query('SELECT * FROM historical_fixture.release_ownership WHERE artist_user_id=$1 ORDER BY id', [artist.id])).rows,
    royalties: (await owner.query('SELECT * FROM historical_fixture.royalty_attribution WHERE artist_user_id=$1 ORDER BY id', [artist.id])).rows,
  });
  const baseline = await history();
  assert.equal(baseline.releases.length, 2);
  assert.equal(baseline.royalties.length, 2);
  const current = async () => (await owner.query(`SELECT p.parent_label_id, a.id AS membership_id, a.label_id
    FROM soundpub.profiles p LEFT JOIN soundpub.artists a ON a.artist_user_id=p.id WHERE p.id=$1`, [artist.id])).rows[0];
  return { admin, labelA, labelB, artist, artists, history, baseline, current };
}
