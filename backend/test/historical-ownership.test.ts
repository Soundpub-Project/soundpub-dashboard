import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createLabelsService } from '../src/labels/index.js';
import { historicalDatabase, historicalFixture } from './support/historical-ownership.js';

test('Phase 3B populated historical ownership on owned disposable PostgreSQL', { skip: process.env.RUN_DOCKER_TESTS !== '1', timeout: 120_000 }, async suite => {
  const { owner, runtime, close } = await historicalDatabase();
  const labels = createLabelsService(runtime);
  try {
    await suite.test('transfer preserves every completed release and royalty field and changes current authority', async () => {
      const fixture = await historicalFixture(owner, runtime);
      const before = await fixture.current();
      const catalogArtistId = (await owner.query('SELECT id FROM soundpub.artists WHERE artist_user_id=$1', [fixture.artist.id])).rows[0].id as string;
      const releaseId = (await owner.query(`INSERT INTO soundpub.releases(label_id,artist_id,artist_user_id,created_by,title,artist_name)
        VALUES($1,$2,$3,$4,'Synthetic transfer release','Same synthetic display name') RETURNING id`,
      [fixture.labelA, catalogArtistId, fixture.artist.id, fixture.admin.id])).rows[0].id as string;
      const trackId = (await owner.query(`INSERT INTO soundpub.tracks(release_id,title,artist_name,position)
        VALUES($1,'Synthetic transfer track','Same synthetic display name',1) RETURNING id`, [releaseId])).rows[0].id as string;
      const batchId = randomUUID();
      const transaction = await owner.connect();
      try {
        await transaction.query('BEGIN');
        await transaction.query(`INSERT INTO soundpub.royalty_import_batches
          (id,source,period,currency,checksum,filename,uploader_id,row_count,total_amount,validation_result)
          VALUES($1,'synthetic-transfer','2024-02','IDR',$2,'synthetic-transfer.csv',$3,1,100.00,'{}')`,
        [batchId, randomUUID().replaceAll('-', '').padEnd(64, '0'), fixture.admin.id]);
        const entryId = (await transaction.query(`INSERT INTO soundpub.royalty_import_entries
          (batch_id,source,period,source_row_id,beneficiary_id,release_id,track_id,gross_amount,deduction_amount,net_amount,artist_id,financial_owner_user_id,label_owner_user_id,calculation_policy_code)
          VALUES($1,'synthetic-transfer','2024-02','transfer-row-1',$2,$3,$4,100.00,0.00,100.00,$5,$2,$6,'SYNTHETIC_TRANSFER_V1') RETURNING id`,
        [batchId, fixture.artist.id, releaseId, trackId, catalogArtistId, fixture.labelA])).rows[0].id as string;
        await transaction.query(`INSERT INTO soundpub.royalty_import_allocations(entry_id,component,owner_id,amount,policy_code)
          VALUES($1,'LEGACY_OWNER',$2,100.00,'SYNTHETIC_TRANSFER_V1')`, [entryId, fixture.artist.id]);
        await transaction.query('COMMIT');
      } catch (error) {
        await transaction.query('ROLLBACK');
        throw error;
      } finally { transaction.release(); }
      const result = await labels.transfer(fixture.admin, fixture.artist.id, {
        labelId: fixture.labelB, expectedParentLabelId: fixture.labelA,
        confirmationPhrase: 'PINDAH LABEL', royaltyTransferMode: 'keep_old_label',
      }, randomUUID());
      assert.deepEqual(result.affected, { releases: 1, tracks: 1, royalties: 1 });
      assert.deepEqual(await fixture.current(), {
        parent_label_id: fixture.labelB, label_id: fixture.labelB, membership_id: before.membership_id,
      });
      assert.deepEqual(await fixture.history(), fixture.baseline);
      await assert.rejects(fixture.artists.get({ id: fixture.labelA, roles: ['label'], status: 'active' }, fixture.artist.id),
        { statusCode: 404 });
      assert.equal((await fixture.artists.get({ id: fixture.labelB, roles: ['label'], status: 'active' }, fixture.artist.id)).id, fixture.artist.id);
      const audit = (await owner.query("SELECT metadata FROM soundpub.audit_logs WHERE resource_id=$1 AND action='label.artist_transferred'", [fixture.artist.id])).rows;
      assert.equal(audit.length, 1);
      assert.equal(audit[0].metadata.previousParentLabelId, fixture.labelA);
      assert.equal(audit[0].metadata.parentLabelId, fixture.labelB);
      assert.equal(audit[0].metadata.royaltyTransferMode, 'keep_old_label');
      assert.deepEqual(audit[0].metadata.affected, { releases: 1, tracks: 1, royalties: 1 });
      assert.equal(audit[0].metadata.historicalOwnership, 'kept');
      assert.equal((await owner.query('SELECT label_id,artist_user_id FROM soundpub.releases WHERE id=$1', [releaseId])).rows[0].label_id, fixture.labelA);
    });

    for (const path of ['labels.remove', 'artists.removeFromLabel'] as const) {
      await suite.test(`${path} preserves populated history and leaves independent profile without dangling membership`, async () => {
        const fixture = await historicalFixture(owner, runtime);
        if (path === 'labels.remove') {
          await labels.remove(fixture.admin, fixture.artist.id, { expectedParentLabelId: fixture.labelA }, randomUUID());
        } else await fixture.artists.removeFromLabel(fixture.admin, fixture.artist.id, randomUUID());
        assert.deepEqual(await fixture.current(), { parent_label_id: null, label_id: null, membership_id: null });
        assert.deepEqual(await fixture.history(), fixture.baseline);
        assert.equal((await fixture.artists.get(fixture.admin, fixture.artist.id)).id, fixture.artist.id);
        assert.equal((await owner.query(`SELECT count(*)::int AS count FROM historical_fixture.royalty_attribution y
          JOIN historical_fixture.release_ownership r ON r.id=y.release_id
          JOIN soundpub.profiles p ON p.id=y.artist_user_id
          JOIN soundpub.profiles l ON l.id=y.label_user_id
          JOIN soundpub.profiles recipient ON recipient.id=y.recipient_user_id WHERE y.artist_user_id=$1`,
        [fixture.artist.id])).rows[0].count, 2);
      });
    }

    await suite.test('deletion approval records review only; restricted runtime cannot destroy artist or historical owner', async () => {
      const fixture = await historicalFixture(owner, runtime);
      const request = await fixture.artists.requestDeletion(fixture.admin, fixture.artist.id, { reason: 'Synthetic historical safety check' }, randomUUID());
      const approved = await fixture.artists.reviewDeletionRequest(fixture.admin, request.id, { status: 'approved' }, randomUUID());
      assert.equal(approved.status, 'approved');
      assert.equal((await fixture.artists.get(fixture.admin, fixture.artist.id)).id, fixture.artist.id);
      assert.equal((await fixture.current()).parent_label_id, fixture.labelA);
      for (const id of [fixture.artist.id, fixture.labelA]) {
        await assert.rejects(runtime.query('DELETE FROM soundpub.profiles WHERE id=$1', [id]), { code: '23503' });
        await assert.rejects(owner.query('DELETE FROM soundpub.profiles WHERE id=$1', [id]), { code: '23503' });
      }
      assert.deepEqual(await fixture.history(), fixture.baseline);
    });

    await suite.test('stale transfer rolls back current relation and history without false success audit', async () => {
      const fixture = await historicalFixture(owner, runtime);
      const before = await fixture.current();
      const requestId = randomUUID();
      await assert.rejects(labels.transfer(fixture.admin, fixture.artist.id, {
        labelId: fixture.labelB, expectedParentLabelId: fixture.labelB, confirmationPhrase: 'PINDAH LABEL',
      }, requestId), { statusCode: 409 });
      assert.deepEqual(await fixture.current(), before);
      assert.deepEqual(await fixture.history(), fixture.baseline);
      assert.equal((await owner.query('SELECT count(*)::int AS count FROM soundpub.audit_logs WHERE request_id=$1', [requestId])).rows[0].count, 0);
      await assert.rejects(runtime.query('SELECT * FROM historical_fixture.royalty_attribution'), { code: '42501' });
    });
  } finally { await close(); }
});
