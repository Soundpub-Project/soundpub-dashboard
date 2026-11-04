import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { concurrencyPostgres } from '../backend/test/support/concurrency-postgres.js';
import { postEvent, reconcileAccount } from '../backend/src/finance/index.js';
import { withTransaction } from '../backend/src/db/pool.js';

async function main() {
  const fixture = await concurrencyPostgres();
  try {
    const ownerId = randomUUID();
    await fixture.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [ownerId]);
    await fixture.owner.query('INSERT INTO soundpub.profiles(id) VALUES ($1)', [ownerId]);
    const source = { businessReference: 'synthetic-approved-source:1', kind: 'ROYALTY_EARNING' as const, amount: '1000.00' };
    await withTransaction(fixture.runtime, db => postEvent(db, {
      ...source, ownerId, idempotencyKey: 'synthetic-approved-source:1', systemActor: 'closeout-self-check',
    }));
    const snapshot = async () => (await fixture.owner.query(`SELECT
      (SELECT jsonb_agg(to_jsonb(event) ORDER BY id) FROM soundpub.finance_events event) AS events,
      (SELECT jsonb_agg(to_jsonb(audit) ORDER BY event_id) FROM soundpub.finance_audit audit) AS audit,
      (SELECT jsonb_agg(to_jsonb(outbox) ORDER BY id) FROM soundpub.outbox_events outbox) AS outbox`)).rows[0];
    const before = await snapshot();
    const matched = await withTransaction(fixture.runtime, db => reconcileAccount(db, ownerId, [source]));
    assert.equal(matched.mode, 'DRY_RUN');
    assert.equal(matched.reconciled, true);
    const mismatched = await withTransaction(fixture.runtime, db => reconcileAccount(db, ownerId, [{ ...source, amount: '999.00' }]));
    assert.equal(mismatched.reconciled, false);
    assert.deepEqual(mismatched.issues.map(issue => issue.code), ['AMOUNT_OR_EVIDENCE_MISMATCH']);
    const unresolved = await withTransaction(fixture.runtime, db => reconcileAccount(db, ownerId, [source,
      { businessReference: 'synthetic-source-without-local-record:2', kind: 'ROYALTY_EARNING', amount: '1.00' },
    ]));
    assert.equal(unresolved.reconciled, false);
    assert.deepEqual(unresolved.issues.map(issue => issue.code), ['MISSING_LEDGER_EVENT']);
    const unexpected = await withTransaction(fixture.runtime, db => reconcileAccount(db, ownerId, []));
    assert.equal(unexpected.reconciled, false);
    assert.deepEqual(unexpected.issues.map(issue => issue.code), ['UNEXPECTED_LEDGER_EVENT']);
    await assert.rejects(withTransaction(fixture.runtime, db => reconcileAccount(db, ownerId, [source, source])),
      { code: 'DUPLICATE_RECONCILIATION_EXPECTATION' });
    assert.deepEqual(await snapshot(), before);
    process.stdout.write(`${JSON.stringify({ mode: 'DRY_RUN', scope: 'synthetic-local-only',
      summary: { matched: 1, mismatched: 1, unresolved: 1, ambiguous: 1, historical_exception: 0 },
      counted_unit: 'independent comparison scenarios, not historical records',
      duplicate_expectation_rejected: true, ledger_audit_outbox_unchanged: true,
      historical_population: 'NOT_RUN', settlement_proof: 'NOT_TESTED',
    }, null, 2)}\n`);
  } finally {
    await fixture.close();
  }
}

main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
