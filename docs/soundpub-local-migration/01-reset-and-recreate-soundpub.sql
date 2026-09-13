-- =============================================
-- Soundpub RESET AND RECREATE
-- WARNING: This deletes all objects/data inside schema Soundpub only.
-- Other schemas remain untouched.
-- =============================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP SCHEMA IF EXISTS Soundpub CASCADE;
CREATE SCHEMA Soundpub;
-- =============================================
-- Soundpub SCHEMA - MIGRATION SCRIPT
-- Execute this in Supabase Studio SQL Editor
-- =============================================

-- 1. CREATE SCHEMA
-- 2. CREATE ENUM TYPE
CREATE TYPE Soundpub.app_role AS ENUM ('superadmin', 'admin', 'label', 'artist', 'user');

-- 3. CREATE TABLES
CREATE TABLE Soundpub.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role Soundpub.app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, role)
);

CREATE TABLE Soundpub.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    parent_label_id UUID REFERENCES Soundpub.profiles(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    balance DECIMAL(18, 2) NOT NULL DEFAULT 0,
    logo_url TEXT,
    logo_url_light TEXT,
    logo_url_dark TEXT,
    label_revenue DECIMAL(18, 2) NOT NULL DEFAULT 0,
    artist_revenue DECIMAL(18, 2) NOT NULL DEFAULT 0,
    password_set BOOLEAN DEFAULT true,
    subscription_status TEXT,
    subscription_upgraded_at TIMESTAMP WITH TIME ZONE,
    composer_code TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE Soundpub.releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upc TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    label_id UUID NOT NULL REFERENCES Soundpub.profiles(id),
    release_date DATE,
    cover_url TEXT,
    genre TEXT,
    release_type TEXT DEFAULT 'single' CHECK (release_type IN ('single', 'album', 'ep')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'draft', 'inactive')),
    created_by UUID REFERENCES Soundpub.profiles(id),
    archived_at TIMESTAMP WITH TIME ZONE,
    artist_user_id UUID REFERENCES Soundpub.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE Soundpub.tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_id UUID NOT NULL REFERENCES Soundpub.releases(id) ON DELETE CASCADE,
    isrc TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    audio_url TEXT,
    composer TEXT,
    lyricist TEXT,
    lyrics TEXT,
    genre TEXT,
    artists JSONB DEFAULT '[]'::jsonb,
    explicit_lyrics BOOLEAN DEFAULT false,
    contributors JSONB DEFAULT '[]'::jsonb,
    video_url TEXT,
    clip_url TEXT,
    duration INTEGER,
    artist_user_id UUID REFERENCES Soundpub.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE Soundpub.royalty_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES Soundpub.profiles(id),
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    total_records INTEGER NOT NULL DEFAULT 0,
    inserted_records INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'success', 'partial', 'failed')),
    error_message TEXT,
    summary JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE Soundpub.royalties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID NOT NULL REFERENCES Soundpub.royalty_uploads(id),
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
    pendapatan_bersih_Soundpub DECIMAL(18, 2) NOT NULL DEFAULT 0,
    artist_revenue DECIMAL(18, 2) NOT NULL DEFAULT 0,
    Soundpub_revenue DECIMAL(18, 2) NOT NULL DEFAULT 0,
    title TEXT,
    artist TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE Soundpub.payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES Soundpub.profiles(id),
    amount DECIMAL(18, 2) NOT NULL,
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_holder_name TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
    processed_by UUID REFERENCES Soundpub.profiles(id),
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. ENABLE ROW LEVEL SECURITY
ALTER TABLE Soundpub.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE Soundpub.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE Soundpub.releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE Soundpub.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE Soundpub.royalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE Soundpub.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE Soundpub.royalty_uploads ENABLE ROW LEVEL SECURITY;

-- =============================================
-- PART 2: HELPER FUNCTIONS
-- =============================================

CREATE OR REPLACE FUNCTION Soundpub.has_role(user_id UUID, role Soundpub.app_role)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM Soundpub.user_roles
    WHERE user_roles.user_id = $1 AND user_roles.role = $2
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = Soundpub;

