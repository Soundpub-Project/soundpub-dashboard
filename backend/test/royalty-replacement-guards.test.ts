import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { PoolClient } from 'pg';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

const migration = readFileSync(new URL('../migrations/0034_royalty_replacement_guards.sql', import.meta.url), 'utf8');

test('royalty replacement guard is deferred and not publicly executable', () => {
  assert.match(migration, /CREATE CONSTRAINT TRIGGER royalty_replacement_relation_guard/);
  assert.match(migration, /DEFERRABLE INITIALLY DEFERRED FOR EACH ROW/);
  assert.match(migration, /ROYALTY_REPLACEMENT_CORRECTION_REQUIRED/);
  assert.match(migration, /ROYALTY_REPLACEMENT_SOURCE_MISMATCH/);
  assert.match(migration, /ROYALTY_REPLACEMENT_PERIOD_MISMATCH/);
  assert.match(migration, /ROYALTY_REPLACEMENT_CURRENCY_MISMATCH/);
  assert.match(migration, /ROYALTY_REPLACEMENT_POLICY_MISMATCH/);
  assert.match(migration, /ROYALTY_REPLACEMENT_PROVENANCE_MISMATCH/);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION soundpub\.royalty_replacement_guard\(\) FROM PUBLIC/);
  assert.match(migration, /REVOKE ALL ON FUNCTION soundpub\.royalty_replacement_guard\(\) FROM soundpub_app/);
});

