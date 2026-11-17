import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import { prepareLegacyRoyaltyCsv } from '../src/royalties/legacy-preview.js';
import { stageLegacyRoyaltyCsvStream } from '../src/royalties/streaming-preview.js';
import { LEGACY_ROYALTY_POLICY_CHECKSUM } from '../src/royalties/split.js';

const csv = [
  'period,isrc,upc,title,artist,label_name,platform,country,sales_type,sales_unit,net_revenue',
  '2026-10,FRX762598330,1234567890123,One,A,L,Spotify,ID,stream,1,100.05',
].join('\n');
const candidate = { normalized_isrc: 'FRX762598330', track_id: '00000000-0000-4000-8000-000000000010',
  release_id: '00000000-0000-4000-8000-000000000020', artist_id: '00000000-0000-4000-8000-000000000030',
  artist_owner_user_id: '00000000-0000-4000-8000-000000000040',
  label_owner_user_id: '00000000-0000-4000-8000-000000000050', upc: '1234567890123', title: 'One',
  artist_name: 'A', label_name: 'L' };

function fixture(lease = true) {
  const calls: { sql: string; args: unknown[] }[] = [];
  const db = { async query(sql: string, args: unknown[] = []) {
    calls.push({ sql, args });
    if (sql.includes('FROM soundpub.royalty_import_entries')) return { rows: [], rowCount: 0 };
    if (sql.includes('FROM soundpub.tracks')) return { rows: [candidate], rowCount: 1 };
    if (sql.startsWith('UPDATE soundpub.royalty_import_sessions')) return { rows: [], rowCount: lease ? 1 : 0 };
    return { rows: [], rowCount: 0 };
  } } as unknown as PoolClient;
  return { db, calls };
}

async function *stream() {
  const encoded = new TextEncoder().encode(csv);
  for (let index = 0; index < encoded.length; index += 3) yield encoded.slice(index, index + 3);
}

test('streaming preview stages immutable snapshots and matches legacy checksum', async () => {
  const baseline = fixture();
  const expected = await prepareLegacyRoyaltyCsv(baseline.db, csv);
  const target = fixture();
  const preview = await stageLegacyRoyaltyCsvStream(target.db,
    { id: '00000000-0000-4000-8000-000000000060', source_checksum: 'a'.repeat(64) }, stream(), 'worker');
  assert.equal(preview.checksum, expected.checksum);
  assert.equal(preview.policy_version, 1);
  assert.equal(preview.policy_checksum, LEGACY_ROYALTY_POLICY_CHECKSUM);
  assert.equal(preview.total_rows, 1);
  assert.equal(preview.valid_rows, 1);
  const insert = target.calls.find(call => call.sql.includes('INSERT INTO soundpub.royalty_import_session_rows'))!;
  const staged = JSON.parse(String(insert.args[1]))[0];
  assert.equal(staged.source_row_id, `${'a'.repeat(64)}:2`);
  assert.equal(staged.track_id, candidate.track_id);
  assert.equal(staged.financial_owner_user_id, candidate.artist_owner_user_id);
  assert.equal(staged.artist_amount, '70.04');
  assert.equal(staged.label_amount, '21.01');
  assert.equal(staged.soundpub_amount, '9.00');
  assert.ok(target.calls.some(call => call.sql.includes("lease_expires_at=clock_timestamp()+interval '5 minutes'")));
});

test('streaming preview stops when chunk heartbeat loses lease', async () => {
  const target = fixture(false);
  await assert.rejects(stageLegacyRoyaltyCsvStream(target.db,
    { id: '00000000-0000-4000-8000-000000000060', source_checksum: 'a'.repeat(64) }, stream(), 'worker'),
  /ROYALTY_JOB_LEASE_LOST/);
  assert.ok(target.calls.some(call => call.sql === 'ROLLBACK'));
});
