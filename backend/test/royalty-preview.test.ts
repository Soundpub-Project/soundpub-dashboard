import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import { previewLegacyRoyaltyCsv } from '../src/royalties/legacy-preview.js';
import { LEGACY_ROYALTY_POLICY_CHECKSUM } from '../src/royalties/split.js';

const header = 'period,isrc,upc,title,artist,label_name,platform,country,sales_type,sales_unit,net_revenue';
const artistOwner = '00000000-0000-4000-8000-000000000001';
const labelOwner = '00000000-0000-4000-8000-000000000002';
const candidates = [
  { normalized_isrc: 'FRX762598330', track_id: '00000000-0000-4000-8000-000000000010', release_id: '00000000-0000-4000-8000-000000000020',
    artist_id: '00000000-0000-4000-8000-000000000030', artist_owner_user_id: artistOwner, label_owner_user_id: labelOwner,
    upc: '1234567890123', title: 'One', artist_name: 'A', label_name: 'L' },
  { normalized_isrc: 'FRX762598331', track_id: '00000000-0000-4000-8000-000000000011', release_id: '00000000-0000-4000-8000-000000000021',
    artist_id: '00000000-0000-4000-8000-000000000031', artist_owner_user_id: labelOwner, label_owner_user_id: labelOwner,
    upc: '1234567890123', title: 'Two', artist_name: 'B', label_name: 'L' },
];
const db = { async query(sql: string) { const rows = sql.includes('FROM soundpub.royalty_import_entries') ? [] : candidates;
  return { rows, rowCount: rows.length }; } } as unknown as PoolClient;

test('legacy royalty preview resolves catalog and totals production split per row', async () => {
  const preview = await previewLegacyRoyaltyCsv(db, `${header}\n2026-10,FRX762598330,1234567890123,One,A,L,Spotify,ID,stream,1,0.01\n2026-10,FRX762598331,1234567890123,Two,B,L,Spotify,ID,stream,2,100.00`);
  assert.equal(preview.parsed_rows, 2);
  assert.equal(preview.valid_rows, 2);
  assert.equal(preview.invalid_rows, 0);
  assert.equal(preview.file_errors, 0);
  assert.equal(preview.period, '2026-10');
  assert.equal(preview.policy_version, 1);
  assert.equal(preview.policy_checksum, LEGACY_ROYALTY_POLICY_CHECKSUM);
  assert.equal(preview.total_net_amount, '100.01');
  assert.equal(preview.artist_amount, '70.01');
  assert.equal(preview.label_amount, '21.00');
  assert.equal(preview.soundpub_amount, '9.00');
  assert.equal(preview.sample_rows[0]?.artist_owner_user_id, artistOwner);
  assert.equal(preview.sample_rows[1]?.artist_owner_user_id, labelOwner);
  assert.equal(preview.sample_rows[1]?.label_owner_user_id, labelOwner);
});

test('legacy royalty preview quarantines ambiguous catalog identity and proposes a catalogless managed artist', async () => {
  const ambiguous = { ...candidates[0], track_id: '00000000-0000-4000-8000-000000000099',
    artist_id: '00000000-0000-4000-8000-000000000099', artist_owner_user_id: '00000000-0000-4000-8000-000000000099' };
  const fixture = { async query(sql: string) { const rows = sql.includes('FROM soundpub.tracks t') ? [...candidates, ambiguous]
      : sql.includes('FROM soundpub.profiles profile') ? [{ id: labelOwner, full_name: 'L' }] : [];
    return { rows, rowCount: rows.length }; } } as unknown as PoolClient;
  const csv = `${header}\n2026-10,FRX762598330,1234567890123,One,A,L,Spotify,ID,stream,1,1.00\n2026-10,FRX762598331,9999999999999,Two,B,L,Spotify,ID,stream,1,1.00\n2026-10,FRX762598399,,Missing,A,L,Spotify,ID,stream,1,1.00`;
  const preview = await previewLegacyRoyaltyCsv(fixture, csv);
  assert.equal(preview.valid_rows, 1);
  assert.equal(preview.invalid_rows, 2);
  assert.deepEqual(preview.issues.map(issue => issue.code), ['AMBIGUOUS_ISRC', 'UPC_CONFLICT']);
  assert.equal(preview.total_net_amount, '1.00');
  assert.equal(preview.sample_rows[0]?.artist_owner_user_id, null);
});
