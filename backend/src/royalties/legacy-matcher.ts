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

interface CataloglessLabel {
  id: string;
  full_name: string;
  is_label_custom: boolean;
}

interface CataloglessArtist {
  id: string;
  artist_user_id: string | null;
  management_mode: 'LOGIN_ACCOUNT' | 'LABEL_CUSTOM_MANAGED';
  artist_owner_user_id: string | null;
  label_owner_user_id: string;
  upc: null;
  title: '';
  artist_name: string;
  label_name: string;
}

export interface MatchedLegacyRoyaltyRow extends LegacyRoyaltyCsvRow {
  trackId: string | null;
  releaseId: string | null;
  artistId: string | null;
  artistOwnerUserId: string | null;
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
  const historical = (await db.query<{ source_isrc: string; artist_ids: string[]; financial_owner_user_ids: string[];
    label_owner_user_ids: string[] }>(`SELECT source_isrc,
      COALESCE(array_agg(DISTINCT artist_id::text) FILTER (WHERE artist_id IS NOT NULL),'{}'::text[]) AS artist_ids,
      COALESCE(array_agg(DISTINCT financial_owner_user_id::text)
        FILTER (WHERE financial_owner_user_id IS NOT NULL),'{}'::text[]) AS financial_owner_user_ids,
      COALESCE(array_agg(DISTINCT label_owner_user_id::text)
        FILTER (WHERE label_owner_user_id IS NOT NULL),'{}'::text[]) AS label_owner_user_ids
    FROM soundpub.royalty_import_entries WHERE source_isrc=ANY($1::text[])
    GROUP BY source_isrc`, [isrcs])).rows;
  const historicalByIsrc = new Map(historical.map(item => [item.source_isrc, item]));
  const cataloglessRows = rows.filter(row => !(byIsrc.get(row.isrc)?.length));
  const labelNames = [...new Set(cataloglessRows.flatMap(row => row.labelName ? [row.labelName] : []))];
  const labels = labelNames.length ? (await db.query<CataloglessLabel>(`SELECT profile.id,profile.full_name,
      EXISTS(SELECT 1 FROM soundpub.user_roles custom_role WHERE custom_role.user_id=profile.id
        AND custom_role.role='label_custom' AND custom_role.verified_at IS NOT NULL) AS is_label_custom
    FROM soundpub.profiles profile JOIN soundpub.backend_users user_record
      ON user_record.id=profile.id AND user_record.status='active'
    WHERE lower(regexp_replace(btrim(profile.full_name),'[[:space:]]+',' ','g'))=ANY($1::text[])
      AND EXISTS(SELECT 1 FROM soundpub.user_roles role WHERE role.user_id=profile.id
        AND role.role IN ('label','whitelabel','label_custom') AND role.verified_at IS NOT NULL)
    ORDER BY profile.id`, [labelNames.map(nameKey)])).rows : [];
  const labelIds = [...new Set(labels.map(label => label.id))];
  const cataloglessArtists = labelIds.length ? (await db.query<CataloglessArtist>(`SELECT a.id,a.artist_user_id,a.management_mode,
      CASE WHEN a.management_mode='LABEL_CUSTOM_MANAGED' THEN unit.owner_user_id ELSE a.artist_user_id END AS artist_owner_user_id,
      a.label_id AS label_owner_user_id,NULL::text AS upc,''::text AS title,a.name AS artist_name,
      label_profile.full_name AS label_name
    FROM soundpub.artists a
    JOIN soundpub.profiles label_profile ON label_profile.id=a.label_id
    JOIN soundpub.backend_users label_user ON label_user.id=a.label_id AND label_user.status='active'
    LEFT JOIN soundpub.label_custom_units unit ON unit.id=a.label_custom_unit_id AND unit.status='active'
    LEFT JOIN soundpub.backend_users artist_user ON artist_user.id=a.artist_user_id AND artist_user.status='active'
    LEFT JOIN soundpub.profiles artist_profile ON artist_profile.id=a.artist_user_id
    WHERE a.label_id=ANY($1::uuid[]) AND a.verified_at IS NOT NULL
      AND ((a.management_mode='LOGIN_ACCOUNT' AND artist_user.id IS NOT NULL
          AND artist_profile.parent_label_id=a.label_id
          AND EXISTS(SELECT 1 FROM soundpub.user_roles label_role WHERE label_role.user_id=a.label_id
            AND label_role.role IN ('label','whitelabel') AND label_role.verified_at IS NOT NULL)
          AND EXISTS(SELECT 1 FROM soundpub.user_roles role WHERE role.user_id=a.artist_user_id
            AND role.role='artist' AND role.verified_at IS NOT NULL))
        OR (a.management_mode='LABEL_CUSTOM_MANAGED' AND unit.owner_user_id=a.label_id
          AND EXISTS(SELECT 1 FROM soundpub.user_roles role WHERE role.user_id=unit.owner_user_id
            AND role.role='label_custom' AND role.verified_at IS NOT NULL)))
    ORDER BY a.label_id,a.id`, [labelIds])).rows : [];
  const artistsByLabel = new Map<string, CataloglessArtist[]>();
  for (const artist of cataloglessArtists) {
    const matches = artistsByLabel.get(artist.label_owner_user_id) ?? [];
    matches.push(artist);
    artistsByLabel.set(artist.label_owner_user_id,matches);
  }
  const labelsByName = new Map<string, CataloglessLabel[]>();
  for (const label of labels) {
    const key = nameKey(label.full_name);
    const matches = labelsByName.get(key) ?? [];
    matches.push(label);
    labelsByName.set(key,matches);
  }
  const matched: MatchedLegacyRoyaltyRow[] = [];
  const issues: LegacyRoyaltyCsvIssue[] = [];
  for (const row of rows) {
    let options = byIsrc.get(row.isrc) ?? [];
    const fail = (field: string, code: string, message: string) => {
      issues.push({ row: row.sourceRowNumber, field, code, message });
    };
    if (!options.length) {
      if (!row.artist) { fail('artist','ARTIST_REQUIRED','Nama artis wajib untuk ISRC yang belum ada di katalog.'); continue; }
      if (!row.labelName) { fail('label_name','LABEL_REQUIRED','Nama label wajib untuk ISRC yang belum ada di katalog.'); continue; }
      const labelMatches = labelsByName.get(nameKey(row.labelName)) ?? [];
      if (labelMatches.length !== 1) {
        fail('label_name',labelMatches.length ? 'AMBIGUOUS_LABEL' : 'UNRESOLVED_LABEL',
          'Label harus cocok tepat dengan satu label aktif.'); continue;
      }
      const label = labelMatches[0]!;
      const artistMatches = (artistsByLabel.get(label.id) ?? []).filter(artist => nameKey(artist.artist_name) === nameKey(row.artist!));
      if (artistMatches.length > 1) { fail('artist','AMBIGUOUS_ARTIST','Artis cocok dengan lebih dari satu roster pada label ini.'); continue; }
      const existing = artistMatches[0];
      if (!existing && label.is_label_custom) {
        fail('artist','ARTIST_ROSTER_REQUIRED','Daftarkan artis Label Custom beserta email dan nomor telepon sebelum impor.'); continue;
      }
      const prior = historicalByIsrc.get(row.isrc);
      if (prior && (!existing || prior.artist_ids.some(id => id !== existing.id) ||
          prior.financial_owner_user_ids.some(id => id !== existing.artist_owner_user_id) ||
          prior.label_owner_user_ids.some(id => id !== label.id))) {
        fail('isrc','HISTORICAL_OWNER_CONFLICT','Pemilik royalti historis ISRC ini tidak cocok dengan label dan artis yang diberikan.'); continue;
      }
      if (existing && existing.management_mode === 'LOGIN_ACCOUNT' && !existing.artist_user_id) {
        fail('artist','UNRESOLVED_ARTIST_OWNER','Akun artis aktif tidak ditemukan untuk roster ini.'); continue;
      }
      matched.push({ ...row, trackId: null, releaseId: null, artistId: existing?.id ?? null,
        artistOwnerUserId: existing?.artist_owner_user_id ?? null, labelOwnerUserId: label.id,
        catalogUpc: '', catalogTitle: '', catalogArtist: existing?.artist_name ?? '', catalogLabel: label.full_name });
      continue;
    }
    if (row.upc) {
      const exact = options.filter(option => option.upc === row.upc);
      const knownUpcs = options.some(option => option.upc);
      if (!exact.length && knownUpcs) { fail('upc', 'UPC_CONFLICT', 'UPC tidak cocok dengan release katalog untuk ISRC ini.'); continue; }
      if (exact.length) options = exact;
    }
    const owners = new Set(options.map(option => [option.artist_id, option.artist_owner_user_id,
      option.label_owner_user_id].join('|')));
    if (owners.size !== 1) {
      fail('isrc', 'AMBIGUOUS_ISRC', 'ISRC cocok dengan lebih dari satu artis atau pemilik. Isi UPC yang tepat atau perbaiki katalog.');
      continue;
    }
    const catalogIds = new Set(options.map(option => [option.track_id, option.release_id].join('|')));
    const catalogIdIsUnique = catalogIds.size === 1;
    const uniqueText = (values: (string | null)[]) => {
      const distinct = new Set(values.filter((value): value is string => Boolean(value)));
      return distinct.size === 1 ? [...distinct][0]! : '';
    };
    const candidate = options[0]!;
    const prior = historicalByIsrc.get(row.isrc);
    if (prior && (prior.artist_ids.some(id => id !== candidate.artist_id) ||
        prior.financial_owner_user_ids.some(id => id !== candidate.artist_owner_user_id) ||
        prior.label_owner_user_ids.some(id => id !== candidate.label_owner_user_id))) {
      fail('isrc', 'HISTORICAL_OWNER_CONFLICT', 'Pemilik katalog berbeda dari snapshot royalti historis untuk ISRC ini.'); continue;
    }
    if (row.title && !options.some(option => nameKey(row.title!) === nameKey(option.title))) {
      fail('title', 'TITLE_CONFLICT', 'Judul tidak cocok dengan track katalog.'); continue;
    }
    if (row.artist && !options.some(option => nameKey(row.artist!) === nameKey(option.artist_name))) {
      fail('artist', 'ARTIST_CONFLICT', 'Nama artis tidak cocok dengan artis katalog.'); continue;
    }
    if (row.labelName && !options.some(option => nameKey(row.labelName!) === nameKey(option.label_name))) {
      fail('label_name', 'LABEL_CONFLICT', 'Nama label tidak cocok dengan pemilik release katalog.'); continue;
    }
    matched.push({ ...row, trackId: catalogIdIsUnique ? candidate.track_id : null,
      releaseId: catalogIdIsUnique ? candidate.release_id : null, artistId: candidate.artist_id,
      artistOwnerUserId: candidate.artist_owner_user_id, labelOwnerUserId: candidate.label_owner_user_id,
      catalogUpc: uniqueText(options.map(option => option.upc)),
      catalogTitle: uniqueText(options.map(option => option.title)),
      catalogArtist: uniqueText(options.map(option => option.artist_name)) || candidate.artist_name,
      catalogLabel: uniqueText(options.map(option => option.label_name)) || candidate.label_name });
  }
  return { rows: matched, issues };
}