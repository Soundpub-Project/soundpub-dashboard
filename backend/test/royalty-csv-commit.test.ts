import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Principal } from '../src/auth/index.js';
import { createRoyaltiesService } from '../src/royalties/index.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

test('CSV royalty commit splits ordinary label wallets and reverses exact allocations', {
  skip: process.env.RUN_DOCKER_TESTS !== '1', timeout: 120_000,
}, async () => {
  const database = await concurrencyPostgres();
  const { owner, runtime } = database;
  const admin: Principal = { id: randomUUID(), roles: ['admin'], status: 'active' };
  const label: Principal = { id: randomUUID(), roles: ['label'], status: 'active' };
  const artist: Principal = { id: randomUUID(), roles: ['artist'], status: 'active' };
  const artistId = randomUUID(), releaseId = randomUUID(), trackId = randomUUID();
  try {
    await owner.query(`INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active'),($2,'active'),($3,'active')`,
      [admin.id,label.id,artist.id]);
    await owner.query(`INSERT INTO soundpub.profiles(id,full_name,parent_label_id) VALUES
      ($1,'Synthetic Label',NULL),($2,'Synthetic Artist',$1)`, [label.id,artist.id]);
    await owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,'admin',now()),($2,'label',now()),($3,'artist',now())`,
      [admin.id,label.id,artist.id]);
    await owner.query(`INSERT INTO soundpub.artists(id,label_id,artist_user_id,name)
      VALUES($1,$2,$3,'Synthetic Artist')`, [artistId,label.id,artist.id]);
    await owner.query(`INSERT INTO soundpub.releases(id,label_id,artist_user_id,created_by,artist_id,title,artist_name,upc,status)
      VALUES($1,$2,$3,$2,$4,'Synthetic Release','Synthetic Artist','1234567890123','draft')`,
    [releaseId,label.id,artist.id,artistId]);
    await owner.query(`INSERT INTO soundpub.tracks(id,release_id,artist_user_id,artist_id,title,artist_name,isrc,position)
      VALUES($1,$2,$3,$4,'Synthetic Track','Synthetic Artist','FRX762598330',1)`,
    [trackId,releaseId,artist.id,artistId]);

    const service = createRoyaltiesService(runtime);
    const csv = [
      'period,isrc,upc,title,artist,label_name,platform,country,sales_type,sales_unit,net_revenue',
      '2026-10,FRX762598330,1234567890123,Synthetic Track,Synthetic Artist,Synthetic Label,Spotify,ID,stream,10,100.00',
    ].join('\n');
    const preview = await service.previewCsv(admin, { csv });
    assert.equal(preview.valid_rows, 1);
    assert.equal(preview.artist_amount, '70.00');
    assert.equal(preview.label_amount, '21.00');
    assert.equal(preview.soundpub_amount, '9.00');
    assert.ok(preview.checksum);
    await assert.rejects(service.commitCsv(admin, { csv, source: 'ordinary-dsp', filename: 'ordinary.csv',
      expected_checksum: '0'.repeat(64) }, 'stale'), { code: 'ROYALTY_PREVIEW_STALE' });

    const input = { csv, source: 'ordinary-dsp', filename: 'ordinary.csv', expected_checksum: preview.checksum! };
    const batch = await service.commitCsv(admin, input, 'commit');
    assert.equal(batch.replayed, false);
    assert.deepEqual(await service.commitCsv(admin, input, 'replay'), { id: batch.id, replayed: true });
    assert.deepEqual((await owner.query(`SELECT component,owner_id,amount::text FROM soundpub.royalty_import_allocations a
      JOIN soundpub.royalty_import_entries e ON e.id=a.entry_id WHERE e.batch_id=$1 ORDER BY component`, [batch.id])).rows, [
      { component: 'ARTIST', owner_id: artist.id, amount: '70.00' },
      { component: 'LABEL', owner_id: label.id, amount: '21.00' },
      { component: 'SOUNDPUB', owner_id: null, amount: '9.00' },
    ]);
    assert.deepEqual((await owner.query(`SELECT owner_id,kind,amount_minor::text FROM soundpub.finance_events
      WHERE business_reference=$1 ORDER BY owner_id`, [`royalty:${batch.id}`])).rows, [
      { owner_id: label.id < artist.id ? label.id : artist.id, kind: 'ROYALTY_EARNING', amount_minor: label.id < artist.id ? '2100' : '7000' },
      { owner_id: label.id < artist.id ? artist.id : label.id, kind: 'ROYALTY_EARNING', amount_minor: label.id < artist.id ? '7000' : '2100' },
    ]);
    assert.equal((await service.summary(artist)).net_earnings, '70.00');
    assert.equal((await service.summary(label)).net_earnings, '21.00');

    const changedCsv = csv.replace('100.00', '101.00');
    const changed = await service.previewCsv(admin, { csv: changedCsv });
    await assert.rejects(service.commitCsv(admin, { ...input, csv: changedCsv, expected_checksum: changed.checksum! }, 'conflict'),
      { code: 'ROYALTY_PERIOD_CONFLICT' });
    await service.correct(admin, batch.id, { reason: 'synthetic reversal' }, 'correct');
    assert.deepEqual((await owner.query(`SELECT owner_id,kind,amount_minor::text FROM soundpub.finance_events
      WHERE business_reference=$1 ORDER BY owner_id,kind`, [`royalty:${batch.id}`])).rows.map(row => ({ ...row })), [
      { owner_id: label.id < artist.id ? label.id : artist.id, kind: 'ROYALTY_ADJUSTMENT', amount_minor: label.id < artist.id ? '-2100' : '-7000' },
      { owner_id: label.id < artist.id ? label.id : artist.id, kind: 'ROYALTY_EARNING', amount_minor: label.id < artist.id ? '2100' : '7000' },
      { owner_id: label.id < artist.id ? artist.id : label.id, kind: 'ROYALTY_ADJUSTMENT', amount_minor: label.id < artist.id ? '-7000' : '-2100' },
      { owner_id: label.id < artist.id ? artist.id : label.id, kind: 'ROYALTY_EARNING', amount_minor: label.id < artist.id ? '7000' : '2100' },
    ]);
  } finally {
    await database.close();
  }
});

