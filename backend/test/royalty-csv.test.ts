import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLegacyRoyaltyCsv } from '../src/royalties/legacy-csv.js';

const header = 'period,isrc,upc,title,artist,label_name,platform,country,sales_type,sales_unit,net_revenue';

test('legacy CSV parser preserves production columns and normalizes catalog keys', () => {
  const result = parseLegacyRoyaltyCsv(`\uFEFF${header}\n2026-10,FR-X76-25-98330,1234567890123,"Song, One",Artist A,Label A,Spotify,id,stream,+10,100.05`);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.rows, [{
    sourceRowNumber: 2, period: '2026-10', isrc: 'FRX762598330', upc: '1234567890123', title: 'Song, One',
    artist: 'Artist A', labelName: 'Label A', platform: 'Spotify', country: 'ID', salesType: 'stream', salesUnit: 10,
    netMinor: 10_005n,
  }]);
});

test('legacy CSV parser reports header and row errors without accepting invalid values', () => {
  const missing = parseLegacyRoyaltyCsv('period,isrc\n2026-10,FRX762598330');
  assert.equal(missing.issues[0]?.code, 'MISSING_COLUMNS');
  const duplicate = parseLegacyRoyaltyCsv('period,isrc,isrc,platform,country,sales_unit,net_revenue\n2026-10,a,b,x,ID,1,1');
  assert.equal(duplicate.issues[0]?.code, 'DUPLICATE_HEADER');
  const invalid = parseLegacyRoyaltyCsv(`${header}\n2026-13,FRX762598330,,,A,L,Spotify,ID,,1,1\n2026-10,SHORT,,,A,L,Spotify,ID,,1,1\n2026-10,FRX762598330,,,A,L,Spotify,ID,,-1,1\n2026-10,FRX762598330,,,A,L,Spotify,ID,,1,1.001`);
  assert.deepEqual(invalid.issues.map(issue => issue.code), ['INVALID_PERIOD', 'INVALID_ISRC', 'INVALID_SALES_UNIT', 'INVALID_NET_REVENUE']);
  assert.equal(invalid.rows.length, 0);
});

test('legacy CSV parser enforces production ISRC shape', () => {
  const result = parseLegacyRoyaltyCsv(`period,isrc,platform,country,sales_unit,net_revenue\n2026-10,123456789012,Spotify,ID,1,1.00`);
  assert.equal(result.rows.length, 0);
  assert.equal(result.issues[0]?.code, 'INVALID_ISRC');
});

test('legacy CSV parser rejects multiple periods and malformed quoting', () => {
  const multiple = parseLegacyRoyaltyCsv(`${header}\n2026-09,FRX762598330,,,A,L,Spotify,ID,,1,1\n2026-10,FRX762598331,,,A,L,Spotify,ID,,1,2`);
  assert.equal(multiple.rows.length, 2);
  assert.equal(multiple.issues.at(-1)?.code, 'MULTIPLE_PERIODS');
  const quoted = parseLegacyRoyaltyCsv(`${header}\n2026-10,FRX762598330,,"broken,A,L,Spotify,ID,,1,1`);
  assert.equal(quoted.issues[0]?.code, 'CSV_UNCLOSED_QUOTE');
});
