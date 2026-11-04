import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { formatMoney } from '../finance/money.js';
import { parseLegacyRoyaltyCsvStream, type LegacyRoyaltyCsvIssue } from './legacy-csv.js';
import { matchLegacyRoyaltyRows } from './legacy-matcher.js';
import { LEGACY_ROYALTY_POLICY, splitLegacyRoyalty } from './split.js';

interface StreamingSession {
  id: string;
  source_checksum: string;
}

interface StagedRow {
  source_row_number: number;
  source_row_id: string;
  row_status: 'MATCHED' | 'INVALID';
  issue: LegacyRoyaltyCsvIssue | null;
  period: string | null;
  source_isrc: string | null;
  source_upc: string | null;
  title: string | null;
  artist_name: string | null;
  label_name: string | null;
  platform: string | null;
  country: string | null;
  sales_type: string | null;
  sales_unit: number | null;
  net_amount: string | null;
  track_id: string | null;
  release_id: string | null;
  artist_id: string | null;
  financial_owner_user_id: string | null;
  label_owner_user_id: string | null;
  artist_amount: string | null;
  label_amount: string | null;
  soundpub_amount: string | null;
  calculation_policy_code: string | null;
  row_checksum: string | null;
}

const issueLimit = 500;

export async function stageLegacyRoyaltyCsvStream(db: PoolClient, session: StreamingSession,
  input: AsyncIterable<Uint8Array | string>, workerId: string) {
  let processedRows = 0;
  let validRows = 0;
  let matchingInvalidRows = 0;
  let net = 0n;
  let artist = 0n;
  let label = 0n;
  let soundpub = 0n;
  let firstHashRow = true;
  const hash = createHash('sha256');
  const stagingHash = createHash('sha256');
  hash.update(JSON.stringify({ policy: LEGACY_ROYALTY_POLICY.code, rows: [] }).slice(0, -2));
  const issues: LegacyRoyaltyCsvIssue[] = [];
  let issuesTruncated = false;
  const sampleRows: Record<string, unknown>[] = [];
  const retainIssue = (issue: LegacyRoyaltyCsvIssue) => {
    if (issues.length < issueLimit) issues.push(issue);
    else issuesTruncated = true;
  };
  const sourceRowId = (row: number) => `${session.source_checksum}:${row}`;
  const invalid = (issue: LegacyRoyaltyCsvIssue): StagedRow => ({ source_row_number: issue.row,
    source_row_id: sourceRowId(issue.row), row_status: 'INVALID', issue, period: null, source_isrc: null,
    source_upc: null, title: null, artist_name: null, label_name: null, platform: null, country: null,
    sales_type: null, sales_unit: null, net_amount: null, track_id: null, release_id: null, artist_id: null,
    financial_owner_user_id: null, label_owner_user_id: null, artist_amount: null, label_amount: null,
    soundpub_amount: null, calculation_policy_code: null, row_checksum: null });
  const insertRows = async (rows: StagedRow[]) => {
    if (!rows.length) return;
    await db.query(`INSERT INTO soundpub.royalty_import_session_rows
      (session_id,source_row_number,source_row_id,row_status,issue,period,source_isrc,source_upc,title,artist_name,
       label_name,platform,country,sales_type,sales_unit,net_amount,track_id,release_id,artist_id,
       financial_owner_user_id,label_owner_user_id,artist_amount,label_amount,soundpub_amount,calculation_policy_code,row_checksum)
      SELECT $1,x.source_row_number,x.source_row_id,x.row_status,x.issue,x.period,x.source_isrc,x.source_upc,
        x.title,x.artist_name,x.label_name,x.platform,x.country,x.sales_type,x.sales_unit,x.net_amount,x.track_id,
        x.release_id,x.artist_id,x.financial_owner_user_id,x.label_owner_user_id,x.artist_amount,x.label_amount,
        x.soundpub_amount,x.calculation_policy_code,x.row_checksum
      FROM jsonb_to_recordset($2::jsonb) AS x(source_row_number integer,source_row_id text,row_status text,issue jsonb,
        period text,source_isrc text,source_upc text,title text,artist_name text,label_name text,platform text,country text,
        sales_type text,sales_unit integer,net_amount numeric,track_id uuid,release_id uuid,artist_id uuid,
        financial_owner_user_id uuid,label_owner_user_id uuid,artist_amount numeric,label_amount numeric,
        soundpub_amount numeric,calculation_policy_code text,row_checksum text)`, [session.id,JSON.stringify(rows)]);
  };
  const parsed = await parseLegacyRoyaltyCsvStream(input, { chunkSize: 1000, maxRows: 100_000, issueLimit,
    async onChunk(chunk) {
      await db.query('BEGIN');
      try {
        const matching = await matchLegacyRoyaltyRows(db, chunk.rows);
        const staged: StagedRow[] = chunk.issues.map(invalid);
        matchingInvalidRows += matching.issues.length;
        for (const issue of matching.issues) { retainIssue(issue); staged.push(invalid(issue)); }
        for (const row of matching.rows) {
          const split = splitLegacyRoyalty(row.netMinor);
          validRows += 1;
          net += split.netMinor;
          artist += split.artistMinor;
          label += split.labelMinor;
          soundpub += split.soundpubMinor;
          const canonical = { sourceRowNumber: row.sourceRowNumber, period: row.period, isrc: row.isrc,
            upc: row.upc || row.catalogUpc, platform: row.platform, country: row.country,
            salesType: row.salesType ?? null, salesUnit: row.salesUnit, netMinor: row.netMinor.toString(),
            trackId: row.trackId, releaseId: row.releaseId, artistId: row.artistId,
            artistOwnerUserId: row.artistOwnerUserId, labelOwnerUserId: row.labelOwnerUserId };
          const canonicalPayload = JSON.stringify(canonical);
          const rowChecksum = createHash('sha256').update(canonicalPayload).digest('hex');
          hash.update(`${firstHashRow ? '' : ','}${canonicalPayload}`);
          stagingHash.update(rowChecksum);
          firstHashRow = false;
          const display = { source_row_number: row.sourceRowNumber, period: row.period, isrc: row.isrc,
            upc: row.upc || row.catalogUpc, title: row.title || row.catalogTitle,
            artist: row.artist || row.catalogArtist, label_name: row.labelName || row.catalogLabel,
            platform: row.platform, country: row.country, sales_type: row.salesType ?? null,
            sales_unit: row.salesUnit, net_revenue: formatMoney(row.netMinor), track_id: row.trackId,
            release_id: row.releaseId, artist_id: row.artistId, artist_owner_user_id: row.artistOwnerUserId,
            label_owner_user_id: row.labelOwnerUserId };
          if (sampleRows.length < 20) sampleRows.push(display);
          staged.push({ source_row_number: row.sourceRowNumber, source_row_id: sourceRowId(row.sourceRowNumber),
            row_status: 'MATCHED', issue: null, period: row.period, source_isrc: row.isrc,
            source_upc: row.upc || row.catalogUpc, title: row.title || row.catalogTitle,
            artist_name: row.artist || row.catalogArtist, label_name: row.labelName || row.catalogLabel,
            platform: row.platform, country: row.country, sales_type: row.salesType ?? null,
            sales_unit: row.salesUnit, net_amount: formatMoney(row.netMinor), track_id: row.trackId,
            release_id: row.releaseId, artist_id: row.artistId, financial_owner_user_id: row.artistOwnerUserId,
            label_owner_user_id: row.labelOwnerUserId, artist_amount: formatMoney(split.artistMinor),
            label_amount: formatMoney(split.labelMinor), soundpub_amount: formatMoney(split.soundpubMinor),
            calculation_policy_code: LEGACY_ROYALTY_POLICY.code, row_checksum: rowChecksum });
        }
        processedRows += chunk.processedRows;
        await insertRows(staged);
        const heartbeat = await db.query(`UPDATE soundpub.royalty_import_sessions
          SET processed_rows=$3,phase='MATCH',lease_expires_at=clock_timestamp()+interval '5 minutes',updated_at=clock_timestamp()
          WHERE id=$1 AND status='PARSING' AND lease_owner=$2`, [session.id,workerId,processedRows]);
        if (!heartbeat.rowCount) throw new Error('ROYALTY_JOB_LEASE_LOST');
        await db.query('COMMIT');
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    } });
  for (const issue of parsed.issues) if (!issues.some(item => item.row === issue.row && item.code === issue.code)) retainIssue(issue);
  issuesTruncated ||= parsed.issuesTruncated;
  const fileErrors = issues.filter(issue => issue.row <= 1).length;
  const invalidRows = parsed.invalidRows + matchingInvalidRows;
  const hasErrors = invalidRows > 0 || fileErrors > 0 || parsed.periods.length !== 1;
  hash.update(']}');
  return { parsed_rows: parsed.parsedRows, valid_rows: validRows, invalid_rows: invalidRows,
    file_errors: fileErrors, period: parsed.periods.length === 1 ? parsed.periods[0]! : null,
    currency: 'IDR' as const, policy_code: LEGACY_ROYALTY_POLICY.code,
    checksum: hasErrors || !validRows ? null : hash.digest('hex'), total_net_amount: formatMoney(net),
    artist_amount: formatMoney(artist), label_amount: formatMoney(label), soundpub_amount: formatMoney(soundpub),
    issues, issues_truncated: issuesTruncated, sample_rows: sampleRows, total_rows: parsed.dataRows,
    staging_checksum: hasErrors || !validRows ? null : stagingHash.digest('hex') };
}
