import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import { matchLegacyRoyaltyRows } from '../src/royalties/legacy-matcher.js';
import type { LegacyRoyaltyCsvRow } from '../src/royalties/legacy-csv.js';

const row: LegacyRoyaltyCsvRow = { sourceRowNumber: 2, period: '2026-10', isrc: 'FRX762598330', upc: '1234567890123',
  title: 'Canonical Title', artist: 'Canonical Artist', labelName: 'Canonical Label', platform: 'Spotify', country: 'ID',
  salesType: 'stream', salesUnit: 1, netMinor: 10000n };
const candidate = { normalized_isrc: row.isrc, track_id: '00000000-0000-4000-8000-000000000010',
  release_id: '00000000-0000-4000-8000-000000000020', artist_id: '00000000-0000-4000-8000-000000000030',
  artist_owner_user_id: '00000000-0000-4000-8000-000000000040', label_owner_user_id: '00000000-0000-4000-8000-000000000050',
  upc: row.upc, title: row.title!, artist_name: row.artist!, label_name: row.labelName! };
const fixture = (rows: unknown[], historical: unknown[] = []) => ({ async query(sql: string, args: unknown[]) {
  assert.deepEqual(args, [[row.isrc]]);
  const result = sql.includes('FROM soundpub.royalty_import_entries') ? historical : rows;
  return { rows: result, rowCount: result.length };
} } as unknown as PoolClient);

test('catalog matcher returns immutable track, artist and owner identity', async () => {
  const result = await matchLegacyRoyaltyRows(fixture([candidate]), [row]);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.rows[0], { ...row, trackId: candidate.track_id, releaseId: candidate.release_id,
    artistId: candidate.artist_id, artistOwnerUserId: candidate.artist_owner_user_id,
    labelOwnerUserId: candidate.label_owner_user_id, catalogUpc: row.upc, catalogTitle: row.title,
    catalogArtist: row.artist, catalogLabel: row.labelName });
});

test('catalog matcher checks optional CSV assertions without name-based identity creation', async () => {
  for (const [field, value, code] of [
    ['title', 'Wrong title', 'TITLE_CONFLICT'], ['artist', 'Wrong artist', 'ARTIST_CONFLICT'],
    ['labelName', 'Wrong label', 'LABEL_CONFLICT'],
  ] as const) {
    const result = await matchLegacyRoyaltyRows(fixture([candidate]), [{ ...row, [field]: value }]);
    assert.equal(result.rows.length, 0);
    assert.equal(result.issues[0]?.code, code);
  }
  const missing = await matchLegacyRoyaltyRows(fixture([]), [row]);
  assert.equal(missing.issues[0]?.code, 'UNMATCHED_ISRC');
});

test('catalog matcher rejects historical artist drift', async () => {
  const historical = [{ source_isrc: row.isrc, artist_ids: ['00000000-0000-4000-8000-000000000099'],
    financial_owner_user_ids: [candidate.artist_owner_user_id], label_owner_user_ids: [candidate.label_owner_user_id] }];
  const result = await matchLegacyRoyaltyRows(fixture([candidate], historical), [row]);
  assert.equal(result.rows.length, 0);
  assert.equal(result.issues[0]?.code, 'HISTORICAL_OWNER_CONFLICT');
});

test('catalog matcher rejects historical financial or label owner drift', async () => {
  for (const historical of [
    { source_isrc: row.isrc, artist_ids: [candidate.artist_id],
      financial_owner_user_ids: ['00000000-0000-4000-8000-000000000099'],
      label_owner_user_ids: [candidate.label_owner_user_id] },
    { source_isrc: row.isrc, artist_ids: [candidate.artist_id],
      financial_owner_user_ids: [candidate.artist_owner_user_id],
      label_owner_user_ids: ['00000000-0000-4000-8000-000000000099'] },
  ]) {
    const result = await matchLegacyRoyaltyRows(fixture([candidate], [historical]), [row]);
    assert.equal(result.rows.length, 0);
    assert.equal(result.issues[0]?.code, 'HISTORICAL_OWNER_CONFLICT');
  }
});

test('catalog matcher keeps historical release label after current artist transfer', async () => {
  const result = await matchLegacyRoyaltyRows(fixture([candidate]), [row]);
  assert.equal(result.rows[0]?.labelOwnerUserId, candidate.label_owner_user_id);
});

