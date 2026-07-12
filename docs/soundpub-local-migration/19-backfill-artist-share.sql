-- =============================================
-- BACKFILL ARTIST USER ID AND RECALCULATE ARTIST SHARE
-- Schema: soundpub
-- Purpose:
--   1) Fill missing releases.artist_user_id and tracks.artist_user_id from label-owned artist profiles.
--   2) Fill missing royalties.artist_user_id from tracks/releases.
--   3) Recalculate artist_revenue, label_revenue, soundpub_revenue, and profile balances.
-- =============================================

BEGIN;

CREATE TEMP TABLE tmp_soundpub_main_label AS
SELECT id
FROM soundpub.profiles
WHERE lower(email) = 'publishersoundpub@gmail.com'
   OR lower(trim(full_name)) IN ('soundpub music ecosystem', 'soundpub music', 'soundpub')
ORDER BY CASE WHEN lower(email) = 'publishersoundpub@gmail.com' THEN 0 ELSE 1 END, created_at NULLS LAST
LIMIT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tmp_soundpub_main_label) THEN
    RAISE EXCEPTION 'Soundpub main label profile not found. Import profiles first and ensure publishersoundpub@gmail.com exists in soundpub.profiles.';
  END IF;
END;
$$;

ALTER TABLE soundpub.royalties
ADD COLUMN IF NOT EXISTS label_revenue numeric(18, 2) DEFAULT 0;

-- 1. Backfill release artist_user_id by artist name under the same label.
WITH profile_name_matches AS (
  SELECT
    r.id AS release_id,
    p.id AS artist_user_id,
    ROW_NUMBER() OVER (PARTITION BY r.id ORDER BY p.created_at NULLS LAST, p.id) AS rn
  FROM soundpub.releases r
  JOIN soundpub.profiles p
    ON p.parent_label_id = r.label_id
   AND lower(trim(p.full_name)) = lower(trim(r.artist_name))
  JOIN soundpub.user_roles ur
    ON ur.user_id = p.id
   AND ur.role = 'artist'::soundpub.app_role
  WHERE r.artist_user_id IS NULL
), artist_profile_name_matches AS (
  SELECT
    r.id AS release_id,
    ap.user_id AS artist_user_id,
    ROW_NUMBER() OVER (PARTITION BY r.id ORDER BY ap.created_at NULLS LAST, ap.user_id) AS rn
  FROM soundpub.releases r
  JOIN soundpub.profiles p
    ON p.parent_label_id = r.label_id
  JOIN soundpub.user_roles ur
    ON ur.user_id = p.id
   AND ur.role = 'artist'::soundpub.app_role
  JOIN soundpub.artist_profiles ap
    ON ap.user_id = p.id
   AND lower(trim(ap.artist_name)) = lower(trim(r.artist_name))
  WHERE r.artist_user_id IS NULL
), release_matches AS (
  SELECT release_id, artist_user_id FROM profile_name_matches WHERE rn = 1
  UNION ALL
  SELECT release_id, artist_user_id FROM artist_profile_name_matches WHERE rn = 1
)
UPDATE soundpub.releases r
SET artist_user_id = m.artist_user_id
FROM release_matches m
WHERE r.id = m.release_id
  AND r.artist_user_id IS NULL;

-- 2. Backfill track artist_user_id from release first.
UPDATE soundpub.tracks t
SET artist_user_id = r.artist_user_id
FROM soundpub.releases r
WHERE t.release_id = r.id
  AND t.artist_user_id IS NULL
  AND r.artist_user_id IS NOT NULL;

-- 3. Backfill remaining track artist_user_id by track artist name under release label.
WITH track_profile_matches AS (
  SELECT
    t.id AS track_id,
    p.id AS artist_user_id,
    ROW_NUMBER() OVER (PARTITION BY t.id ORDER BY p.created_at NULLS LAST, p.id) AS rn
  FROM soundpub.tracks t
  JOIN soundpub.releases r ON r.id = t.release_id
  JOIN soundpub.profiles p
    ON p.parent_label_id = r.label_id
   AND lower(trim(p.full_name)) = lower(trim(t.artist_name))
  JOIN soundpub.user_roles ur
    ON ur.user_id = p.id
   AND ur.role = 'artist'::soundpub.app_role
  WHERE t.artist_user_id IS NULL
), track_artist_profile_matches AS (
  SELECT
    t.id AS track_id,
    ap.user_id AS artist_user_id,
    ROW_NUMBER() OVER (PARTITION BY t.id ORDER BY ap.created_at NULLS LAST, ap.user_id) AS rn
  FROM soundpub.tracks t
  JOIN soundpub.releases r ON r.id = t.release_id
  JOIN soundpub.profiles p ON p.parent_label_id = r.label_id
  JOIN soundpub.user_roles ur
    ON ur.user_id = p.id
   AND ur.role = 'artist'::soundpub.app_role
  JOIN soundpub.artist_profiles ap
    ON ap.user_id = p.id
   AND lower(trim(ap.artist_name)) = lower(trim(t.artist_name))
  WHERE t.artist_user_id IS NULL
), track_matches AS (
  SELECT track_id, artist_user_id FROM track_profile_matches WHERE rn = 1
  UNION ALL
  SELECT track_id, artist_user_id FROM track_artist_profile_matches WHERE rn = 1
)
UPDATE soundpub.tracks t
SET artist_user_id = m.artist_user_id
FROM track_matches m
WHERE t.id = m.track_id
  AND t.artist_user_id IS NULL;

