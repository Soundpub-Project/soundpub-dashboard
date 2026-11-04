import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Principal, Role } from '../src/auth/index.js';
import { createRoyaltiesService } from '../src/royalties/index.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

const principal = (id: string, role: Role): Principal => ({ id, roles: [role], status: 'active' });

test('royalty report scopes admin, label, whitelabel and artist without cross-owner leakage', {
  skip: !dockerTestsEnabled, timeout: 120_000,
}, async () => {
  const database = await concurrencyPostgres();
  const { owner, runtime } = database;
  const admin = principal(randomUUID(), 'admin');
  const label = principal(randomUUID(), 'label');
  const whitelabel = principal(randomUUID(), 'whitelabel');
  const artistA = principal(randomUUID(), 'artist');
  const artistB = principal(randomUUID(), 'artist');
  const user = principal(randomUUID(), 'user');
  const artistAId = randomUUID(), artistBId = randomUUID();
  const releaseA = randomUUID(), releaseB = randomUUID();
  const trackA = randomUUID(), trackB = randomUUID();
  try {
    await owner.query(`INSERT INTO soundpub.backend_users(id,status) VALUES
      ($1,'active'),($2,'active'),($3,'active'),($4,'active'),($5,'active'),($6,'active')`,
    [admin.id,label.id,whitelabel.id,artistA.id,artistB.id,user.id]);
    await owner.query(`INSERT INTO soundpub.profiles(id,full_name,parent_label_id) VALUES
      ($1,'Admin',NULL),($2,'Label A',NULL),($3,'White Label B',NULL),
      ($4,'Artist A',$2),($5,'Artist B',$3),($6,'User',NULL)`,
    [admin.id,label.id,whitelabel.id,artistA.id,artistB.id,user.id]);
    await owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES
      ($1,'admin',now()),($2,'label',now()),($3,'whitelabel',now()),
      ($4,'artist',now()),($5,'artist',now()),($6,'user',now())`,
    [admin.id,label.id,whitelabel.id,artistA.id,artistB.id,user.id]);
    await owner.query(`INSERT INTO soundpub.artists(id,label_id,artist_user_id,name) VALUES
      ($1,$2,$3,'Artist A'),($4,$5,$6,'Artist B')`,
    [artistAId,label.id,artistA.id,artistBId,whitelabel.id,artistB.id]);
    await owner.query(`INSERT INTO soundpub.releases(id,label_id,artist_user_id,created_by,artist_id,title,artist_name,upc,status) VALUES
      ($1,$2,$3,$2,$4,'Release A','Artist A','1234567890123','draft'),
      ($5,$6,$7,$6,$8,'Release B','Artist B','2234567890123','draft')`,
    [releaseA,label.id,artistA.id,artistAId,releaseB,whitelabel.id,artistB.id,artistBId]);
    await owner.query(`INSERT INTO soundpub.tracks(id,release_id,artist_user_id,artist_id,title,artist_name,isrc,position) VALUES
      ($1,$2,$3,$4,'Track A','Artist A','FRX762598330',1),
      ($5,$6,$7,$8,'Track B','Artist B','FRX762598331',1)`,
    [trackA,releaseA,artistA.id,artistAId,trackB,releaseB,artistB.id,artistBId]);

    const service = createRoyaltiesService(runtime);
    const csv = [
      'period,isrc,upc,title,artist,label_name,platform,country,sales_type,sales_unit,net_revenue',
      '2026-10,FRX762598330,1234567890123,Track A,Artist A,Label A,Spotify,ID,stream,10,100.00',
      '2026-10,FRX762598331,2234567890123,Track B,Artist B,White Label B,Apple Music,US,stream,20,200.00',
    ].join('\n');
    const preview = await service.previewCsv(admin, { csv });
    assert.ok(preview.checksum);
    await service.commitCsv(admin, { csv, source: 'reporting-dsp', filename: 'reporting.csv',
      expected_checksum: preview.checksum! }, 'reporting-commit');

    assert.deepEqual(await service.periods(admin), { items: ['2026-10'] });
    assert.deepEqual(await service.periods(label), { items: ['2026-10'] });
    assert.deepEqual(await service.periods(whitelabel), { items: ['2026-10'] });
    assert.deepEqual(await service.periods(artistA), { items: ['2026-10'] });
    await assert.rejects(service.periods(user), { code: 'FORBIDDEN' });

    const adminReport = await service.report(admin);
    assert.equal(adminReport.total, 2);
    assert.equal(adminReport.summary.net_revenue, '300.00');
    assert.equal(adminReport.summary.owner_revenue, '300.00');
    assert.deepEqual(new Set(adminReport.items.map(row => row.track_id)), new Set([trackA,trackB]));
    const labelReport = await service.report(label);
    assert.equal(labelReport.total, 1);
    assert.equal(labelReport.items[0]?.track_id, trackA);
    assert.equal(labelReport.items[0]?.owner_revenue, '21.00');
    assert.equal(labelReport.summary.owner_revenue, '21.00');
    const whiteReport = await service.report(whitelabel);
    assert.equal(whiteReport.total, 1);
    assert.equal(whiteReport.items[0]?.track_id, trackB);
    assert.equal(whiteReport.items[0]?.owner_revenue, '42.00');
    const artistReport = await service.report(artistA);
    assert.equal(artistReport.total, 1);
    assert.equal(artistReport.items[0]?.track_id, trackA);
    assert.equal(artistReport.items[0]?.owner_revenue, '70.00');
    assert.equal(artistReport.summary.owner_revenue, '70.00');
    assert.equal((await service.report(admin, { search: 'apple', period: '2026-10' })).total, 1);
    assert.equal((await service.report(admin, { release_id: releaseA })).items[0]?.track_id, trackA);
    await assert.rejects(service.report(user), { code: 'FORBIDDEN' });
  } finally { await database.close(); }
});
