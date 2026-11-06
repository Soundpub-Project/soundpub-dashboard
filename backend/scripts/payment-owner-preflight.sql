BEGIN TRANSACTION READ ONLY;

SELECT count(*) AS invoice_count,
  count(*) FILTER (WHERE artist.management_mode = 'LOGIN_ACCOUNT'
    AND artist.artist_user_id = release.artist_user_id
    AND NOT EXISTS (SELECT 1 FROM soundpub.finance_events event
      WHERE event.business_reference=invoice.id::text AND event.kind IN ('PAYMENT_CHARGE','PAYMENT_REFUND')
        AND event.owner_id IS DISTINCT FROM artist.artist_user_id)) AS canonical_login_count,
  count(*) FILTER (WHERE artist.id IS NULL OR artist.management_mode <> 'LOGIN_ACCOUNT'
    OR artist.artist_user_id IS NULL OR artist.artist_user_id IS DISTINCT FROM release.artist_user_id
    OR EXISTS (SELECT 1 FROM soundpub.finance_events event
      WHERE event.business_reference=invoice.id::text AND event.kind IN ('PAYMENT_CHARGE','PAYMENT_REFUND')
        AND event.owner_id IS DISTINCT FROM artist.artist_user_id)) AS blocked_count
FROM soundpub.payment_invoices invoice
LEFT JOIN soundpub.releases release ON release.id = invoice.business_id
LEFT JOIN soundpub.artists artist ON artist.id = release.artist_id;

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM soundpub.payment_invoices invoice
    LEFT JOIN soundpub.releases release ON release.id = invoice.business_id
    LEFT JOIN soundpub.artists artist ON artist.id = release.artist_id
    WHERE artist.id IS NULL OR artist.management_mode <> 'LOGIN_ACCOUNT'
      OR artist.artist_user_id IS NULL
      OR artist.artist_user_id IS DISTINCT FROM release.artist_user_id
      OR EXISTS (SELECT 1 FROM soundpub.finance_events event
        WHERE event.business_reference=invoice.id::text AND event.kind IN ('PAYMENT_CHARGE','PAYMENT_REFUND')
          AND event.owner_id IS DISTINCT FROM artist.artist_user_id)
  ) THEN
    RAISE EXCEPTION 'PAYMENT_OWNER_PREFLIGHT_BLOCKED: resolve legacy ownership with evidence before migration 0057';
  END IF;
END;
$preflight$;

COMMIT;
