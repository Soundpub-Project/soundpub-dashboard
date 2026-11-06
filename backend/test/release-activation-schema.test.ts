import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql=readFileSync(new URL('../migrations/0055_release_activation_identifiers.sql',import.meta.url),'utf8');
test('release activation identifiers are normalized and unique',()=>{
  assert.match(sql,/releases_upc_format/);
  assert.match(sql,/tracks_isrc_format/);
  assert.match(sql,/CREATE UNIQUE INDEX releases_upc_unique/);
  assert.match(sql,/CREATE UNIQUE INDEX tracks_isrc_unique/);
});
