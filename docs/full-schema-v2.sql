-- =====================================================
-- SoundPub Dashboard - Full Database Schema Export v2.5
-- Updated: Agustus 2026
-- SCHEMA TARGET: "soundpub-dashboard" (menggantikan "public")
-- Untuk migrasi ke Supabase Self-Hosted di VPS
-- =====================================================
-- PENTING:
--   1) Nama schema mengandung tanda hubung, jadi WAJIB pakai tanda kutip
--      ganda di setiap referensi: "soundpub-dashboard".nama_tabel
--   2) Setelah deploy, tambahkan schema ini ke PostgREST:
--        PGRST_DB_SCHEMAS="soundpub-dashboard,storage,graphql_public"
--      (di supabase/docker/.env -> PGRST_DB_SCHEMAS)
--      lalu restart container `rest` dan `kong`.
--   3) Frontend harus memakai:
--        createClient(url, key, { db: { schema: 'soundpub-dashboard' } })
-- =====================================================

-- =====================================================
-- BAGIAN 0: CREATE SCHEMA + GRANT DASAR
-- =====================================================
CREATE SCHEMA IF NOT EXISTS "soundpub-dashboard";

GRANT USAGE ON SCHEMA "soundpub-dashboard" TO anon, authenticated, service_role;
GRANT ALL   ON SCHEMA "soundpub-dashboard" TO postgres, service_role;

-- Default privileges untuk objek yang dibuat berikutnya
ALTER DEFAULT PRIVILEGES IN SCHEMA "soundpub-dashboard"
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA "soundpub-dashboard"
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA "soundpub-dashboard"
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;

-- Search path default agar helper SECURITY DEFINER tetap resolve
ALTER ROLE authenticated SET search_path = "soundpub-dashboard", public, extensions;
ALTER ROLE anon          SET search_path = "soundpub-dashboard", public, extensions;
ALTER ROLE service_role  SET search_path = "soundpub-dashboard", public, extensions;


-- =====================================================
-- BAGIAN 1: CLEANUP (Opsional - untuk fresh install)
-- =====================================================
-- PERINGATAN: Uncomment bagian ini HANYA jika ingin reset database
-- 
-- DROP POLICY IF EXISTS ... ON ...;
-- DROP TABLE IF EXISTS ... CASCADE;
-- DROP FUNCTION IF EXISTS ... CASCADE;
-- DROP TYPE IF EXISTS ... CASCADE;

-- =====================================================
-- BAGIAN 2: CUSTOM TYPES (ENUM)
-- =====================================================

-- Role enum dengan semua roles
DO $$ BEGIN
  CREATE TYPE "soundpub-dashboard".app_role AS ENUM (
    'superadmin', 
    'admin', 
    'label', 
    'whitelabel',
    'artist', 
    'copyright',
    'user'
  );
EXCEPTION
  WHEN duplicate_object THEN 
    -- Jika type sudah ada, alter untuk tambah values baru
    ALTER TYPE "soundpub-dashboard".app_role ADD VALUE IF NOT EXISTS 'whitelabel';
    ALTER TYPE "soundpub-dashboard".app_role ADD VALUE IF NOT EXISTS 'copyright';
END $$;

-- =====================================================
-- BAGIAN 3: TABLES
-- =====================================================

-- Profiles table (linked to auth.users)
CREATE TABLE IF NOT EXISTS "soundpub-dashboard".profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  balance NUMERIC NOT NULL DEFAULT 0,
  label_revenue NUMERIC NOT NULL DEFAULT 0,
  artist_revenue NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  password_set BOOLEAN DEFAULT true,
  logo_url TEXT,
  logo_url_light TEXT,
  logo_url_dark TEXT,
  composer_code TEXT,
  subscription_status TEXT DEFAULT 'none',
  subscription_upgraded_at TIMESTAMP WITH TIME ZONE,
  parent_label_id UUID REFERENCES "soundpub-dashboard".profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- User roles table
CREATE TABLE IF NOT EXISTS "soundpub-dashboard".user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role "soundpub-dashboard".app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Artists table
CREATE TABLE IF NOT EXISTS "soundpub-dashboard".artists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id UUID NOT NULL REFERENCES "soundpub-dashboard".profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Releases table
CREATE TABLE IF NOT EXISTS "soundpub-dashboard".releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id UUID NOT NULL REFERENCES "soundpub-dashboard".profiles(id),
  created_by UUID REFERENCES "soundpub-dashboard".profiles(id),
  artist_user_id UUID REFERENCES "soundpub-dashboard".profiles(id),
  upc TEXT,
  title TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  cover_url TEXT,
  genre TEXT,
  release_type TEXT DEFAULT 'single',
  release_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  archived_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tracks table
CREATE TABLE IF NOT EXISTS "soundpub-dashboard".tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES "soundpub-dashboard".releases(id) ON DELETE CASCADE,
  artist_user_id UUID REFERENCES "soundpub-dashboard".profiles(id),
  title TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  artists JSONB DEFAULT '[]'::jsonb,
  isrc TEXT,
  genre TEXT,
  composer TEXT,
  lyricist TEXT,
  lyrics TEXT,
  duration INTEGER,
  audio_url TEXT,
  video_url TEXT,
  clip_url TEXT,
  explicit_lyrics BOOLEAN DEFAULT false,
  contributors JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Royalty uploads table
CREATE TABLE IF NOT EXISTS "soundpub-dashboard".royalty_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "soundpub-dashboard".profiles(id),
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  status TEXT NOT NULL,
  total_records INTEGER NOT NULL DEFAULT 0,
  inserted_records INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  summary JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Royalties table
CREATE TABLE IF NOT EXISTS "soundpub-dashboard".royalties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES "soundpub-dashboard".royalty_uploads(id) ON DELETE CASCADE,
  artist_user_id UUID,
  period TEXT NOT NULL,
  platform TEXT NOT NULL,
  country TEXT NOT NULL,
  isrc TEXT NOT NULL,
  upc TEXT NOT NULL,
  title TEXT,
  artist TEXT,
  label_name TEXT NOT NULL,
  sales_type TEXT,
  sales_unit INTEGER NOT NULL DEFAULT 0,
  net_revenue NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Composer royalties table
CREATE TABLE IF NOT EXISTS "soundpub-dashboard".composer_royalties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  composer_id TEXT NOT NULL,
  composer_name TEXT NOT NULL,
  period TEXT,
  total_net_royalti NUMERIC NOT NULL DEFAULT 0,
  upload_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Payout requests table
CREATE TABLE IF NOT EXISTS "soundpub-dashboard".payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "soundpub-dashboard".profiles(id),
  amount NUMERIC NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_holder_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  processed_by UUID REFERENCES "soundpub-dashboard".profiles(id),
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS "soundpub-dashboard".audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- App settings table
CREATE TABLE IF NOT EXISTS "soundpub-dashboard".app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =====================================================
-- BAGIAN 4: INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_profiles_parent_label ON "soundpub-dashboard".profiles(parent_label_id);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON "soundpub-dashboard".profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON "soundpub-dashboard".profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_composer_code ON "soundpub-dashboard".profiles(composer_code);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON "soundpub-dashboard".user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON "soundpub-dashboard".user_roles(role);
CREATE INDEX IF NOT EXISTS idx_artists_label_id ON "soundpub-dashboard".artists(label_id);
CREATE INDEX IF NOT EXISTS idx_artists_name ON "soundpub-dashboard".artists(name);
CREATE INDEX IF NOT EXISTS idx_releases_label_id ON "soundpub-dashboard".releases(label_id);
CREATE INDEX IF NOT EXISTS idx_releases_status ON "soundpub-dashboard".releases(status);
CREATE INDEX IF NOT EXISTS idx_releases_artist_name ON "soundpub-dashboard".releases(artist_name);
CREATE INDEX IF NOT EXISTS idx_releases_artist_user_id ON "soundpub-dashboard".releases(artist_user_id);
CREATE INDEX IF NOT EXISTS idx_releases_upc ON "soundpub-dashboard".releases(upc);
CREATE INDEX IF NOT EXISTS idx_tracks_release_id ON "soundpub-dashboard".tracks(release_id);
CREATE INDEX IF NOT EXISTS idx_tracks_isrc ON "soundpub-dashboard".tracks(isrc);
CREATE INDEX IF NOT EXISTS idx_tracks_artist_user_id ON "soundpub-dashboard".tracks(artist_user_id);
CREATE INDEX IF NOT EXISTS idx_royalty_uploads_user_id ON "soundpub-dashboard".royalty_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_royalties_upload_id ON "soundpub-dashboard".royalties(upload_id);
CREATE INDEX IF NOT EXISTS idx_royalties_period ON "soundpub-dashboard".royalties(period);
CREATE INDEX IF NOT EXISTS idx_royalties_label_name ON "soundpub-dashboard".royalties(label_name);
CREATE INDEX IF NOT EXISTS idx_royalties_isrc ON "soundpub-dashboard".royalties(isrc);
CREATE INDEX IF NOT EXISTS idx_royalties_artist ON "soundpub-dashboard".royalties(artist);
CREATE INDEX IF NOT EXISTS idx_royalties_artist_user_id ON "soundpub-dashboard".royalties(artist_user_id);
CREATE INDEX IF NOT EXISTS idx_composer_royalties_composer_id ON "soundpub-dashboard".composer_royalties(composer_id);
CREATE INDEX IF NOT EXISTS idx_composer_royalties_period ON "soundpub-dashboard".composer_royalties(period);
CREATE INDEX IF NOT EXISTS idx_payout_requests_user_id ON "soundpub-dashboard".payout_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON "soundpub-dashboard".payout_requests(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON "soundpub-dashboard".audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON "soundpub-dashboard".audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON "soundpub-dashboard".audit_logs(action);

-- =====================================================
-- BAGIAN 5: SECURITY DEFINER FUNCTIONS (Core)
-- =====================================================

-- Check if user has specific role
CREATE OR REPLACE FUNCTION "soundpub-dashboard".has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "soundpub-dashboard".user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Check if user is admin (superadmin or admin)
CREATE OR REPLACE FUNCTION "soundpub-dashboard".is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "soundpub-dashboard".user_roles
    WHERE user_id = _user_id AND role IN ('superadmin', 'admin')
  )
