import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { formatMoney } from '../finance/money.js';
import { parseLegacyRoyaltyCsv } from './legacy-csv.js';
import { matchLegacyRoyaltyRows, type MatchedLegacyRoyaltyRow } from './legacy-matcher.js';
import { LEGACY_ROYALTY_POLICY, LEGACY_ROYALTY_POLICY_CHECKSUM, splitLegacyRoyalty } from './split.js';

export function legacyRoyaltyChecksumRow(row: MatchedLegacyRoyaltyRow) {
  return { sourceRowNumber: row.sourceRowNumber, period: row.period, isrc: row.isrc,
    upc: row.upc || row.catalogUpc, platform: row.platform, country: row.country, salesType: row.salesType ?? null,
    salesUnit: row.salesUnit, netMinor: row.netMinor.toString(), trackId: row.trackId, releaseId: row.releaseId,
    artistId: row.trackId ? row.artistId : null, artistOwnerUserId: row.trackId ? row.artistOwnerUserId : null,
    labelOwnerUserId: row.labelOwnerUserId,
    ...(row.trackId ? {} : { sourceTitle: row.title ?? null,
      sourceArtist: row.artist?.trim().toLocaleLowerCase('id-ID').replace(/\s+/g, ' ') ?? '',
      sourceLabel: row.labelName?.trim().toLocaleLowerCase('id-ID').replace(/\s+/g, ' ') ?? '' }),
  };
}
export async function prepareLegacyRoyaltyCsv(db: PoolClient, text: string) {
  const parsed = parseLegacyRoyaltyCsv(text);
  const matching = await matchLegacyRoyaltyRows(db, parsed.rows);
  const issues = [...parsed.issues, ...matching.issues].sort((left, right) => left.row - right.row || left.field.localeCompare(right.field));
  let net = 0n;
  let artist = 0n;
  let label = 0n;
  let soundpub = 0n;
  const rows = matching.rows.map(row => {
    const split = splitLegacyRoyalty(row.netMinor);
    net += split.netMinor;
    artist += split.artistMinor;
    label += split.labelMinor;
    soundpub += split.soundpubMinor;
    return { ...row, split };
  });
  const checksum = issues.length || !rows.length ? null : createHash('sha256').update(JSON.stringify({
    policy: LEGACY_ROYALTY_POLICY.code,
    policy_checksum: LEGACY_ROYALTY_POLICY_CHECKSUM,
    rows: rows.map(legacyRoyaltyChecksumRow).sort((left, right) => left.sourceRowNumber - right.sourceRowNumber),
  })).digest('hex');
  return { parsed, matching, issues, rows, checksum, totals: { net, artist, label, soundpub } };
}

export async function previewLegacyRoyaltyCsv(db: PoolClient, text: string) {
  const prepared = await prepareLegacyRoyaltyCsv(db, text);
  const invalidRows = new Set(prepared.issues.filter(issue => issue.row > 1).map(issue => issue.row)).size;
  const periods = [...new Set(prepared.parsed.rows.map(row => row.period))];
  return {
    parsed_rows: prepared.parsed.rows.length,
    valid_rows: prepared.rows.length,
    invalid_rows: invalidRows,
    file_errors: prepared.issues.filter(issue => issue.row <= 1).length,
    period: periods.length === 1 ? periods[0]! : null,
    currency: 'IDR' as const,
    policy_code: LEGACY_ROYALTY_POLICY.code,
    policy_version: LEGACY_ROYALTY_POLICY.version,
    policy_checksum: LEGACY_ROYALTY_POLICY_CHECKSUM,
    checksum: prepared.checksum,
    total_net_amount: formatMoney(prepared.totals.net),
    artist_amount: formatMoney(prepared.totals.artist),
    label_amount: formatMoney(prepared.totals.label),
    soundpub_amount: formatMoney(prepared.totals.soundpub),
    issues: prepared.issues,
    sample_rows: prepared.rows.slice(0, 20).map(row => ({
      source_row_number: row.sourceRowNumber,
      period: row.period,
      isrc: row.isrc,
      upc: row.upc || row.catalogUpc,
      title: row.title || row.catalogTitle,
      artist: row.artist || row.catalogArtist,
      label_name: row.labelName || row.catalogLabel,
      platform: row.platform,
      country: row.country,
      sales_type: row.salesType ?? null,
      sales_unit: row.salesUnit,
      net_revenue: formatMoney(row.netMinor),
      track_id: row.trackId,
      release_id: row.releaseId,
      artist_id: row.artistId,
      artist_owner_user_id: row.artistOwnerUserId,
      label_owner_user_id: row.labelOwnerUserId,
    })),
  };
}
