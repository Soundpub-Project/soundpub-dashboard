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
const fixture = (rows: unknown[], historical: unknown[] = [], labels: unknown[] = [], artists: unknown[] = []) =>
  ({ async query(sql: string, args: unknown[]) {
    let result: unknown[];
    if (sql.includes('FROM soundpub.royalty_import_entries')) {
      assert.deepEqual(args, [[row.isrc]]);
      result = historical;
    } else if (sql.includes('FROM soundpub.profiles profile')) {
      result = labels;
    } else if (sql.includes('FROM soundpub.artists a')) {
      result = artists;
    } else {
      assert.deepEqual(args, [[row.isrc]]);
      result = rows;
    }
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

test('catalog matcher checks optional CSV assertions without rewriting catalog identity', async () => {
  for (const [field, value, code] of [
    ['title', 'Wrong title', 'TITLE_CONFLICT'], ['artist', 'Wrong artist', 'ARTIST_CONFLICT'],
    ['labelName', 'Wrong label', 'LABEL_CONFLICT'],
  ] as const) {
    const result = await matchLegacyRoyaltyRows(fixture([candidate]), [{ ...row, [field]: value }]);
    assert.equal(result.rows.length, 0);
    assert.equal(result.issues[0]?.code, code);
  }
  const missing = await matchLegacyRoyaltyRows(fixture([]), [row]);
  assert.equal(missing.issues[0]?.code, 'UNRESOLVED_LABEL');
});

test('catalog matcher uses UPC to resolve repeated ISRC candidates without weakening ambiguity checks', async () => {
  const other = { ...candidate, track_id: '00000000-0000-4000-8000-000000000011',
    release_id: '00000000-0000-4000-8000-000000000021', artist_id: '00000000-0000-4000-8000-000000000031',
    artist_owner_user_id: '00000000-0000-4000-8000-000000000041', upc: '2234567890123' };
  const resolved = await matchLegacyRoyaltyRows(fixture([candidate, other]), [row]);
  assert.deepEqual(resolved.issues, []);
  assert.equal(resolved.rows[0]?.trackId, candidate.track_id);

  const ambiguous = await matchLegacyRoyaltyRows(fixture([candidate, other]), [{ ...row, upc: '' }]);
  assert.equal(ambiguous.rows.length, 0);
  assert.equal(ambiguous.issues[0]?.code, 'AMBIGUOUS_ISRC');

  const conflict = await matchLegacyRoyaltyRows(fixture([candidate, other]), [{ ...row, upc: '3234567890123' }]);
  assert.equal(conflict.rows.length, 0);
  assert.equal(conflict.issues[0]?.code, 'UPC_CONFLICT');
});

test('catalog matcher preserves recipient attribution when ISRC has multiple tracks for same artist and owner', async () => {
  const sibling = { ...candidate, track_id: '00000000-0000-4000-8000-000000000011',
    release_id: '00000000-0000-4000-8000-000000000021', upc: '2234567890123', title: 'Alternate Version' };
  const result = await matchLegacyRoyaltyRows(fixture([candidate, sibling]), [{ ...row, upc: '', title: 'Canonical Title' }]);
  assert.deepEqual(result.issues, []);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.trackId, null);
  assert.equal(result.rows[0]?.releaseId, null);
  assert.equal(result.rows[0]?.artistId, candidate.artist_id);
  assert.equal(result.rows[0]?.artistOwnerUserId, candidate.artist_owner_user_id);
  assert.equal(result.rows[0]?.labelOwnerUserId, candidate.label_owner_user_id);
  assert.equal(result.rows[0]?.catalogTitle, '');
  assert.equal(result.rows[0]?.catalogUpc, '');
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


test('missing ISRC resolves one active label and proposes managed artist without writing', async () => {
  const label = { id: candidate.label_owner_user_id, full_name: row.labelName! };
  const pending = await matchLegacyRoyaltyRows(fixture([], [], [label]), [row]);
  assert.deepEqual(pending.issues, []);
  assert.equal(pending.rows[0]?.artistId, null);
  assert.equal(pending.rows[0]?.artistOwnerUserId, null);
  assert.equal(pending.rows[0]?.labelOwnerUserId, label.id);
  assert.equal(pending.rows[0]?.trackId, null);
  assert.equal(pending.rows[0]?.releaseId, null);
  const existing = { id: candidate.artist_id, artist_user_id: candidate.artist_owner_user_id,
    management_mode: 'LOGIN_ACCOUNT', artist_owner_user_id: candidate.artist_owner_user_id,
    label_owner_user_id: label.id, upc: null, title: '', artist_name: row.artist!, label_name: label.full_name };
  const matched = await matchLegacyRoyaltyRows(fixture([], [], [label], [existing]), [row]);
  assert.equal(matched.rows[0]?.artistId, existing.id);
  assert.equal(matched.rows[0]?.artistOwnerUserId, existing.artist_owner_user_id);
});

test('missing ISRC rejects ambiguous label, artist or historical owner', async () => {
  const label = { id: candidate.label_owner_user_id, full_name: row.labelName! };
  const anotherLabel = { ...label, id: '00000000-0000-4000-8000-000000000099' };
  assert.equal((await matchLegacyRoyaltyRows(fixture([], [], [label, anotherLabel]), [row]))
    .issues[0]?.code, 'AMBIGUOUS_LABEL');
  const existing = { id: candidate.artist_id, artist_user_id: candidate.artist_owner_user_id,
    management_mode: 'LOGIN_ACCOUNT', artist_owner_user_id: candidate.artist_owner_user_id,
    label_owner_user_id: label.id, upc: null, title: '', artist_name: row.artist!, label_name: label.full_name };
  assert.equal((await matchLegacyRoyaltyRows(fixture([], [], [label], [existing, { ...existing,
    id: '00000000-0000-4000-8000-000000000099' }]), [row])).issues[0]?.code, 'AMBIGUOUS_ARTIST');
  const prior = { source_isrc: row.isrc, artist_ids: [existing.id],
    financial_owner_user_ids: [existing.artist_owner_user_id], label_owner_user_ids: [label.id] };
  assert.equal((await matchLegacyRoyaltyRows(fixture([], [prior], [label]), [row]))
    .issues[0]?.code, 'HISTORICAL_OWNER_CONFLICT');
});
test('catalogless Label Custom only matches existing managed roster and PIC owner', async () => {
  const label = { id: candidate.label_owner_user_id, full_name: row.labelName!, is_label_custom: true };
  const pending = await matchLegacyRoyaltyRows(fixture([], [], [label]), [row]);
  assert.equal(pending.rows.length, 0);
  assert.equal(pending.issues[0]?.code, 'ARTIST_ROSTER_REQUIRED');
  const artist = { id: candidate.artist_id, artist_user_id: null,
    management_mode: 'LABEL_CUSTOM_MANAGED', artist_owner_user_id: label.id,
    label_owner_user_id: label.id, upc: null, title: '', artist_name: row.artist!, label_name: label.full_name };
  const matched = await matchLegacyRoyaltyRows(fixture([], [], [label], [artist]), [row]);
  assert.equal(matched.issues.length, 0);
  assert.equal(matched.rows[0]?.artistId, artist.id);
  assert.equal(matched.rows[0]?.artistOwnerUserId, label.id);
  assert.equal(matched.rows[0]?.labelOwnerUserId, label.id);
});