import assert from 'node:assert/strict';
import test from 'node:test';
import { concurrencyPostgres } from './support/concurrency-postgres.js';
import { createFinanceReconciliationService, runFinanceReconciliation } from '../src/reconciliation/index.js';
import type { Principal } from '../src/auth/index.js';

test('scheduled finance reconciliation records deterministic read-only evidence', { skip: process.env.RUN_DOCKER_TESTS !== '1', timeout: 120000 }, async () => {
  const fixture = await concurrencyPostgres();
  try {
    const { owner, runtime, reconciler, auditor } = fixture;
    const businessBefore = (await owner.query(`SELECT jsonb_build_object(
      'royalties',(SELECT count(*) FROM soundpub.royalty_import_batches),
      'events',(SELECT count(*) FROM soundpub.finance_events),
      'payouts',(SELECT count(*) FROM soundpub.payout_requests),
      'payments',(SELECT count(*) FROM soundpub.payment_invoices)) AS value`)).rows[0].value;
    assert.equal((await owner.query(`SELECT pg_has_role('soundpub_auditor','soundpub_app','member') AS member`)).rows[0].member, false);
    assert.equal((await owner.query(`SELECT pg_has_role('soundpub_reconciler','soundpub_app','member') AS member`)).rows[0].member, false);
    await assert.rejects(reconciler.query(`INSERT INTO soundpub.finance_reconciliation_runs
      (status,issue_count,issues,snapshot,snapshot_checksum,runner,started_at)
      VALUES('PASS',0,'[]','{}',repeat('0',64),'forged',now())`), /permission denied/);
    await assert.rejects(auditor.query(`INSERT INTO soundpub.payment_callback_receipts
      (event_id,provider_invoice_id,disposition,payload) VALUES('forged','forged','unknown_invoice','{}')`), /permission denied/);
    await assert.rejects(runtime.query(`INSERT INTO soundpub.finance_reconciliation_runs
      (status,issue_count,issues,snapshot,snapshot_checksum,runner,started_at)
      VALUES('PASS',0,'[]','{}',repeat('0',64),'forged',now())`), /permission denied/);
    const first = await runFinanceReconciliation(auditor, { runner: 'test', now: new Date('2026-11-05T00:00:00Z') });
    assert.equal(first.outcome, 'recorded');
    if (first.outcome !== 'recorded') return;
    assert.equal(first.run.status, 'PASS');
    assert.equal(first.run.issue_count, 0);

    const idle = await runFinanceReconciliation(auditor, { runner: 'test', minimumIntervalMs: 60_000,
      now: new Date('2026-11-05T00:00:30Z') });
    assert.equal(idle.outcome, 'idle');

    const lock = await owner.connect();
    await lock.query('BEGIN');
    await lock.query('SELECT pg_advisory_xact_lock(1936684400,42)');
    try {
      assert.equal((await runFinanceReconciliation(auditor, { runner: 'test' })).outcome, 'locked');
    } finally { await lock.query('ROLLBACK'); lock.release(); }

    await runtime.query(`INSERT INTO soundpub.payment_callback_receipts(event_id,provider_invoice_id,disposition,payload)
      VALUES('synthetic-unresolved-a','missing-provider-a','unknown_invoice','{}'),
        ('synthetic-unresolved-b','missing-provider-b','unsupported','{}')`);
    const failed = await runFinanceReconciliation(auditor, { runner: 'test', issueLimit: 1, now: new Date('2026-11-05T00:02:00Z') });
    assert.equal(failed.outcome, 'recorded');
    if (failed.outcome !== 'recorded') return;
    assert.equal(failed.run.status, 'FAIL');
    assert.equal(failed.run.issue_count, 2);
    assert.equal(failed.run.issues.length, 1);
    assert.equal(failed.run.issues[0]?.code, 'PAYMENT_CALLBACK_UNRESOLVED');

    const repeated = await runFinanceReconciliation(auditor, { runner: 'test', issueLimit: 1, now: new Date('2026-11-05T00:03:00Z') });
    assert.equal(repeated.outcome, 'recorded');
    if (repeated.outcome !== 'recorded') return;
    assert.equal(repeated.run.snapshot_checksum, failed.run.snapshot_checksum);
    await owner.query(`UPDATE soundpub.payment_callback_receipts SET provider_invoice_id='changed-hidden-provider'
      WHERE event_id='synthetic-unresolved-b'`);
    const hiddenChanged = await runFinanceReconciliation(auditor, { runner: 'test', issueLimit: 1,
      now: new Date('2026-11-05T00:04:00Z') });
    assert.equal(hiddenChanged.outcome, 'recorded');
    if (hiddenChanged.outcome !== 'recorded') return;
    assert.notEqual(hiddenChanged.run.snapshot_checksum, repeated.run.snapshot_checksum);
    assert.deepEqual(hiddenChanged.run.issues, repeated.run.issues);
    await assert.rejects(runtime.query(`UPDATE soundpub.finance_reconciliation_runs SET runner='tampered' WHERE id=$1`, [failed.run.id]), /FINANCE_IMMUTABLE|permission denied/);

    const businessAfter = (await owner.query(`SELECT jsonb_build_object(
      'royalties',(SELECT count(*) FROM soundpub.royalty_import_batches),
      'events',(SELECT count(*) FROM soundpub.finance_events),
      'payouts',(SELECT count(*) FROM soundpub.payout_requests),
      'payments',(SELECT count(*) FROM soundpub.payment_invoices)) AS value`)).rows[0].value;
    assert.deepEqual(businessAfter, businessBefore);
    assert.equal((await owner.query('SELECT count(*) FROM soundpub.finance_reconciliation_runs')).rows[0].count, '4');
    const alerts = await owner.query(`SELECT payload FROM soundpub.outbox_events WHERE topic='finance.reconciliation' ORDER BY created_at,id`);
    assert.equal(alerts.rowCount, 3);
    // created_at can tie across fast transactions; UUID is not a business ordering signal.
    assert.deepEqual(alerts.rows.map(row => row.payload.status).sort(), ['FAIL','FAIL','PASS']);

    const admin: Principal = { id: '00000000-0000-4000-8000-000000000001', roles: ['superadmin'], status: 'active' };
    const ordinary: Principal = { id: '00000000-0000-4000-8000-000000000002', roles: ['user'], status: 'active' };
    await owner.query(`INSERT INTO soundpub.backend_users(id,email,status,email_verified_at) VALUES
      ($1,'reconciliation-admin@example.test','active',now()),($2,'reconciliation-user@example.test','active',now())`, [admin.id, ordinary.id]);
    await owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'superadmin',now()),($2,'user',now())`, [admin.id, ordinary.id]);
    const service = createFinanceReconciliationService(runtime);
    assert.equal((await service.latest(admin))?.id, hiddenChanged.run.id);
    assert.equal((await service.history(admin, { limit: '2', offset: '0' })).length, 2);
    await assert.rejects(service.latest(ordinary), error => error instanceof Error && error.message === 'FORBIDDEN');
  } finally { await fixture.close(); }
});

test('auditor can execute royalty invoker integrity functions without inherited app privileges', {
  skip: process.env.RUN_DOCKER_TESTS !== '1', timeout: 120000,
}, async () => {
  const fixture = await concurrencyPostgres();
  try {
    const target = '00000000-0000-4000-8000-000000000101';
    assert.deepEqual((await fixture.auditor.query(`SELECT soundpub.royalty_batch_finance_intact($1) AS finance,
      soundpub.royalty_reconciliation_intact($1) AS reconciliation,
      soundpub.royalty_correction_intact($1) AS correction`, [target])).rows, [{
      finance: false, reconciliation: false, correction: false,
    }]);
  } finally { await fixture.close(); }
});
