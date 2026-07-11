CREATE SCHEMA IF NOT EXISTS soundpub;

-- app_settings
CREATE TABLE soundpub.app_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text UNIQUE NOT NULL,
    value text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- artist_profiles
CREATE TABLE soundpub.artist_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_name text NOT NULL,
  artist_type text NOT NULL DEFAULT 'solo',
  bio text,
  genre text,
  social_links jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- audit_logs
CREATE TABLE soundpub.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  actor_id UUID NOT NULL,
  target_id UUID,
  target_type TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- composer_royalties
CREATE TABLE IF NOT EXISTS soundpub.composer_royalties (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    composer_id TEXT NOT NULL,
    composer_name TEXT NOT NULL,
    total_net_royalti NUMERIC(18,2) NOT NULL DEFAULT 0,
    period TEXT,
    upload_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- email_send_log
CREATE TABLE IF NOT EXISTS soundpub.email_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL,
  recipient_email text NOT NULL,
  recipient_user_id uuid,
  status text NOT NULL,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- notifications
CREATE TABLE soundpub.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_global BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- release_payments
CREATE TABLE soundpub.release_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  release_id UUID NOT NULL REFERENCES soundpub.releases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'IDR',
  track_count INTEGER NOT NULL DEFAULT 1,
  price_per_track NUMERIC(18,2) NOT NULL DEFAULT 50000,
  xendit_invoice_id TEXT,
  xendit_invoice_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- storage_backup_log
CREATE TABLE IF NOT EXISTS soundpub.storage_backup_log (
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

-- storage_backup_runs
CREATE TABLE IF NOT EXISTS soundpub.storage_backup_runs (
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


-- artists
CREATE TABLE IF NOT EXISTS soundpub.artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id uuid REFERENCES soundpub.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);


-- =============================================
-- RLS POLICIES FOR MISSING TABLES
-- =============================================

-- APP_SETTINGS
ALTER TABLE soundpub.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins can manage app settings"
ON soundpub.app_settings FOR ALL
USING (soundpub.has_role(auth.uid(), 'superadmin'::soundpub.app_role));
CREATE POLICY "Anyone can view app settings"
ON soundpub.app_settings FOR SELECT
USING (true);

-- ARTIST_PROFILES
ALTER TABLE soundpub.artist_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own artist profile"
ON soundpub.artist_profiles FOR SELECT
TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "Users can update own artist profile"
ON soundpub.artist_profiles FOR UPDATE
TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "Users can insert own artist profile"
ON soundpub.artist_profiles FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can manage all artist profiles"
ON soundpub.artist_profiles FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

-- ARTISTS
ALTER TABLE soundpub.artists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Labels can manage their artists"
ON soundpub.artists FOR ALL
TO authenticated
USING (label_id = auth.uid());
CREATE POLICY "Admins can manage all artists"
ON soundpub.artists FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

-- AUDIT_LOGS
ALTER TABLE soundpub.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view audit logs"
ON soundpub.audit_logs FOR SELECT
TO authenticated
USING (soundpub.is_admin(auth.uid()));

-- COMPOSER_ROYALTIES
ALTER TABLE soundpub.composer_royalties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage composer royalties"
ON soundpub.composer_royalties FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

-- EMAIL_SEND_LOG
ALTER TABLE soundpub.email_send_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view email logs"
ON soundpub.email_send_log FOR SELECT
TO authenticated
USING (soundpub.is_admin(auth.uid()));

-- NOTIFICATIONS
ALTER TABLE soundpub.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own and global notifications"
ON soundpub.notifications FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR is_global = true);
CREATE POLICY "Users can update own notifications"
ON soundpub.notifications FOR UPDATE
TO authenticated
USING (user_id = auth.uid() OR is_global = true);
CREATE POLICY "Admins can manage all notifications"
ON soundpub.notifications FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

-- RELEASE_PAYMENTS
ALTER TABLE soundpub.release_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own payments"
ON soundpub.release_payments FOR SELECT
TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "Users can insert their own payments"
ON soundpub.release_payments FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can manage all payments"
ON soundpub.release_payments FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

-- STORAGE_BACKUP_LOG
ALTER TABLE soundpub.storage_backup_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage backup logs"
ON soundpub.storage_backup_log FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

-- STORAGE_BACKUP_RUNS
ALTER TABLE soundpub.storage_backup_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage backup runs"
ON soundpub.storage_backup_runs FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_soundpub_artist_profiles_user_id ON soundpub.artist_profiles(user_id);
CREATE INDEX idx_soundpub_artists_label_id ON soundpub.artists(label_id);
CREATE INDEX idx_soundpub_audit_logs_actor_id ON soundpub.audit_logs(actor_id);
CREATE INDEX idx_soundpub_audit_logs_target_id ON soundpub.audit_logs(target_id);
CREATE INDEX idx_soundpub_composer_royalties_upload_id ON soundpub.composer_royalties(upload_id);
CREATE INDEX idx_soundpub_notifications_user_id ON soundpub.notifications(user_id);
CREATE INDEX idx_soundpub_release_payments_release_id ON soundpub.release_payments(release_id);
CREATE INDEX idx_soundpub_release_payments_user_id ON soundpub.release_payments(user_id);
CREATE INDEX idx_soundpub_email_send_log_recipient_user_id ON soundpub.email_send_log(recipient_user_id);

-- =============================================
-- TRIGGERS
-- =============================================
CREATE TRIGGER update_app_settings_timestamp
BEFORE UPDATE ON soundpub.app_settings
FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();

CREATE TRIGGER update_artist_profiles_timestamp
BEFORE UPDATE ON soundpub.artist_profiles
FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();

CREATE TRIGGER update_artists_timestamp
BEFORE UPDATE ON soundpub.artists
FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();

CREATE TRIGGER update_composer_royalties_timestamp
BEFORE UPDATE ON soundpub.composer_royalties
FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();

CREATE TRIGGER update_release_payments_timestamp
BEFORE UPDATE ON soundpub.release_payments
FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();
