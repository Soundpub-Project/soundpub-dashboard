import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql=readFileSync(new URL('../migrations/0055_release_activation_identifiers.sql',import.meta.url),'utf8');
test('original release activation migration establishes identifier guards before parity migration',()=>{
  assert.match(sql,/releases_upc_format/);
  assert.match(sql,/tracks_isrc_format/);
  assert.match(sql,/CREATE UNIQUE INDEX releases_upc_unique/);
  assert.match(sql,/CREATE UNIQUE INDEX tracks_isrc_unique/);
});

test('royalty catalog retains repeated ISRCs for recipient-based legacy matching', () => {
  const parity=readFileSync(new URL('../migrations/0081_royalty_same_recipient_isrc.sql',import.meta.url),'utf8');
  const lookup=readFileSync(new URL('../migrations/0037_royalty_streaming_guards.sql',import.meta.url),'utf8');
  assert.match(parity,/DROP INDEX soundpub\.tracks_isrc_unique/);
  assert.match(lookup,/CREATE INDEX tracks_normalized_isrc/);
});