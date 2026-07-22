-- =============================================
-- SOUNDPUB SCHEMA - MIGRATION SCRIPT
-- Execute this in Supabase Studio SQL Editor
-- =============================================

-- 1. CREATE SCHEMA
CREATE SCHEMA IF NOT EXISTS soundpub;

-- 2. CREATE ENUM TYPE
CREATE TYPE soundpub.app_role AS ENUM ('superadmin', 'admin', 'label', 'artist', 'user');

-- 3. CREATE TABLES
CREATE TABLE soundpub.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role soundpub.app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, role)
);

CREATE TABLE soundpub.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    parent_label_id UUID REFERENCES soundpub.profiles(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    balance DECIMAL(18, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE soundpub.releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upc TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    label_id UUID NOT NULL REFERENCES soundpub.profiles(id),
    release_date DATE,
    cover_url TEXT,
    genre TEXT,
    release_type TEXT DEFAULT 'single' CHECK (release_type IN ('single', 'album', 'ep')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'draft', 'inactive')),
    created_by UUID REFERENCES soundpub.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE soundpub.tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_id UUID NOT NULL REFERENCES soundpub.releases(id) ON DELETE CASCADE,
    isrc TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    audio_url TEXT,
    composer TEXT,
    lyricist TEXT,
    lyrics TEXT,
    genre TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE soundpub.royalty_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES soundpub.profiles(id),
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    total_records INTEGER NOT NULL DEFAULT 0,
    inserted_records INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'partial', 'failed')),
    error_message TEXT,
    summary JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE soundpub.royalties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID NOT NULL REFERENCES soundpub.royalty_uploads(id),
    period TEXT NOT NULL,
    isrc TEXT NOT NULL,
    upc TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    label_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    country TEXT NOT NULL,
    sales_type TEXT NOT NULL,
    unit_penjualan INTEGER NOT NULL DEFAULT 0,
    pendapatan_kotor_dsp DECIMAL(18, 2) NOT NULL DEFAULT 0,
    pendapatan_label_artis DECIMAL(18, 2) NOT NULL DEFAULT 0,
    pendapatan_bersih_soundpub DECIMAL(18, 2) NOT NULL DEFAULT 0,
    artist_revenue DECIMAL(18, 2) NOT NULL DEFAULT 0,
    soundpub_revenue DECIMAL(18, 2) NOT NULL DEFAULT 0,
    title TEXT,
    artist TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE soundpub.payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES soundpub.profiles(id),
    amount DECIMAL(18, 2) NOT NULL,
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_holder_name TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
    processed_by UUID REFERENCES soundpub.profiles(id),
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. ENABLE ROW LEVEL SECURITY
ALTER TABLE soundpub.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.royalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.royalty_uploads ENABLE ROW LEVEL SECURITY;

-- =============================================
-- PART 2: HELPER FUNCTIONS
-- =============================================

CREATE OR REPLACE FUNCTION soundpub.has_role(user_id UUID, role soundpub.app_role)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM soundpub.user_roles
    WHERE user_roles.user_id = $1 AND user_roles.role = $2
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = soundpub;

CREATE OR REPLACE FUNCTION soundpub.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN soundpub.has_role($1, 'superadmin'::soundpub.app_role) 
      OR soundpub.has_role($1, 'admin'::soundpub.app_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = soundpub;

CREATE OR REPLACE FUNCTION soundpub.get_user_full_name(user_id UUID)
RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT full_name FROM soundpub.profiles WHERE id = $1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = soundpub;

-- =============================================
-- PART 3: RLS POLICIES
-- =============================================

-- USER ROLES POLICIES
CREATE POLICY "Users can view own roles"
ON soundpub.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
ON soundpub.user_roles FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

-- PROFILES POLICIES
CREATE POLICY "Users can view own profile"
ON soundpub.profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
ON soundpub.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Admins can manage all profiles"
ON soundpub.profiles FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

CREATE POLICY "Labels can view their artists"
ON soundpub.profiles FOR SELECT
TO authenticated
USING (parent_label_id = auth.uid());

-- RELEASES POLICIES
CREATE POLICY "Admins can manage all releases"
ON soundpub.releases FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

CREATE POLICY "Labels can manage own releases"
ON soundpub.releases FOR ALL
TO authenticated
USING (label_id = auth.uid() OR created_by = auth.uid());

CREATE POLICY "Artists can view own releases"
ON soundpub.releases FOR SELECT
TO authenticated
USING (artist_name = soundpub.get_user_full_name(auth.uid()));

-- TRACKS POLICIES
CREATE POLICY "Admins can manage all tracks"
ON soundpub.tracks FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

CREATE POLICY "Labels can manage tracks from own releases"
ON soundpub.tracks FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM soundpub.releases
    WHERE releases.id = tracks.release_id
    AND (releases.label_id = auth.uid() OR releases.created_by = auth.uid())
  )
);

