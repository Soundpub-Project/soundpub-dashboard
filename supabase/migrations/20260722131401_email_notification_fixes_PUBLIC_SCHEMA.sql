-- Migration: Email & Notification System - Critical Fixes (PUBLIC SCHEMA VERSION)
-- Created: 2026-07-22
-- Purpose: Fix critical performance and schema issues for PUBLIC schema
-- USE THIS if your tables are in 'public' schema (not 'soundpub')

-- =====================================================
-- PART 1: Add Missing Indexes (CRITICAL - Performance)
-- =====================================================

-- Notifications table indexes
CREATE INDEX IF NOT EXISTS idx_notifications_is_read 
  ON public.notifications(is_read);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at 
  ON public.notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_is_global 
  ON public.notifications(is_global);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
  ON public.notifications(user_id, is_read, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_global_recent 
  ON public.notifications(is_global, created_at DESC, is_read)
  WHERE is_global = true;

-- Email send log indexes (if not exist)
CREATE INDEX IF NOT EXISTS idx_email_send_log_status 
  ON public.email_send_log(status);

CREATE INDEX IF NOT EXISTS idx_email_send_log_template 
  ON public.email_send_log(template_name);

CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient 
  ON public.email_send_log(recipient_user_id);

CREATE INDEX IF NOT EXISTS idx_email_send_log_created_at 
  ON public.email_send_log(created_at DESC);

-- =====================================================
-- PART 2: Add Notification Enhancements
-- =====================================================

-- Add priority field for future use
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal'
  CHECK (priority IN ('critical', 'high', 'normal', 'low'));

-- Add email status tracking
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS email_sent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
ADD COLUMN IF NOT EXISTS email_error text;

-- Add thread_id for grouping related notifications
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS thread_id uuid;

-- Create index on thread_id
CREATE INDEX IF NOT EXISTS idx_notifications_thread 
  ON public.notifications(thread_id)
  WHERE thread_id IS NOT NULL;

-- =====================================================
-- PART 3: Notification Retention & Cleanup
-- =====================================================

-- Function to cleanup old read notifications
CREATE OR REPLACE FUNCTION public.cleanup_old_notifications(
  _days_old int DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted_count int;
  _cutoff_date timestamptz;
BEGIN
  _cutoff_date := now() - (_days_old || ' days')::interval;
  
  -- Delete old read notifications (keeping critical ones)
  DELETE FROM public.notifications
  WHERE is_read = true 
    AND created_at < _cutoff_date
    AND (priority IS NULL OR priority != 'critical');
  
  GET DIAGNOSTICS _deleted_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', _deleted_count,
    'cutoff_date', _cutoff_date
  );
END;
$$;

-- =====================================================
-- PART 4: Email Health Monitoring
-- =====================================================

-- Monitoring view for email health
CREATE OR REPLACE VIEW public.email_health AS
SELECT
  date_trunc('hour', created_at) as hour,
  template_name,
  status,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
  COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'failed') / 
    NULLIF(COUNT(*), 0), 
    2
  ) as failure_rate_pct
FROM public.email_send_log
WHERE created_at > now() - interval '7 days'
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2, 3;

-- Function to check email health and alert
CREATE OR REPLACE FUNCTION public.check_email_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  FROM public.email_send_log
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
    INSERT INTO public.notifications (
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

-- =====================================================
-- PART 5: Grant Permissions
-- =====================================================

GRANT EXECUTE ON FUNCTION public.cleanup_old_notifications TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_health TO authenticated;
GRANT SELECT ON public.email_health TO authenticated;

-- =====================================================
-- Success Message
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Email & Notification fixes applied (PUBLIC schema)';
  RAISE NOTICE '📊 Added 10+ indexes for performance';
  RAISE NOTICE '🔍 Added monitoring & health checks';
  RAISE NOTICE '🧹 Added cleanup functions';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Verify: SELECT * FROM pg_indexes WHERE tablename = ''notifications'';';
  RAISE NOTICE '2. Test: SELECT public.cleanup_old_notifications(90);';
  RAISE NOTICE '3. Monitor: SELECT * FROM public.email_health;';
END $$;
