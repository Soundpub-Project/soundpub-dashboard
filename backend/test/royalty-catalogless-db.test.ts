import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';
import { createRoyaltiesService } from '../src/royalties/index.js';

test('catalogless royalty keeps actual artist and label ownership without fabricated catalog rows',
  { skip: !dockerTestsEnabled, timeout: 120_000 }, async () => {
    const database = await concurrencyPostgres();
    const adminId = randomUUID();
    const labelId = randomUUID();
    const otherLabelId = randomUUID();
    const artistUserId = randomUUID();
    const artistId = randomUUID();
    const batchId = randomUUID();
    const runtime = await database.runtime.connect();
    try {
      await database.owner.query(`INSERT INTO soundpub.backend_users(id,status,account_kind) VALUES
        ($1,'active','STANDARD'),($2,'active','STANDARD'),($3,'active','STANDARD'),($4,'active','MANAGED_ARTIST')`,
      [adminId,labelId,otherLabelId,artistUserId]);
      await database.owner.query(`INSERT INTO soundpub.profiles(id,full_name,parent_label_id,password_set) VALUES
        ($1,'Synthetic Admin',NULL,false),($2,'Synthetic Label',NULL,false),
        ($3,'Other Label',NULL,false),($4,'Synthetic Artist',$2,false)`, [adminId,labelId,otherLabelId,artistUserId]);
      await database.owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES
        ($1,'admin',now()),($2,'label',now()),($3,'label',now()),($4,'artist',now())`,
      [adminId,labelId,otherLabelId,artistUserId]);
      await database.owner.query(`INSERT INTO soundpub.artist_profiles(user_id,artist_name) VALUES ($1,'Synthetic Artist')`,
        [artistUserId]);
      await database.owner.query(`INSERT INTO soundpub.artists(id,label_id,artist_user_id,name,verified_at)
        VALUES ($1,$2,$3,'Synthetic Artist',now())`, [artistId,labelId,artistUserId]);
      await runtime.query('BEGIN');
      await runtime.query(`INSERT INTO soundpub.royalty_import_batches
        (id,source,period,currency,checksum,filename,uploader_id,row_count,total_amount,validation_result)
        VALUES ($1,'synthetic','2026-10','IDR',$2,'catalogless.csv',$3,1,100.00,
          '{"policy_code":"SOUNDPUB_LEGACY_70_21_9","artist_amount":"70.00","label_amount":"21.00","soundpub_amount":"9.00"}')`,
      [batchId,'1'.repeat(64),adminId]);
      const insert = (ownerId: string, labelOwnerId: string, sourceArtist = 'Synthetic Artist') =>
        runtime.query(`INSERT INTO soundpub.royalty_import_entries
          (batch_id,source,period,source_row_id,beneficiary_id,release_id,track_id,platform,
            gross_amount,deduction_amount,net_amount,artist_id,financial_owner_user_id,label_owner_user_id,
            calculation_policy_code,source_isrc,source_artist,source_label,source_row_number,country,sales_unit)
          VALUES ($1,'synthetic','2026-10','row:2',$2,NULL,NULL,'synthetic',100,0,100,$3,$2,$4,
            'SOUNDPUB_LEGACY_70_21_9','IDA010000001',$5,'Synthetic Label',2,'ID',1) RETURNING id`,
        [batchId,ownerId,artistId,labelOwnerId,sourceArtist]);
      const rejected = async (name: string, run: () => Promise<unknown>, matcher: RegExp) => {
        await runtime.query(`SAVEPOINT ${name}`);
        await assert.rejects(run(), matcher);
        await runtime.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await runtime.query(`RELEASE SAVEPOINT ${name}`);
      };
      await rejected('wrong_owner', () => insert(labelId,labelId), /ROYALTY_OWNER_MAPPING_REQUIRED/);
      await rejected('wrong_label', () => insert(artistUserId,otherLabelId), /ROYALTY_LABEL_OWNER_MAPPING_REQUIRED|ROYALTY_OWNER_MAPPING_REQUIRED/);
      await rejected('wrong_name', () => insert(artistUserId,labelId,'Impostor'), /ROYALTY_OWNER_MAPPING_REQUIRED/);
      const entry = (await insert(artistUserId,labelId)).rows[0];
      assert.equal(entry?.id !== undefined,true);
      await runtime.query(`INSERT INTO soundpub.royalty_import_allocations
        (entry_id,component,owner_id,amount,policy_code) VALUES
        ($1,'ARTIST',$2,70,'SOUNDPUB_LEGACY_70_21_9'),
        ($1,'LABEL',$3,21,'SOUNDPUB_LEGACY_70_21_9'),
        ($1,'SOUNDPUB',NULL,9,'SOUNDPUB_LEGACY_70_21_9')`, [entry.id,artistUserId,labelId]);
      await runtime.query('COMMIT');
      const persisted = (await runtime.query(`SELECT release_id,track_id,artist_id,
        financial_owner_user_id,label_owner_user_id,source_artist FROM soundpub.royalty_import_entries
        WHERE id=$1`, [entry.id])).rows[0];
      assert.deepEqual(persisted, { release_id: null, track_id: null, artist_id: artistId,
        financial_owner_user_id: artistUserId, label_owner_user_id: labelId, source_artist: 'Synthetic Artist' });
      const royalties = createRoyaltiesService(database.runtime);
      const admin = { id: adminId, roles: ['admin'] as const, status: 'active' as const };
      const label = { id: labelId, roles: ['label'] as const, status: 'active' as const };
      const adminReport = await royalties.report(admin);
      assert.equal(adminReport.total, 1);
      assert.equal(adminReport.items[0].artist_name, 'Synthetic Artist');
      assert.equal(adminReport.items[0].release_id, null);
      assert.equal(adminReport.summary.net_revenue, '100.00');
      assert.equal((await royalties.report(label)).total, 1);
      const tracks = await royalties.analytics(admin, { view: 'track' });
      assert.equal(tracks.length, 1);
      assert.equal(tracks[0].isrc, 'IDA010000001');
      const csv = `period,isrc,upc,title,artist,label_name,platform,country,sales_unit,net_revenue
2026-11,FRX762598331,,No Catalog Song,New Managed Artist,Synthetic Label,Spotify,ID,10,100.00`;
      const beforePreview = (await database.owner.query(`SELECT count(*)::int AS count
        FROM soundpub.backend_users WHERE account_kind='MANAGED_ARTIST'`)).rows[0].count;
      const preview = await royalties.previewCsv(admin,{ csv });
      assert.deepEqual(preview.issues,[]);
      assert.equal(preview.sample_rows[0].artist_id,null);
      assert.equal(preview.sample_rows[0].release_id,null);
      assert.equal((await database.owner.query(`SELECT count(*)::int AS count
        FROM soundpub.backend_users WHERE account_kind='MANAGED_ARTIST'`)).rows[0].count,beforePreview);
      const imported = await royalties.commitCsv(admin,{ csv,source:'november-synthetic',filename:'november.csv',
        expected_checksum: preview.checksum! },'catalogless-import');
      assert.equal(imported.replayed,false);
      const royalty = (await database.owner.query(`SELECT e.artist_id,e.financial_owner_user_id,e.release_id,e.track_id,
        e.source_artist,e.source_label,u.account_kind
        FROM soundpub.royalty_import_entries e JOIN soundpub.backend_users u ON u.id=e.financial_owner_user_id
        WHERE e.batch_id=$1`,[imported.id])).rows[0];
      assert.equal(royalty.account_kind,'MANAGED_ARTIST');
      assert.equal(royalty.release_id,null);
      assert.equal(royalty.track_id,null);
      assert.equal(royalty.source_artist,'New Managed Artist');
      assert.equal(royalty.source_label,'Synthetic Label');
      assert.equal((await database.owner.query(`SELECT count(*)::int AS count
        FROM soundpub.local_auth_credentials WHERE user_id=$1`,[royalty.financial_owner_user_id])).rows[0].count,0);
      const replay = await royalties.commitCsv(admin,{ csv,source:'november-synthetic',filename:'november.csv',
        expected_checksum: preview.checksum! },'catalogless-replay');
      assert.deepEqual(replay,{ id: imported.id,replayed:true });
      assert.equal((await royalties.report(admin)).total,2);
    } finally {
      try { await runtime.query('ROLLBACK'); } catch { /* transaction already closed */ }
      runtime.release();
      await database.close();
    }
  });
test('catalogless Label Custom import credits PIC only and requires registered contact roster',
  { skip: !dockerTestsEnabled, timeout: 120_000 }, async () => {
    const database = await concurrencyPostgres();
    const adminId = randomUUID();
    const ownerId = randomUUID();
    const unitId = randomUUID();
    const artistId = randomUUID();
    try {
      await database.owner.query(`INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active'),($2,'active')`,
        [adminId,ownerId]);
      await database.owner.query(`INSERT INTO soundpub.profiles(id,full_name) VALUES
        ($1,'Synthetic Admin'),($2,'Custom Label')`, [adminId,ownerId]);
      await database.owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES
        ($1,'admin',now()),($2,'label_custom',now())`, [adminId,ownerId]);
      await database.owner.query(`INSERT INTO soundpub.label_custom_units(id,owner_user_id,unit_code,name)
        VALUES($1,$2,'test-custom-unit','Custom Label Unit')`, [unitId,ownerId]);
      await database.owner.query(`INSERT INTO soundpub.artists
        (id,label_id,label_custom_unit_id,management_mode,name,contact_email,contact_phone,verified_at)
        VALUES($1,$2,$3,'LABEL_CUSTOM_MANAGED','Custom Artist','artist@example.test','+628123456789',now())`,
      [artistId,ownerId,unitId]);
      await database.owner.query(`INSERT INTO soundpub.artist_profiles(artist_id,artist_name)
        VALUES($1,'Custom Artist')`, [artistId]);
      const service = createRoyaltiesService(database.runtime);
      const admin = { id: adminId, roles: ['admin'] as const, status: 'active' as const };
      const pic = { id: ownerId, roles: ['label_custom'] as const, status: 'active' as const };
      const csv = `period,isrc,upc,title,artist,label_name,platform,country,sales_unit,net_revenue
2026-11,IDA010000005,,Uncatalogued Song,Custom Artist,Custom Label,Spotify,ID,10,100.00`;
      const missing = await service.previewCsv(admin, { csv: csv.replace('Custom Artist', 'Unknown Artist') });
      assert.equal(missing.valid_rows, 0);
      assert.equal(missing.issues[0]?.code, 'ARTIST_ROSTER_REQUIRED');
      assert.equal((await database.owner.query(`SELECT count(*)::int AS count FROM soundpub.artists
        WHERE label_id=$1`, [ownerId])).rows[0].count, 1);
      const preview = await service.previewCsv(admin, { csv });
      assert.deepEqual(preview.issues, []);
      assert.equal(preview.sample_rows[0]?.artist_id, artistId);
      assert.equal(preview.sample_rows[0]?.artist_owner_user_id, ownerId);
      const committed = await service.commitCsv(admin, { csv, source: 'synthetic-custom',
        filename: 'custom.csv', expected_checksum: preview.checksum! }, 'custom-import');
      assert.equal(committed.replayed, false);
      const entry = (await database.owner.query(`SELECT artist_id,financial_owner_user_id,label_owner_user_id,
        release_id,track_id FROM soundpub.royalty_import_entries WHERE batch_id=$1`, [committed.id])).rows[0];
      assert.deepEqual(entry, { artist_id: artistId, financial_owner_user_id: ownerId,
        label_owner_user_id: ownerId, release_id: null, track_id: null });
      assert.deepEqual((await database.owner.query(`SELECT component,owner_id,amount::text
        FROM soundpub.royalty_import_allocations allocation JOIN soundpub.royalty_import_entries entry
        ON entry.id=allocation.entry_id WHERE entry.batch_id=$1 ORDER BY component`, [committed.id])).rows,
      [{ component: 'ARTIST', owner_id: ownerId, amount: '70.00' },
        { component: 'LABEL', owner_id: ownerId, amount: '21.00' },
        { component: 'SOUNDPUB', owner_id: null, amount: '9.00' }]);
      assert.deepEqual((await database.owner.query(`SELECT owner_id,amount_minor::text FROM soundpub.finance_events
        WHERE business_reference=$1`, [`royalty:${committed.id}`])).rows,
      [{ owner_id: ownerId, amount_minor: '9100' }]);
      const report = await service.report(pic);
      assert.equal(report.total, 1);
      assert.equal(report.items[0].owner_revenue, '91.00');
      assert.equal((await database.owner.query(`SELECT count(*)::int AS count FROM soundpub.backend_users
        WHERE account_kind='MANAGED_ARTIST'`)).rows[0].count, 0);
    } finally { await database.close(); }
  });