CREATE POLICY "Artists can view own tracks"
ON soundpub.tracks FOR SELECT
TO authenticated
USING (artist_name = soundpub.get_user_full_name(auth.uid()));

-- ROYALTIES POLICIES
CREATE POLICY "Admins can manage all royalties"
ON soundpub.royalties FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

CREATE POLICY "Labels can view their royalties"
ON soundpub.royalties FOR SELECT
TO authenticated
USING (
  soundpub.has_role(auth.uid(), 'label'::soundpub.app_role)
  AND label_name = soundpub.get_user_full_name(auth.uid())
);

CREATE POLICY "Artists can view their royalties"
ON soundpub.royalties FOR SELECT
TO authenticated
USING (
  soundpub.has_role(auth.uid(), 'artist'::soundpub.app_role)
  AND (
    artist_name = soundpub.get_user_full_name(auth.uid())
    OR artist = soundpub.get_user_full_name(auth.uid())
  )
);

-- PAYOUT REQUESTS POLICIES
CREATE POLICY "Admins can manage all payouts"
ON soundpub.payout_requests FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

CREATE POLICY "Users can manage own payouts"
ON soundpub.payout_requests FOR ALL
TO authenticated
USING (user_id = auth.uid());

-- ROYALTY UPLOADS POLICIES
CREATE POLICY "Admins can manage all uploads"
ON soundpub.royalty_uploads FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

CREATE POLICY "Users can view own uploads"
ON soundpub.royalty_uploads FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- =============================================
-- PART 4: TRIGGERS
-- =============================================

-- TIMESTAMP UPDATE TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION soundpub.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_timestamp
BEFORE UPDATE ON soundpub.profiles
FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();

CREATE TRIGGER update_releases_timestamp
BEFORE UPDATE ON soundpub.releases
FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();

CREATE TRIGGER update_tracks_timestamp
BEFORE UPDATE ON soundpub.tracks
FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();

CREATE TRIGGER update_payout_requests_timestamp
BEFORE UPDATE ON soundpub.payout_requests
FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();

CREATE TRIGGER update_royalty_uploads_timestamp
BEFORE UPDATE ON soundpub.royalty_uploads
FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();

-- BALANCE UPDATE ON PAYOUT STATUS CHANGE
CREATE OR REPLACE FUNCTION soundpub.update_balance_on_payout_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
        UPDATE soundpub.profiles
        SET balance = balance - NEW.amount
        WHERE id = NEW.user_id;
    ELSIF OLD.status = 'paid' AND NEW.status != 'paid' THEN
        UPDATE soundpub.profiles
        SET balance = balance + NEW.amount
        WHERE id = NEW.user_id;
    END IF;

    IF NEW.status IN ('approved', 'rejected', 'paid') AND
       (OLD.status IS NULL OR OLD.status NOT IN ('approved', 'rejected', 'paid')) THEN
        NEW.processed_at = NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = soundpub;

CREATE TRIGGER update_balance_on_payout_status_change
BEFORE UPDATE ON soundpub.payout_requests
FOR EACH ROW EXECUTE FUNCTION soundpub.update_balance_on_payout_status_change();

-- AUTO-CREATE PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION soundpub.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO soundpub.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1))
  );

  INSERT INTO soundpub.user_roles (user_id, role)
  VALUES (NEW.id, 'user'::soundpub.app_role);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = soundpub;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION soundpub.handle_new_user();

-- =============================================
-- PART 5: INDEXES
-- =============================================

CREATE INDEX idx_soundpub_user_roles_user_id ON soundpub.user_roles(user_id);
CREATE INDEX idx_soundpub_profiles_parent_label ON soundpub.profiles(parent_label_id);
CREATE INDEX idx_soundpub_releases_label_id ON soundpub.releases(label_id);
CREATE INDEX idx_soundpub_releases_artist_name ON soundpub.releases(artist_name);
CREATE INDEX idx_soundpub_tracks_release_id ON soundpub.tracks(release_id);
CREATE INDEX idx_soundpub_tracks_artist_name ON soundpub.tracks(artist_name);
CREATE INDEX idx_soundpub_royalties_upload_id ON soundpub.royalties(upload_id);
CREATE INDEX idx_soundpub_royalties_artist_name ON soundpub.royalties(artist_name);
CREATE INDEX idx_soundpub_royalties_label_name ON soundpub.royalties(label_name);
CREATE INDEX idx_soundpub_payout_requests_user_id ON soundpub.payout_requests(user_id);
CREATE INDEX idx_soundpub_royalty_uploads_user_id ON soundpub.royalty_uploads(user_id);

-- =============================================
-- MIGRATION COMPLETE
-- =============================================
-- Schema soundpub is ready for use
-- All tables, functions, policies, triggers, and indexes are created

-- =============================================
-- ADDITIONAL TABLES FROM LOVABLE
-- =============================================

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
