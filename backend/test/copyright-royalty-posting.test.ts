import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Principal } from '../src/auth/index.js';
import { createComposerRoyaltiesService } from '../src/composer-royalties/index.js';
import { createBalanceService } from '../src/finance/service.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

test('copyright royalty posting is atomic, idempotent, isolated, reconcilable and fully reversible', {
  skip: process.env.RUN_DOCKER_TESTS !== '1', timeout: 120_000,
}, async () => {
  const database = await concurrencyPostgres();
  const { owner, runtime } = database;
  const uploader: Principal = { id: randomUUID(), roles: ['admin'], status: 'active' };
  const reviewer: Principal = { id: randomUUID(), roles: ['admin'], status: 'active' };
  const beneficiary: Principal = { id: randomUUID(), roles: ['copyright'], status: 'active' };
  const outsider: Principal = { id: randomUUID(), roles: ['copyright'], status: 'active' };
  try {
    await owner.query(`INSERT INTO soundpub.backend_users(id,status) VALUES
      ($1,'active'),($2,'active'),($3,'active'),($4,'active')`,
    [uploader.id, reviewer.id, beneficiary.id, outsider.id]);
    await owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES
      ($1,'admin',now()),($2,'admin',now()),($3,'copyright',now()),($4,'copyright',now())`,
    [uploader.id, reviewer.id, beneficiary.id, outsider.id]);
    await owner.query(`INSERT INTO soundpub.copyright_beneficiary_mappings
      (composer_code,owner_id,canonical_name,valid_from,created_by)
      VALUES('CMP-001',$1,'Composer One','2026-01',$2)`, [beneficiary.id, uploader.id]);

    const service = createComposerRoyaltiesService(runtime);
    const statement = { source: 'synthetic-dsp', source_batch: 'batch-001', period: '2026-10', currency: 'IDR' as const,
      rows: [{ composer_code: 'CMP-001', composer_name: 'Composer Source Name', total_net_royalti: '100.00' }] };
    const preview = await service.preview(uploader, statement) as any;
    assert.equal(preview.posting_allowed, true);
    await assert.rejects(service.postImport(uploader, { expected_checksum: '0'.repeat(64), statement }, 'stale'),
      { code: 'COPYRIGHT_ROYALTY_PREVIEW_STALE' });

    const posted = await service.postImport(uploader, { expected_checksum: preview.checksum, statement }, 'post') as any;
    assert.equal(posted.replayed, false);
    assert.equal(posted.batch.entries[0].beneficiary_id, beneficiary.id);
    assert.equal(posted.batch.entries[0].canonical_name, 'Composer One');
    const replay = await service.postImport(uploader, { expected_checksum: preview.checksum, statement }, 'replay') as any;
    assert.equal(replay.replayed, true);
    assert.equal(replay.batch.id, posted.batch.id);
    assert.deepEqual((await owner.query(`SELECT owner_id,kind,amount_minor::text FROM soundpub.finance_events
      WHERE business_reference=$1`, [`copyright-royalty:${posted.batch.id}`])).rows, [
      { owner_id: beneficiary.id, kind: 'ROYALTY_EARNING', amount_minor: '10000' },
    ]);

    const changed = { ...statement, rows: [{ ...statement.rows[0], total_net_royalti: '101.00' }] };
    const changedPreview = await service.preview(uploader, changed) as any;
    await assert.rejects(service.postImport(uploader, { expected_checksum: changedPreview.checksum, statement: changed }, 'conflict'),
      { code: 'COPYRIGHT_ROYALTY_SOURCE_CONFLICT' });
    assert.equal(((await service.listRoyalties(beneficiary, {})) as any).items.length, 1);
    assert.equal(((await service.listRoyalties(outsider, {})) as any).items.length, 0);
    await assert.rejects(service.getImport(beneficiary, posted.batch.id), { code: 'FORBIDDEN' });

    const before = await createBalanceService(runtime).get(beneficiary);
    assert.equal(before.status, 'RECONCILIATION_REQUIRED');
    assert.equal(before.available, null);
    await assert.rejects(service.reconcile(uploader, posted.batch.id, { evidence: 'self review' }, 'self'),
      { code: 'INDEPENDENT_RECONCILER_REQUIRED' });
    const reconciled = await service.reconcile(reviewer, posted.batch.id, { evidence: 'statement and ledger verified' }, 'reconcile') as any;
    assert.equal(reconciled.result, 'MATCHED');
    assert.deepEqual(reconciled.issues, []);
    assert.equal(reconciled.replayed, false);
    const reconciliationReplay = await service.reconcile(reviewer, posted.batch.id, { evidence: 'retry' }, 'retry') as any;
    assert.equal(reconciliationReplay.replayed, true);
    const after = await createBalanceService(runtime).get(beneficiary);
    assert.equal(after.status, 'RECONCILED');
    assert.equal(after.available, '100.00');

    const correction = await service.correct(reviewer, posted.batch.id, { reason: 'full statement reversal' }, 'correct') as any;
    assert.equal(correction.batch_id, posted.batch.id);
    assert.deepEqual((await owner.query(`SELECT kind,amount_minor::text FROM soundpub.finance_events
      WHERE business_reference=$1 ORDER BY kind`, [`copyright-royalty:${posted.batch.id}`])).rows, [
      { kind: 'ROYALTY_ADJUSTMENT', amount_minor: '-10000' },
      { kind: 'ROYALTY_EARNING', amount_minor: '10000' },
    ]);
    await assert.rejects(service.correct(reviewer, posted.batch.id, { reason: 'duplicate' }, 'correct-again'),
      { code: 'COPYRIGHT_ROYALTY_ALREADY_CORRECTED' });
    assert.equal(((await service.getImport(uploader, posted.batch.id)) as any).status, 'CORRECTED');
    const correctedBalance = await createBalanceService(runtime).get(beneficiary);
    assert.equal(correctedBalance.status, 'RECONCILED');
    assert.equal(correctedBalance.available, '0.00');

    const missing = { ...statement, source_batch: 'batch-unmapped',
      rows: [{ composer_code: 'CMP-MISSING', composer_name: 'Missing', total_net_royalti: '1.00' }] };
    const missingPreview = await service.preview(uploader, missing) as any;
    assert.equal(missingPreview.posting_allowed, false);
    await assert.rejects(service.postImport(uploader, { expected_checksum: missingPreview.checksum, statement: missing }, 'missing'),
      { code: 'COPYRIGHT_ROYALTY_MAPPING_REQUIRED' });
  } finally {
    await database.close();
  }
});
