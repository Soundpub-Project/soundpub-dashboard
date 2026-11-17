import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../migrations/0065_finance_adjustment_approval.sql', import.meta.url), 'utf8');
const readiness = readFileSync(new URL('../src/finance/readiness.ts', import.meta.url), 'utf8');
const reconciliation = readFileSync(new URL('../src/reconciliation/index.ts', import.meta.url), 'utf8');

test('manual finance adjustments require distinct-person approval and immutable ledger evidence', () => {
  assert.match(migration, /CREATE TABLE soundpub\.finance_adjustment_requests/);
  assert.match(migration, /reviewed_by IS DISTINCT FROM requested_by/);
  assert.match(migration, /FINANCE_ADJUSTMENT_TRANSITION_INVALID/);
  assert.match(migration, /FINANCE_ADJUSTMENT_EVIDENCE_MISMATCH/);
  assert.match(migration, /finance_adjustments_intact/);
  assert.match(migration, /finance_adjustment_requests_auditor/);
  assert.match(migration, /finance_manual_adjustment_event_guard/);
  assert.match(readiness, /'MANUAL_ADJUSTMENT','manual-adjustment:'/);
  assert.match(readiness, /finance_adjustments_intact\(\$1\)/);
  assert.match(reconciliation, /MANUAL_ADJUSTMENT_UNAPPROVED/);
  assert.match(reconciliation, /NOT soundpub\.finance_adjustments_intact\(e\.owner_id\)/);
  assert.doesNotMatch(migration, /(?:^|\n)(?:BEGIN|COMMIT|ROLLBACK);/i);
});
