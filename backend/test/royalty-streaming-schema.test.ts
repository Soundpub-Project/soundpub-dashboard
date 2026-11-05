import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../migrations/0036_royalty_import_streaming.sql', import.meta.url), 'utf8');
const guards = readFileSync(new URL('../migrations/0037_royalty_streaming_guards.sql', import.meta.url), 'utf8');
const allocationGuard = readFileSync(new URL('../migrations/0038_royalty_batch_allocation_guard.sql', import.meta.url), 'utf8');
const stagingIntegrity = readFileSync(new URL('../migrations/0039_royalty_staging_integrity.sql', import.meta.url), 'utf8');
const detailPagination = readFileSync(new URL('../migrations/0040_royalty_detail_pagination.sql', import.meta.url), 'utf8');

test('streaming migration raises only durable file-session row capacity', () => {
  assert.match(migration, /row_count BETWEEN 1 AND 100000/);
  assert.match(migration, /processed_rows <= total_rows/);
  assert.match(migration, /CREATE TABLE soundpub\.royalty_import_session_rows/);
  assert.match(migration, /PRIMARY KEY \(session_id,source_row_number\)/);
  assert.match(migration, /UNIQUE \(session_id,source_row_id\)/);
  assert.match(migration, /row_status IN \('MATCHED','INVALID'\)/);
});

test('streaming guards bind progress, lease, preview size and lookup indexes', () => {
  assert.match(guards, /processed_rows <= 100000/);
  assert.match(guards, /processed_rows=total_rows/);
  assert.match(guards, /lease_owner IS NULL OR status IN \('PARSING','CLEANING'\)/);
  assert.match(guards, /jsonb_array_length[\s\S]*<= 500/);
  assert.match(guards, /tracks_normalized_isrc/);
  assert.match(guards, /royalty_import_entries_batch_isrc_snapshot/);
  assert.match(guards, /royalty_import_sessions_expired_parse_lease/);
});

test('staged rows preserve immutable catalog, owner, split and issue snapshots', () => {
  for (const column of ['track_id','release_id','artist_id','financial_owner_user_id','label_owner_user_id',
    'artist_amount','label_amount','soundpub_amount','calculation_policy_code','issue']) {
    assert.match(migration, new RegExp(`\\b${column}\\b`));
  }
  assert.match(migration, /artist_amount\+label_amount\+soundpub_amount=net_amount/);
  assert.match(migration, /royalty_import_entries\(batch_id,source_row_number\)/);
  assert.match(migration, /GRANT SELECT,INSERT,DELETE ON soundpub\.royalty_import_session_rows TO soundpub_app/);
});

test('allocation invariant runs once per batch and closes append window after commit', () => {
  assert.match(allocationGuard, /ADD COLUMN write_xid xid8 NOT NULL DEFAULT pg_current_xact_id\(\)/);
  assert.match(allocationGuard, /DROP TRIGGER royalty_entry_allocation_sum/);
  assert.match(allocationGuard, /CREATE CONSTRAINT TRIGGER royalty_batch_allocation_sum/);
  assert.match(allocationGuard, /entry_count IS DISTINCT FROM NEW\.row_count/);
  assert.match(allocationGuard, /allocation_total IS DISTINCT FROM NEW\.total_amount/);
  assert.match(allocationGuard, /allocation\.owner_id IS DISTINCT FROM entry\.financial_owner_user_id/);
  assert.match(allocationGuard, /REFERENCING NEW TABLE AS new_entries FOR EACH STATEMENT/);
  assert.match(allocationGuard, /REFERENCING NEW TABLE AS new_allocations FOR EACH STATEMENT/);
  assert.match(allocationGuard, /ROYALTY_BATCH_CLOSED/);
});

test('royalty detail pagination index matches stable source-row ordering', () => {
  assert.match(detailPagination, /CREATE INDEX royalty_import_entries_batch_detail_order/);
  assert.match(detailPagination, /\(batch_id,\(source_row_number IS NULL\),source_row_number,source_row_id,id\)/);
});

test('preview staging is checksum-bound and frozen outside worker leases', () => {
  assert.match(stagingIntegrity, /ADD COLUMN staging_checksum text/);
  assert.match(stagingIntegrity, /ADD COLUMN row_checksum text/);
  assert.match(stagingIntegrity, /session\.status<>'PARSING' OR session\.lease_owner IS NULL/);
  assert.match(stagingIntegrity, /session\.status NOT IN \('PARSING','CLEANING'\)/);
  assert.match(stagingIntegrity, /ROYALTY_STAGING_FROZEN/);
});