-- 4. Backfill royalties artist_user_id from matching ISRC tracks/release.
WITH royalty_track_matches AS (
  SELECT
    ro.id AS royalty_id,
    COALESCE(t.artist_user_id, r.artist_user_id) AS artist_user_id,
    ROW_NUMBER() OVER (PARTITION BY ro.id ORDER BY t.created_at NULLS LAST, t.id) AS rn
  FROM soundpub.royalties ro
  JOIN soundpub.tracks t
    ON lower(regexp_replace(coalesce(t.isrc, ''), '[^a-zA-Z0-9]', '', 'g')) = lower(regexp_replace(coalesce(ro.isrc, ''), '[^a-zA-Z0-9]', '', 'g'))
  LEFT JOIN soundpub.releases r ON r.id = t.release_id
  WHERE ro.artist_user_id IS NULL
    AND COALESCE(t.artist_user_id, r.artist_user_id) IS NOT NULL
)
UPDATE soundpub.royalties ro
SET artist_user_id = m.artist_user_id
FROM royalty_track_matches m
WHERE ro.id = m.royalty_id
  AND m.rn = 1
  AND ro.artist_user_id IS NULL;

-- 4b. Backfill remaining royalties by artist name under the same label.
WITH royalty_profile_name_matches AS (
  SELECT
    ro.id AS royalty_id,
    p.id AS artist_user_id,
    ROW_NUMBER() OVER (PARTITION BY ro.id ORDER BY p.created_at NULLS LAST, p.id) AS rn
  FROM soundpub.royalties ro
  JOIN soundpub.profiles p
    ON p.parent_label_id = ro.label_user_id
   AND lower(trim(p.full_name)) = lower(trim(COALESCE(ro.artist_name, ro.artist)))
  JOIN soundpub.user_roles ur
    ON ur.user_id = p.id
   AND ur.role = 'artist'::soundpub.app_role
  WHERE ro.artist_user_id IS NULL
    AND ro.label_user_id IS NOT NULL
), royalty_artist_profile_name_matches AS (
  SELECT
    ro.id AS royalty_id,
    ap.user_id AS artist_user_id,
    ROW_NUMBER() OVER (PARTITION BY ro.id ORDER BY ap.created_at NULLS LAST, ap.user_id) AS rn
  FROM soundpub.royalties ro
  JOIN soundpub.profiles p
    ON p.parent_label_id = ro.label_user_id
  JOIN soundpub.user_roles ur
    ON ur.user_id = p.id
   AND ur.role = 'artist'::soundpub.app_role
  JOIN soundpub.artist_profiles ap
    ON ap.user_id = p.id
   AND lower(trim(ap.artist_name)) = lower(trim(COALESCE(ro.artist_name, ro.artist)))
  WHERE ro.artist_user_id IS NULL
    AND ro.label_user_id IS NOT NULL
), royalty_name_matches AS (
  SELECT royalty_id, artist_user_id FROM royalty_profile_name_matches WHERE rn = 1
  UNION ALL
  SELECT royalty_id, artist_user_id FROM royalty_artist_profile_name_matches WHERE rn = 1
)
UPDATE soundpub.royalties ro
SET artist_user_id = m.artist_user_id
FROM royalty_name_matches m
WHERE ro.id = m.royalty_id
  AND ro.artist_user_id IS NULL;

-- 4c. Backfill remaining royalties by globally unique artist profile name.
-- This covers legacy rows where royalty label_name differs from the artist parent label.
WITH unique_profile_artist_names AS (
  SELECT
    lower(trim(p.full_name)) AS normalized_artist_name,
    (array_agg(p.id ORDER BY p.id::text))[1] AS artist_user_id,
    count(DISTINCT p.id) AS candidate_count
  FROM soundpub.profiles p
  JOIN soundpub.user_roles ur
    ON ur.user_id = p.id
   AND ur.role = 'artist'::soundpub.app_role
  WHERE p.full_name IS NOT NULL
  GROUP BY lower(trim(p.full_name))
  HAVING count(DISTINCT p.id) = 1
), unique_artist_profile_names AS (
  SELECT
    lower(trim(ap.artist_name)) AS normalized_artist_name,
    (array_agg(ap.user_id ORDER BY ap.user_id::text))[1] AS artist_user_id,
    count(DISTINCT ap.user_id) AS candidate_count
  FROM soundpub.artist_profiles ap
  JOIN soundpub.user_roles ur
    ON ur.user_id = ap.user_id
   AND ur.role = 'artist'::soundpub.app_role
  WHERE ap.artist_name IS NOT NULL
  GROUP BY lower(trim(ap.artist_name))
  HAVING count(DISTINCT ap.user_id) = 1
), royalty_global_name_matches AS (
  SELECT
    ro.id AS royalty_id,
    COALESCE(up.artist_user_id, uap.artist_user_id) AS artist_user_id
  FROM soundpub.royalties ro
  LEFT JOIN unique_profile_artist_names up
    ON up.normalized_artist_name = lower(trim(COALESCE(ro.artist_name, ro.artist)))
  LEFT JOIN unique_artist_profile_names uap
    ON uap.normalized_artist_name = lower(trim(COALESCE(ro.artist_name, ro.artist)))
  WHERE ro.artist_user_id IS NULL
    AND COALESCE(up.artist_user_id, uap.artist_user_id) IS NOT NULL
)
UPDATE soundpub.royalties ro
SET artist_user_id = m.artist_user_id
FROM royalty_global_name_matches m
WHERE ro.id = m.royalty_id
  AND ro.artist_user_id IS NULL;

