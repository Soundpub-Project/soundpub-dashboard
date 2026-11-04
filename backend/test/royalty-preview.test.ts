import assert from 'node:assert/strict';
import test from 'node:test';
import { previewLegacyRoyaltyCsv } from '../src/royalties/legacy-preview.js';

const header = 'period,isrc,upc,title,artist,label_name,platform,country,sales_type,sales_unit,net_revenue';

test('legacy royalty preview totals production split per row', () => {
  const preview = previewLegacyRoyaltyCsv(`${header}\n2026-10,FRX762598330,1234567890123,One,A,L,Spotify,ID,stream,1,0.01\n2026-10,FRX762598331,1234567890123,Two,A,L,Spotify,ID,stream,2,100.00`);
  assert.equal(preview.valid_rows, 2);
  assert.equal(preview.invalid_rows, 0);
  assert.equal(preview.file_errors, 0);
  assert.equal(preview.period, '2026-10');
  assert.equal(preview.total_net_amount, '100.01');
  assert.equal(preview.artist_amount, '70.01');
  assert.equal(preview.label_amount, '21.00');
  assert.equal(preview.soundpub_amount, '9.00');
});
