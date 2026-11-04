BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '45s';
WITH allocations AS (
  SELECT artist_user_id id, artist_revenue amount, artist_revenue artist, 0::numeric label FROM soundpub.royalties
  UNION ALL
  SELECT label_user_id, label_revenue, 0::numeric, label_revenue FROM soundpub.royalties
), totals AS (
  SELECT id, sum(amount) amount, sum(artist) artist, sum(label) label FROM allocations GROUP BY id
), reserved AS (
  SELECT profile_id id, sum(reservation.amount) amount FROM soundpub.payout_balance_reservations reservation
  JOIN soundpub.payout_requests payout ON payout.id = reservation.payout_id
  WHERE payout.status IN ('pending','approved','paid') GROUP BY profile_id
), adjustments AS (
  SELECT profile_id id, sum(amount) amount FROM soundpub.balance_adjustments GROUP BY profile_id
), profiles AS (
  SELECT profile.*, coalesce(totals.amount,0) + coalesce(adjustments.amount,0) - coalesce(reserved.amount,0) expected,
    coalesce(totals.artist,0) expected_artist, coalesce(totals.label,0) expected_label
  FROM soundpub.profiles profile LEFT JOIN totals USING(id) LEFT JOIN reserved USING(id) LEFT JOIN adjustments USING(id)
), checks AS (
  SELECT 'balance' check_name, count(*) failures FROM profiles WHERE balance IS DISTINCT FROM expected
  UNION ALL SELECT 'artist_balance',count(*) FROM profiles WHERE artist_revenue IS DISTINCT FROM expected_artist
  UNION ALL SELECT 'label_balance',count(*) FROM profiles WHERE label_revenue IS DISTINCT FROM expected_label
  UNION ALL SELECT 'negative_balance',count(*) FROM profiles WHERE balance < 0
  UNION ALL SELECT 'allocation',count(*) FROM soundpub.royalties WHERE net_revenue IS DISTINCT FROM coalesce(artist_revenue,0)+coalesce(label_revenue,0)+coalesce(soundpub_revenue,0)
  UNION ALL SELECT 'recipient',count(*) FROM soundpub.royalties WHERE artist_user_id IS NULL OR label_user_id IS NULL
  UNION ALL SELECT 'reservation_amount',count(*) FROM soundpub.payout_requests payout WHERE status IN ('pending','approved','paid') AND amount IS DISTINCT FROM (SELECT coalesce(sum(amount),0) FROM soundpub.payout_balance_reservations WHERE payout_id=payout.id)
  UNION ALL SELECT 'paid_without_reservation',count(*) FROM soundpub.payout_requests payout WHERE status='paid' AND NOT EXISTS (SELECT FROM soundpub.payout_balance_reservations WHERE payout_id=payout.id)
  UNION ALL SELECT 'paid_without_proof_path',count(*) FROM soundpub.payout_requests WHERE status='paid' AND nullif(payment_proof_path,'') IS NULL
  UNION ALL SELECT 'orphan_composer_upload',count(*) FROM soundpub.composer_royalties composer WHERE upload_id IS NOT NULL AND NOT EXISTS (SELECT FROM soundpub.royalty_uploads WHERE id=composer.upload_id)
  UNION ALL SELECT 'duplicate_release_invoice',count(*) FROM (SELECT xendit_invoice_id FROM soundpub.release_payments WHERE xendit_invoice_id IS NOT NULL GROUP BY 1 HAVING count(*)>1) duplicate
  UNION ALL SELECT 'duplicate_copyright_invoice',count(*) FROM (SELECT xendit_invoice_id FROM soundpub.copyright_registration_payments WHERE xendit_invoice_id IS NOT NULL GROUP BY 1 HAVING count(*)>1) duplicate
  UNION ALL SELECT 'cross_domain_invoice',count(*) FROM soundpub.release_payments JOIN soundpub.copyright_registration_payments USING(xendit_invoice_id)
  UNION ALL SELECT 'paid_without_timestamp',count(*) FROM soundpub.release_payments WHERE status='paid' AND paid_at IS NULL
  UNION ALL SELECT 'paid_without_provider',count(*) FROM soundpub.release_payments WHERE status='paid' AND xendit_invoice_id IS NULL
  UNION ALL SELECT 'paid_without_invoice_number',count(*) FROM soundpub.release_payments WHERE status='paid' AND nullif(invoice_number,'') IS NULL
  UNION ALL SELECT 'paid_without_pdf_path',count(*) FROM soundpub.release_payments WHERE status='paid' AND nullif(invoice_pdf_path,'') IS NULL
  UNION ALL SELECT 'missing_source_row',count(*) FROM soundpub.royalties WHERE source_row_number IS NULL
  UNION ALL SELECT 'missing_upload_replay_key',count(*) FROM soundpub.royalty_uploads WHERE idempotency_key IS NULL
  UNION ALL SELECT 'upload_inserted_count',count(*) FROM soundpub.royalty_uploads upload WHERE status='success' AND inserted_records IS DISTINCT FROM (SELECT count(*) FROM soundpub.royalties WHERE upload_id=upload.id)
)
SELECT check_name, failures, CASE WHEN failures=0 THEN 'PASS' ELSE 'FAIL' END result,
  count(*) FILTER (WHERE failures=0) OVER () passed_checks,
  count(*) FILTER (WHERE failures<>0) OVER () failed_checks FROM checks ORDER BY check_name;
ROLLBACK;
