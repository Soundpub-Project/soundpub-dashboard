import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../migrations/0043_royalty_preview_approvals.sql', import.meta.url), 'utf8');

test('royalty preview approvals are immutable and checksum-bound to staged evidence', () => {
  assert.match(migration, /CREATE TABLE soundpub\.royalty_import_session_approvals/);
  assert.match(migration, /session_id uuid NOT NULL UNIQUE/);
  assert.match(migration, /ROYALTY_PREVIEW_APPROVAL_EVIDENCE_MISMATCH/);
  assert.match(migration, /session\.preview_checksum=NEW\.preview_checksum/);
  assert.match(migration, /session\.staging_checksum=NEW\.staging_checksum/);
  assert.match(migration, /role\.role IN \('admin','superadmin'\)/);
  assert.match(migration, /royalty_preview_approvals_immutable/);
  assert.match(migration, /DEFERRABLE INITIALLY DEFERRED/);
  assert.doesNotMatch(migration, /GRANT (?:UPDATE|DELETE|TRUNCATE)/);
});

