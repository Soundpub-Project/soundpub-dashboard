import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Principal } from '../src/auth/index.js';
import { createRoyaltiesService } from '../src/royalties/index.js';
import { createBalanceService } from '../src/finance/service.js';
import { postEvent } from '../src/finance/index.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

test('CSV royalty commit splits ordinary label wallets and reverses exact allocations', {
  skip: process.env.RUN_DOCKER_TESTS !== '1', timeout: 120_000,
}, async () => {
  const database = await concurrencyPostgres();
  const { owner, runtime, reconciler } = database;
  const admin: Principal = { id: randomUUID(), roles: ['admin'], status: 'active' };
  const reviewer: Principal = { id: randomUUID(), roles: ['admin'], status: 'active' };
  const label: Principal = { id: randomUUID(), roles: ['label'], status: 'active' };
  const artist: Principal = { id: randomUUID(), roles: ['artist'], status: 'active' };
  const artistId = randomUUID(), releaseId = randomUUID(), trackId = randomUUID();
  try {
    await owner.query(`INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active'),($2,'active'),($3,'active'),($4,'active')`,
      [admin.id,label.id,artist.id,reviewer.id]);
    await owner.query(`INSERT INTO soundpub.profiles(id,full_name,parent_label_id) VALUES
      ($1,'Synthetic Label',NULL),($2,'Synthetic Artist',$1)`, [label.id,artist.id]);
    await owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES
      ($1,'admin',now()),($2,'label',now()),($3,'artist',now()),($4,'admin',now())`,
      [admin.id,label.id,artist.id,reviewer.id]);
    await owner.query(`INSERT INTO soundpub.artists(id,label_id,artist_user_id,name)
      VALUES($1,$2,$3,'Synthetic Artist')`, [artistId,label.id,artist.id]);
    await owner.query(`INSERT INTO soundpub.releases(id,label_id,artist_user_id,created_by,artist_id,title,artist_name,upc,status)
      VALUES($1,$2,$3,$2,$4,'Synthetic Release','Synthetic Artist','1234567890123','draft')`,
    [releaseId,label.id,artist.id,artistId]);
    await owner.query(`INSERT INTO soundpub.tracks(id,release_id,artist_user_id,artist_id,title,artist_name,isrc,position)
      VALUES($1,$2,$3,$4,'Synthetic Track','Synthetic Artist','FRX762598330',1)`,
    [trackId,releaseId,artist.id,artistId]);

    await owner.query('BEGIN');
    const driftBatch = (await owner.query<{ id: string }>(`INSERT INTO soundpub.royalty_import_batches
      (source,period,currency,checksum,filename,uploader_id,row_count,total_amount,validation_result)
      VALUES('drift','2026-08','IDR',$1,'drift.csv',$2,2,100,'{}'::jsonb) RETURNING id`,
    ['1'.repeat(64),admin.id])).rows[0]!.id;
    const driftEntries = (await owner.query<{ id: string }>(`INSERT INTO soundpub.royalty_import_entries
      (batch_id,source,period,source_row_id,beneficiary_id,release_id,track_id,gross_amount,deduction_amount,net_amount,
        artist_id,financial_owner_user_id,label_owner_user_id,calculation_policy_code,source_isrc,source_upc)
      VALUES($1,'drift','2026-08','drift-1',$2,$3,$4,50,0,50,$5,$2,$6,'BACKEND_SINGLE_OWNER_V1','FRX762598330','1234567890123'),
        ($1,'drift','2026-08','drift-2',$2,$3,$4,50,0,50,$5,$2,$6,'BACKEND_SINGLE_OWNER_V1','FRX762598330','1234567890123') RETURNING id`,
    [driftBatch,artist.id,releaseId,trackId,artistId,label.id])).rows;
    await owner.query(`INSERT INTO soundpub.royalty_import_allocations(entry_id,component,owner_id,amount,policy_code)
      VALUES($1,'LEGACY_OWNER',$3,60,'BACKEND_SINGLE_OWNER_V1'),
        ($2,'LEGACY_OWNER',$3,40,'BACKEND_SINGLE_OWNER_V1')`, [driftEntries[0]!.id,driftEntries[1]!.id,artist.id]);
    await assert.rejects(owner.query('COMMIT'), /ROYALTY_ALLOCATION_SUM_MISMATCH/);
    await owner.query('ROLLBACK');

    await owner.query('BEGIN');
    await owner.query(`INSERT INTO soundpub.royalty_import_batches
      (source,period,currency,checksum,filename,uploader_id,row_count,total_amount,validation_result)
      VALUES('empty','2026-09','IDR',$1,'empty.csv',$2,1,1,'{}'::jsonb)`, ['2'.repeat(64),admin.id]);
    await assert.rejects(owner.query('COMMIT'), /ROYALTY_ALLOCATION_SUM_MISMATCH/);
    await owner.query('ROLLBACK');

    const service = createRoyaltiesService(runtime, undefined, reconciler);
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
    const report = await service.reconciliation(admin, batch.id);
    assert.equal(report.matched, true, JSON.stringify(report));
    assert.deepEqual(report.issues, []);
    assert.equal(report.approval, null);
    await assert.rejects(service.reconcile(reviewer, batch.id, { expected_checksum: '0'.repeat(64),
      evidence: 'synthetic verification' }, 'reconcile-stale'), { code: 'ROYALTY_RECONCILIATION_STALE' });
    await assert.rejects(service.reconcile(admin, batch.id, { expected_checksum: report.snapshot.batch.checksum,
      evidence: 'self review forbidden' }, 'reconcile-self'), { code: 'ROYALTY_RECONCILIATION_REVIEWER_REQUIRED' });
    const approved = await service.reconcile(reviewer, batch.id, { expected_checksum: report.snapshot.batch.checksum,
      evidence: 'synthetic verification' }, 'reconcile');
    assert.equal(approved.matched, true);
    assert.equal(approved.replayed, false);
    assert.equal((await service.detail(admin, batch.id)).status, 'RECONCILED');
    const replayed = await service.reconcile(reviewer, batch.id, { expected_checksum: report.snapshot.batch.checksum,
      evidence: 'retry evidence is ignored after immutable approval' }, 'reconcile-replay');
    assert.equal(replayed.replayed, true);
    const labelBalance = await createBalanceService(runtime).get(label);
    assert.equal(labelBalance.status, 'RECONCILED');
    assert.equal(labelBalance.available, '91.00');

    const approvalEvidence = (await owner.query<{ audit_log_id: string; outbox_id: string }>(`SELECT audit_log_id,outbox_id
      FROM soundpub.royalty_import_reconciliations WHERE batch_id=$1 AND result='MATCHED'`, [batch.id])).rows[0]!;
    await assert.rejects(runtime.query(`INSERT INTO soundpub.royalty_import_reconciliations
      (batch_id,actor_id,result,evidence,snapshot_checksum,snapshot,issues,audit_log_id,outbox_id)
      VALUES($1,$2,'MATCHED','forged approval',$3,'{}'::jsonb,'[]'::jsonb,$4,$5)`,
    [batch.id,reviewer.id,report.checksum,approvalEvidence.audit_log_id,approvalEvidence.outbox_id]), /permission denied/);

    const importOutbox = (await owner.query<{ id: string; payload: unknown }>(`SELECT id,payload FROM soundpub.outbox_events
      WHERE idempotency_key=$1`, [`royalty.csv_imported:${batch.id}`])).rows[0]!;
    await owner.query(`UPDATE soundpub.outbox_events SET payload='{}'::jsonb WHERE id=$1`, [importOutbox.id]);
    assert.equal((await createBalanceService(runtime).get(label)).status, 'RECONCILIATION_REQUIRED');
    assert.equal((await service.detail(admin, batch.id)).status, 'UNRECONCILED');
    await owner.query(`UPDATE soundpub.outbox_events SET payload=$2::jsonb WHERE id=$1`,
      [importOutbox.id,JSON.stringify(importOutbox.payload)]);
    assert.equal((await createBalanceService(runtime).get(label)).status, 'RECONCILED');

    const changedCsv = csv.replace('100.00', '101.00');
    const changed = await service.previewCsv(admin, { csv: changedCsv });
    await assert.rejects(service.commitCsv(admin, { ...input, csv: changedCsv, expected_checksum: changed.checksum! }, 'conflict'),
      { code: 'ROYALTY_PERIOD_CONFLICT' });
    await owner.query('BEGIN');
    await owner.query(`INSERT INTO soundpub.royalty_import_corrections(batch_id,actor_id,reason)
      VALUES($1,$2,'missing adjustment proof')`, [batch.id,reviewer.id]);
    await assert.rejects(owner.query('COMMIT'), /ROYALTY_CORRECTION_FINANCE_MISMATCH/);
    await owner.query('ROLLBACK');

    const missingEarningBatch = randomUUID(), missingEarningEntry = randomUUID();
    await runtime.query('BEGIN');
    await runtime.query(`INSERT INTO soundpub.royalty_import_batches
      (id,source,period,currency,checksum,filename,uploader_id,row_count,total_amount,validation_result)
      VALUES($1,'missing-earning','2026-09','IDR',$2,'missing.csv',$3,1,'1.00',
        '{"policy_code":"BACKEND_SINGLE_OWNER_V1"}'::jsonb)`, [missingEarningBatch,'8'.repeat(64),admin.id]);
    await runtime.query(`INSERT INTO soundpub.royalty_import_entries
      (id,batch_id,source,period,source_row_id,beneficiary_id,release_id,track_id,gross_amount,deduction_amount,net_amount,
        artist_id,financial_owner_user_id,label_owner_user_id,calculation_policy_code)
      VALUES($1,$2,'missing-earning','2026-09','missing-row',$3,$4,$5,'1.00','0','1.00',$6,$3,$7,
        'BACKEND_SINGLE_OWNER_V1')`,
    [missingEarningEntry,missingEarningBatch,artist.id,releaseId,trackId,artistId,label.id]);
    await runtime.query(`INSERT INTO soundpub.royalty_import_allocations(entry_id,component,owner_id,amount,policy_code)
      VALUES($1,'LEGACY_OWNER',$2,'1.00','BACKEND_SINGLE_OWNER_V1')`, [missingEarningEntry,artist.id]);
    await runtime.query('COMMIT');
    const missingEarningClient = await runtime.connect();
    try {
      await missingEarningClient.query('BEGIN');
      await postEvent(missingEarningClient, { ownerId: artist.id, kind: 'MANUAL_ADJUSTMENT', amount: '1.00',
        businessReference: 'fixture:other-balance', idempotencyKey: `fixture:other-balance:${missingEarningBatch}`,
        actorId: admin.id });
      await postEvent(missingEarningClient, { ownerId: artist.id, kind: 'ROYALTY_ADJUSTMENT', amount: '-1.00',
        businessReference: `royalty:${missingEarningBatch}`, idempotencyKey: `fixture:correction:${missingEarningBatch}`,
        actorId: admin.id });
      await missingEarningClient.query(`INSERT INTO soundpub.royalty_import_corrections(batch_id,actor_id,reason)
        VALUES($1,$2,'earning missing')`, [missingEarningBatch,admin.id]);
      await assert.rejects(missingEarningClient.query('COMMIT'), /ROYALTY_CORRECTION_FINANCE_MISMATCH/);
      await missingEarningClient.query('ROLLBACK');
    } finally {
      missingEarningClient.release();
    }
    await service.correct(admin, batch.id, { reason: 'synthetic reversal' }, 'correct');
    assert.equal((await service.detail(admin, batch.id)).status, 'VOIDED_WITH_OFFSET');
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