CREATE OR REPLACE FUNCTION Soundpub.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN Soundpub.has_role($1, 'superadmin'::Soundpub.app_role) 
      OR Soundpub.has_role($1, 'admin'::Soundpub.app_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = Soundpub;

CREATE OR REPLACE FUNCTION Soundpub.get_user_full_name(user_id UUID)
RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT full_name FROM Soundpub.profiles WHERE id = $1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = Soundpub;

-- =============================================
-- PART 3: RLS POLICIES
-- =============================================

-- USER ROLES POLICIES
CREATE POLICY "Users can view own roles"
ON Soundpub.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
ON Soundpub.user_roles FOR ALL
TO authenticated
USING (Soundpub.is_admin(auth.uid()));

-- PROFILES POLICIES
CREATE POLICY "Users can view own profile"
ON Soundpub.profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
ON Soundpub.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Admins can manage all profiles"
ON Soundpub.profiles FOR ALL
TO authenticated
USING (Soundpub.is_admin(auth.uid()));

CREATE POLICY "Labels can view their artists"
ON Soundpub.profiles FOR SELECT
TO authenticated
USING (parent_label_id = auth.uid());

-- RELEASES POLICIES
CREATE POLICY "Admins can manage all releases"
ON Soundpub.releases FOR ALL
TO authenticated
USING (Soundpub.is_admin(auth.uid()));

CREATE POLICY "Labels can manage own releases"
ON Soundpub.releases FOR ALL
TO authenticated
USING (label_id = auth.uid() OR created_by = auth.uid());

CREATE POLICY "Artists can view own releases"
ON Soundpub.releases FOR SELECT
TO authenticated
USING (artist_name = Soundpub.get_user_full_name(auth.uid()));

-- TRACKS POLICIES
CREATE POLICY "Admins can manage all tracks"
ON Soundpub.tracks FOR ALL
TO authenticated
USING (Soundpub.is_admin(auth.uid()));

CREATE POLICY "Labels can manage tracks from own releases"
ON Soundpub.tracks FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM Soundpub.releases
    WHERE releases.id = tracks.release_id
    AND (releases.label_id = auth.uid() OR releases.created_by = auth.uid())
  )
);

CREATE POLICY "Artists can view own tracks"
ON Soundpub.tracks FOR SELECT
TO authenticated
USING (artist_name = Soundpub.get_user_full_name(auth.uid()));

-- ROYALTIES POLICIES
CREATE POLICY "Admins can manage all royalties"
ON Soundpub.royalties FOR ALL
TO authenticated
USING (Soundpub.is_admin(auth.uid()));

CREATE POLICY "Labels can view their royalties"
ON Soundpub.royalties FOR SELECT
TO authenticated
USING (
  Soundpub.has_role(auth.uid(), 'label'::Soundpub.app_role)
  AND label_name = Soundpub.get_user_full_name(auth.uid())
);

CREATE POLICY "Artists can view their royalties"
ON Soundpub.royalties FOR SELECT
TO authenticated
USING (
  Soundpub.has_role(auth.uid(), 'artist'::Soundpub.app_role)
  AND (
    artist_name = Soundpub.get_user_full_name(auth.uid())
    OR artist = Soundpub.get_user_full_name(auth.uid())
  )
);

-- PAYOUT REQUESTS POLICIES
CREATE POLICY "Admins can manage all payouts"
ON Soundpub.payout_requests FOR ALL
TO authenticated
USING (Soundpub.is_admin(auth.uid()));

CREATE POLICY "Users can manage own payouts"
ON Soundpub.payout_requests FOR ALL
TO authenticated
USING (user_id = auth.uid());

-- ROYALTY UPLOADS POLICIES
CREATE POLICY "Admins can manage all uploads"
ON Soundpub.royalty_uploads FOR ALL
TO authenticated
USING (Soundpub.is_admin(auth.uid()));

CREATE POLICY "Users can view own uploads"
ON Soundpub.royalty_uploads FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- =============================================
-- PART 4: TRIGGERS
-- =============================================

-- TIMESTAMP UPDATE TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION Soundpub.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_timestamp
BEFORE UPDATE ON Soundpub.profiles
FOR EACH ROW EXECUTE FUNCTION Soundpub.update_timestamp();

CREATE TRIGGER update_releases_timestamp
BEFORE UPDATE ON Soundpub.releases
FOR EACH ROW EXECUTE FUNCTION Soundpub.update_timestamp();

CREATE TRIGGER update_tracks_timestamp
BEFORE UPDATE ON Soundpub.tracks
FOR EACH ROW EXECUTE FUNCTION Soundpub.update_timestamp();

CREATE TRIGGER update_payout_requests_timestamp
BEFORE UPDATE ON Soundpub.payout_requests
FOR EACH ROW EXECUTE FUNCTION Soundpub.update_timestamp();

CREATE TRIGGER update_royalty_uploads_timestamp
BEFORE UPDATE ON Soundpub.royalty_uploads
FOR EACH ROW EXECUTE FUNCTION Soundpub.update_timestamp();

