-- REBUILD ALL PROFILE BALANCES FROM ROYALTIES SOURCE OF TRUTH
-- This recalculates balance, artist_revenue, label_revenue from the royalties table.
-- Safe to run multiple times - it's idempotent.

BEGIN;

-- 1. Reset all balances to 0 (clean slate)
UPDATE Soundpub.profiles
SET 
  balance = 0,
  artist_revenue = 0,
  label_revenue = 0,
  updated_at = now()
WHERE true;

-- 2. Rebuild artist balances from royalties
UPDATE Soundpub.profiles p
SET 
  artist_revenue = COALESCE(artist_totals.total, 0),
  balance = COALESCE(artist_totals.total, 0),
  updated_at = now()
FROM (
  SELECT 
    artist_user_id,
    SUM(artist_revenue) AS total
  FROM Soundpub.royalties
  WHERE artist_user_id IS NOT NULL
  GROUP BY artist_user_id
) artist_totals
WHERE p.id = artist_totals.artist_user_id;

-- 3. Rebuild label balances from royalties
UPDATE Soundpub.profiles p
SET 
  label_revenue = COALESCE(label_totals.total, 0),
  balance = COALESCE(label_totals.total, 0),
  updated_at = now()
FROM (
  SELECT 
    label_user_id,
    SUM(label_revenue) AS total
  FROM Soundpub.royalties
  WHERE label_user_id IS NOT NULL
  GROUP BY label_user_id
) label_totals
WHERE p.id = label_totals.label_user_id;

-- 4. Report summary
SELECT 
  'Rebuild Complete' AS status,
  COUNT(*) AS total_profiles_updated,
  SUM(balance)::numeric(16,2) AS total_balance,
  SUM(artist_revenue)::numeric(16,2) AS total_artist_revenue,
  SUM(label_revenue)::numeric(16,2) AS total_label_revenue
FROM Soundpub.profiles
WHERE balance > 0 OR artist_revenue > 0 OR label_revenue > 0;

COMMIT;
