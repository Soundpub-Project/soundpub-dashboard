-- =============================================
-- SOUNDPUB ROYALTY SPLIT NORMALIZATION AND RECALC
-- Canonical main label: SOUNDPUB MUSIC
-- Split rules:
--   SOUNDPUB MUSIC: 70% artist, 30% Soundpub label
--   Other label/whitelabel: 49% artist, 21% label, 30% admin
--   Other label/whitelabel without linked artist: 70% label, 30% admin
-- =============================================

BEGIN;

ALTER TABLE soundpub.royalties
ADD COLUMN IF NOT EXISTS label_revenue numeric(18, 2) DEFAULT 0;

-- Canonicalize Soundpub profile name.
UPDATE soundpub.profiles
SET full_name = 'SOUNDPUB MUSIC', updated_at = now()
WHERE id = '423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid;

-- Canonicalize royalties pointing to Soundpub aliases.
UPDATE soundpub.royalties
SET label_user_id = '423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid,
    label_name = 'SOUNDPUB MUSIC'
WHERE lower(trim(coalesce(label_name, ''))) IN ('soundpub', 'soundpub music', 'soundpub music ecosystem')
   OR label_user_id = '423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid;

-- Canonicalize releases pointing to Soundpub aliases by label_id/name where possible.
UPDATE soundpub.releases
SET label_id = '423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid
WHERE label_id = '423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid;

-- Recalculate split columns in royalty rows.
UPDATE soundpub.royalties r
SET
  artist_revenue = CASE
    WHEN r.artist_user_id IS NULL THEN 0
    WHEN r.label_user_id = '423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid THEN COALESCE(r.net_revenue, 0) * 0.70
    ELSE COALESCE(r.net_revenue, 0) * 0.49
  END,
  label_revenue = CASE
    WHEN r.label_user_id = '423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid THEN COALESCE(r.net_revenue, 0) * 0.30
    WHEN r.artist_user_id IS NULL THEN COALESCE(r.net_revenue, 0) * 0.70
    ELSE COALESCE(r.net_revenue, 0) * 0.21
  END,
  soundpub_revenue = CASE
    WHEN r.label_user_id = '423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid THEN 0
    ELSE COALESCE(r.net_revenue, 0) * 0.30
  END,
  pendapatan_kotor_dsp = COALESCE(r.net_revenue, r.pendapatan_kotor_dsp, 0),
  pendapatan_label_artis = CASE
    WHEN r.label_user_id = '423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid THEN COALESCE(r.net_revenue, 0)
    ELSE COALESCE(r.net_revenue, 0) * 0.70
  END,
  pendapatan_bersih_soundpub = CASE
    WHEN r.label_user_id = '423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid THEN COALESCE(r.net_revenue, 0) * 0.30
    ELSE COALESCE(r.net_revenue, 0) * 0.30
  END;

-- Reset royalty-derived balances.
UPDATE soundpub.profiles
SET balance = 0,
    artist_revenue = 0,
    label_revenue = 0,
    updated_at = now();

-- Artist balances from recalculated royalty rows.
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

-- Label/whitelabel balances from recalculated royalty rows.
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

-- Verification: label split must not exceed total revenue.
SELECT
  COALESCE(label_name, '-') AS label_name,
  SUM(COALESCE(net_revenue, 0)) AS total_revenue,
  SUM(COALESCE(artist_revenue, 0)) AS artist_share,
  SUM(COALESCE(label_revenue, 0)) AS label_share,
  SUM(COALESCE(soundpub_revenue, 0)) AS admin_share,
  SUM(COALESCE(artist_revenue, 0) + COALESCE(label_revenue, 0) + COALESCE(soundpub_revenue, 0)) AS distributed_total
FROM soundpub.royalties
GROUP BY COALESCE(label_name, '-')
ORDER BY total_revenue DESC;
