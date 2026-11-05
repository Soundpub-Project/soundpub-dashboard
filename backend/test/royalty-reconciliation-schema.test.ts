import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/0041_royalty_reconciliation.sql', import.meta.url), 'utf8');

test('royalty reconciliation evidence is append-only and matched once per batch', () => {
  assert.match(migration, /CREATE TABLE soundpub\.royalty_import_reconciliations/);
  assert.match(migration, /result IN \('MATCHED','MISMATCH'\)/);
  assert.match(migration, /royalty_import_reconciliations_matched_batch/);
  assert.match(migration, /finance_events_royalty_reference/);
  assert.match(migration, /entry_mismatches/);
  assert.match(migration, /ROYALTY_BATCH_CLOSED/);
  assert.match(migration, /royalty_correction_finance_integrity/);
  assert.match(migration, /ROYALTY_CORRECTION_FINANCE_MISMATCH/);
  assert.match(migration, /royalty_batch_finance_intact/);
  assert.match(migration, /royalty_reconciliation_intact/);
  assert.match(migration, /royalty_reconciliation_evidence_guard/);
  assert.match(migration, /ROYALTY_RECONCILIATION_EVIDENCE_MISMATCH/);
  assert.match(migration, /GRANT SELECT ON soundpub\.royalty_import_reconciliations TO soundpub_app/);
  assert.match(migration, /GRANT INSERT ON soundpub\.audit_logs,soundpub\.outbox_events,soundpub\.royalty_import_reconciliations TO soundpub_reconciler/);
  assert.match(migration, /kind IN \('ROYALTY_EARNING','ROYALTY_ADJUSTMENT'\)/);
  assert.match(migration, /audit_log_id uuid UNIQUE REFERENCES soundpub\.audit_logs/);
  assert.match(migration, /outbox_id uuid UNIQUE REFERENCES soundpub\.outbox_events/);
  assert.match(migration, /WHERE result='MATCHED'/);
  assert.match(migration, /royalty_reconciliations_immutable/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /(?:^|\n)(?:BEGIN|COMMIT|ROLLBACK);/i);
});
