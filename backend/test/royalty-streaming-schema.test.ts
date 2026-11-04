import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../migrations/0036_royalty_import_streaming.sql', import.meta.url), 'utf8');
const guards = readFileSync(new URL('../migrations/0037_royalty_streaming_guards.sql', import.meta.url), 'utf8');

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
