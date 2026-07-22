-- Migration: Email & Notification System - Critical Fixes
-- Created: 2026-07-22
-- Purpose: Fix critical performance and schema issues identified in audit

-- =====================================================
-- PART 1: Add Missing Indexes (CRITICAL - Performance)
-- =====================================================

-- Notifications table indexes
CREATE INDEX IF NOT EXISTS idx_notifications_is_read 
  ON soundpub.notifications(is_read);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at 
  ON soundpub.notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_is_global 
  ON soundpub.notifications(is_global);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
  ON soundpub.notifications(user_id, is_read, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_global_recent 
  ON soundpub.notifications(is_global, created_at DESC, is_read)
  WHERE is_global = true;

-- Email send log indexes (if not exist)
CREATE INDEX IF NOT EXISTS idx_email_send_log_status 
  ON soundpub.email_send_log(status);

CREATE INDEX IF NOT EXISTS idx_email_send_log_template 
  ON soundpub.email_send_log(template_name);

CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient 
  ON soundpub.email_send_log(recipient_user_id);

CREATE INDEX IF NOT EXISTS idx_email_send_log_created_at 
  ON soundpub.email_send_log(created_at DESC);

-- =====================================================
-- PART 2: Add Notification Enhancements
-- =====================================================

-- Add priority field for future use
ALTER TABLE soundpub.notifications
ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal'
  CHECK (priority IN ('critical', 'high', 'normal', 'low'));

-- Add email status tracking
ALTER TABLE soundpub.notifications
ADD COLUMN IF NOT EXISTS email_sent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
ADD COLUMN IF NOT EXISTS email_error text;

-- Add thread_id for grouping related notifications
ALTER TABLE soundpub.notifications
ADD COLUMN IF NOT EXISTS thread_id uuid;

-- Create index on thread_id
CREATE INDEX IF NOT EXISTS idx_notifications_thread 
  ON soundpub.notifications(thread_id)
  WHERE thread_id IS NOT NULL;

-- =====================================================
-- PART 3: Notification Retention & Cleanup
-- =====================================================

-- Function to cleanup old read notifications
CREATE OR REPLACE FUNCTION soundpub.cleanup_old_notifications(
  _days_old int DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = soundpub
AS $$
DECLARE
  _deleted_count int;
  _cutoff_date timestamptz;
BEGIN
  _cutoff_date := now() - (_days_old || ' days')::interval;
  
  -- Archive to separate table first (optional)
  INSERT INTO soundpub.notifications_archive
  SELECT *, now() as archived_at
  FROM soundpub.notifications
  WHERE is_read = true 
    AND created_at < _cutoff_date
    AND priority != 'critical'; -- Keep critical notifications longer
  
  -- Delete old read notifications
  DELETE FROM soundpub.notifications
  WHERE is_read = true 
    AND created_at < _cutoff_date
    AND priority != 'critical';
  
  GET DIAGNOSTICS _deleted_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', _deleted_count,
    'cutoff_date', _cutoff_date
  );
END;
$$;

-- Archive table for old notifications
CREATE TABLE IF NOT EXISTS soundpub.notifications_archive (
  LIKE soundpub.notifications INCLUDING ALL,
  archived_at timestamptz DEFAULT now()
);

-- Grant permissions
GRANT EXECUTE ON FUNCTION soundpub.cleanup_old_notifications TO service_role;

-- =====================================================
-- PART 4: Email Queue System
-- =====================================================

-- Email queue table for rate limiting and retry
CREATE TABLE IF NOT EXISTS soundpub.email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL,
  recipient_email text NOT NULL,
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  template_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  priority int DEFAULT 5, -- 1=highest, 10=lowest
  retry_count int DEFAULT 0,
  max_retries int DEFAULT 3,
  scheduled_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  failed_at timestamptz,
  error_message text,
  idempotency_key text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for email queue
CREATE INDEX IF NOT EXISTS idx_email_queue_status 
  ON soundpub.email_queue(status, scheduled_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_email_queue_idempotency 
  ON soundpub.email_queue(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_queue_priority 
  ON soundpub.email_queue(priority, scheduled_at)
  WHERE status = 'pending';

-- RLS for email queue
ALTER TABLE soundpub.email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email queue"
  ON soundpub.email_queue FOR SELECT
  TO authenticated
  USING (soundpub.is_admin(auth.uid()));

CREATE POLICY "Service role can manage email queue"
  ON soundpub.email_queue FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to enqueue email
CREATE OR REPLACE FUNCTION soundpub.enqueue_email(
  _template_name text,
  _recipient_email text,
  _recipient_user_id uuid,
  _template_data jsonb,
  _idempotency_key text DEFAULT NULL,
  _priority int DEFAULT 5
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = soundpub
AS $$
DECLARE
  _queue_id uuid;
BEGIN
  -- Check idempotency
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _queue_id
    FROM soundpub.email_queue
    WHERE idempotency_key = _idempotency_key
      AND status IN ('pending', 'sent')
    LIMIT 1;
    
    IF FOUND THEN
      RETURN _queue_id; -- Already queued
    END IF;
  END IF;
  
  -- Insert to queue
  INSERT INTO soundpub.email_queue (
    template_name,
    recipient_email,
    recipient_user_id,
    template_data,
    priority,
    idempotency_key
  ) VALUES (
    _template_name,
    _recipient_email,
    _recipient_user_id,
    _template_data,
    _priority,
    _idempotency_key
  )
  RETURNING id INTO _queue_id;
  
  RETURN _queue_id;
END;
$$;

GRANT EXECUTE ON FUNCTION soundpub.enqueue_email TO authenticated;

-- =====================================================
-- PART 5: Email Health Monitoring
-- =====================================================

-- Monitoring view for email health
CREATE OR REPLACE VIEW soundpub.email_health AS
SELECT
  date_trunc('hour', created_at) as hour,
  template_name,
  status,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
  COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
  COUNT(*) FILTER (WHERE status = 'suppressed') as suppressed_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'failed') / 
    NULLIF(COUNT(*), 0), 
    2
  ) as failure_rate_pct
FROM soundpub.email_send_log
WHERE created_at > now() - interval '7 days'
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2, 3;

-- Grant view access
GRANT SELECT ON soundpub.email_health TO authenticated;

-- Function to check email health and alert
CREATE OR REPLACE FUNCTION soundpub.check_email_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = soundpub
AS $$
DECLARE
  _failure_rate numeric;
  _failed_count int;
  _alert jsonb;
BEGIN
  -- Calculate failure rate in last hour
  SELECT 
    COUNT(*) FILTER (WHERE status = 'failed')::numeric / 
    NULLIF(COUNT(*), 0) * 100,
    COUNT(*) FILTER (WHERE status = 'failed')
  INTO _failure_rate, _failed_count
  FROM soundpub.email_send_log
  WHERE created_at > now() - interval '1 hour';
  
  -- Alert if failure rate > 10%
  IF _failure_rate > 10 AND _failed_count > 5 THEN
    _alert := jsonb_build_object(
      'severity', 'high',
      'message', 'Email failure rate above 10%',
      'failure_rate', _failure_rate,
      'failed_count', _failed_count,
      'timestamp', now()
    );
    
    -- Create admin notification
    INSERT INTO soundpub.notifications (
      type,
      title,
      message,
      is_global,
      priority,
      metadata
    ) VALUES (
      'error',
      '⚠️ High Email Failure Rate',
      format('Email failure rate: %.1f%% (%s failures in last hour)', _failure_rate, _failed_count),
      true,
      'high',
      _alert
    );
    
    RETURN _alert;
  END IF;
  
  RETURN jsonb_build_object(
    'status', 'healthy',
    'failure_rate', COALESCE(_failure_rate, 0),
    'failed_count', COALESCE(_failed_count, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION soundpub.check_email_health TO service_role;

-- =====================================================
-- PART 6: Update Timestamps Trigger
-- =====================================================

-- Trigger for email_queue updated_at
CREATE OR REPLACE FUNCTION soundpub.update_email_queue_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_queue_updated_at ON soundpub.email_queue;
CREATE TRIGGER trg_email_queue_updated_at
  BEFORE UPDATE ON soundpub.email_queue
  FOR EACH ROW
  EXECUTE FUNCTION soundpub.update_email_queue_timestamp();

-- =====================================================
-- PART 7: Comments for Documentation
-- =====================================================

COMMENT ON INDEX idx_notifications_user_unread IS 'Optimizes user notification list queries with unread filter';
COMMENT ON INDEX idx_notifications_global_recent IS 'Optimizes global notification broadcast queries';
COMMENT ON TABLE soundpub.email_queue IS 'Queue system for rate-limited email sending with retry logic';
COMMENT ON FUNCTION soundpub.cleanup_old_notifications IS 'Cleanup old read notifications to prevent database bloat';
COMMENT ON FUNCTION soundpub.enqueue_email IS 'Enqueue email for sending with idempotency and priority';
COMMENT ON FUNCTION soundpub.check_email_health IS 'Monitor email sending health and alert on high failure rates';
COMMENT ON VIEW soundpub.email_health IS 'Real-time email sending health metrics';

-- =====================================================
-- Success Message
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Email & Notification system fixes applied successfully';
  RAISE NOTICE '📊 Added 10+ indexes for performance';
  RAISE NOTICE '📧 Created email queue system';
  RAISE NOTICE '🔍 Added monitoring & health checks';
  RAISE NOTICE '🧹 Added cleanup functions';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Run: SELECT soundpub.cleanup_old_notifications(90);';
  RAISE NOTICE '2. Schedule cleanup job (daily/weekly)';
  RAISE NOTICE '3. Schedule health check (hourly)';
  RAISE NOTICE '4. Update frontend error handling';
END $$;
