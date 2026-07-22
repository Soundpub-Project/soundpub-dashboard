-- INVESTIGASI: Label KADITRUDIT Balance Mismatch
-- Run this to find why dashboard shows Rp 0 but royalty-summary shows correct data.

-- 1. Check KADITRUDIT profile balance directly
SELECT
  'Profile Balance Check' AS check_name,
  p.id,
  p.full_name,
  p.email,
  p.balance::numeric(14,2) AS stored_balance,
  p.artist_revenue::numeric(14,2) AS stored_artist_rev,
  p.label_revenue::numeric(14,2) AS stored_label_rev,
  p.updated_at
FROM soundpub.profiles p
WHERE p.full_name ILIKE '%KADITRUDIT%'
   OR p.email ILIKE '%kaditrudit%';

-- 2. Check actual royalty data for KADITRUDIT
-- (sum from royalties table - source of truth)
SELECT
  'Royalties Sum Check' AS check_name,
  r.label_user_id,
  p.full_name AS label_name,
  COUNT(*) AS royalty_rows,
  SUM(r.net_revenue)::numeric(14,2) AS total_gross_revenue,
  SUM(r.artist_revenue)::numeric(14,2) AS sum_artist_rev,
  SUM(r.label_revenue)::numeric(14,2) AS sum_label_rev,
  SUM(r.soundpub_revenue)::numeric(14,2) AS sum_admin_rev
FROM soundpub.royalties r
JOIN soundpub.profiles p ON p.id = r.label_user_id
WHERE p.full_name ILIKE '%KADITRUDIT%'
GROUP BY r.label_user_id, p.full_name;

-- 3. Check if there are royalty rows with label_name KADITRUDIT but wrong label_user_id
SELECT
  'Orphan Royalty Check' AS check_name,
  r.label_name,
  r.label_user_id,
  p.full_name AS label_profile_name,
  COUNT(*) AS rows,
  SUM(r.net_revenue)::numeric(14,2) AS total_revenue,
  SUM(r.label_revenue)::numeric(14,2) AS total_label_rev
FROM soundpub.royalties r
LEFT JOIN soundpub.profiles p ON p.id = r.label_user_id
WHERE r.label_name ILIKE '%KADITRUDIT%'
GROUP BY r.label_name, r.label_user_id, p.full_name
ORDER BY rows DESC;

-- 4. Check what the dashboard query SHOULD return for this label
-- (This mirrors what Dashboard.tsx calculates)
WITH label_profile AS (
  SELECT id, full_name, balance, label_revenue
  FROM soundpub.profiles
  WHERE full_name ILIKE '%KADITRUDIT%'
  LIMIT 1
)
SELECT
  'Dashboard Expected Values' AS check_name,
  lp.id AS profile_id,
  lp.full_name,
  lp.balance::numeric(14,2) AS current_profile_balance,
  lp.label_revenue::numeric(14,2) AS current_profile_label_rev,
  COALESCE(SUM(r.net_revenue), 0)::numeric(14,2) AS expected_total_revenue,
  COALESCE(SUM(r.label_revenue), 0)::numeric(14,2) AS expected_balance,
  COUNT(*) AS royalty_count
FROM label_profile lp
LEFT JOIN soundpub.royalties r ON r.label_user_id = lp.id
GROUP BY lp.id, lp.full_name, lp.balance, lp.label_revenue;
