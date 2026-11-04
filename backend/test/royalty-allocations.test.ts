import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

const migration = readFileSync(new URL('../migrations/0028_royalty_allocations.sql', import.meta.url), 'utf8');
const batchGuard = readFileSync(new URL('../migrations/0038_royalty_batch_allocation_guard.sql', import.meta.url), 'utf8');

test('royalty allocation migration declares immutable deferred allocation invariants', () => {
  assert.match(migration, /CREATE TABLE soundpub\.royalty_import_allocations/);
  assert.match(migration, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(migration, /ROYALTY_ALLOCATION_SUM_MISMATCH/);
  assert.match(migration, /component='SOUNDPUB' AND owner_id IS NULL/);
  assert.match(migration, /component<>'SOUNDPUB' AND owner_id IS NOT NULL/);
  assert.match(migration, /royalty_allocations_immutable/);
  assert.match(migration, /'LEGACY_OWNER',financial_owner_user_id,net_amount,'BACKEND_SINGLE_OWNER_V1'/);
  assert.match(batchGuard, /CREATE CONSTRAINT TRIGGER royalty_batch_allocation_sum/);
  assert.match(batchGuard, /ROYALTY_BATCH_CLOSED/);
});

test('royalty allocation PostgreSQL constraints preserve exact owner totals', {
  skip: process.env.RUN_DOCKER_TESTS !== '1', timeout: 120_000,
}, async () => {
  const fixture = await concurrencyPostgres();
  const { owner, runtime } = fixture;
  const ids = {
    admin: randomUUID(), artistUser: randomUUID(), label: randomUUID(), artist: randomUUID(),
    release: randomUUID(), track: randomUUID(), batch: randomUUID(), entry: randomUUID(),
  };
  try {
    await owner.query(`INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active'),($2,'active'),($3,'active')`,
      [ids.admin, ids.artistUser, ids.label]);
    await owner.query(`INSERT INTO soundpub.profiles(id,parent_label_id) VALUES($1,NULL),($2,$1)`,
      [ids.label, ids.artistUser]);
    await owner.query(`INSERT INTO soundpub.artists(id,artist_user_id,label_id,name,management_mode)
      VALUES($1,$2,$3,'Synthetic Artist','LOGIN_ACCOUNT')`, [ids.artist, ids.artistUser, ids.label]);
    await owner.query(`INSERT INTO soundpub.releases(id,artist_id,artist_user_id,label_id,title,artist_name,release_type,genre,release_date,status)
      VALUES($1,$2,$3,$4,'Synthetic Release','Synthetic Artist','single','Pop','2026-12-01','draft')`,
    [ids.release, ids.artist, ids.artistUser, ids.label]);
    await owner.query(`INSERT INTO soundpub.tracks(id,release_id,artist_id,artist_user_id,title,artist_name,position)
      VALUES($1,$2,$3,$4,'Synthetic Track','Synthetic Artist',1)`,
    [ids.track, ids.release, ids.artist, ids.artistUser]);
    await owner.query(`INSERT INTO soundpub.royalty_import_batches
      (id,source,period,currency,checksum,filename,uploader_id,row_count,total_amount,validation_result)
      VALUES($1,'allocation-test','2026-10','IDR',$2,'synthetic.csv',$3,1,'100.00','{}')`,
    [ids.batch, 'a'.repeat(64), ids.admin]);

    await runtime.query('BEGIN');
    await runtime.query(`INSERT INTO soundpub.royalty_import_entries
      (id,batch_id,source,period,source_row_id,beneficiary_id,release_id,track_id,gross_amount,deduction_amount,
        net_amount,artist_id,financial_owner_user_id,label_owner_user_id,calculation_policy_code)
      VALUES($1,$2,'allocation-test','2026-10','row-1',$3,$4,$5,'100.00','0','100.00',$6,$3,$7,'PRODUCTION_SPLIT_V1')`,
    [ids.entry, ids.batch, ids.artistUser, ids.release, ids.track, ids.artist, ids.label]);
    await runtime.query(`INSERT INTO soundpub.royalty_import_allocations(entry_id,component,owner_id,amount,policy_code) VALUES
      ($1,'ARTIST',$2,'70.00','PRODUCTION_SPLIT_V1'),
      ($1,'LABEL',$3,'21.00','PRODUCTION_SPLIT_V1'),
      ($1,'SOUNDPUB',NULL,'9.00','PRODUCTION_SPLIT_V1')`, [ids.entry, ids.artistUser, ids.label]);
    await runtime.query('COMMIT');

    assert.deepEqual((await owner.query(`SELECT component,owner_id,amount::text FROM soundpub.royalty_import_allocations
      WHERE entry_id=$1 ORDER BY component`, [ids.entry])).rows, [
      { component: 'ARTIST', owner_id: ids.artistUser, amount: '70.00' },
      { component: 'LABEL', owner_id: ids.label, amount: '21.00' },
      { component: 'SOUNDPUB', owner_id: null, amount: '9.00' },
    ]);
    await assert.rejects(runtime.query(`INSERT INTO soundpub.royalty_import_allocations
      (entry_id,component,owner_id,amount,policy_code) VALUES($1,'SOUNDPUB',$2,'1.00','PRODUCTION_SPLIT_V1')`,
    [ids.entry, ids.label]), /royalty_allocation_owner_shape/);
    await assert.rejects(owner.query('UPDATE soundpub.royalty_import_allocations SET amount=amount'), /FINANCE_IMMUTABLE/);
    await assert.rejects(owner.query('DELETE FROM soundpub.royalty_import_allocations'), /FINANCE_IMMUTABLE/);

    const mismatchBatch = randomUUID(), mismatchEntry = randomUUID();
    await runtime.query('BEGIN');
    await runtime.query(`INSERT INTO soundpub.royalty_import_batches
      (id,source,period,currency,checksum,filename,uploader_id,row_count,total_amount,validation_result)
      VALUES($1,'allocation-mismatch','2026-11','IDR',$2,'mismatch.csv',$3,1,'10.00','{}')`,
    [mismatchBatch,'b'.repeat(64),ids.admin]);
    await runtime.query(`INSERT INTO soundpub.royalty_import_entries
      (id,batch_id,source,period,source_row_id,beneficiary_id,release_id,track_id,gross_amount,deduction_amount,
        net_amount,artist_id,financial_owner_user_id,label_owner_user_id,calculation_policy_code)
      VALUES($1,$2,'allocation-mismatch','2026-11','row-2',$3,$4,$5,'10.00','0','10.00',$6,$3,$7,'PRODUCTION_SPLIT_V1')`,
    [mismatchEntry, mismatchBatch, ids.artistUser, ids.release, ids.track, ids.artist, ids.label]);
    await runtime.query(`INSERT INTO soundpub.royalty_import_allocations(entry_id,component,owner_id,amount,policy_code)
      VALUES($1,'ARTIST',$2,'9.99','PRODUCTION_SPLIT_V1')`, [mismatchEntry, ids.artistUser]);
    await assert.rejects(runtime.query('COMMIT'), /ROYALTY_ALLOCATION_SUM_MISMATCH/);
    await runtime.query('ROLLBACK');
  } finally {
    await fixture.close();
  }
});
