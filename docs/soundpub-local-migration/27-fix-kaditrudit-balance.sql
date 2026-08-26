-- REBUILD BALANCE UNTUK KADITRUDIT SAJA
-- This fixes the gap between profiles.balance and royalties sum

BEGIN;

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
  WHERE label_user_id = '442b47f0-29ab-43de-97d8-49007f7d313f'
  GROUP BY label_user_id
) label_totals
WHERE p.id = label_totals.label_user_id;

SELECT 
  'Updated KADITRUDIT balance' AS status,
  p.id,
  p.full_name,
  p.balance::numeric(14,2) AS new_balance,
  p.label_revenue::numeric(14,2) AS new_label_rev
FROM Soundpub.profiles p
WHERE p.id = '442b47f0-29ab-43de-97d8-49007f7d313f';

COMMIT;
