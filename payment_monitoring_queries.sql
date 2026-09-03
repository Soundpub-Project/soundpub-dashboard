-- ============================================================================
-- SQL QUERIES: Webhook & Payment Monitoring
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FIND STUCK PAYMENTS (Pending > 1 hour)
-- ----------------------------------------------------------------------------
SELECT 
  rp.id,
  rp.xendit_invoice_id,
  rp.status,
  rp.amount,
  rp.track_count,
  rp.created_at,
  AGE(NOW(), rp.created_at) as stuck_duration,
  r.title as release_title,
  r.artist_name,
  r.status as release_status,
  p.email as user_email,
  p.full_name as user_name
FROM release_payments rp
JOIN releases r ON r.id = rp.release_id
JOIN profiles p ON p.id = rp.user_id
WHERE rp.status = 'pending'
  AND rp.xendit_invoice_id IS NOT NULL
  AND rp.created_at < NOW() - INTERVAL '1 hour'
ORDER BY rp.created_at DESC;

-- ----------------------------------------------------------------------------
-- 2. PAYMENT STATUS SUMMARY
-- ----------------------------------------------------------------------------
SELECT 
  status,
  COUNT(*) as count,
  SUM(amount) as total_amount,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM release_payments
GROUP BY status
ORDER BY count DESC;

-- ----------------------------------------------------------------------------
-- 3. RECENT PAYMENT ACTIVITY (Last 24 hours)
-- ----------------------------------------------------------------------------
SELECT 
  rp.xendit_invoice_id,
  rp.status,
  rp.amount,
  rp.created_at,
  rp.paid_at,
  CASE 
    WHEN rp.paid_at IS NOT NULL THEN AGE(rp.paid_at, rp.created_at)
    ELSE NULL
  END as payment_duration,
  r.title as release_title,
  p.email as user_email
FROM release_payments rp
JOIN releases r ON r.id = rp.release_id
JOIN profiles p ON p.id = rp.user_id
WHERE rp.created_at > NOW() - INTERVAL '24 hours'
ORDER BY rp.created_at DESC;

-- ----------------------------------------------------------------------------
-- 4. FIND PAYMENT BY INVOICE ID
-- ----------------------------------------------------------------------------
SELECT 
  rp.*,
  r.title as release_title,
  r.status as release_status,
  p.email as user_email,
  p.full_name as user_name
FROM release_payments rp
JOIN releases r ON r.id = rp.release_id
JOIN profiles p ON p.id = rp.user_id
WHERE rp.xendit_invoice_id = 'GANTI_DENGAN_INVOICE_ID';

-- ----------------------------------------------------------------------------
-- 5. PAYMENTS WITHOUT MATCHING RELEASE STATUS
-- ----------------------------------------------------------------------------
-- Find paid payments where release is not pending_paid
SELECT 
  rp.id as payment_id,
  rp.xendit_invoice_id,
  rp.status as payment_status,
  rp.paid_at,
  r.id as release_id,
  r.title as release_title,
  r.status as release_status
FROM release_payments rp
JOIN releases r ON r.id = rp.release_id
WHERE rp.status = 'paid'
  AND r.status != 'pending_paid'
  AND r.status != 'approved'
  AND r.status != 'published';

-- ----------------------------------------------------------------------------
-- 6. EXPORT STUCK PAYMENTS TO CSV (for batch processing)
-- ----------------------------------------------------------------------------
\COPY (
  SELECT 
    rp.xendit_invoice_id,
    rp.amount,
    rp.created_at::text,
    r.title as release_title,
    p.email as user_email
  FROM release_payments rp
  JOIN releases r ON r.id = rp.release_id
  JOIN profiles p ON p.id = rp.user_id
  WHERE rp.status = 'pending'
    AND rp.xendit_invoice_id IS NOT NULL
    AND rp.created_at < NOW() - INTERVAL '1 hour'
  ORDER BY rp.created_at DESC
) TO 'stuck_payments.csv' CSV HEADER;

-- ----------------------------------------------------------------------------
-- 7. CHECK NOTIFICATIONS SENT FOR PAYMENT
-- ----------------------------------------------------------------------------
SELECT 
  n.id,
  n.user_id,
  n.type,
  n.title,
  n.message,
  n.created_at,
  n.read_at,
  p.email as user_email
FROM notifications n
JOIN profiles p ON p.id = n.user_id
WHERE n.metadata->>'release_id' = (
  SELECT release_id::text 
  FROM release_payments 
  WHERE xendit_invoice_id = 'GANTI_DENGAN_INVOICE_ID'
)
ORDER BY n.created_at DESC;

-- ----------------------------------------------------------------------------
-- 8. FAILED WEBHOOK DETECTION (Payment pending but old)
-- ----------------------------------------------------------------------------
SELECT 
  COUNT(*) as stuck_count,
  SUM(amount) as total_stuck_amount
FROM release_payments
WHERE status = 'pending'
  AND xendit_invoice_id IS NOT NULL
  AND created_at < NOW() - INTERVAL '1 hour';

-- ----------------------------------------------------------------------------
-- 9. PAYMENT SUCCESS RATE (Last 7 days)
-- ----------------------------------------------------------------------------
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_payments,
  COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
  COUNT(*) FILTER (WHERE status = 'expired') as expired_count,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'paid') / COUNT(*),
    2
  ) as success_rate_pct
