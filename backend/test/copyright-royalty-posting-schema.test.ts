import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../migrations/0046_copyright_royalty_posting.sql', import.meta.url), 'utf8');

test('copyright royalty posting schema is append-only and transaction-scoped', () => {
  for (const table of ['batches', 'entries', 'corrections', 'reconciliations']) {
    assert.match(migration, new RegExp(`CREATE TABLE soundpub\\.copyright_royalty_${table}`));
    assert.match(migration, new RegExp(`copyright_royalty_${table}_immutable[\\s\\S]*BEFORE UPDATE OR DELETE OR TRUNCATE`));
    assert.match(migration, new RegExp(`ALTER TABLE soundpub\\.copyright_royalty_${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(migration, /write_xid xid8 NOT NULL DEFAULT pg_current_xact_id\(\)/);
  assert.match(migration, /batch\.write_xid IS DISTINCT FROM pg_current_xact_id\(\)/);
  assert.match(migration, /batch_id uuid NOT NULL UNIQUE REFERENCES soundpub\.copyright_royalty_batches/);
});

test('copyright royalty posting constrains legacy aggregate shape', () => {
  assert.match(migration, /currency text NOT NULL DEFAULT 'IDR' CHECK \(currency='IDR'\)/);
  assert.match(migration, /checksum text NOT NULL CHECK \(checksum ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(migration, /policy_code text NOT NULL DEFAULT 'LEGACY_AGGREGATE_100_PERCENT_TO_RESOLVED_BENEFICIARY_V1'/);
  assert.match(migration, /policy_checksum text NOT NULL CHECK/);
  assert.match(migration, /UNIQUE\(source,source_batch,period\)/);
  assert.match(migration, /UNIQUE\(batch_id,row_number\)/);
  assert.match(migration, /mapping_id uuid NOT NULL REFERENCES soundpub\.copyright_beneficiary_mappings/);
  assert.match(migration, /beneficiary_id uuid NOT NULL REFERENCES soundpub\.backend_users/);
  assert.match(migration, /canonical_name text NOT NULL CHECK/);
  assert.match(migration, /result text NOT NULL CHECK \(result IN \('MATCHED','MISMATCH'\)\)/);
  assert.match(migration, /audit_log_id uuid NOT NULL UNIQUE REFERENCES soundpub\.audit_logs/);
  assert.match(migration, /outbox_id uuid NOT NULL UNIQUE REFERENCES soundpub\.outbox_events/);
});

test('copyright royalty totals and finance references are deferred and exact', () => {
  assert.match(migration, /CREATE CONSTRAINT TRIGGER copyright_royalty_batch_integrity[\s\S]*DEFERRABLE INITIALLY DEFERRED/);
  assert.match(migration, /entry_count IS DISTINCT FROM NEW\.row_count/);
  assert.match(migration, /entry_total IS DISTINCT FROM NEW\.total_amount/);
  assert.match(migration, /business_reference='copyright-royalty:'\|\|NEW\.id::text AND kind='ROYALTY_EARNING'/);
  assert.match(migration, /CREATE CONSTRAINT TRIGGER copyright_royalty_correction_integrity[\s\S]*DEFERRABLE INITIALLY DEFERRED/);
  assert.match(migration, /CREATE CONSTRAINT TRIGGER copyright_royalty_finance_event_integrity[\s\S]*AFTER INSERT ON soundpub\.finance_events[\s\S]*DEFERRABLE INITIALLY DEFERRED/);
  assert.match(migration, /WHEN \(NEW\.business_reference LIKE 'copyright-royalty:%'\)/);
  assert.match(migration, /kind NOT IN \('ROYALTY_EARNING','ROYALTY_ADJUSTMENT'\)/);
});

test('runtime gets only select and insert grants', () => {
  assert.match(migration, /REVOKE ALL ON soundpub\.copyright_royalty_batches[\s\S]*FROM PUBLIC,soundpub_app/);
  assert.match(migration, /GRANT SELECT,INSERT ON soundpub\.copyright_royalty_batches,soundpub\.copyright_royalty_entries,[\s\S]*TO soundpub_app/);
  assert.doesNotMatch(migration, /GRANT (?:UPDATE|DELETE|TRUNCATE)[\s\S]*TO soundpub_app/);
});
