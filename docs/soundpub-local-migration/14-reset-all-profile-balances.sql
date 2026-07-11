-- =============================================
-- SOUNDPUB RESET ALL PROFILE BALANCES
-- Run this only if you want to clear all royalty-derived balances.
-- This does not delete users or profiles.
-- =============================================

BEGIN;

-- Reset royalty-derived balances for all profiles.
UPDATE soundpub.profiles
SET
  balance = 0,
  artist_revenue = 0,
  label_revenue = 0,
  updated_at = now();

-- Reset composer royalty totals as well, if you want a full clean slate.
UPDATE soundpub.composer_royalties
SET
  total_net_royalti = 0,
  updated_at = now();

COMMIT;

-- Verification: ensure no remaining non-zero balances.
SELECT
  COUNT(*) AS affected_profiles,
  SUM(COALESCE(balance, 0)) AS total_balance,
  SUM(COALESCE(artist_revenue, 0)) AS total_artist_revenue,
  SUM(COALESCE(label_revenue, 0)) AS total_label_revenue
FROM soundpub.profiles;

SELECT
  COUNT(*) AS affected_composer_rows,
  SUM(COALESCE(total_net_royalti, 0)) AS total_composer_royalty
FROM soundpub.composer_royalties;
