-- Verify dashboard role revenue/balance directly from soundpub.royalties.
-- This mirrors the frontend rule:
-- Artist: Total Revenue = SUM(net_revenue), Balance = SUM(artist_revenue)
-- Label:  Total Revenue = SUM(net_revenue), Balance = SUM(label_revenue)

-- Replace this UUID with the profile id you want to verify.
-- Example:
-- \set profile_id '00000000-0000-0000-0000-000000000000'

-- Artist calculation by user id
SELECT
  'artist_dashboard_expected' AS check_name,
  p.id,
  p.full_name,
  SUM(r.net_revenue)::numeric(14,2) AS total_revenue,
  SUM(r.artist_revenue)::numeric(14,2) AS balance,
  COUNT(*) AS royalty_rows,
  COUNT(DISTINCT r.isrc) AS tracks
FROM soundpub.profiles p
JOIN soundpub.royalties r ON r.artist_user_id = p.id
GROUP BY p.id, p.full_name
ORDER BY balance DESC NULLS LAST
LIMIT 50;

-- Label calculation by user id
SELECT
  'label_dashboard_expected' AS check_name,
  p.id,
  p.full_name,
  SUM(r.net_revenue)::numeric(14,2) AS total_revenue,
  SUM(r.label_revenue)::numeric(14,2) AS balance,
  COUNT(*) AS royalty_rows,
  COUNT(DISTINCT r.isrc) AS tracks
FROM soundpub.profiles p
JOIN soundpub.royalties r ON r.label_user_id = p.id
GROUP BY p.id, p.full_name
ORDER BY balance DESC NULLS LAST
LIMIT 50;

-- Profiles whose stored balance differs from royalty-derived balance.
-- This is expected if profile.balance is stale, but dashboard now uses royalty-derived value for non-admin roles.
WITH role_totals AS (
  SELECT
    p.id,
    p.full_name,
    ur.role::text AS role,
    COALESCE(SUM(r_artist.artist_revenue), 0) AS artist_balance,
    COALESCE(SUM(r_label.label_revenue), 0) AS label_balance
  FROM soundpub.profiles p
  JOIN soundpub.user_roles ur ON ur.user_id = p.id
  LEFT JOIN soundpub.royalties r_artist ON r_artist.artist_user_id = p.id
  LEFT JOIN soundpub.royalties r_label ON r_label.label_user_id = p.id
  WHERE ur.role IN ('artist', 'label', 'whitelabel')
  GROUP BY p.id, p.full_name, ur.role
)
SELECT
  'stored_profile_balance_mismatch' AS check_name,
  rt.id,
  rt.full_name,
  rt.role,
  p.balance::numeric(14,2) AS stored_profile_balance,
  CASE
    WHEN rt.role = 'artist' THEN rt.artist_balance
    ELSE rt.label_balance
  END::numeric(14,2) AS royalty_derived_balance,
  (p.balance - CASE WHEN rt.role = 'artist' THEN rt.artist_balance ELSE rt.label_balance END)::numeric(14,2) AS diff
FROM role_totals rt
JOIN soundpub.profiles p ON p.id = rt.id
WHERE ABS(p.balance - CASE WHEN rt.role = 'artist' THEN rt.artist_balance ELSE rt.label_balance END) > 0.01
ORDER BY ABS(p.balance - CASE WHEN rt.role = 'artist' THEN rt.artist_balance ELSE rt.label_balance END) DESC
LIMIT 50;
