import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../migrations/0052_copyright_registrations.sql', import.meta.url), 'utf8');

test('copyright registration schema owns aggregate and uses media-only file bindings', () => {
  for (const table of ['copyright_registrations','copyright_registration_works','copyright_registration_files',
    'copyright_registration_payments','copyright_contracts','copyright_registration_status_history']) {
    assert.match(sql, new RegExp(`CREATE TABLE soundpub\\.${table} \\(`));
  }
  assert.match(sql, /media_object_id uuid NOT NULL UNIQUE REFERENCES soundpub\.media_objects/);
  assert.doesNotMatch(sql, /file_url|preview_html_url|generated_pdf_url|stamped_pdf_url/);
  assert.match(sql, /owner_id uuid NOT NULL REFERENCES soundpub\.backend_users/);
  assert.match(sql, /UNIQUE\(registration_id,position\)/);
});

test('registration, payment, and contract state machines reject arbitrary jumps', () => {
  assert.match(sql, /OLD\.status='DRAFT' AND NEW\.status='AWAITING_PAYMENT'/);
  assert.match(sql, /OLD\.status='IN_REVIEW' AND NEW\.status IN \('REVISION_REQUESTED','APPROVED','REJECTED'\)/);
  assert.match(sql, /OLD\.status='CONTRACT_SIGNED' AND NEW\.status='ACTIVE'/);
  assert.match(sql, /OLD\.status='INTENT' AND NEW\.status IN \('PROVIDER_PENDING','CANCELLED'\)/);
  assert.match(sql, /OLD\.status='PAID' AND NEW\.status IN \('REFUNDED','RECONCILIATION_REQUIRED'\)/);
  assert.match(sql, /OLD\.status='STAMPED' AND NEW\.status IN \('SIGNED','VOID'\)/);
  assert.doesNotMatch(sql, /OLD\.status='REJECTED'/);
  assert.doesNotMatch(sql, /OLD\.status='ACTIVE' AND/);
});

test('payment intent and history provide exact replay keys without browser-owned amounts', () => {
  assert.match(sql, /idempotency_key text NOT NULL UNIQUE/);
  assert.match(sql, /request_hash text NOT NULL CHECK \(request_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(sql, /UNIQUE\(registration_id,idempotency_key\)/);
  assert.match(sql, /copyright payment intent is immutable/);
  assert.match(sql, /amount_minor bigint NOT NULL/);
  assert.doesNotMatch(sql, /amount numeric/);
});

test('runtime privileges are column-scoped and submitted evidence is frozen', () => {
  assert.match(sql, /REVOKE ALL ON soundpub\.copyright_registrations/);
  assert.match(sql, /GRANT INSERT \(id,registration_code,owner_id/);
  assert.match(sql, /GRANT UPDATE \(status,provider,provider_external_id/);
  assert.doesNotMatch(sql, /GRANT ALL ON soundpub\.copyright/);
  assert.match(sql, /copyright_works_draft_guard BEFORE UPDATE OR DELETE/);
  assert.match(sql, /copyright_files_draft_guard BEFORE UPDATE OR DELETE/);
  assert.match(sql, /parent_status NOT IN \('DRAFT','REVISION_REQUESTED'\)/);
  assert.match(sql, /copyright_history_immutable BEFORE UPDATE OR DELETE OR TRUNCATE/);
  assert.match(sql, /soundpub\.copyright_draft_child_guard\(\)/);
});

test('terms are accepted exactly at submit and one owner has one registration', () => {
  assert.match(sql, /UNIQUE\(id,owner_id\), UNIQUE\(owner_id\)/);
  assert.match(sql, /num_nonnulls\(terms_version,terms_checksum,terms_accepted_at\) IN \(0,3\)/);
  assert.match(sql, /OLD\.terms_accepted_at IS NOT NULL/);
  assert.match(sql, /OLD\.status='DRAFT' AND NEW\.status='AWAITING_PAYMENT'/);
});
