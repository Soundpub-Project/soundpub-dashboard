
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.storage_backup_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bucket TEXT NOT NULL,
  path TEXT NOT NULL,
  size_bytes BIGINT,
  drive_file_id TEXT,
  drive_folder_id TEXT,
  content_hash TEXT,
  source_updated_at TIMESTAMPTZ,
  last_backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bucket, path)
);

CREATE INDEX IF NOT EXISTS idx_storage_backup_log_bucket ON public.storage_backup_log(bucket);

CREATE TABLE IF NOT EXISTS public.storage_backup_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  files_uploaded INTEGER NOT NULL DEFAULT 0,
  files_skipped INTEGER NOT NULL DEFAULT 0,
  errors_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'cron',
  details JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_storage_backup_runs_started ON public.storage_backup_runs(started_at DESC);

ALTER TABLE public.storage_backup_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_backup_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage backup log" ON public.storage_backup_log
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins manage backup runs" ON public.storage_backup_runs
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