test('royalty replacement relation commits only with correction, matching dimensions, policy and provenance', {
  skip: !dockerTestsEnabled, timeout: 120_000,
}, async () => {
  const fixture = await concurrencyPostgres();
  const { owner, runtime } = fixture;
  const actorId = randomUUID();
  let sequence = 0;

  type Relation = {
    correction?: boolean;
    oldSource?: string;
    newSource?: string;
    oldPeriod?: string;
    newPeriod?: string;
    oldCurrency?: string;
    newCurrency?: string;
    oldPolicy?: string;
    newPolicy?: string;
    provenance?: string;
  };

  async function insertRelation(client: PoolClient, relation: Relation = {}) {
    const oldBatchId = randomUUID();
    const newBatchId = randomUUID();
    const oldSource = relation.oldSource ?? 'replacement-guard';
    const newSource = relation.newSource ?? oldSource;
    const oldPeriod = relation.oldPeriod ?? '2026-10';
    const newPeriod = relation.newPeriod ?? oldPeriod;
    const oldCurrency = relation.oldCurrency ?? 'IDR';
    const newCurrency = relation.newCurrency ?? oldCurrency;
    const oldPolicy = relation.oldPolicy ?? 'SOUNDPUB_LEGACY_70_21_9';
    const newPolicy = relation.newPolicy ?? oldPolicy;
    const index = sequence++;
    const checksum = (offset: number) => (index * 2 + offset).toString(16).padStart(64, '0');

    await client.query(`INSERT INTO soundpub.royalty_import_batches
      (id,source,period,currency,checksum,filename,uploader_id,row_count,total_amount,validation_result)
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,1,'100.00',$8::jsonb),
      ($9,$10,$11,$12,$13,$14,$7,1,'120.00',$15::jsonb)`, [
      oldBatchId, oldSource, oldPeriod, oldCurrency, checksum(0), `old-${index}.csv`, actorId,
      JSON.stringify({ policy_code: oldPolicy }),
      newBatchId, newSource, newPeriod, newCurrency, checksum(1), `new-${index}.csv`,
      JSON.stringify({ policy_code: newPolicy, replaces_batch_id: relation.provenance ?? oldBatchId }),
    ]);
    if (relation.correction !== false) {
      await client.query(`INSERT INTO soundpub.royalty_import_corrections(batch_id,actor_id,reason)
        VALUES($1,$2,'provider correction')`, [oldBatchId, actorId]);
    }
    await client.query(`INSERT INTO soundpub.royalty_import_replacements(old_batch_id,new_batch_id,actor_id,reason)
      VALUES($1,$2,$3,'provider replacement')`, [oldBatchId, newBatchId, actorId]);
    return { oldBatchId, newBatchId };
  }

  async function expectCommitRejected(name: string, relation: Relation, error: RegExp) {
    const client = await runtime.connect();
    let ids: { oldBatchId: string; newBatchId: string } | undefined;
    try {
      await client.query('BEGIN');
      ids = await insertRelation(client, relation);
      assert.equal((await client.query(`SELECT count(*)::int AS count FROM soundpub.royalty_import_replacements
        WHERE old_batch_id=$1`, [ids.oldBatchId])).rows[0].count, 1, `${name} relation must exist before COMMIT`);
      await assert.rejects(client.query('COMMIT'), error);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    assert.ok(ids);
    const persisted = (await owner.query(`SELECT
      (SELECT count(*)::int FROM soundpub.royalty_import_batches WHERE id=ANY($1::uuid[])) AS batches,
      (SELECT count(*)::int FROM soundpub.royalty_import_corrections WHERE batch_id=$2) AS corrections,
      (SELECT count(*)::int FROM soundpub.royalty_import_replacements WHERE old_batch_id=$2) AS replacements`,
    [[ids.oldBatchId, ids.newBatchId], ids.oldBatchId])).rows[0];
    assert.deepEqual(persisted, { batches: 0, corrections: 0, replacements: 0 },
      `${name} transaction must roll back`);
  }

  try {
    await owner.query(`INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active')`, [actorId]);
    await owner.query('CREATE ROLE royalty_replacement_guard_probe NOLOGIN');

    const validClient = await runtime.connect();
    let valid: { oldBatchId: string; newBatchId: string };
    try {
      await validClient.query('BEGIN');
      valid = await insertRelation(validClient);
      await validClient.query('COMMIT');
    } finally {
      validClient.release();
    }
    assert.deepEqual((await owner.query(`SELECT old_batch_id,new_batch_id
      FROM soundpub.royalty_import_replacements WHERE old_batch_id=$1`, [valid.oldBatchId])).rows,
    [{ old_batch_id: valid.oldBatchId, new_batch_id: valid.newBatchId }]);
    const privileges = (await owner.query(`SELECT
      has_function_privilege('royalty_replacement_guard_probe','soundpub.royalty_replacement_guard()','EXECUTE') AS public_execute,
      has_function_privilege('soundpub_app','soundpub.royalty_replacement_guard()','EXECUTE') AS app_execute`)).rows[0];
    assert.deepEqual(privileges, { public_execute: false, app_execute: false });
    await assert.rejects(owner.query(`UPDATE soundpub.royalty_import_replacements SET reason=reason
      WHERE old_batch_id=$1`, [valid.oldBatchId]), /FINANCE_IMMUTABLE/);
    await assert.rejects(owner.query(`DELETE FROM soundpub.royalty_import_replacements
      WHERE old_batch_id=$1`, [valid.oldBatchId]), /FINANCE_IMMUTABLE/);

    await expectCommitRejected('missing correction', { correction: false }, /ROYALTY_REPLACEMENT_CORRECTION_REQUIRED/);
    await expectCommitRejected('source mismatch', { newSource: 'other-source' }, /ROYALTY_REPLACEMENT_SOURCE_MISMATCH/);
    await expectCommitRejected('period mismatch', { newPeriod: '2026-11' }, /ROYALTY_REPLACEMENT_PERIOD_MISMATCH/);
    await expectCommitRejected('policy mismatch', { newPolicy: 'OTHER_POLICY' }, /ROYALTY_REPLACEMENT_POLICY_MISMATCH/);
    await expectCommitRejected('provenance mismatch', { provenance: randomUUID() },
      /ROYALTY_REPLACEMENT_PROVENANCE_MISMATCH/);

    // Base schema only permits IDR; remove that disposable-fixture check to exercise this guard directly.
    await owner.query(`ALTER TABLE soundpub.royalty_import_batches
      DROP CONSTRAINT royalty_import_batches_currency_check`);
    await expectCommitRejected('currency mismatch', { newCurrency: 'USD' }, /ROYALTY_REPLACEMENT_CURRENCY_MISMATCH/);
  } finally {
    await fixture.close();
  }
});
