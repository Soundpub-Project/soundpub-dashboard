import type { PoolClient } from 'pg';
import type { LegacyRoyaltyCsvIssue, LegacyRoyaltyCsvRow } from './legacy-csv.js';

interface CatalogCandidate {
  normalized_isrc: string;
  track_id: string;
  release_id: string;
  artist_id: string;
  artist_owner_user_id: string;
  label_owner_user_id: string;
  upc: string | null;
  title: string;
  artist_name: string;
  label_name: string;
}

export interface MatchedLegacyRoyaltyRow extends LegacyRoyaltyCsvRow {
  trackId: string;
  releaseId: string;
  artistId: string;
  artistOwnerUserId: string;
  labelOwnerUserId: string;
  catalogUpc: string;
  catalogTitle: string;
  catalogArtist: string;
  catalogLabel: string;
}

function nameKey(value: string): string {
  return value.trim().toLocaleLowerCase('id-ID').replace(/\s+/g, ' ');
}

export async function matchLegacyRoyaltyRows(db: PoolClient, rows: LegacyRoyaltyCsvRow[]) {
  if (!rows.length) return { rows: [] as MatchedLegacyRoyaltyRow[], issues: [] as LegacyRoyaltyCsvIssue[] };
  const isrcs = [...new Set(rows.map(row => row.isrc))];
  const candidates = (await db.query<CatalogCandidate>(`SELECT
      upper(replace(btrim(t.isrc),'-','')) AS normalized_isrc,
      t.id AS track_id,r.id AS release_id,a.id AS artist_id,
      CASE WHEN a.management_mode='LABEL_CUSTOM_MANAGED' THEN unit.owner_user_id
        ELSE a.artist_user_id END AS artist_owner_user_id,
      r.label_id AS label_owner_user_id,r.upc,t.title,a.name AS artist_name,label_profile.full_name AS label_name
    FROM soundpub.tracks t
    JOIN soundpub.releases r ON r.id=t.release_id
    JOIN soundpub.artists a ON a.id=t.artist_id AND a.id=r.artist_id
    JOIN soundpub.profiles label_profile ON label_profile.id=r.label_id
    JOIN soundpub.backend_users label_user ON label_user.id=r.label_id AND label_user.status='active'
    LEFT JOIN soundpub.label_custom_units unit ON unit.id=a.label_custom_unit_id AND unit.status='active'
    LEFT JOIN soundpub.backend_users artist_user ON artist_user.id=a.artist_user_id AND artist_user.status='active'
    WHERE upper(replace(btrim(t.isrc),'-',''))=ANY($1::text[])
      AND EXISTS(SELECT 1 FROM soundpub.user_roles role WHERE role.user_id=r.label_id
        AND role.role IN ('label','whitelabel','label_custom','admin','superadmin'))
      AND ((a.management_mode='LOGIN_ACCOUNT' AND artist_user.id IS NOT NULL
          AND EXISTS(SELECT 1 FROM soundpub.user_roles role WHERE role.user_id=a.artist_user_id AND role.role='artist'))
        OR (a.management_mode='LABEL_CUSTOM_MANAGED' AND unit.owner_user_id=r.label_id))
    ORDER BY normalized_isrc,r.id,t.id`, [isrcs])).rows;
  const byIsrc = new Map<string, CatalogCandidate[]>();
  for (const candidate of candidates) {
    const matches = byIsrc.get(candidate.normalized_isrc) ?? [];
    matches.push(candidate);
    byIsrc.set(candidate.normalized_isrc, matches);
  }
  const historical = (await db.query<{ source_isrc: string; artist_ids: string[] }>(`SELECT source_isrc,
      COALESCE(array_agg(DISTINCT artist_id::text) FILTER (WHERE artist_id IS NOT NULL),'{}'::text[]) AS artist_ids
    FROM soundpub.royalty_import_entries WHERE source_isrc=ANY($1::text[])
    GROUP BY source_isrc`, [isrcs])).rows;
  const historicalByIsrc = new Map(historical.map(item => [item.source_isrc, item]));
  const matched: MatchedLegacyRoyaltyRow[] = [];
  const issues: LegacyRoyaltyCsvIssue[] = [];
  for (const row of rows) {
    let options = byIsrc.get(row.isrc) ?? [];
    const fail = (field: string, code: string, message: string) => {
      issues.push({ row: row.sourceRowNumber, field, code, message });
    };
    if (!options.length) { fail('isrc', 'UNMATCHED_ISRC', 'ISRC tidak ditemukan pada katalog aktif.'); continue; }
    if (row.upc) {
      const exact = options.filter(option => option.upc === row.upc);
      const knownUpcs = options.some(option => option.upc);
      if (!exact.length && knownUpcs) { fail('upc', 'UPC_CONFLICT', 'UPC tidak cocok dengan release katalog untuk ISRC ini.'); continue; }
      if (exact.length) options = exact;
    }
    const identities = new Set(options.map(option => [option.track_id, option.release_id, option.artist_id,
      option.artist_owner_user_id, option.label_owner_user_id].join('|')));
    if (identities.size !== 1) {
      fail('isrc', 'AMBIGUOUS_ISRC', 'ISRC cocok dengan lebih dari satu track, release, artis, atau pemilik. Isi UPC yang tepat atau perbaiki katalog.');
      continue;
    }
    const candidate = options[0]!;
    const prior = historicalByIsrc.get(row.isrc);
    if (prior?.artist_ids.some(id => id !== candidate.artist_id)) {
      fail('isrc', 'HISTORICAL_OWNER_CONFLICT', 'Pemilik katalog berbeda dari snapshot royalti historis untuk ISRC ini.'); continue;
    }
    if (row.title && nameKey(row.title) !== nameKey(candidate.title)) {
      fail('title', 'TITLE_CONFLICT', 'Judul tidak cocok dengan track katalog.'); continue;
    }
    if (row.artist && nameKey(row.artist) !== nameKey(candidate.artist_name)) {
      fail('artist', 'ARTIST_CONFLICT', 'Nama artis tidak cocok dengan artis katalog.'); continue;
    }
    if (row.labelName && nameKey(row.labelName) !== nameKey(candidate.label_name)) {
      fail('label_name', 'LABEL_CONFLICT', 'Nama label tidak cocok dengan pemilik release katalog.'); continue;
    }
    matched.push({ ...row, trackId: candidate.track_id, releaseId: candidate.release_id, artistId: candidate.artist_id,
      artistOwnerUserId: candidate.artist_owner_user_id, labelOwnerUserId: candidate.label_owner_user_id,
      catalogUpc: candidate.upc ?? '', catalogTitle: candidate.title, catalogArtist: candidate.artist_name,
      catalogLabel: candidate.label_name });
  }
  return { rows: matched, issues };
}

