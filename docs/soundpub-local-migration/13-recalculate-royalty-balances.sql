-- =============================================
-- Soundpub RECALCULATE ROYALTY BALANCES
-- Use after fixing upload/delete royalty logic.
-- Rebuilds balances from current Soundpub.royalties rows.
-- =============================================

BEGIN;

-- Reset only royalty-derived balances. Other profile metadata remains untouched.
UPDATE Soundpub.profiles
SET balance = 0,
    artist_revenue = 0,
    label_revenue = 0;

-- Artist share: 70% of net revenue for rows mapped to an artist.
WITH artist_totals AS (
  SELECT
    artist_user_id AS user_id,
    COALESCE(SUM(COALESCE(artist_revenue, net_revenue * 0.70)), 0) AS artist_amount
  FROM Soundpub.royalties
  WHERE artist_user_id IS NOT NULL
  GROUP BY artist_user_id
)
UPDATE Soundpub.profiles p
SET balance = p.balance + artist_totals.artist_amount,
    artist_revenue = artist_totals.artist_amount
FROM artist_totals
WHERE p.id = artist_totals.user_id;

-- Label/whitelabel share: 21% when artist exists, 91% when no artist account exists.
WITH label_totals AS (
  SELECT
    label_user_id AS user_id,
    COALESCE(SUM(
      CASE
        WHEN artist_user_id IS NULL THEN net_revenue * 0.91
        ELSE net_revenue * 0.21
      END
    ), 0) AS label_amount
  FROM Soundpub.royalties
  WHERE label_user_id IS NOT NULL
  GROUP BY label_user_id
)
UPDATE Soundpub.profiles p
SET balance = p.balance + label_totals.label_amount,
    label_revenue = label_totals.label_amount
FROM label_totals
WHERE p.id = label_totals.user_id;

COMMIT;

-- Verification by role.
SELECT
  ur.role::text AS role,
  COUNT(*) AS users,
  SUM(p.balance) AS total_balance,
  SUM(p.artist_revenue) AS total_artist_revenue,
  SUM(p.label_revenue) AS total_label_revenue
FROM Soundpub.profiles p
JOIN Soundpub.user_roles ur ON ur.user_id = p.id
GROUP BY ur.role
ORDER BY ur.role::text;
