-- Verification: Balance and Total Revenue per role
-- Run this to compare dashboard display vs actual database aggregation

-- 1. Artist balances and revenue from profiles
SELECT 
  '=== ARTIST PROFILES ===' AS section,
  p.id,
  p.full_name,
  p.email,
  p.balance AS profile_balance,
  p.artist_revenue AS profile_artist_revenue,
  p.label_revenue AS profile_label_revenue
FROM soundpub.profiles p
JOIN soundpub.user_roles ur ON ur.user_id = p.id
WHERE ur.role = 'artist'
ORDER BY p.balance DESC NULLS LAST
LIMIT 20;

-- 2. Artist balances calculated from royalties table (source of truth)
SELECT 
  '=== ARTIST FROM ROYALTIES ===' AS section,
  r.artist_user_id,
  p.full_name,
  p.email,
  COUNT(*) AS royalty_rows,
  SUM(r.net_revenue) AS total_gross_revenue,
  SUM(r.artist_revenue) AS sum_artist_revenue,
  SUM(r.label_revenue) AS sum_label_revenue,
  SUM(r.soundpub_revenue) AS sum_admin_revenue
FROM soundpub.royalties r
JOIN soundpub.profiles p ON p.id = r.artist_user_id
WHERE r.artist_user_id IS NOT NULL
GROUP BY r.artist_user_id, p.full_name, p.email
ORDER BY sum_artist_revenue DESC NULLS LAST
LIMIT 20;

-- 3. Label balances from profiles
SELECT 
  '=== LABEL PROFILES ===' AS section,
  p.id,
  p.full_name,
  p.email,
  p.balance AS profile_balance,
  p.artist_revenue AS profile_artist_revenue,
  p.label_revenue AS profile_label_revenue
FROM soundpub.profiles p
JOIN soundpub.user_roles ur ON ur.user_id = p.id
WHERE ur.role IN ('label', 'whitelabel')
ORDER BY p.balance DESC NULLS LAST
LIMIT 20;

-- 4. Label balances calculated from royalties table
SELECT 
  '=== LABEL FROM ROYALTIES ===' AS section,
  r.label_user_id,
  p.full_name,
  p.email,
  COUNT(*) AS royalty_rows,
  SUM(r.net_revenue) AS total_gross_revenue,
  SUM(r.artist_revenue) AS sum_artist_revenue,
  SUM(r.label_revenue) AS sum_label_revenue,
  SUM(r.soundpub_revenue) AS sum_admin_revenue
FROM soundpub.royalties r
JOIN soundpub.profiles p ON p.id = r.label_user_id
WHERE r.label_user_id IS NOT NULL
GROUP BY r.label_user_id, p.full_name, p.email
ORDER BY sum_label_revenue DESC NULLS LAST
LIMIT 20;

-- 5. Mismatch detection: profile balance vs royalties sum
SELECT 
  '=== BALANCE MISMATCH ===' AS section,
  p.id,
  p.full_name,
  ur.role::text,
  p.balance AS profile_balance,
  p.artist_revenue AS profile_artist_rev,
  COALESCE(artist_sum.total, 0) AS royalties_artist_rev,
  p.label_revenue AS profile_label_rev,
  COALESCE(label_sum.total, 0) AS royalties_label_rev,
  (p.balance - COALESCE(artist_sum.total, 0) - COALESCE(label_sum.total, 0)) AS balance_diff
FROM soundpub.profiles p
JOIN soundpub.user_roles ur ON ur.user_id = p.id
LEFT JOIN (
  SELECT artist_user_id, SUM(artist_revenue) AS total
  FROM soundpub.royalties
  WHERE artist_user_id IS NOT NULL
  GROUP BY artist_user_id
) artist_sum ON artist_sum.artist_user_id = p.id
LEFT JOIN (
  SELECT label_user_id, SUM(label_revenue) AS total
  FROM soundpub.royalties
  WHERE label_user_id IS NOT NULL
  GROUP BY label_user_id
) label_sum ON label_sum.label_user_id = p.id
WHERE ur.role IN ('artist', 'label', 'whitelabel')
  AND (
    ABS(p.balance - COALESCE(artist_sum.total, 0) - COALESCE(label_sum.total, 0)) > 0.01
    OR ABS(p.artist_revenue - COALESCE(artist_sum.total, 0)) > 0.01
    OR ABS(p.label_revenue - COALESCE(label_sum.total, 0)) > 0.01
  )
ORDER BY ABS(p.balance - COALESCE(artist_sum.total, 0) - COALESCE(label_sum.total, 0)) DESC
LIMIT 30;