FROM release_payments
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- ----------------------------------------------------------------------------
-- 10. AVERAGE PAYMENT PROCESSING TIME
-- ----------------------------------------------------------------------------
SELECT 
  AVG(AGE(paid_at, created_at)) as avg_processing_time,
  MIN(AGE(paid_at, created_at)) as fastest,
  MAX(AGE(paid_at, created_at)) as slowest,
  COUNT(*) as sample_size
FROM release_payments
WHERE status = 'paid'
  AND paid_at IS NOT NULL
  AND created_at > NOW() - INTERVAL '30 days';

-- ----------------------------------------------------------------------------
-- 11. MANUAL FIX: Update payment status (USE WITH CAUTION)
-- ----------------------------------------------------------------------------
-- Only use this after verifying payment is PAID in Xendit
/*
BEGIN;

-- Update payment status
UPDATE release_payments
SET 
  status = 'paid',
  paid_at = NOW(),
  updated_at = NOW()
WHERE xendit_invoice_id = 'GANTI_DENGAN_INVOICE_ID'
  AND status = 'pending';

-- Update release status
UPDATE releases
SET 
  status = 'pending_paid',
  updated_at = NOW()
WHERE id = (
  SELECT release_id 
  FROM release_payments 
  WHERE xendit_invoice_id = 'GANTI_DENGAN_INVOICE_ID'
)
AND status IN ('draft', 'pending_payment');

-- Create user notification
INSERT INTO notifications (user_id, type, title, message, metadata)
SELECT 
  rp.user_id,
  'success',
  'Pembayaran Berhasil',
  'Pembayaran untuk release "' || r.title || '" berhasil. Admin akan segera mengonfirmasi.',
  jsonb_build_object('release_id', rp.release_id, 'amount', rp.amount)
FROM release_payments rp
JOIN releases r ON r.id = rp.release_id
WHERE rp.xendit_invoice_id = 'GANTI_DENGAN_INVOICE_ID';

-- Create admin notifications
INSERT INTO notifications (user_id, type, title, message, metadata)
SELECT 
  ur.user_id,
  'release',
  'Release Baru Dibayar',
  'Release "' || r.title || '" oleh ' || r.artist_name || ' telah dibayar. Menunggu konfirmasi.',
  jsonb_build_object('release_id', rp.release_id, 'amount', rp.amount)
FROM release_payments rp
JOIN releases r ON r.id = rp.release_id
CROSS JOIN user_roles ur
WHERE rp.xendit_invoice_id = 'GANTI_DENGAN_INVOICE_ID'
  AND ur.role IN ('admin', 'superadmin');

COMMIT;
-- ROLLBACK; -- Use this if you want to undo
*/

-- ----------------------------------------------------------------------------
-- 12. VERIFY FIX WAS SUCCESSFUL
-- ----------------------------------------------------------------------------
SELECT 
  'Payment Status' as check_type,
  rp.status as current_status,
  rp.paid_at,
  CASE 
    WHEN rp.status = 'paid' AND rp.paid_at IS NOT NULL THEN '✅ OK'
    ELSE '❌ ISSUE'
  END as result
FROM release_payments rp
WHERE rp.xendit_invoice_id = 'GANTI_DENGAN_INVOICE_ID'

UNION ALL

SELECT 
  'Release Status' as check_type,
  r.status as current_status,
  NULL as paid_at,
  CASE 
    WHEN r.status IN ('pending_paid', 'approved', 'published') THEN '✅ OK'
    ELSE '❌ ISSUE'
  END as result
FROM releases r
WHERE r.id = (
  SELECT release_id 
  FROM release_payments 
  WHERE xendit_invoice_id = 'GANTI_DENGAN_INVOICE_ID'
)

UNION ALL

SELECT 
  'User Notification' as check_type,
  COUNT(*)::text as current_status,
  NULL as paid_at,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ OK'
    ELSE '❌ MISSING'
  END as result
FROM notifications n
WHERE n.user_id = (
  SELECT user_id 
  FROM release_payments 
  WHERE xendit_invoice_id = 'GANTI_DENGAN_INVOICE_ID'
)
AND n.type = 'success'
AND n.title LIKE '%Pembayaran Berhasil%'

UNION ALL

SELECT 
  'Admin Notification' as check_type,
  COUNT(*)::text as current_status,
  NULL as paid_at,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ OK'
    ELSE '❌ MISSING'
  END as result
FROM notifications n
WHERE n.type = 'release'
AND n.title LIKE '%Release Baru Dibayar%'
AND n.metadata->>'release_id' = (
  SELECT release_id::text 
  FROM release_payments 
  WHERE xendit_invoice_id = 'GANTI_DENGAN_INVOICE_ID'
);

-- ============================================================================
-- MONITORING QUERIES (Run periodically)
-- ============================================================================

-- Check for stuck payments every hour
-- Alert if result > 0
SELECT COUNT(*) as alert_count
FROM release_payments
WHERE status = 'pending'
  AND xendit_invoice_id IS NOT NULL
  AND created_at < NOW() - INTERVAL '1 hour';

-- Check webhook processing health (last 24h)
-- Alert if success_rate < 95%
SELECT 
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'paid') / 
    NULLIF(COUNT(*) FILTER (WHERE status IN ('paid', 'expired', 'failed')), 0),
    2
  ) as success_rate_pct
FROM release_payments
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND xendit_invoice_id IS NOT NULL;

-- ============================================================================