-- BALANCE UPDATE ON PAYOUT STATUS CHANGE
CREATE OR REPLACE FUNCTION Soundpub.update_balance_on_payout_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
        UPDATE Soundpub.profiles
        SET balance = balance - NEW.amount
        WHERE id = NEW.user_id;
    ELSIF OLD.status = 'paid' AND NEW.status != 'paid' THEN
        UPDATE Soundpub.profiles
        SET balance = balance + NEW.amount
        WHERE id = NEW.user_id;
    END IF;

    IF NEW.status IN ('approved', 'rejected', 'paid') AND
       (OLD.status IS NULL OR OLD.status NOT IN ('approved', 'rejected', 'paid')) THEN
        NEW.processed_at = NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = Soundpub;

CREATE TRIGGER update_balance_on_payout_status_change
BEFORE UPDATE ON Soundpub.payout_requests
FOR EACH ROW EXECUTE FUNCTION Soundpub.update_balance_on_payout_status_change();

-- AUTO-CREATE PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION Soundpub.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO Soundpub.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1))
  );

  INSERT INTO Soundpub.user_roles (user_id, role)
  VALUES (NEW.id, 'user'::Soundpub.app_role);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = Soundpub;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION Soundpub.handle_new_user();

-- =============================================
-- PART 5: INDEXES
-- =============================================

CREATE INDEX idx_Soundpub_user_roles_user_id ON Soundpub.user_roles(user_id);
CREATE INDEX idx_Soundpub_profiles_parent_label ON Soundpub.profiles(parent_label_id);
CREATE INDEX idx_Soundpub_releases_label_id ON Soundpub.releases(label_id);
CREATE INDEX idx_Soundpub_releases_artist_name ON Soundpub.releases(artist_name);
CREATE INDEX idx_Soundpub_tracks_release_id ON Soundpub.tracks(release_id);
CREATE INDEX idx_Soundpub_tracks_artist_name ON Soundpub.tracks(artist_name);
CREATE INDEX idx_Soundpub_royalties_upload_id ON Soundpub.royalties(upload_id);
CREATE INDEX idx_Soundpub_royalties_artist_name ON Soundpub.royalties(artist_name);
CREATE INDEX idx_Soundpub_royalties_label_name ON Soundpub.royalties(label_name);
CREATE INDEX idx_Soundpub_payout_requests_user_id ON Soundpub.payout_requests(user_id);
CREATE INDEX idx_Soundpub_royalty_uploads_user_id ON Soundpub.royalty_uploads(user_id);

-- =============================================

-- =============================================
-- GRANT PERMISSIONS TO SERVICE ROLE
-- =============================================
GRANT USAGE ON SCHEMA Soundpub TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA Soundpub TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA Soundpub TO postgres, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA Soundpub TO postgres, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA Soundpub GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA Soundpub GRANT ALL ON SEQUENCES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA Soundpub GRANT ALL ON FUNCTIONS TO postgres, service_role;

-- MIGRATION COMPLETE
-- =============================================
-- Schema Soundpub is ready for use
-- All tables, functions, policies, triggers, and indexes are created

-- =============================================
-- ADDITIONAL TABLES FROM LOVABLE
-- =============================================

-- app_settings
CREATE TABLE Soundpub.app_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text UNIQUE NOT NULL,
    value text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- artist_profiles
