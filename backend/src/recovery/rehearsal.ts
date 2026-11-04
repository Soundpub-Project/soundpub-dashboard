import assert from 'node:assert/strict';
import pg from 'pg';
import { guardTarget, recover, type DisposableTarget } from './apply.js';
import { digest, planRecovery, snapshotRecoverySource, type RecoveryReport } from './index.js';

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(',')}}`;
  return JSON.stringify(value);
}

async function records(pool: pg.Pool) {
  return (await pool.query(`SELECT namespace,kind,source_id,canonical_id,payload
    FROM recovery_foundation.records ORDER BY kind COLLATE "C",source_id COLLATE "C"`)).rows;
}

function expectedRecords(report: RecoveryReport) {
  return report.accepted.map(record => ({ namespace: report.namespace, kind: record.kind,
    source_id: record.sourceId, canonical_id: record.canonicalId, payload: record.data }))
    .sort((left, right) => left.kind < right.kind ? -1 : left.kind > right.kind ? 1
      : left.source_id < right.source_id ? -1 : left.source_id > right.source_id ? 1 : 0);
}

async function userTables(pool: pg.Pool): Promise<string[]> {
  return (await pool.query(`SELECT table_schema||'.'||table_name AS name FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY name`)).rows.map(row => row.name);
}

export interface RecoveryTargetEvidence {
  database: string;
  records: number;
  recordHash: string;
  replayIdentical: true;
  tables: string[];
  royaltyMinorByCurrency: Record<string, string>;
}

/** Real PostgreSQL staging rehearsal. Caller provisions two owned, fresh disposable targets.
 * No Docker, env, source writes, domain activation, credentials or ledger restoration here.
 * Evidence omits source contact data, connection URLs and passwords.
 */
export async function rehearseRecovery(stagingDirectory: string,
  targets: readonly [DisposableTarget, DisposableTarget]) {
  const urls = targets.map(guardTarget);
  assert.equal(new Set(urls.map(url => url.pathname)).size, 2, 'Two distinct disposable databases required');
  const sourceHashes = await snapshotRecoverySource(stagingDirectory);
  const baseline = await planRecovery(stagingDirectory);
  assert.equal(baseline.rejected.length + baseline.orphan.length, 0, 'Rehearsal requires zero rejected and orphan rows');
  const pools = urls.map(url => new pg.Pool({ connectionString: url.toString(), max: 1,
    connectionTimeoutMillis: 3000, options: '-c statement_timeout=10000 -c lock_timeout=3000' }));
  const evidence: RecoveryTargetEvidence[] = [];
  try {
    // Check both targets before the first mutation. Existing namespaces are not reset or reused.
    for (const pool of pools) {
      const state = (await pool.query(`SELECT current_database() AS database,current_user AS username,
        to_regnamespace('recovery_foundation') IS NULL AS fresh`)).rows[0];
      const index = pools.indexOf(pool);
      assert.equal(state.database, targets[index]!.confirmDisposableDatabase, 'Connected target mismatch');
      assert.equal(state.username, 'soundpub_recovery', 'Connected user mismatch');
      assert.equal(state.fresh, true, 'Rehearsal target is not fresh');
      assert.deepEqual(await userTables(pool), [], 'Rehearsal target must contain no user tables');
    }
    for (let index = 0; index < targets.length; index++) {
      const target = targets[index]!;
      const pool = pools[index]!;
      const applied = await recover(stagingDirectory, { apply: true, target });
      assert.deepEqual({ ...applied, mode: 'dry-run' }, baseline, 'Source report changed during apply');
      const restored = await records(pool);
      assert.deepEqual(restored, expectedRecords(baseline), 'Restored canonical records differ from source plan');
      assert.deepEqual(await userTables(pool), ['recovery_foundation.records'], 'Unexpected tables or credentials restored');
      // Strict parser accepted only allowlisted fields; exact payload equality above proves
      // no session, refresh token, password or external identity was added by the writer.
      const totals = Object.fromEntries((await pool.query(`SELECT payload->>'currency' AS currency,
        sum((payload->>'amountMinor')::numeric)::text AS amount FROM recovery_foundation.records
        WHERE kind='royalties' GROUP BY payload->>'currency' ORDER BY currency`)).rows
        .map(row => [row.currency, row.amount]));
      assert.deepEqual(totals, baseline.reconciliation.royaltyMinorByCurrency, 'Staged royalty reconciliation mismatch');
      assert.deepEqual(await recover(stagingDirectory, { apply: true, target }), applied, 'Replay report differs');
      assert.deepEqual(await records(pool), restored, 'Replay changed staged records');
      evidence.push({ database: target.confirmDisposableDatabase, records: restored.length,
        recordHash: digest(stable(restored)), replayIdentical: true,
        tables: await userTables(pool), royaltyMinorByCurrency: totals });
    }
    assert.equal(evidence[0]!.recordHash, evidence[1]!.recordHash, 'Independent target results differ');
    assert.deepEqual(await snapshotRecoverySource(stagingDirectory), sourceHashes, 'Source bytes changed during rehearsal');
    return { scope: 'synthetic-staging-only' as const, sourceUnchanged: true as const,
      resultsIdentical: true as const, sourceHashes, reportHash: digest(stable(baseline)),
      reconciliation: baseline.reconciliation, targets: evidence };
  } finally {
    const closed = await Promise.allSettled(pools.map(pool => pool.end()));
    assert.ok(closed.every(result => result.status === 'fulfilled'), 'Rehearsal connection cleanup failed');
  }
}
