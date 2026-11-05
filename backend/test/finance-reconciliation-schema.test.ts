import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/0042_finance_reconciliation_runs.sql', import.meta.url), 'utf8');

test('finance reconciliation evidence is append-only and runtime can only append/read runs', () => {
  assert.match(migration, /CREATE TABLE soundpub\.finance_reconciliation_runs/);
  assert.match(migration, /status IN \('PASS','FAIL'\)/);
  assert.match(migration, /snapshot_checksum text NOT NULL/);
  assert.match(migration, /GRANT SELECT ON soundpub\.finance_reconciliation_runs TO soundpub_app/);
  assert.match(migration, /GRANT SELECT,INSERT ON soundpub\.finance_reconciliation_runs TO soundpub_auditor/);
  assert.match(migration, /soundpub\.backend_users,soundpub\.user_roles/);
  assert.match(migration, /royalty_correction_intact/);
  assert.match(migration, /royalty_reconciliation_intact\(uuid\) TO soundpub_auditor/);
  assert.match(migration, /royalty_batches_reconciler/);
  assert.match(migration, /finance_events_reconciler/);
  assert.match(migration, /royalty_batches_auditor/);
  assert.match(migration, /royalty_reconciliations_auditor/);
  assert.match(migration, /payout_requests_auditor/);
  assert.match(migration, /finance_reconciliation_runs_immutable/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /GRANT (?:UPDATE|DELETE|TRUNCATE)/);
  assert.doesNotMatch(migration, /(?:^|\n)(?:BEGIN|COMMIT|ROLLBACK);/i);
});