$$;

-- Check if user is whitelabel
CREATE OR REPLACE FUNCTION "soundpub-dashboard".is_whitelabel(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "soundpub-dashboard".user_roles
    WHERE user_id = _user_id AND role = 'whitelabel'
  )
$$;

-- Get user role
CREATE OR REPLACE FUNCTION "soundpub-dashboard".get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
  SELECT role FROM "soundpub-dashboard".user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Get user full name
CREATE OR REPLACE FUNCTION "soundpub-dashboard".get_user_full_name(_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
  SELECT full_name FROM "soundpub-dashboard".profiles
  WHERE id = _user_id
$$;

-- Get user parent label id
CREATE OR REPLACE FUNCTION "soundpub-dashboard".get_user_parent_label_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
  SELECT parent_label_id FROM "soundpub-dashboard".profiles
  WHERE id = _user_id
$$;

-- Get release label ids for user
CREATE OR REPLACE FUNCTION "soundpub-dashboard".get_user_release_label_ids(_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
  SELECT DISTINCT label_id FROM "soundpub-dashboard".releases
  WHERE label_id = _user_id 
     OR artist_name = (SELECT full_name FROM "soundpub-dashboard".profiles WHERE id = _user_id)
$$;

-- Get artist user_id by name (for matching)
CREATE OR REPLACE FUNCTION "soundpub-dashboard".get_artist_user_id_by_name(_artist_name TEXT, _label_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
  SELECT p.id
  FROM profiles p
  JOIN user_roles ur ON p.id = ur.user_id
  WHERE ur.role = 'artist'
    AND LOWER(TRIM(p.full_name)) = LOWER(TRIM(_artist_name))
    AND (_label_id IS NULL OR p.parent_label_id = _label_id)
  LIMIT 1
$$;

-- =====================================================
-- BAGIAN 5b: ROYALTY RPC FUNCTIONS
-- =====================================================

-- Get royalty stats (totals)
CREATE OR REPLACE FUNCTION "soundpub-dashboard".get_royalty_stats()
RETURNS TABLE(total_revenue NUMERIC, total_streams BIGINT, unique_artists BIGINT, unique_labels BIGINT, unique_platforms BIGINT, unique_tracks BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
  SELECT
    COALESCE(SUM(net_revenue), 0) AS total_revenue,
    COALESCE(SUM(sales_unit)::bigint, 0) AS total_streams,
    COUNT(DISTINCT artist) AS unique_artists,
    COUNT(DISTINCT label_name) AS unique_labels,
    COUNT(DISTINCT platform) AS unique_platforms,
    COUNT(DISTINCT isrc) AS unique_tracks
  FROM royalties r
  WHERE
    CASE
      WHEN "soundpub-dashboard".is_admin(auth.uid()) THEN true
      WHEN "soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel') THEN
        r.label_name = "soundpub-dashboard".get_user_full_name(auth.uid())
      WHEN "soundpub-dashboard".has_role(auth.uid(), 'artist') THEN
        r.artist_user_id = auth.uid() OR (r.artist_user_id IS NULL AND r.artist = "soundpub-dashboard".get_user_full_name(auth.uid()))
      ELSE false
    END;
$$;

-- Get royalty monthly summary
CREATE OR REPLACE FUNCTION "soundpub-dashboard".get_royalty_monthly_summary()
RETURNS TABLE(period TEXT, revenue NUMERIC, streams BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
  SELECT
    r.period,
    SUM(r.net_revenue) AS revenue,
    SUM(r.sales_unit)::bigint AS streams
  FROM royalties r
  WHERE
    CASE
      WHEN "soundpub-dashboard".is_admin(auth.uid()) THEN true
      WHEN "soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel') THEN
        r.label_name = "soundpub-dashboard".get_user_full_name(auth.uid())
      WHEN "soundpub-dashboard".has_role(auth.uid(), 'artist') THEN
        r.artist_user_id = auth.uid() OR (r.artist_user_id IS NULL AND r.artist = "soundpub-dashboard".get_user_full_name(auth.uid()))
      ELSE false
    END
  GROUP BY r.period
  ORDER BY r.period ASC;
$$;

-- Get royalty platform summary
CREATE OR REPLACE FUNCTION "soundpub-dashboard".get_royalty_platform_summary(_limit INTEGER DEFAULT 10)
RETURNS TABLE(platform TEXT, revenue NUMERIC, streams BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
  SELECT
    r.platform,
    SUM(r.net_revenue) AS revenue,
    SUM(r.sales_unit)::bigint AS streams
  FROM royalties r
  WHERE
    CASE
      WHEN "soundpub-dashboard".is_admin(auth.uid()) THEN true
      WHEN "soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel') THEN
        r.label_name = "soundpub-dashboard".get_user_full_name(auth.uid())
      WHEN "soundpub-dashboard".has_role(auth.uid(), 'artist') THEN
        r.artist_user_id = auth.uid() OR (r.artist_user_id IS NULL AND r.artist = "soundpub-dashboard".get_user_full_name(auth.uid()))
      ELSE false
    END
  GROUP BY r.platform
  ORDER BY revenue DESC
  LIMIT _limit;
$$;

-- Get royalty country summary
CREATE OR REPLACE FUNCTION "soundpub-dashboard".get_royalty_country_summary(_limit INTEGER DEFAULT 10)
RETURNS TABLE(country TEXT, revenue NUMERIC, streams BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
  SELECT
    r.country,
    SUM(r.net_revenue) AS revenue,
    SUM(r.sales_unit)::bigint AS streams
  FROM royalties r
  WHERE
    CASE
      WHEN "soundpub-dashboard".is_admin(auth.uid()) THEN true
      WHEN "soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel') THEN
        r.label_name = "soundpub-dashboard".get_user_full_name(auth.uid())
      WHEN "soundpub-dashboard".has_role(auth.uid(), 'artist') THEN
        r.artist_user_id = auth.uid() OR (r.artist_user_id IS NULL AND r.artist = "soundpub-dashboard".get_user_full_name(auth.uid()))
      ELSE false
    END
  GROUP BY r.country
  ORDER BY revenue DESC
  LIMIT _limit;
$$;

-- Get royalty periods
CREATE OR REPLACE FUNCTION "soundpub-dashboard".get_royalty_periods()
RETURNS TABLE(period TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
  SELECT DISTINCT r.period
  FROM royalties r
  WHERE
    CASE
      WHEN "soundpub-dashboard".is_admin(auth.uid()) THEN true
      WHEN "soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel') THEN
        r.label_name = "soundpub-dashboard".get_user_full_name(auth.uid())
      WHEN "soundpub-dashboard".has_role(auth.uid(), 'artist') THEN
        r.artist_user_id = auth.uid() OR (r.artist_user_id IS NULL AND r.artist = "soundpub-dashboard".get_user_full_name(auth.uid()))
      ELSE false
    END
  ORDER BY r.period DESC;
$$;

-- Get royalty period summary (with growth calculation)
CREATE OR REPLACE FUNCTION "soundpub-dashboard".get_royalty_period_summary()
RETURNS TABLE(period TEXT, revenue NUMERIC, streams BIGINT, unique_tracks BIGINT, unique_artists BIGINT, unique_labels BIGINT, top_platform TEXT, top_country TEXT, growth NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean := "soundpub-dashboard".is_admin(_uid);
  _is_label boolean := "soundpub-dashboard".has_role(_uid, 'label');
  _is_whitelabel boolean := "soundpub-dashboard".has_role(_uid, 'whitelabel');
  _is_artist boolean := "soundpub-dashboard".has_role(_uid, 'artist');
  _full_name text := "soundpub-dashboard".get_user_full_name(_uid);
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT r.*
    FROM royalties r
    WHERE
      CASE
        WHEN _is_admin THEN true
        WHEN _is_label OR _is_whitelabel THEN r.label_name = _full_name
        WHEN _is_artist THEN r.artist_user_id = _uid OR (r.artist_user_id IS NULL AND r.artist = _full_name)
        ELSE false
      END
  ),
  period_data AS (
    SELECT
      f.period,
      SUM(f.net_revenue) AS revenue,
      SUM(f.sales_unit)::bigint AS streams,
      COUNT(DISTINCT f.isrc) AS unique_tracks,
      COUNT(DISTINCT f.artist) AS unique_artists,
      COUNT(DISTINCT f.label_name) AS unique_labels
    FROM filtered f
    GROUP BY f.period
  ),
  top_platforms AS (
    SELECT DISTINCT ON (sub.period) sub.period, sub.platform
    FROM (
      SELECT f2.period, f2.platform, SUM(f2.net_revenue) AS rev
      FROM filtered f2
      GROUP BY f2.period, f2.platform
    ) sub
    ORDER BY sub.period, sub.rev DESC
  ),
  top_countries AS (
    SELECT DISTINCT ON (sub.period) sub.period, sub.country
    FROM (
      SELECT f2.period, f2.country, SUM(f2.net_revenue) AS rev
      FROM filtered f2
      GROUP BY f2.period, f2.country
    ) sub
    ORDER BY sub.period, sub.rev DESC
  ),
  with_lag AS (
    SELECT
      pd.period,
      pd.revenue,
      pd.streams,
      pd.unique_tracks,
      pd.unique_artists,
      pd.unique_labels,
      COALESCE(tp.platform, '-') AS top_platform,
      COALESCE(tc.country, '-') AS top_country,
      LAG(pd.revenue) OVER (ORDER BY pd.period) AS prev_revenue
    FROM period_data pd
    LEFT JOIN top_platforms tp ON tp.period = pd.period
    LEFT JOIN top_countries tc ON tc.period = pd.period
  )
  SELECT
    wl.period,
    wl.revenue,
    wl.streams,
    wl.unique_tracks,
    wl.unique_artists,
    wl.unique_labels,
    wl.top_platform,
    wl.top_country,
    CASE WHEN wl.prev_revenue > 0
      THEN ((wl.revenue - wl.prev_revenue) / wl.prev_revenue * 100)
      ELSE 0::numeric
    END AS growth
  FROM with_lag wl
  ORDER BY wl.period DESC;
END;
$$;

-- Get royalty comparison between periods
CREATE OR REPLACE FUNCTION "soundpub-dashboard".get_royalty_comparison(_current_periods TEXT[], _previous_periods TEXT[])
RETURNS TABLE(data_type TEXT, period TEXT, revenue NUMERIC, streams BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean := "soundpub-dashboard".is_admin(_uid);
  _is_label boolean := "soundpub-dashboard".has_role(_uid, 'label');
  _is_whitelabel boolean := "soundpub-dashboard".has_role(_uid, 'whitelabel');
  _is_artist boolean := "soundpub-dashboard".has_role(_uid, 'artist');
  _full_name text := "soundpub-dashboard".get_user_full_name(_uid);
BEGIN
  RETURN QUERY
  SELECT 'current'::text AS data_type, r.period, SUM(r.net_revenue) AS revenue, SUM(r.sales_unit)::bigint AS streams
  FROM royalties r
  WHERE r.period = ANY(_current_periods)
    AND CASE
      WHEN _is_admin THEN true
      WHEN _is_label OR _is_whitelabel THEN r.label_name = _full_name
      WHEN _is_artist THEN r.artist_user_id = _uid OR (r.artist_user_id IS NULL AND r.artist = _full_name)
      ELSE false
    END
  GROUP BY r.period
  UNION ALL
  SELECT 'previous'::text AS data_type, r.period, SUM(r.net_revenue) AS revenue, SUM(r.sales_unit)::bigint AS streams
  FROM royalties r
  WHERE r.period = ANY(_previous_periods)
    AND CASE
      WHEN _is_admin THEN true
      WHEN _is_label OR _is_whitelabel THEN r.label_name = _full_name
      WHEN _is_artist THEN r.artist_user_id = _uid OR (r.artist_user_id IS NULL AND r.artist = _full_name)
      ELSE false
    END
  GROUP BY r.period
  ORDER BY period ASC;
END;
$$;

-- Get top performers with growth
CREATE OR REPLACE FUNCTION "soundpub-dashboard".get_royalty_top_performers(_current_periods TEXT[], _previous_periods TEXT[], _group_by TEXT DEFAULT 'title', _limit INTEGER DEFAULT 10)
RETURNS TABLE(name TEXT, revenue NUMERIC, streams BIGINT, growth NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean := "soundpub-dashboard".is_admin(_uid);
  _is_label boolean := "soundpub-dashboard".has_role(_uid, 'label');
  _is_whitelabel boolean := "soundpub-dashboard".has_role(_uid, 'whitelabel');
  _is_artist boolean := "soundpub-dashboard".has_role(_uid, 'artist');
  _full_name text := "soundpub-dashboard".get_user_full_name(_uid);
BEGIN
  RETURN QUERY
  WITH role_filter AS (
    SELECT r.*
    FROM royalties r
    WHERE CASE
      WHEN _is_admin THEN true
      WHEN _is_label OR _is_whitelabel THEN r.label_name = _full_name
      WHEN _is_artist THEN r.artist_user_id = _uid OR (r.artist_user_id IS NULL AND r.artist = _full_name)
      ELSE false
    END
  ),
  current_data AS (
    SELECT
      CASE _group_by
        WHEN 'title' THEN COALESCE(rf.title, rf.isrc)
        WHEN 'platform' THEN rf.platform
        WHEN 'country' THEN rf.country
        ELSE COALESCE(rf.title, rf.isrc)
      END AS name,
      SUM(rf.net_revenue) AS revenue,
      SUM(rf.sales_unit)::bigint AS streams
    FROM role_filter rf
    WHERE rf.period = ANY(_current_periods)
    GROUP BY 1
  ),
  previous_data AS (
    SELECT
      CASE _group_by
        WHEN 'title' THEN COALESCE(rf.title, rf.isrc)
        WHEN 'platform' THEN rf.platform
        WHEN 'country' THEN rf.country
        ELSE COALESCE(rf.title, rf.isrc)
      END AS name,
      SUM(rf.net_revenue) AS revenue
    FROM role_filter rf
    WHERE rf.period = ANY(_previous_periods)
    GROUP BY 1
  )
  SELECT
    cd.name,
    cd.revenue,
    cd.streams,
    CASE WHEN COALESCE(pd.revenue, 0) > 0
      THEN ((cd.revenue - pd.revenue) / pd.revenue * 100)
      ELSE 0::numeric
    END AS growth
  FROM current_data cd
  LEFT JOIN previous_data pd ON pd.name = cd.name
  ORDER BY cd.revenue DESC
  LIMIT _limit;
END;
$$;

-- Get royalty label breakdown
CREATE OR REPLACE FUNCTION "soundpub-dashboard".get_royalty_label_breakdown(_period TEXT DEFAULT NULL)
RETURNS TABLE(label_name TEXT, revenue NUMERIC, streams BIGINT, artist_share NUMERIC, label_share NUMERIC, admin_share NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean := "soundpub-dashboard".is_admin(_uid);
  _is_label boolean := "soundpub-dashboard".has_role(_uid, 'label');
  _is_whitelabel boolean := "soundpub-dashboard".has_role(_uid, 'whitelabel');
  _is_artist boolean := "soundpub-dashboard".has_role(_uid, 'artist');
  _full_name text := "soundpub-dashboard".get_user_full_name(_uid);
BEGIN
  RETURN QUERY
  SELECT
    r.label_name,
    SUM(r.net_revenue) AS revenue,
    SUM(r.sales_unit)::bigint AS streams,
    SUM(r.net_revenue) * 0.70 AS artist_share,
    SUM(r.net_revenue) * 0.21 AS label_share,
    SUM(r.net_revenue) * 0.09 AS admin_share
  FROM royalties r
  WHERE
    (_period IS NULL OR r.period = _period)
    AND CASE
      WHEN _is_admin THEN true
      WHEN _is_label OR _is_whitelabel THEN r.label_name = _full_name
      WHEN _is_artist THEN r.artist_user_id = _uid OR (r.artist_user_id IS NULL AND r.artist = _full_name)
      ELSE false
    END
  GROUP BY r.label_name
  ORDER BY revenue DESC;
END;
$$;

-- Get royalty artist breakdown
CREATE OR REPLACE FUNCTION "soundpub-dashboard".get_royalty_artist_breakdown(_period TEXT DEFAULT NULL, _limit INTEGER DEFAULT 20)
RETURNS TABLE(artist_name TEXT, revenue NUMERIC, streams BIGINT, track_count BIGINT, is_soundpub BOOLEAN, artist_share NUMERIC, label_share NUMERIC, admin_share NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean := "soundpub-dashboard".is_admin(_uid);
  _is_label boolean := "soundpub-dashboard".has_role(_uid, 'label');
  _is_whitelabel boolean := "soundpub-dashboard".has_role(_uid, 'whitelabel');
  _is_artist boolean := "soundpub-dashboard".has_role(_uid, 'artist');
  _full_name text := "soundpub-dashboard".get_user_full_name(_uid);
BEGIN
  RETURN QUERY
  SELECT
    r.artist AS artist_name,
    SUM(r.net_revenue) AS revenue,
    SUM(r.sales_unit)::bigint AS streams,
    COUNT(DISTINCT r.isrc) AS track_count,
    false AS is_soundpub,
    SUM(r.net_revenue) * 0.70 AS artist_share,
    SUM(r.net_revenue) * 0.21 AS label_share,
    SUM(r.net_revenue) * 0.09 AS admin_share
  FROM royalties r
  WHERE
    r.artist IS NOT NULL
    AND (_period IS NULL OR r.period = _period)
    AND CASE
      WHEN _is_admin THEN true
      WHEN _is_label OR _is_whitelabel THEN r.label_name = _full_name
      WHEN _is_artist THEN r.artist_user_id = _uid OR (r.artist_user_id IS NULL AND r.artist = _full_name)
      ELSE false
    END
  GROUP BY r.artist
  ORDER BY revenue DESC
  LIMIT _limit;
END;
$$;

-- Get royalty track breakdown
CREATE OR REPLACE FUNCTION "soundpub-dashboard".get_royalty_track_breakdown(_period TEXT DEFAULT NULL)
RETURNS TABLE(isrc TEXT, title TEXT, artist_name TEXT, label TEXT, revenue NUMERIC, streams BIGINT, platform_count BIGINT, country_count BIGINT, is_soundpub BOOLEAN, artist_share NUMERIC, label_share NUMERIC, admin_share NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean := "soundpub-dashboard".is_admin(_uid);
  _is_label boolean := "soundpub-dashboard".has_role(_uid, 'label');
  _is_whitelabel boolean := "soundpub-dashboard".has_role(_uid, 'whitelabel');
  _is_artist boolean := "soundpub-dashboard".has_role(_uid, 'artist');
  _full_name text := "soundpub-dashboard".get_user_full_name(_uid);
BEGIN
  RETURN QUERY
  SELECT
    r.isrc,
    COALESCE(MAX(r.title), 'Unknown') AS title,
    COALESCE(MAX(r.artist), 'Unknown') AS artist_name,
    MAX(r.label_name) AS label,
    SUM(r.net_revenue) AS revenue,
    SUM(r.sales_unit)::bigint AS streams,
    COUNT(DISTINCT r.platform) AS platform_count,
    COUNT(DISTINCT r.country) AS country_count,
    false AS is_soundpub,
    SUM(r.net_revenue) * 0.70 AS artist_share,
    SUM(r.net_revenue) * 0.21 AS label_share,
    SUM(r.net_revenue) * 0.09 AS admin_share
  FROM royalties r
  WHERE
    (_period IS NULL OR r.period = _period)
    AND CASE
      WHEN _is_admin THEN true
      WHEN _is_label OR _is_whitelabel THEN r.label_name = _full_name
      WHEN _is_artist THEN r.artist_user_id = _uid OR (r.artist_user_id IS NULL AND r.artist = _full_name)
      ELSE false
    END
  GROUP BY r.isrc
  ORDER BY revenue DESC;
END;
$$;

-- =====================================================
-- BAGIAN 5c: TRIGGER FUNCTIONS
-- =====================================================

-- Handle new user signup (creates profile and default role)
CREATE OR REPLACE FUNCTION "soundpub-dashboard".handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
BEGIN
  INSERT INTO "soundpub-dashboard".profiles (id, email, full_name, password_set)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data ->> 'password_set')::boolean, true)
  );
  
  INSERT INTO "soundpub-dashboard".user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

-- Update timestamp function
CREATE OR REPLACE FUNCTION "soundpub-dashboard".update_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Update balance on payout status change
CREATE OR REPLACE FUNCTION "soundpub-dashboard".update_balance_on_payout_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "soundpub-dashboard"
AS $$
DECLARE
  current_balance DECIMAL(18,2);
  caller_is_admin BOOLEAN;
BEGIN
    caller_is_admin := "soundpub-dashboard".is_admin(auth.uid());
    
    -- Handle transition TO 'paid' status
    IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
        IF NOT caller_is_admin THEN
            RAISE EXCEPTION 'Only administrators can mark payouts as paid';
        END IF;
        
        IF NEW.amount <= 0 THEN
            RAISE EXCEPTION 'Payout amount must be positive';
        END IF;
        
        SELECT balance INTO current_balance
        FROM "soundpub-dashboard".profiles
        WHERE id = NEW.user_id
        FOR UPDATE;
        
        IF current_balance IS NULL THEN
            RAISE EXCEPTION 'User profile not found';
        END IF;
        
        IF current_balance < NEW.amount THEN
            RAISE EXCEPTION 'Insufficient balance: user has %, requested %', 
              current_balance, NEW.amount;
        END IF;
        
        UPDATE "soundpub-dashboard".profiles
        SET balance = balance - NEW.amount
        WHERE id = NEW.user_id AND balance >= NEW.amount;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Failed to update balance - concurrent modification or insufficient funds';
        END IF;
        
        NEW.processed_by := auth.uid();
        NEW.processed_at := NOW();
        
    -- Handle payout reversions (FROM 'paid' to another status)
    ELSIF OLD.status = 'paid' AND NEW.status != 'paid' THEN
        IF NOT caller_is_admin THEN
            RAISE EXCEPTION 'Only administrators can revert paid payouts';
        END IF;
        
        UPDATE "soundpub-dashboard".profiles
        SET balance = balance + NEW.amount
        WHERE id = NEW.user_id;
        
        NEW.processed_by := auth.uid();
        NEW.processed_at := NOW();
        
    -- Handle approval/rejection
    ELSIF NEW.status IN ('approved', 'rejected') AND 
          (OLD.status IS NULL OR OLD.status NOT IN ('approved', 'rejected', 'paid')) THEN
        IF NOT caller_is_admin THEN
            RAISE EXCEPTION 'Only administrators can approve or reject payouts';
        END IF;
        
        NEW.processed_by := auth.uid();
        NEW.processed_at := NOW();
    END IF;

    NEW.updated_at := NOW();
    
    RETURN NEW;
END;
$$;

-- =====================================================
-- BAGIAN 6: TRIGGERS
-- =====================================================

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION "soundpub-dashboard".handle_new_user();

-- Update timestamp triggers
DROP TRIGGER IF EXISTS update_profiles_timestamp ON "soundpub-dashboard".profiles;
CREATE TRIGGER update_profiles_timestamp
  BEFORE UPDATE ON "soundpub-dashboard".profiles
  FOR EACH ROW EXECUTE FUNCTION "soundpub-dashboard".update_timestamp();

DROP TRIGGER IF EXISTS update_artists_timestamp ON "soundpub-dashboard".artists;
CREATE TRIGGER update_artists_timestamp
  BEFORE UPDATE ON "soundpub-dashboard".artists
  FOR EACH ROW EXECUTE FUNCTION "soundpub-dashboard".update_timestamp();

DROP TRIGGER IF EXISTS update_releases_timestamp ON "soundpub-dashboard".releases;
CREATE TRIGGER update_releases_timestamp
  BEFORE UPDATE ON "soundpub-dashboard".releases
  FOR EACH ROW EXECUTE FUNCTION "soundpub-dashboard".update_timestamp();

DROP TRIGGER IF EXISTS update_tracks_timestamp ON "soundpub-dashboard".tracks;
CREATE TRIGGER update_tracks_timestamp
  BEFORE UPDATE ON "soundpub-dashboard".tracks
  FOR EACH ROW EXECUTE FUNCTION "soundpub-dashboard".update_timestamp();

DROP TRIGGER IF EXISTS update_royalty_uploads_timestamp ON "soundpub-dashboard".royalty_uploads;
CREATE TRIGGER update_royalty_uploads_timestamp
  BEFORE UPDATE ON "soundpub-dashboard".royalty_uploads
  FOR EACH ROW EXECUTE FUNCTION "soundpub-dashboard".update_timestamp();

DROP TRIGGER IF EXISTS update_payout_requests_timestamp ON "soundpub-dashboard".payout_requests;
CREATE TRIGGER update_payout_requests_timestamp
  BEFORE UPDATE ON "soundpub-dashboard".payout_requests
  FOR EACH ROW EXECUTE FUNCTION "soundpub-dashboard".update_timestamp();

DROP TRIGGER IF EXISTS update_composer_royalties_timestamp ON "soundpub-dashboard".composer_royalties;
CREATE TRIGGER update_composer_royalties_timestamp
  BEFORE UPDATE ON "soundpub-dashboard".composer_royalties
  FOR EACH ROW EXECUTE FUNCTION "soundpub-dashboard".update_timestamp();

-- Payout balance update trigger
DROP TRIGGER IF EXISTS on_payout_status_change ON "soundpub-dashboard".payout_requests;
CREATE TRIGGER on_payout_status_change
  BEFORE UPDATE ON "soundpub-dashboard".payout_requests
  FOR EACH ROW EXECUTE FUNCTION "soundpub-dashboard".update_balance_on_payout_status_change();

-- =====================================================
-- BAGIAN 7: ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE "soundpub-dashboard".profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE "soundpub-dashboard".user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE "soundpub-dashboard".artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE "soundpub-dashboard".releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE "soundpub-dashboard".tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE "soundpub-dashboard".royalty_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE "soundpub-dashboard".royalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE "soundpub-dashboard".composer_royalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE "soundpub-dashboard".payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE "soundpub-dashboard".audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE "soundpub-dashboard".app_settings ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- BAGIAN 8: RLS POLICIES - PROFILES
-- =====================================================

DROP POLICY IF EXISTS "Users can view their own profile" ON "soundpub-dashboard".profiles;
CREATE POLICY "Users can view their own profile" ON "soundpub-dashboard".profiles
  FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all profiles" ON "soundpub-dashboard".profiles;
CREATE POLICY "Admins can view all profiles" ON "soundpub-dashboard".profiles
  FOR SELECT USING ("soundpub-dashboard".is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage all profiles" ON "soundpub-dashboard".profiles;
CREATE POLICY "Admins can manage all profiles" ON "soundpub-dashboard".profiles
  FOR ALL USING ("soundpub-dashboard".is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can update their own profile" ON "soundpub-dashboard".profiles;
CREATE POLICY "Users can update their own profile" ON "soundpub-dashboard".profiles
  FOR UPDATE USING (id = auth.uid());

DROP POLICY IF EXISTS "Labels can view their artists" ON "soundpub-dashboard".profiles;
CREATE POLICY "Labels can view their artists" ON "soundpub-dashboard".profiles
  FOR SELECT USING ("soundpub-dashboard".has_role(auth.uid(), 'label') AND parent_label_id = auth.uid());

DROP POLICY IF EXISTS "Labels can update their artists" ON "soundpub-dashboard".profiles;
CREATE POLICY "Labels can update their artists" ON "soundpub-dashboard".profiles
  FOR UPDATE 
  USING ("soundpub-dashboard".has_role(auth.uid(), 'label') AND parent_label_id = auth.uid())
  WITH CHECK ("soundpub-dashboard".has_role(auth.uid(), 'label') AND (parent_label_id = auth.uid() OR parent_label_id IS NULL));

DROP POLICY IF EXISTS "Whitelabels can view their artists" ON "soundpub-dashboard".profiles;
CREATE POLICY "Whitelabels can view their artists" ON "soundpub-dashboard".profiles
  FOR SELECT USING ("soundpub-dashboard".has_role(auth.uid(), 'whitelabel') AND parent_label_id = auth.uid());

DROP POLICY IF EXISTS "Whitelabels can update their artists" ON "soundpub-dashboard".profiles;
CREATE POLICY "Whitelabels can update their artists" ON "soundpub-dashboard".profiles
  FOR UPDATE 
  USING ("soundpub-dashboard".has_role(auth.uid(), 'whitelabel') AND parent_label_id = auth.uid())
  WITH CHECK ("soundpub-dashboard".has_role(auth.uid(), 'whitelabel') AND (parent_label_id = auth.uid() OR parent_label_id IS NULL));

DROP POLICY IF EXISTS "Artists can view their parent label profile" ON "soundpub-dashboard".profiles;
CREATE POLICY "Artists can view their parent label profile" ON "soundpub-dashboard".profiles
  FOR SELECT USING ("soundpub-dashboard".has_role(auth.uid(), 'artist') AND id = "soundpub-dashboard".get_user_parent_label_id(auth.uid()));

DROP POLICY IF EXISTS "Users can view label profiles for their releases" ON "soundpub-dashboard".profiles;
CREATE POLICY "Users can view label profiles for their releases" ON "soundpub-dashboard".profiles
  FOR SELECT USING (id IN (SELECT "soundpub-dashboard".get_user_release_label_ids(auth.uid())));

-- =====================================================
-- BAGIAN 9: RLS POLICIES - USER ROLES
-- =====================================================

DROP POLICY IF EXISTS "Users can view their own roles" ON "soundpub-dashboard".user_roles;
CREATE POLICY "Users can view their own roles" ON "soundpub-dashboard".user_roles
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage all roles" ON "soundpub-dashboard".user_roles;
CREATE POLICY "Admins can manage all roles" ON "soundpub-dashboard".user_roles
  FOR ALL USING ("soundpub-dashboard".is_admin(auth.uid()));

-- =====================================================
-- BAGIAN 10: RLS POLICIES - ARTISTS
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all artists" ON "soundpub-dashboard".artists;
CREATE POLICY "Admins can manage all artists" ON "soundpub-dashboard".artists
  FOR ALL USING ("soundpub-dashboard".is_admin(auth.uid()));

DROP POLICY IF EXISTS "Labels can manage their own artists" ON "soundpub-dashboard".artists;
CREATE POLICY "Labels can manage their own artists" ON "soundpub-dashboard".artists
  FOR ALL 
  USING (label_id = auth.uid())
  WITH CHECK (label_id = auth.uid());

DROP POLICY IF EXISTS "Whitelabels can manage their own artists" ON "soundpub-dashboard".artists;
CREATE POLICY "Whitelabels can manage their own artists" ON "soundpub-dashboard".artists
  FOR ALL 
  USING ("soundpub-dashboard".has_role(auth.uid(), 'whitelabel') AND label_id = auth.uid())
  WITH CHECK ("soundpub-dashboard".has_role(auth.uid(), 'whitelabel') AND label_id = auth.uid());

DROP POLICY IF EXISTS "Admins, labels and associated artists can view artists" ON "soundpub-dashboard".artists;
CREATE POLICY "Admins, labels and associated artists can view artists" ON "soundpub-dashboard".artists
  FOR SELECT USING (
    "soundpub-dashboard".is_admin(auth.uid())
    OR label_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM "soundpub-dashboard".profiles p
      WHERE p.id = auth.uid()
      AND p.parent_label_id = artists.label_id
      AND "soundpub-dashboard".has_role(auth.uid(), 'artist')
    )
  );

-- =====================================================
-- BAGIAN 11: RLS POLICIES - RELEASES
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all releases" ON "soundpub-dashboard".releases;
CREATE POLICY "Admins can manage all releases" ON "soundpub-dashboard".releases
  FOR ALL 
  USING ("soundpub-dashboard".is_admin(auth.uid()))
  WITH CHECK ("soundpub-dashboard".is_admin(auth.uid()));

DROP POLICY IF EXISTS "Labels can manage their releases" ON "soundpub-dashboard".releases;
CREATE POLICY "Labels can manage their releases" ON "soundpub-dashboard".releases
  FOR ALL 
  USING ("soundpub-dashboard".has_role(auth.uid(), 'label') AND label_id = auth.uid())
  WITH CHECK ("soundpub-dashboard".has_role(auth.uid(), 'label') AND label_id = auth.uid());

DROP POLICY IF EXISTS "Whitelabels can manage their releases" ON "soundpub-dashboard".releases;
CREATE POLICY "Whitelabels can manage their releases" ON "soundpub-dashboard".releases
  FOR ALL 
  USING ("soundpub-dashboard".has_role(auth.uid(), 'whitelabel') AND label_id = auth.uid())
  WITH CHECK ("soundpub-dashboard".has_role(auth.uid(), 'whitelabel') AND label_id = auth.uid());

DROP POLICY IF EXISTS "Artists can view their releases" ON "soundpub-dashboard".releases;
CREATE POLICY "Artists can view their releases" ON "soundpub-dashboard".releases
  FOR SELECT 
  USING (
    "soundpub-dashboard".has_role(auth.uid(), 'artist') AND (
      artist_user_id = auth.uid()
      OR (artist_user_id IS NULL AND artist_name = "soundpub-dashboard".get_user_full_name(auth.uid()))
    )
  );

-- Artist can INSERT releases (auto-set label_id via parent_label_id)
DROP POLICY IF EXISTS "Artists can insert their releases" ON "soundpub-dashboard".releases;
CREATE POLICY "Artists can insert their releases" ON "soundpub-dashboard".releases
  FOR INSERT 
  WITH CHECK (
    "soundpub-dashboard".has_role(auth.uid(), 'artist')
    AND artist_user_id = auth.uid()
    AND label_id = "soundpub-dashboard".get_user_parent_label_id(auth.uid())
  );

-- Artist can UPDATE their own releases
DROP POLICY IF EXISTS "Artists can update their releases" ON "soundpub-dashboard".releases;
CREATE POLICY "Artists can update their releases" ON "soundpub-dashboard".releases
  FOR UPDATE 
  USING (
    "soundpub-dashboard".has_role(auth.uid(), 'artist') AND (
      artist_user_id = auth.uid()
      OR (artist_user_id IS NULL AND artist_name = "soundpub-dashboard".get_user_full_name(auth.uid()))
    )
  )
  WITH CHECK (
    "soundpub-dashboard".has_role(auth.uid(), 'artist')
    AND artist_user_id = auth.uid()
    AND label_id = "soundpub-dashboard".get_user_parent_label_id(auth.uid())
  );

-- =====================================================
-- BAGIAN 12: RLS POLICIES - TRACKS
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all tracks" ON "soundpub-dashboard".tracks;
CREATE POLICY "Admins can manage all tracks" ON "soundpub-dashboard".tracks
  FOR ALL 
  USING ("soundpub-dashboard".is_admin(auth.uid()))
  WITH CHECK ("soundpub-dashboard".is_admin(auth.uid()));

DROP POLICY IF EXISTS "Labels can manage tracks for their releases" ON "soundpub-dashboard".tracks;
CREATE POLICY "Labels can manage tracks for their releases" ON "soundpub-dashboard".tracks
  FOR ALL 
  USING ("soundpub-dashboard".has_role(auth.uid(), 'label') AND release_id IN (SELECT id FROM releases WHERE label_id = auth.uid()))
  WITH CHECK ("soundpub-dashboard".has_role(auth.uid(), 'label') AND release_id IN (SELECT id FROM releases WHERE label_id = auth.uid()));

DROP POLICY IF EXISTS "Whitelabels can manage tracks for their releases" ON "soundpub-dashboard".tracks;
CREATE POLICY "Whitelabels can manage tracks for their releases" ON "soundpub-dashboard".tracks
  FOR ALL 
  USING ("soundpub-dashboard".has_role(auth.uid(), 'whitelabel') AND release_id IN (SELECT id FROM releases WHERE label_id = auth.uid()))
  WITH CHECK ("soundpub-dashboard".has_role(auth.uid(), 'whitelabel') AND release_id IN (SELECT id FROM releases WHERE label_id = auth.uid()));

DROP POLICY IF EXISTS "Artists can view their tracks" ON "soundpub-dashboard".tracks;
CREATE POLICY "Artists can view their tracks" ON "soundpub-dashboard".tracks
  FOR SELECT 
  USING (
    "soundpub-dashboard".has_role(auth.uid(), 'artist') AND (
      artist_user_id = auth.uid()
      OR (artist_user_id IS NULL AND artist_name = "soundpub-dashboard".get_user_full_name(auth.uid()))
      OR artists @> jsonb_build_array(jsonb_build_object('name', "soundpub-dashboard".get_user_full_name(auth.uid())))
      OR EXISTS (
        SELECT 1 FROM releases 
        WHERE releases.id = tracks.release_id 
        AND (releases.artist_user_id = auth.uid() OR (releases.artist_user_id IS NULL AND releases.artist_name = "soundpub-dashboard".get_user_full_name(auth.uid())))
      )
    )
  );

-- Artist can INSERT tracks for their releases
DROP POLICY IF EXISTS "Artists can insert tracks for their releases" ON "soundpub-dashboard".tracks;
CREATE POLICY "Artists can insert tracks for their releases" ON "soundpub-dashboard".tracks
  FOR INSERT 
  WITH CHECK (
    "soundpub-dashboard".has_role(auth.uid(), 'artist')
    AND EXISTS (
      SELECT 1 FROM releases 
      WHERE releases.id = tracks.release_id 
      AND releases.artist_user_id = auth.uid()
      AND releases.label_id = "soundpub-dashboard".get_user_parent_label_id(auth.uid())
    )
  );

-- Artist can UPDATE tracks for their releases
DROP POLICY IF EXISTS "Artists can update tracks for their releases" ON "soundpub-dashboard".tracks;
CREATE POLICY "Artists can update tracks for their releases" ON "soundpub-dashboard".tracks
  FOR UPDATE 
  USING (
    "soundpub-dashboard".has_role(auth.uid(), 'artist')
    AND EXISTS (
      SELECT 1 FROM releases 
      WHERE releases.id = tracks.release_id 
      AND (releases.artist_user_id = auth.uid() OR (releases.artist_user_id IS NULL AND releases.artist_name = "soundpub-dashboard".get_user_full_name(auth.uid())))
    )
  )
  WITH CHECK (
    "soundpub-dashboard".has_role(auth.uid(), 'artist')
    AND EXISTS (
      SELECT 1 FROM releases 
      WHERE releases.id = tracks.release_id 
      AND releases.artist_user_id = auth.uid()
    )
  );

-- =====================================================
-- BAGIAN 13: RLS POLICIES - ROYALTY UPLOADS
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all uploads" ON "soundpub-dashboard".royalty_uploads;
CREATE POLICY "Admins can manage all uploads" ON "soundpub-dashboard".royalty_uploads
  FOR ALL USING ("soundpub-dashboard".is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view their own uploads" ON "soundpub-dashboard".royalty_uploads;
CREATE POLICY "Users can view their own uploads" ON "soundpub-dashboard".royalty_uploads
  FOR SELECT USING (user_id = auth.uid());

-- =====================================================
-- BAGIAN 14: RLS POLICIES - ROYALTIES
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all royalties" ON "soundpub-dashboard".royalties;
CREATE POLICY "Admins can manage all royalties" ON "soundpub-dashboard".royalties
  FOR ALL USING ("soundpub-dashboard".is_admin(auth.uid()));

DROP POLICY IF EXISTS "Labels can view royalties for their artists" ON "soundpub-dashboard".royalties;
CREATE POLICY "Labels can view royalties for their artists" ON "soundpub-dashboard".royalties
  FOR SELECT 
  USING ("soundpub-dashboard".has_role(auth.uid(), 'label') AND label_name = "soundpub-dashboard".get_user_full_name(auth.uid()));

DROP POLICY IF EXISTS "Whitelabels can view royalties for their artists" ON "soundpub-dashboard".royalties;
CREATE POLICY "Whitelabels can view royalties for their artists" ON "soundpub-dashboard".royalties
  FOR SELECT 
  USING ("soundpub-dashboard".has_role(auth.uid(), 'whitelabel') AND label_name = "soundpub-dashboard".get_user_full_name(auth.uid()));

DROP POLICY IF EXISTS "Artists can view their royalties" ON "soundpub-dashboard".royalties;
CREATE POLICY "Artists can view their royalties" ON "soundpub-dashboard".royalties
  FOR SELECT 
  USING (
    "soundpub-dashboard".has_role(auth.uid(), 'artist') AND (
      artist_user_id = auth.uid()
      OR (artist_user_id IS NULL AND artist = "soundpub-dashboard".get_user_full_name(auth.uid()))
    )
  );

-- =====================================================
-- BAGIAN 15: RLS POLICIES - COMPOSER ROYALTIES
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all composer royalties" ON "soundpub-dashboard".composer_royalties;
CREATE POLICY "Admins can manage all composer royalties" ON "soundpub-dashboard".composer_royalties
  FOR ALL USING ("soundpub-dashboard".is_admin(auth.uid()));

DROP POLICY IF EXISTS "Copyright users can view composer royalties" ON "soundpub-dashboard".composer_royalties;
CREATE POLICY "Copyright users can view composer royalties" ON "soundpub-dashboard".composer_royalties
  FOR SELECT USING ("soundpub-dashboard".has_role(auth.uid(), 'copyright'));

-- =====================================================
-- BAGIAN 16: RLS POLICIES - PAYOUT REQUESTS
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all payouts" ON "soundpub-dashboard".payout_requests;
CREATE POLICY "Admins can manage all payouts" ON "soundpub-dashboard".payout_requests
  FOR ALL USING ("soundpub-dashboard".is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view their own payouts" ON "soundpub-dashboard".payout_requests;
CREATE POLICY "Users can view their own payouts" ON "soundpub-dashboard".payout_requests
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create pending payouts" ON "soundpub-dashboard".payout_requests;
CREATE POLICY "Users can create pending payouts" ON "soundpub-dashboard".payout_requests
  FOR INSERT WITH CHECK (user_id = auth.uid() AND status = 'pending' AND amount > 0);

DROP POLICY IF EXISTS "Users can cancel pending payouts" ON "soundpub-dashboard".payout_requests;
CREATE POLICY "Users can cancel pending payouts" ON "soundpub-dashboard".payout_requests
  FOR DELETE USING (user_id = auth.uid() AND status = 'pending');

-- =====================================================
-- BAGIAN 17: RLS POLICIES - AUDIT LOGS
-- =====================================================

DROP POLICY IF EXISTS "Admins can view all audit logs" ON "soundpub-dashboard".audit_logs;
CREATE POLICY "Admins can view all audit logs" ON "soundpub-dashboard".audit_logs
  FOR SELECT USING ("soundpub-dashboard".is_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can insert audit logs" ON "soundpub-dashboard".audit_logs;
CREATE POLICY "Service role can insert audit logs" ON "soundpub-dashboard".audit_logs
  FOR INSERT WITH CHECK (true);

-- =====================================================
-- BAGIAN 18: RLS POLICIES - APP SETTINGS
-- =====================================================

DROP POLICY IF EXISTS "Anyone can view app settings" ON "soundpub-dashboard".app_settings;
CREATE POLICY "Anyone can view app settings" ON "soundpub-dashboard".app_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Superadmins can manage app settings" ON "soundpub-dashboard".app_settings;
CREATE POLICY "Superadmins can manage app settings" ON "soundpub-dashboard".app_settings
  FOR ALL USING ("soundpub-dashboard".has_role(auth.uid(), 'superadmin'));

-- =====================================================
-- BAGIAN 19: STORAGE BUCKETS
-- =====================================================

INSERT INTO storage.buckets (id, name, public) VALUES 
  ('release-covers', 'release-covers', false),
  ('track-audio', 'track-audio', false),
  ('track-video', 'track-video', false),
  ('audio-clips', 'audio-clips', true),
  ('label-logos', 'label-logos', true)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- BAGIAN 20: STORAGE POLICIES
-- =====================================================

-- Clean up existing storage policies first
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    END LOOP;
END $$;

-- release-covers policies (private bucket)
CREATE POLICY "Authenticated users can view release covers" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'release-covers');

CREATE POLICY "Admins can manage release covers" ON storage.objects
  FOR ALL TO authenticated 
  USING (bucket_id = 'release-covers' AND "soundpub-dashboard".is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'release-covers' AND "soundpub-dashboard".is_admin(auth.uid()));

CREATE POLICY "Labels can upload release covers" ON storage.objects
  FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'release-covers' AND ("soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel') OR "soundpub-dashboard".has_role(auth.uid(), 'artist')));

CREATE POLICY "Labels can update release covers" ON storage.objects
  FOR UPDATE TO authenticated 
  USING (bucket_id = 'release-covers' AND ("soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel') OR "soundpub-dashboard".has_role(auth.uid(), 'artist')));

CREATE POLICY "Labels can delete release covers" ON storage.objects
  FOR DELETE TO authenticated 
  USING (bucket_id = 'release-covers' AND ("soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel') OR "soundpub-dashboard".is_admin(auth.uid())));

-- track-audio policies (private bucket)
CREATE POLICY "Authenticated users can view track audio" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'track-audio');

CREATE POLICY "Admins can manage track audio" ON storage.objects
  FOR ALL TO authenticated 
  USING (bucket_id = 'track-audio' AND "soundpub-dashboard".is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'track-audio' AND "soundpub-dashboard".is_admin(auth.uid()));

CREATE POLICY "Labels can upload track audio" ON storage.objects
  FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'track-audio' AND ("soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel') OR "soundpub-dashboard".has_role(auth.uid(), 'artist')));

CREATE POLICY "Labels can update track audio" ON storage.objects
  FOR UPDATE TO authenticated 
  USING (bucket_id = 'track-audio' AND ("soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel') OR "soundpub-dashboard".has_role(auth.uid(), 'artist')));

CREATE POLICY "Labels can delete track audio" ON storage.objects
  FOR DELETE TO authenticated 
  USING (bucket_id = 'track-audio' AND ("soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel') OR "soundpub-dashboard".is_admin(auth.uid())));

-- track-video policies (private bucket)
CREATE POLICY "Authenticated users can view track video" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'track-video');

CREATE POLICY "Admins can manage track video" ON storage.objects
  FOR ALL TO authenticated 
  USING (bucket_id = 'track-video' AND "soundpub-dashboard".is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'track-video' AND "soundpub-dashboard".is_admin(auth.uid()));

CREATE POLICY "Labels can upload track video" ON storage.objects
  FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'track-video' AND ("soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel') OR "soundpub-dashboard".has_role(auth.uid(), 'artist')));

CREATE POLICY "Labels can delete track video" ON storage.objects
  FOR DELETE TO authenticated 
  USING (bucket_id = 'track-video' AND ("soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel') OR "soundpub-dashboard".is_admin(auth.uid())));

-- audio-clips policies (public bucket)
CREATE POLICY "Anyone can view audio clips" ON storage.objects
  FOR SELECT USING (bucket_id = 'audio-clips');

CREATE POLICY "Admins can manage audio clips" ON storage.objects
  FOR ALL TO authenticated 
  USING (bucket_id = 'audio-clips' AND "soundpub-dashboard".is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'audio-clips' AND "soundpub-dashboard".is_admin(auth.uid()));

CREATE POLICY "Labels can upload audio clips" ON storage.objects
  FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'audio-clips' AND ("soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel') OR "soundpub-dashboard".has_role(auth.uid(), 'artist')));

CREATE POLICY "Labels can delete audio clips" ON storage.objects
  FOR DELETE TO authenticated 
  USING (bucket_id = 'audio-clips' AND ("soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel') OR "soundpub-dashboard".is_admin(auth.uid())));

-- label-logos policies (public bucket)
CREATE POLICY "Anyone can view label logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'label-logos');

CREATE POLICY "Admins can manage label logos" ON storage.objects
  FOR ALL TO authenticated 
  USING (bucket_id = 'label-logos' AND "soundpub-dashboard".is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'label-logos' AND "soundpub-dashboard".is_admin(auth.uid()));

CREATE POLICY "Labels can upload label logos" ON storage.objects
  FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'label-logos' AND ("soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel')));

CREATE POLICY "Labels can update label logos" ON storage.objects
  FOR UPDATE TO authenticated 
  USING (bucket_id = 'label-logos' AND ("soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel')));

CREATE POLICY "Labels can delete label logos" ON storage.objects
  FOR DELETE TO authenticated 
  USING (bucket_id = 'label-logos' AND ("soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel') OR "soundpub-dashboard".is_admin(auth.uid())));

-- =====================================================
-- BAGIAN 21: DEFAULT APP SETTINGS
-- =====================================================

INSERT INTO "soundpub-dashboard".app_settings (key, value) VALUES 
  ('ga4_measurement_id', NULL),
  ('app_name', 'SoundPub Dashboard'),
  ('storage_provider', 'supabase')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- BAGIAN 22: CATATAN MIGRASI
-- =====================================================
-- 
-- Catatan: Sistem sudah bermigrasi dari GCS ke Supabase Storage.
-- Edge functions GCS (gcs-upload, gcs-manage) sudah di-disable.
--
-- Daftar Edge Functions yang perlu di-deploy:
--   1. create-user
--   2. delete-user
--   3. update-user-status
--   4. update-user-password
--   5. change-own-password
--   6. remove-artist-from-label
--   7. process-royalty-upload
--   8. create-whitelabel-artist
--   9. set-artist-password
--  10. update-app-settings
--  11. get-ga4-config
--  12. send-royalty-notification
--  13. get-catalog-tracks
--  14. test-gcs (opsional)
--  15. gcs-upload (disabled)
--  16. gcs-manage (disabled)
--
-- Secrets yang perlu dikonfigurasi di Supabase target:
--   - RESEND_API_KEY (untuk email notifikasi)
--   - GA4_MEASUREMENT_ID (untuk Google Analytics)
--   - GCS_BUCKET_NAME (opsional, jika pakai GCS)
--   - GCS_PROJECT_ID (opsional, jika pakai GCS)
--   - GCS_SERVICE_ACCOUNT_KEY (opsional, jika pakai GCS)

-- =====================================================
-- BAGIAN 23: ARTIST INTEGRATION & SYNC
-- =====================================================
--
-- Sistem sinkronisasi artis antara profiles dan artists table:
--
-- 1. Ketika Admin/Superadmin menambahkan user dengan role 'artist' dan parent_label_id:
--    - Edge function 'create-user' otomatis insert ke tabel 'artists' dengan label_id = parent_label_id
--
-- 2. Ketika Admin mengubah role user menjadi 'artist' di ChangeRoleDialog:
--    - Client-side code sinkronkan ke tabel 'artists'
--
-- 3. Ketika Label/Whitelabel menambahkan artist di AddUserDialog:
--    - Untuk Whitelabel: edge function 'create-whitelabel-artist' otomatis insert ke 'artists'
--    - Untuk Label biasa: client-side code sinkronkan ke 'artists'
--
-- 4. Artis bisa membuat release sendiri via ReleaseFormDialog:
--    - label_id otomatis diisi dari parent_label_id
--    - artist_name otomatis diisi dari full_name profil artis
--    - RLS policy memvalidasi artist_user_id dan label_id
--
-- Untuk migrasi data lama, jalankan query berikut:
-- 
-- INSERT INTO artists (name, label_id)
-- SELECT p.full_name, p.parent_label_id
-- FROM profiles p
-- JOIN user_roles ur ON p.id = ur.user_id
-- WHERE ur.role = 'artist' 
--   AND p.parent_label_id IS NOT NULL
--   AND NOT EXISTS (
--     SELECT 1 FROM artists a 
--     WHERE a.name = p.full_name 
--     AND a.label_id = p.parent_label_id
--   );

-- =====================================================
-- BAGIAN TAMBAHAN: PAYMENT GATEWAY (Xendit)
-- =====================================================

-- Tabel release_payments untuk tracking pembayaran release
CREATE TABLE IF NOT EXISTS "soundpub-dashboard".release_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  release_id UUID NOT NULL REFERENCES "soundpub-dashboard".releases(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_release_payments_release_id ON "soundpub-dashboard".release_payments(release_id);
CREATE INDEX IF NOT EXISTS idx_release_payments_user_id ON "soundpub-dashboard".release_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_release_payments_status ON "soundpub-dashboard".release_payments(status);
CREATE INDEX IF NOT EXISTS idx_release_payments_xendit_invoice_id ON "soundpub-dashboard".release_payments(xendit_invoice_id);

ALTER TABLE "soundpub-dashboard".release_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own payments"
ON "soundpub-dashboard".release_payments FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own payments"
ON "soundpub-dashboard".release_payments FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all payments"
ON "soundpub-dashboard".release_payments FOR ALL TO authenticated
USING ("soundpub-dashboard".is_admin(auth.uid()));

CREATE TRIGGER update_release_payments_timestamp
  BEFORE UPDATE ON "soundpub-dashboard".release_payments
  FOR EACH ROW EXECUTE FUNCTION "soundpub-dashboard".update_timestamp();

-- Harga per track (configurable)
INSERT INTO "soundpub-dashboard".app_settings (key, value) VALUES ('release_price_per_track', '50000')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- END OF SCHEMA EXPORT v2.3
-- =====================================================

-- =====================================================
-- APPENDIX v2.4 — Delta Juni–Juli 2026
-- Terapkan setelah base schema v2.3 di atas. Idempotent
-- (aman dijalankan ulang kalau sudah pernah apply).
-- =====================================================

-- ---- 1) Notifications hardening (2026-06-13) ----
DROP POLICY IF EXISTS "Users can insert own notifications" ON "soundpub-dashboard".notifications;
CREATE POLICY "Users can insert own notifications"
  ON "soundpub-dashboard".notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    "soundpub-dashboard".is_admin(auth.uid())
    OR (user_id = auth.uid() AND COALESCE(is_global, false) = false)
  );

-- Trigger functions: revoke direct EXECUTE dari anon/PUBLIC
REVOKE EXECUTE ON FUNCTION "soundpub-dashboard".handle_new_user() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION "soundpub-dashboard".prevent_profile_privilege_escalation() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION "soundpub-dashboard".update_balance_on_payout_status_change() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION "soundpub-dashboard".update_timestamp() FROM anon, PUBLIC;

-- ---- 2) Storage: buang policy role-only lama, pakai path-scoped ----
DROP POLICY IF EXISTS "Labels can delete their own audio files" ON storage.objects;
DROP POLICY IF EXISTS "Labels can delete their own video files" ON storage.objects;
DROP POLICY IF EXISTS "Labels can view audio for their releases" ON storage.objects;
DROP POLICY IF EXISTS "Labels can view video for their releases" ON storage.objects;
DROP POLICY IF EXISTS "Whitelabels can view track audio" ON storage.objects;
DROP POLICY IF EXISTS "Whitelabels can view track video" ON storage.objects;
DROP POLICY IF EXISTS "Labels can upload release covers" ON storage.objects;
DROP POLICY IF EXISTS "Labels can update their release covers" ON storage.objects;
DROP POLICY IF EXISTS "Artists can upload release covers" ON storage.objects;
DROP POLICY IF EXISTS "Whitelabels can upload release covers" ON storage.objects;
DROP POLICY IF EXISTS "Labels can upload track audio" ON storage.objects;
DROP POLICY IF EXISTS "Artists can upload track audio" ON storage.objects;
DROP POLICY IF EXISTS "Whitelabels can upload track audio" ON storage.objects;
DROP POLICY IF EXISTS "Labels can upload track video" ON storage.objects;
DROP POLICY IF EXISTS "Artists can upload track video" ON storage.objects;
DROP POLICY IF EXISTS "Whitelabels can upload track video" ON storage.objects;
DROP POLICY IF EXISTS "Admins and labels can upload release covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can upload to release-cov" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can upload to track-audio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can upload to audio-clips" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can update track-audio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can delete from track-audio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can update audio-clips" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can delete from audio-clips" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can update release-covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can delete from release-covers" ON storage.objects;
DROP POLICY IF EXISTS "Roles can upload to release-covers" ON storage.objects;
DROP POLICY IF EXISTS "Roles can update release-covers" ON storage.objects;
DROP POLICY IF EXISTS "Roles can delete release-covers" ON storage.objects;
DROP POLICY IF EXISTS "Roles can update audio-clips" ON storage.objects;
DROP POLICY IF EXISTS "Roles can delete audio-clips" ON storage.objects;
DROP POLICY IF EXISTS "Roles can upload to track-audio" ON storage.objects;
DROP POLICY IF EXISTS "Roles can update track-audio" ON storage.objects;
DROP POLICY IF EXISTS "Roles can delete track-audio" ON storage.objects;
DROP POLICY IF EXISTS "Roles can upload to track-video" ON storage.objects;
DROP POLICY IF EXISTS "Roles can update track-video" ON storage.objects;
DROP POLICY IF EXISTS "Roles can delete track-video" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view release covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read release-covers" ON storage.objects;
DROP POLICY IF EXISTS "Labels can upload audio for their releases" ON storage.objects;
DROP POLICY IF EXISTS "Labels can upload video for their releases" ON storage.objects;
DROP POLICY IF EXISTS "Labels can upload audio clips" ON storage.objects;
DROP POLICY IF EXISTS "Whitelabels can upload video" ON storage.objects;
DROP POLICY IF EXISTS "Artists can upload video for their releases" ON storage.objects;

-- release-covers: folder-scoped INSERT + UPDATE + DELETE
CREATE POLICY "Users can upload release covers to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'release-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
      "soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'artist')
      OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel') OR "soundpub-dashboard".is_admin(auth.uid())
    )
  );
CREATE POLICY "Users can update release covers in own folder"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'release-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "Owners and admins can update release-covers"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'release-covers'
    AND ("soundpub-dashboard".is_admin(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text)
  );
CREATE POLICY "Owners and admins can delete release-covers"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'release-covers'
    AND ("soundpub-dashboard".is_admin(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text)
  );

-- release-covers: scoped read (owner folder / admin / parent label)
CREATE POLICY "Scoped read release-covers"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'release-covers'
    AND (
      "soundpub-dashboard".is_admin(auth.uid())
      OR (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM "soundpub-dashboard".profiles p
        WHERE p.id::text = (storage.foldername(name))[1]
          AND p.parent_label_id = auth.uid()
      )
    )
  );

-- track-audio: folder-scoped INSERT only (UPDATE/DELETE via owner+admin below)
CREATE POLICY "Users can upload track audio to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'track-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
      "soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'artist')
      OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel') OR "soundpub-dashboard".is_admin(auth.uid())
    )
  );

-- track-video: folder-scoped INSERT
CREATE POLICY "Users can upload track video to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'track-video'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
      "soundpub-dashboard".has_role(auth.uid(), 'label') OR "soundpub-dashboard".has_role(auth.uid(), 'artist')
      OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel') OR "soundpub-dashboard".is_admin(auth.uid())
    )
  );

-- audio-clips: folder-scoped INSERT + owner/admin update/delete
CREATE POLICY "Users can upload audio clips to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'audio-clips'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
      "soundpub-dashboard".is_admin(auth.uid())
      OR "soundpub-dashboard".has_role(auth.uid(), 'label')
      OR "soundpub-dashboard".has_role(auth.uid(), 'whitelabel')
      OR "soundpub-dashboard".has_role(auth.uid(), 'artist')
    )
  );
CREATE POLICY "Owners and admins can update audio-clips"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'audio-clips'
    AND ("soundpub-dashboard".is_admin(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text)
  );
CREATE POLICY "Owners and admins can delete audio-clips"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'audio-clips'
    AND ("soundpub-dashboard".is_admin(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text)
  );

-- ---- 3) Audit logs: buang direct INSERT dari client (edge function only) ----
DROP POLICY IF EXISTS "Authenticated users can insert own audit logs" ON "soundpub-dashboard".audit_logs;

-- ---- 4) label_profile_update_safe helper ----
CREATE OR REPLACE FUNCTION "soundpub-dashboard".label_profile_update_safe(
  _id uuid,
  _balance numeric,
  _label_revenue numeric,
  _artist_revenue numeric,
  _subscription_status text,
  _parent_label_id uuid,
  _composer_code text,
  _status text,
  _email text,
  _sso_provider text,
  _sso_user_id text,
  _sso_user_type text,
  _password_set boolean
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = "soundpub-dashboard"
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "soundpub-dashboard".profiles p
    WHERE p.id = _id
      AND p.balance IS NOT DISTINCT FROM _balance
      AND p.label_revenue IS NOT DISTINCT FROM _label_revenue
      AND p.artist_revenue IS NOT DISTINCT FROM _artist_revenue
      AND p.subscription_status IS NOT DISTINCT FROM _subscription_status
      AND p.parent_label_id IS NOT DISTINCT FROM _parent_label_id
      AND p.composer_code IS NOT DISTINCT FROM _composer_code
      AND p.status IS NOT DISTINCT FROM _status
      AND p.email IS NOT DISTINCT FROM _email
      AND p.sso_provider IS NOT DISTINCT FROM _sso_provider
      AND p.sso_user_id IS NOT DISTINCT FROM _sso_user_id
      AND p.sso_user_type IS NOT DISTINCT FROM _sso_user_type
      AND p.password_set IS NOT DISTINCT FROM _password_set
  )
$$;
REVOKE EXECUTE ON FUNCTION "soundpub-dashboard".label_profile_update_safe(uuid,numeric,numeric,numeric,text,uuid,text,text,text,text,text,text,boolean) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION "soundpub-dashboard".label_profile_update_safe(uuid,numeric,numeric,numeric,text,uuid,text,text,text,text,text,text,boolean) TO authenticated;

-- Profiles: WITH CHECK guard di self-update + label/whitelabel update artist
DROP POLICY IF EXISTS "Users can update their own profile" ON "soundpub-dashboard".profiles;
CREATE POLICY "Users can update their own profile"
  ON "soundpub-dashboard".profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND "soundpub-dashboard".label_profile_update_safe(
      id, balance, label_revenue, artist_revenue,
      subscription_status, parent_label_id, composer_code,
      status, email, sso_provider, sso_user_id, sso_user_type, password_set
    )
  );

DROP POLICY IF EXISTS "Labels can update their artists" ON "soundpub-dashboard".profiles;
DROP POLICY IF EXISTS "Whitelabels can update their artists" ON "soundpub-dashboard".profiles;
CREATE POLICY "Labels can update their artists (safe fields)"
  ON "soundpub-dashboard".profiles FOR UPDATE TO authenticated
  USING ("soundpub-dashboard".has_role(auth.uid(), 'label') AND parent_label_id = auth.uid())
  WITH CHECK (
    "soundpub-dashboard".has_role(auth.uid(), 'label') AND parent_label_id = auth.uid()
    AND "soundpub-dashboard".label_profile_update_safe(
      id, balance, label_revenue, artist_revenue,
      subscription_status, parent_label_id, composer_code,
      status, email, sso_provider, sso_user_id, sso_user_type, password_set
    )
  );
CREATE POLICY "Whitelabels can update their artists (safe fields)"
  ON "soundpub-dashboard".profiles FOR UPDATE TO authenticated
  USING ("soundpub-dashboard".has_role(auth.uid(), 'whitelabel') AND parent_label_id = auth.uid())
  WITH CHECK (
    "soundpub-dashboard".has_role(auth.uid(), 'whitelabel') AND parent_label_id = auth.uid()
    AND "soundpub-dashboard".label_profile_update_safe(
      id, balance, label_revenue, artist_revenue,
      subscription_status, parent_label_id, composer_code,
      status, email, sso_provider, sso_user_id, sso_user_type, password_set
    )
  );

-- payout_requests: restrictive UPDATE hanya admin
CREATE POLICY "Only admins can update payouts"
  ON "soundpub-dashboard".payout_requests AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ("soundpub-dashboard".is_admin(auth.uid()))
  WITH CHECK ("soundpub-dashboard".is_admin(auth.uid()));

-- ---- 5) Email notification opt-in + email_send_log (2026-06-24) ----
ALTER TABLE "soundpub-dashboard".profiles
  ADD COLUMN IF NOT EXISTS email_notif_payout boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_notif_release boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_notif_payment boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_notif_announcement boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "soundpub-dashboard".email_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL,
  recipient_email text NOT NULL,
  recipient_user_id uuid,
  status text NOT NULL,                       -- sent | failed | suppressed
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON "soundpub-dashboard".email_send_log TO authenticated;
GRANT ALL ON "soundpub-dashboard".email_send_log TO service_role;
ALTER TABLE "soundpub-dashboard".email_send_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view email send log" ON "soundpub-dashboard".email_send_log;
CREATE POLICY "Admins can view email send log"
  ON "soundpub-dashboard".email_send_log FOR SELECT TO authenticated
  USING ("soundpub-dashboard".is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_email_send_log_created_at
  ON "soundpub-dashboard".email_send_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_template
  ON "soundpub-dashboard".email_send_log (template_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_idem
  ON "soundpub-dashboard".email_send_log (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---- 6) Royalties: label_user_id stable identifier (2026-06-25) ----
ALTER TABLE "soundpub-dashboard".royalties
  ADD COLUMN IF NOT EXISTS label_user_id uuid REFERENCES "soundpub-dashboard".profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_royalties_label_user_id ON "soundpub-dashboard".royalties(label_user_id);

-- Backfill dari full_name unik
WITH unique_labels AS (
  SELECT lower(trim(p.full_name)) AS name_key, MIN(p.id::text)::uuid AS only_id
  FROM "soundpub-dashboard".profiles p
  JOIN "soundpub-dashboard".user_roles ur ON ur.user_id = p.id
  WHERE ur.role IN ('label','whitelabel')
    AND p.full_name IS NOT NULL AND trim(p.full_name) <> ''
  GROUP BY 1
  HAVING COUNT(*) = 1
)
UPDATE "soundpub-dashboard".royalties r
   SET label_user_id = ul.only_id
  FROM unique_labels ul
 WHERE r.label_user_id IS NULL
   AND lower(trim(r.label_name)) = ul.name_key;

DROP POLICY IF EXISTS "Labels can view royalties for their artists" ON "soundpub-dashboard".royalties;
CREATE POLICY "Labels can view royalties for their artists"
  ON "soundpub-dashboard".royalties FOR SELECT TO authenticated
  USING ("soundpub-dashboard".has_role(auth.uid(), 'label') AND label_user_id = auth.uid());

DROP POLICY IF EXISTS "Whitelabels can view royalties for their artists" ON "soundpub-dashboard".royalties;
CREATE POLICY "Whitelabels can view royalties for their artists"
  ON "soundpub-dashboard".royalties FOR SELECT TO authenticated
  USING ("soundpub-dashboard".has_role(auth.uid(), 'whitelabel') AND label_user_id = auth.uid());

-- ---- 7) prevent_profile_privilege_escalation: service role bypass (2026-06-19) ----
CREATE OR REPLACE FUNCTION "soundpub-dashboard".prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'soundpub-dashboard'
AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF "soundpub-dashboard".is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.balance IS DISTINCT FROM OLD.balance
     OR NEW.label_revenue IS DISTINCT FROM OLD.label_revenue
     OR NEW.artist_revenue IS DISTINCT FROM OLD.artist_revenue
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_upgraded_at IS DISTINCT FROM OLD.subscription_upgraded_at
     OR NEW.parent_label_id IS DISTINCT FROM OLD.parent_label_id
     OR NEW.composer_code IS DISTINCT FROM OLD.composer_code
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.sso_provider IS DISTINCT FROM OLD.sso_provider
     OR NEW.sso_user_id IS DISTINCT FROM OLD.sso_user_id
     OR NEW.sso_user_type IS DISTINCT FROM OLD.sso_user_type
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.password_set IS DISTINCT FROM OLD.password_set
  THEN
    RAISE EXCEPTION 'Not allowed to modify privileged profile fields';
  END IF;
  RETURN NEW;
END;
$$;

-- =====================================================
-- END OF APPENDIX v2.4
-- =====================================================


-- =====================================================
-- BAGIAN AKHIR: GRANT TABEL (WAJIB — PostgREST tidak grant otomatis)
-- =====================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "soundpub-dashboard" TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA "soundpub-dashboard" TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "soundpub-dashboard" TO authenticated, service_role;

-- anon HANYA untuk branding login page (app_settings dibatasi oleh RLS)
GRANT SELECT ON "soundpub-dashboard".app_settings TO anon;

-- Verifikasi
--   SELECT tablename FROM pg_tables WHERE schemaname = 'soundpub-dashboard';
--   SELECT tablename, count(*) FROM pg_policies
--     WHERE schemaname = 'soundpub-dashboard' GROUP BY 1 ORDER BY 1;
-- =====================================================