-- 5. Recalculate split columns.
UPDATE soundpub.royalties ro
SET
  artist_revenue = CASE
    WHEN ro.artist_user_id IS NULL THEN 0
    WHEN ro.label_user_id = (SELECT id FROM tmp_soundpub_main_label) THEN COALESCE(ro.net_revenue, 0) * 0.70
    ELSE COALESCE(ro.net_revenue, 0) * 0.49
  END,
  label_revenue = CASE
    WHEN ro.label_user_id = (SELECT id FROM tmp_soundpub_main_label) THEN COALESCE(ro.net_revenue, 0) * 0.30
    WHEN ro.artist_user_id IS NULL THEN COALESCE(ro.net_revenue, 0) * 0.70
    ELSE COALESCE(ro.net_revenue, 0) * 0.21
  END,
  soundpub_revenue = CASE
    WHEN ro.label_user_id = (SELECT id FROM tmp_soundpub_main_label) THEN 0
    ELSE COALESCE(ro.net_revenue, 0) * 0.30
  END,
  pendapatan_label_artis = CASE
    WHEN ro.label_user_id = (SELECT id FROM tmp_soundpub_main_label) THEN COALESCE(ro.net_revenue, 0)
    ELSE COALESCE(ro.net_revenue, 0) * 0.70
  END,
  pendapatan_bersih_soundpub = CASE
    WHEN ro.label_user_id = (SELECT id FROM tmp_soundpub_main_label) THEN COALESCE(ro.net_revenue, 0) * 0.30
    ELSE COALESCE(ro.net_revenue, 0) * 0.30
  END;

-- 6. Rebuild royalty-derived balances.
UPDATE soundpub.profiles
SET balance = 0,
    artist_revenue = 0,
    label_revenue = 0,
    updated_at = now();

WITH artist_totals AS (
  SELECT artist_user_id AS user_id, SUM(COALESCE(artist_revenue, 0)) AS amount
  FROM soundpub.royalties
  WHERE artist_user_id IS NOT NULL
  GROUP BY artist_user_id
)
UPDATE soundpub.profiles p
SET balance = p.balance + artist_totals.amount,
    artist_revenue = artist_totals.amount,
    updated_at = now()
FROM artist_totals
WHERE p.id = artist_totals.user_id;

WITH label_totals AS (
  SELECT label_user_id AS user_id, SUM(COALESCE(label_revenue, 0)) AS amount
  FROM soundpub.royalties
  WHERE label_user_id IS NOT NULL
  GROUP BY label_user_id
)
UPDATE soundpub.profiles p
SET balance = p.balance + label_totals.amount,
    label_revenue = label_totals.amount,
    updated_at = now()
FROM label_totals
WHERE p.id = label_totals.user_id;

COMMIT;

-- Verification: labels with zero artist share after backfill.
SELECT
  COALESCE(label_name, '-') AS label_name,
  SUM(COALESCE(net_revenue, 0)) AS total_revenue,
  SUM(COALESCE(artist_revenue, 0)) AS artist_share,
  SUM(COALESCE(label_revenue, 0)) AS label_share,
  SUM(COALESCE(soundpub_revenue, 0)) AS admin_share,
  COUNT(*) FILTER (WHERE artist_user_id IS NULL) AS rows_without_artist_user_id
FROM soundpub.royalties
GROUP BY COALESCE(label_name, '-')
ORDER BY rows_without_artist_user_id DESC, total_revenue DESC;




-- Verification: top unmatched artists after all backfill attempts.
SELECT
  COALESCE(label_name, '-') AS label_name,
  COALESCE(artist_name, artist, '-') AS artist_name,
  COUNT(*) AS total_rows,
  SUM(COALESCE(net_revenue, 0)) AS total_revenue
FROM soundpub.royalties
WHERE artist_user_id IS NULL
GROUP BY COALESCE(label_name, '-'), COALESCE(artist_name, artist, '-')
ORDER BY total_rows DESC, total_revenue DESC
LIMIT 50;


