-- 32-scan-orphan-artist-links-rpc.sql
-- Purpose:
--   Audit artist/profile links that can make label artist lists and release counts inaccurate.
--   This is read-only. It does not modify data.

BEGIN;

CREATE OR REPLACE FUNCTION Soundpub.scan_orphan_artist_links()
RETURNS TABLE (
  issue_type text,
  profile_id uuid,
  full_name text,
  current_label_id uuid,
  current_label_name text,
  related_label_id uuid,
  related_label_name text,
  release_count bigint,
  track_count bigint,
  royalty_count bigint,
  reason text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = Soundpub, public
AS $$
  WITH artist_profiles AS (
    SELECT
      p.id,
      p.full_name,
      p.parent_label_id,
      parent.full_name AS parent_label_name
    FROM Soundpub.profiles p
    LEFT JOIN Soundpub.profiles parent ON parent.id = p.parent_label_id
    WHERE EXISTS (
      SELECT 1
      FROM Soundpub.user_roles ur
      WHERE ur.user_id = p.id
        AND ur.role::text = 'artist'
    )
  ),
  release_links AS (
    SELECT
      r.artist_user_id AS profile_id,
      r.label_id AS related_label_id,
      count(*)::bigint AS release_count,
      0::bigint AS track_count,
      0::bigint AS royalty_count
    FROM Soundpub.releases r
    WHERE r.artist_user_id IS NOT NULL
    GROUP BY r.artist_user_id, r.label_id
  ),
  track_links AS (
    SELECT
      t.artist_user_id AS profile_id,
      r.label_id AS related_label_id,
      0::bigint AS release_count,
      count(*)::bigint AS track_count,
      0::bigint AS royalty_count
    FROM Soundpub.tracks t
    LEFT JOIN Soundpub.releases r ON r.id = t.release_id
    WHERE t.artist_user_id IS NOT NULL
    GROUP BY t.artist_user_id, r.label_id
  ),
  royalty_links AS (
    SELECT
      ro.artist_user_id AS profile_id,
      ro.label_user_id AS related_label_id,
      0::bigint AS release_count,
      0::bigint AS track_count,
      count(*)::bigint AS royalty_count
    FROM Soundpub.royalties ro
    WHERE ro.artist_user_id IS NOT NULL
    GROUP BY ro.artist_user_id, ro.label_user_id
  ),
  combined_links AS (
    SELECT * FROM release_links
    UNION ALL
    SELECT * FROM track_links
    UNION ALL
    SELECT * FROM royalty_links
  ),
  summarized_links AS (
    SELECT
      cl.profile_id,
      cl.related_label_id,
      sum(cl.release_count)::bigint AS release_count,
      sum(cl.track_count)::bigint AS track_count,
      sum(cl.royalty_count)::bigint AS royalty_count
    FROM combined_links cl
    GROUP BY cl.profile_id, cl.related_label_id
  ),
  mismatch_links AS (
    SELECT
      'ARTIST_LABEL_MISMATCH'::text AS issue_type,
      ap.id AS profile_id,
      ap.full_name,
      ap.parent_label_id AS current_label_id,
      ap.parent_label_name AS current_label_name,
      sl.related_label_id,
      related.full_name AS related_label_name,
      sl.release_count,
      sl.track_count,
      sl.royalty_count,
      'Artist masih punya release/track/royalty pada label yang berbeda dari parent_label_id saat ini.'::text AS reason
    FROM summarized_links sl
    JOIN artist_profiles ap ON ap.id = sl.profile_id
    LEFT JOIN Soundpub.profiles related ON related.id = sl.related_label_id
    WHERE sl.related_label_id IS NOT NULL
      AND ap.parent_label_id IS NOT NULL
      AND sl.related_label_id <> ap.parent_label_id
  ),
  no_parent_artists AS (
    SELECT
      'ARTIST_WITHOUT_PARENT_LABEL'::text AS issue_type,
      ap.id AS profile_id,
      ap.full_name,
      ap.parent_label_id AS current_label_id,
      ap.parent_label_name AS current_label_name,
      sl.related_label_id,
      related.full_name AS related_label_name,
      COALESCE(sl.release_count, 0)::bigint AS release_count,
      COALESCE(sl.track_count, 0)::bigint AS track_count,
      COALESCE(sl.royalty_count, 0)::bigint AS royalty_count,
      'Artist tidak punya parent_label_id, tapi masih muncul di release/track/royalty.'::text AS reason
    FROM artist_profiles ap
    JOIN summarized_links sl ON sl.profile_id = ap.id
    LEFT JOIN Soundpub.profiles related ON related.id = sl.related_label_id
    WHERE ap.parent_label_id IS NULL
  ),
  missing_artist_profiles AS (
    SELECT
      'RELATED_ARTIST_PROFILE_MISSING'::text AS issue_type,
      sl.profile_id,
      NULL::text AS full_name,
      NULL::uuid AS current_label_id,
      NULL::text AS current_label_name,
      sl.related_label_id,
      related.full_name AS related_label_name,
      sl.release_count,
      sl.track_count,
      sl.royalty_count,
      'Release/track/royalty masih menunjuk artist_user_id yang tidak ada di Soundpub.profiles.'::text AS reason
    FROM summarized_links sl
    LEFT JOIN Soundpub.profiles artist ON artist.id = sl.profile_id
    LEFT JOIN Soundpub.profiles related ON related.id = sl.related_label_id
    WHERE artist.id IS NULL
  ),
  release_label_without_profile AS (
    SELECT
      'RELATED_LABEL_PROFILE_MISSING'::text AS issue_type,
      r.artist_user_id AS profile_id,
      artist.full_name,
      artist.parent_label_id AS current_label_id,
      parent.full_name AS current_label_name,
      r.label_id AS related_label_id,
      NULL::text AS related_label_name,
      count(*)::bigint AS release_count,
      0::bigint AS track_count,
      0::bigint AS royalty_count,
      'Release masih menunjuk label_id yang tidak ada di Soundpub.profiles.'::text AS reason
    FROM Soundpub.releases r
    LEFT JOIN Soundpub.profiles label_profile ON label_profile.id = r.label_id
    LEFT JOIN Soundpub.profiles artist ON artist.id = r.artist_user_id
    LEFT JOIN Soundpub.profiles parent ON parent.id = artist.parent_label_id
    WHERE label_profile.id IS NULL
    GROUP BY r.artist_user_id, artist.full_name, artist.parent_label_id, parent.full_name, r.label_id
  ),
  releases_without_artist_id AS (
    SELECT
      'RELEASE_WITHOUT_ARTIST_USER_ID'::text AS issue_type,
      NULL::uuid AS profile_id,
      r.artist_name AS full_name,
      NULL::uuid AS current_label_id,
      NULL::text AS current_label_name,
      r.label_id AS related_label_id,
      label_profile.full_name AS related_label_name,
      count(*)::bigint AS release_count,
      0::bigint AS track_count,
      0::bigint AS royalty_count,
      'Release belum punya artist_user_id; label artist list dan hitungan rilis bisa tidak akurat.'::text AS reason
    FROM Soundpub.releases r
    LEFT JOIN Soundpub.profiles label_profile ON label_profile.id = r.label_id
    WHERE r.artist_user_id IS NULL
    GROUP BY r.artist_name, r.label_id, label_profile.full_name
  )
  SELECT *
  FROM (
    SELECT * FROM mismatch_links
    UNION ALL SELECT * FROM no_parent_artists
    UNION ALL SELECT * FROM missing_artist_profiles
    UNION ALL SELECT * FROM release_label_without_profile
    UNION ALL SELECT * FROM releases_without_artist_id
  ) issues
  ORDER BY
    (issues.release_count + issues.track_count + issues.royalty_count) DESC,
    issues.issue_type,
    issues.full_name NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION Soundpub.scan_orphan_artist_links() TO authenticated;
GRANT EXECUTE ON FUNCTION Soundpub.scan_orphan_artist_links() TO anon;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- After running this file, test:
-- SELECT * FROM Soundpub.scan_orphan_artist_links() LIMIT 50;

