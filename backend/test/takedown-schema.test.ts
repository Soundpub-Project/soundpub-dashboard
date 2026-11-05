import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const sql = readFileSync(new URL('../migrations/0049_takedowns.sql', import.meta.url), 'utf8');

test('takedown schema enforces immutable ownership, unique targets, and least privilege', () => {
  assert.match(sql, /takedown submission is immutable/);
  assert.match(sql, /UNIQUE \(request_id, dsp_name\)/);
  assert.match(sql, /takedown_requests_active_scope_idx/);
  assert.doesNotMatch(sql, /dsp_name IN \('Semua DSP'/);
  assert.match(sql, /UNIQUE NULLS NOT DISTINCT \(request_id, release_id, track_id\)/);
  assert.match(sql, /REVOKE ALL ON soundpub\.takedown_requests/);
  assert.doesNotMatch(sql, /GRANT (?:ALL|DELETE) ON soundpub\.takedown_requests/);
  assert.match(sql, /storage_asset_id uuid NOT NULL UNIQUE REFERENCES soundpub\.storage_assets/);
});
