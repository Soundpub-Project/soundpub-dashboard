import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Principal } from '../src/auth/index.js';
import { createRoyaltiesService } from '../src/royalties/index.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

test('CSV replacement atomically reverses old allocations and posts immutable replacement', {
  skip: !dockerTestsEnabled, timeout: 120_000,
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
      ($1,'Replacement Label',NULL),($2,'Replacement Artist',$1)`, [label.id,artist.id]);
    await owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES
      ($1,'admin',now()),($2,'label',now()),($3,'artist',now())`, [admin.id,label.id,artist.id]);
    await owner.query(`INSERT INTO soundpub.artists(id,label_id,artist_user_id,name)
      VALUES($1,$2,$3,'Replacement Artist')`, [artistId,label.id,artist.id]);
    await owner.query(`INSERT INTO soundpub.releases(id,label_id,artist_user_id,created_by,artist_id,title,artist_name,upc,status)
      VALUES($1,$2,$3,$2,$4,'Replacement Release','Replacement Artist','1234567890123','draft')`,
    [releaseId,label.id,artist.id,artistId]);
    await owner.query(`INSERT INTO soundpub.tracks(id,release_id,artist_user_id,artist_id,title,artist_name,isrc,position)
      VALUES($1,$2,$3,$4,'Replacement Track','Replacement Artist','FRX762598330',1)`,
    [trackId,releaseId,artist.id,artistId]);
    const service = createRoyaltiesService(runtime);
    const csv = (period: string, amount: string) => [
      'period,isrc,upc,title,artist,label_name,platform,country,sales_type,sales_unit,net_revenue',
      `${period},FRX762598330,1234567890123,Replacement Track,Replacement Artist,Replacement Label,Spotify,ID,stream,10,${amount}`,
    ].join('\n');
    const originalCsv = csv('2026-10', '100.00');
    const originalPreview = await service.previewCsv(admin, { csv: originalCsv });
    const original = await service.commitCsv(admin, { csv: originalCsv, source: 'replacement-dsp', filename: 'old.csv',
      expected_checksum: originalPreview.checksum! }, 'original');
    const replacementCsv = csv('2026-10', '150.00');
    const replacementPreview = await service.previewCsv(admin, { csv: replacementCsv });
    await assert.rejects(service.replaceCsv(admin, original.id, { csv: replacementCsv, filename: 'new.csv',
      expected_checksum: '0'.repeat(64), reason: 'corrected provider statement' }, 'stale'), { code: 'ROYALTY_PREVIEW_STALE' });
    assert.equal((await owner.query('SELECT count(*)::int AS count FROM soundpub.royalty_import_corrections WHERE batch_id=$1', [original.id])).rows[0].count, 0);

    const input = { csv: replacementCsv, filename: 'new.csv', expected_checksum: replacementPreview.checksum!,
      reason: 'corrected provider statement' };
    const replacement = await service.replaceCsv(admin, original.id, input, 'replace');
    assert.equal(replacement.replayed, false);
    assert.equal(replacement.replaced_id, original.id);
    assert.deepEqual(await service.replaceCsv(admin, original.id, input, 'replay'), { ...replacement, replayed: true });
    await assert.rejects(service.replaceCsv(admin, original.id, { ...input, reason: 'different reason' }, 'conflict'),
      { code: 'ROYALTY_REPLACEMENT_CONFLICT' });
    assert.deepEqual((await owner.query(`SELECT old_batch_id,new_batch_id,reason FROM soundpub.royalty_import_replacements
      WHERE old_batch_id=$1`, [original.id])).rows, [{ old_batch_id: original.id, new_batch_id: replacement.id,
      reason: input.reason }]);
    const originalDetail = await service.detail(admin, original.id);
    const replacementDetail = await service.detail(admin, replacement.id);
    assert.equal(originalDetail.status, 'VOIDED_WITH_OFFSET');
    assert.equal(originalDetail.replacement_batch_id, replacement.id);
    assert.equal(originalDetail.change_reason, input.reason);
    assert.equal(replacementDetail.status, 'UNRECONCILED');
    assert.equal(replacementDetail.replaces_batch_id, original.id);
    const history = await service.history(admin);
    assert.equal(history.items.find(batch => batch.id === original.id)?.replacement_batch_id, replacement.id);
    assert.equal(history.items.find(batch => batch.id === replacement.id)?.replaces_batch_id, original.id);
    assert.equal((await service.summary(artist)).net_earnings, '105.00');
    assert.equal((await service.summary(label)).net_earnings, '31.50');
    assert.equal((await owner.query(`SELECT count(*)::int AS count FROM soundpub.royalty_import_batches
      WHERE source='replacement-dsp' AND period='2026-10'`)).rows[0].count, 2);
    const wrongPeriod = csv('2026-11', '200.00');
    const wrongPreview = await service.previewCsv(admin, { csv: wrongPeriod });
    await assert.rejects(service.replaceCsv(admin, replacement.id, { csv: wrongPeriod, filename: 'wrong.csv',
      expected_checksum: wrongPreview.checksum!, reason: 'wrong period' }, 'wrong-period'),
    { code: 'ROYALTY_REPLACEMENT_PERIOD_MISMATCH' });
  } finally { await database.close(); }
});
