-- ========================================
-- COMPREHENSIVE BACKEND INVESTIGATION
-- ========================================

-- 1. Check what dashboard query should return for KADITRUDIT
-- (This mimics Dashboard.tsx line 173-175)
SELECT
  'Dashboard Query Test' AS test_name,
  'KADITRUDIT' AS label_name,
  p.id AS label_user_id,
  COUNT(*) AS royalty_rows_found,
  SUM(r.net_revenue)::numeric(14,2) AS should_be_total_revenue,
  SUM(r.label_revenue)::numeric(14,2) AS should_be_balance
FROM soundpub.profiles p
LEFT JOIN soundpub.royalties r ON r.label_user_id = p.id
WHERE p.full_name = 'KADITRUDIT'
GROUP BY p.id;

-- 2. Check if royalties for KADITRUDIT have proper label_user_id
-- (find orphan rows - label_name KADITRUDIT but label_user_id wrong/null)
SELECT
  'Orphan Rows Check' AS test_name,
  COUNT(*) AS orphan_count,
  COUNT(CASE WHEN label_user_id IS NULL THEN 1 END) AS null_label_user_id,
  COUNT(CASE WHEN label_user_id IS NOT NULL THEN 1 END) AS has_label_user_id,
  SUM(CASE WHEN label_user_id IS NULL THEN label_revenue ELSE 0 END)::numeric(14,2) AS orphan_revenue
FROM soundpub.royalties
WHERE label_name = 'KADITRUDIT'
  OR label_name ILIKE '%KADITRUDIT%';

-- 3. Check if artist_user_id is populated correctly
-- (if artist_user_id is NULL, artist_revenue will be 0 always)
SELECT
  'Artist Mapping Check' AS test_name,
  COUNT(*) AS total_royalty_rows,
  COUNT(CASE WHEN artist_user_id IS NOT NULL THEN 1 END) AS with_artist_id,
  COUNT(CASE WHEN artist_user_id IS NULL THEN 1 END) AS null_artist_id,
  SUM(CASE WHEN artist_user_id IS NULL THEN net_revenue ELSE 0 END)::numeric(14,2) AS revenue_without_artist
FROM soundpub.royalties;

-- 4. Check RLS on royalties table
-- (verify authenticated user can read royalties)
SELECT
  'RLS Policies Check' AS test_name,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'royalties'
  AND schemaname = 'soundpub';

-- 5. Sample check - first 5 royalty rows for KADITRUDIT
-- (inspect actual data quality)
SELECT
  'Sample Royalty Data' AS test_name,
  r.id,
  r.period,
  r.label_name,
  r.label_user_id,
  r.artist_name,
  r.artist_user_id,
  r.net_revenue::numeric(14,2),
  r.artist_revenue::numeric(14,2),
  r.label_revenue::numeric(14,2)
FROM soundpub.royalties r
WHERE r.label_name = 'KADITRUDIT'
LIMIT 5;