CREATE TABLE Soundpub.artist_profiles (
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
CREATE TABLE Soundpub.audit_logs (
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
CREATE TABLE IF NOT EXISTS Soundpub.composer_royalties (
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
CREATE TABLE IF NOT EXISTS Soundpub.email_send_log (
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
CREATE TABLE Soundpub.notifications (
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
CREATE TABLE Soundpub.release_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  release_id UUID NOT NULL REFERENCES Soundpub.releases(id) ON DELETE CASCADE,
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
CREATE TABLE IF NOT EXISTS Soundpub.storage_backup_log (
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
CREATE TABLE IF NOT EXISTS Soundpub.storage_backup_runs (
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
CREATE TABLE IF NOT EXISTS Soundpub.artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id uuid REFERENCES Soundpub.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);


-- =============================================
-- RLS POLICIES FOR MISSING TABLES
-- =============================================

-- APP_SETTINGS
ALTER TABLE Soundpub.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins can manage app settings"
ON Soundpub.app_settings FOR ALL
USING (Soundpub.has_role(auth.uid(), 'superadmin'::Soundpub.app_role));
CREATE POLICY "Anyone can view app settings"
ON Soundpub.app_settings FOR SELECT
USING (true);

-- ARTIST_PROFILES
ALTER TABLE Soundpub.artist_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own artist profile"
ON Soundpub.artist_profiles FOR SELECT
TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "Users can update own artist profile"
ON Soundpub.artist_profiles FOR UPDATE
TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "Users can insert own artist profile"
ON Soundpub.artist_profiles FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can manage all artist profiles"
ON Soundpub.artist_profiles FOR ALL
TO authenticated
USING (Soundpub.is_admin(auth.uid()));

-- ARTISTS
ALTER TABLE Soundpub.artists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Labels can manage their artists"
ON Soundpub.artists FOR ALL
TO authenticated
USING (label_id = auth.uid());
CREATE POLICY "Admins can manage all artists"
ON Soundpub.artists FOR ALL
TO authenticated
USING (Soundpub.is_admin(auth.uid()));

-- AUDIT_LOGS
ALTER TABLE Soundpub.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view audit logs"
ON Soundpub.audit_logs FOR SELECT
TO authenticated
USING (Soundpub.is_admin(auth.uid()));

-- COMPOSER_ROYALTIES
ALTER TABLE Soundpub.composer_royalties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage composer royalties"
ON Soundpub.composer_royalties FOR ALL
TO authenticated
USING (Soundpub.is_admin(auth.uid()));

-- EMAIL_SEND_LOG
ALTER TABLE Soundpub.email_send_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view email logs"
ON Soundpub.email_send_log FOR SELECT
TO authenticated
USING (Soundpub.is_admin(auth.uid()));

-- NOTIFICATIONS
ALTER TABLE Soundpub.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own and global notifications"
ON Soundpub.notifications FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR is_global = true);
CREATE POLICY "Users can update own notifications"
ON Soundpub.notifications FOR UPDATE
TO authenticated
USING (user_id = auth.uid() OR is_global = true);
CREATE POLICY "Admins can manage all notifications"
ON Soundpub.notifications FOR ALL
TO authenticated
USING (Soundpub.is_admin(auth.uid()));

-- RELEASE_PAYMENTS
ALTER TABLE Soundpub.release_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own payments"
ON Soundpub.release_payments FOR SELECT
TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "Users can insert their own payments"
ON Soundpub.release_payments FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can manage all payments"
ON Soundpub.release_payments FOR ALL
TO authenticated
USING (Soundpub.is_admin(auth.uid()));

-- STORAGE_BACKUP_LOG
ALTER TABLE Soundpub.storage_backup_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage backup logs"
ON Soundpub.storage_backup_log FOR ALL
TO authenticated
USING (Soundpub.is_admin(auth.uid()));

-- STORAGE_BACKUP_RUNS
ALTER TABLE Soundpub.storage_backup_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage backup runs"
ON Soundpub.storage_backup_runs FOR ALL
TO authenticated
USING (Soundpub.is_admin(auth.uid()));

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_Soundpub_artist_profiles_user_id ON Soundpub.artist_profiles(user_id);
CREATE INDEX idx_Soundpub_artists_label_id ON Soundpub.artists(label_id);
CREATE INDEX idx_Soundpub_audit_logs_actor_id ON Soundpub.audit_logs(actor_id);
CREATE INDEX idx_Soundpub_audit_logs_target_id ON Soundpub.audit_logs(target_id);
CREATE INDEX idx_Soundpub_composer_royalties_upload_id ON Soundpub.composer_royalties(upload_id);
CREATE INDEX idx_Soundpub_notifications_user_id ON Soundpub.notifications(user_id);
CREATE INDEX idx_Soundpub_release_payments_release_id ON Soundpub.release_payments(release_id);
CREATE INDEX idx_Soundpub_release_payments_user_id ON Soundpub.release_payments(user_id);
CREATE INDEX idx_Soundpub_email_send_log_recipient_user_id ON Soundpub.email_send_log(recipient_user_id);

-- =============================================
-- TRIGGERS
-- =============================================
CREATE TRIGGER update_app_settings_timestamp
BEFORE UPDATE ON Soundpub.app_settings
FOR EACH ROW EXECUTE FUNCTION Soundpub.update_timestamp();

CREATE TRIGGER update_artist_profiles_timestamp
BEFORE UPDATE ON Soundpub.artist_profiles
FOR EACH ROW EXECUTE FUNCTION Soundpub.update_timestamp();

CREATE TRIGGER update_artists_timestamp
BEFORE UPDATE ON Soundpub.artists
FOR EACH ROW EXECUTE FUNCTION Soundpub.update_timestamp();

CREATE TRIGGER update_composer_royalties_timestamp
BEFORE UPDATE ON Soundpub.composer_royalties
FOR EACH ROW EXECUTE FUNCTION Soundpub.update_timestamp();

CREATE TRIGGER update_release_payments_timestamp
BEFORE UPDATE ON Soundpub.release_payments
FOR EACH ROW EXECUTE FUNCTION Soundpub.update_timestamp();

