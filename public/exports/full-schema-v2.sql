-- =====================================================
-- SoundPub Dashboard - Full Database Schema Export v2.2
-- Updated: April 2026
-- Untuk migrasi ke Supabase Self-Hosted di VPS
-- =====================================================

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
  CREATE TYPE public.app_role AS ENUM (
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
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'whitelabel';
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'copyright';
END $$;

-- =====================================================
-- BAGIAN 3: TABLES
-- =====================================================

-- Profiles table (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
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
  parent_label_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- User roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Artists table
CREATE TABLE IF NOT EXISTS public.artists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Releases table
CREATE TABLE IF NOT EXISTS public.releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id UUID NOT NULL REFERENCES public.profiles(id),
  created_by UUID REFERENCES public.profiles(id),
  artist_user_id UUID REFERENCES public.profiles(id),
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
CREATE TABLE IF NOT EXISTS public.tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  artist_user_id UUID REFERENCES public.profiles(id),
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
CREATE TABLE IF NOT EXISTS public.royalty_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
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
CREATE TABLE IF NOT EXISTS public.royalties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES public.royalty_uploads(id) ON DELETE CASCADE,
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
CREATE TABLE IF NOT EXISTS public.composer_royalties (
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
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  amount NUMERIC NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_holder_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  processed_by UUID REFERENCES public.profiles(id),
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
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
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =====================================================
-- BAGIAN 4: INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_profiles_parent_label ON public.profiles(parent_label_id);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_composer_code ON public.profiles(composer_code);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);
CREATE INDEX IF NOT EXISTS idx_artists_label_id ON public.artists(label_id);
CREATE INDEX IF NOT EXISTS idx_artists_name ON public.artists(name);
CREATE INDEX IF NOT EXISTS idx_releases_label_id ON public.releases(label_id);
CREATE INDEX IF NOT EXISTS idx_releases_status ON public.releases(status);
CREATE INDEX IF NOT EXISTS idx_releases_artist_name ON public.releases(artist_name);
CREATE INDEX IF NOT EXISTS idx_releases_artist_user_id ON public.releases(artist_user_id);
CREATE INDEX IF NOT EXISTS idx_releases_upc ON public.releases(upc);
CREATE INDEX IF NOT EXISTS idx_tracks_release_id ON public.tracks(release_id);
CREATE INDEX IF NOT EXISTS idx_tracks_isrc ON public.tracks(isrc);
CREATE INDEX IF NOT EXISTS idx_tracks_artist_user_id ON public.tracks(artist_user_id);
CREATE INDEX IF NOT EXISTS idx_royalty_uploads_user_id ON public.royalty_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_royalties_upload_id ON public.royalties(upload_id);
CREATE INDEX IF NOT EXISTS idx_royalties_period ON public.royalties(period);
CREATE INDEX IF NOT EXISTS idx_royalties_label_name ON public.royalties(label_name);
CREATE INDEX IF NOT EXISTS idx_royalties_isrc ON public.royalties(isrc);
CREATE INDEX IF NOT EXISTS idx_royalties_artist ON public.royalties(artist);
CREATE INDEX IF NOT EXISTS idx_royalties_artist_user_id ON public.royalties(artist_user_id);
CREATE INDEX IF NOT EXISTS idx_composer_royalties_composer_id ON public.composer_royalties(composer_id);
CREATE INDEX IF NOT EXISTS idx_composer_royalties_period ON public.composer_royalties(period);
CREATE INDEX IF NOT EXISTS idx_payout_requests_user_id ON public.payout_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON public.payout_requests(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

-- =====================================================
-- BAGIAN 5: SECURITY DEFINER FUNCTIONS (Core)
-- =====================================================

-- Check if user has specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Check if user is admin (superadmin or admin)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('superadmin', 'admin')
  )
$$;

-- Check if user is whitelabel
CREATE OR REPLACE FUNCTION public.is_whitelabel(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'whitelabel'
  )
$$;

-- Get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Get user full name
CREATE OR REPLACE FUNCTION public.get_user_full_name(_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT full_name FROM public.profiles
  WHERE id = _user_id
$$;

-- Get user parent label id
CREATE OR REPLACE FUNCTION public.get_user_parent_label_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT parent_label_id FROM public.profiles
  WHERE id = _user_id
$$;

-- Get release label ids for user
CREATE OR REPLACE FUNCTION public.get_user_release_label_ids(_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT label_id FROM public.releases
  WHERE label_id = _user_id 
     OR artist_name = (SELECT full_name FROM public.profiles WHERE id = _user_id)
$$;

-- Get artist user_id by name (for matching)
CREATE OR REPLACE FUNCTION public.get_artist_user_id_by_name(_artist_name TEXT, _label_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
CREATE OR REPLACE FUNCTION public.get_royalty_stats()
RETURNS TABLE(total_revenue NUMERIC, total_streams BIGINT, unique_artists BIGINT, unique_labels BIGINT, unique_platforms BIGINT, unique_tracks BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
      WHEN is_admin(auth.uid()) THEN true
      WHEN has_role(auth.uid(), 'label') OR has_role(auth.uid(), 'whitelabel') THEN
        r.label_name = get_user_full_name(auth.uid())
      WHEN has_role(auth.uid(), 'artist') THEN
        r.artist_user_id = auth.uid() OR (r.artist_user_id IS NULL AND r.artist = get_user_full_name(auth.uid()))
      ELSE false
    END;
$$;

-- Get royalty monthly summary
CREATE OR REPLACE FUNCTION public.get_royalty_monthly_summary()
RETURNS TABLE(period TEXT, revenue NUMERIC, streams BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.period,
    SUM(r.net_revenue) AS revenue,
    SUM(r.sales_unit)::bigint AS streams
  FROM royalties r
  WHERE
    CASE
      WHEN is_admin(auth.uid()) THEN true
      WHEN has_role(auth.uid(), 'label') OR has_role(auth.uid(), 'whitelabel') THEN
        r.label_name = get_user_full_name(auth.uid())
      WHEN has_role(auth.uid(), 'artist') THEN
        r.artist_user_id = auth.uid() OR (r.artist_user_id IS NULL AND r.artist = get_user_full_name(auth.uid()))
      ELSE false
    END
  GROUP BY r.period
  ORDER BY r.period ASC;
$$;

-- Get royalty platform summary
CREATE OR REPLACE FUNCTION public.get_royalty_platform_summary(_limit INTEGER DEFAULT 10)
RETURNS TABLE(platform TEXT, revenue NUMERIC, streams BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.platform,
    SUM(r.net_revenue) AS revenue,
    SUM(r.sales_unit)::bigint AS streams
  FROM royalties r
  WHERE
    CASE
      WHEN is_admin(auth.uid()) THEN true
      WHEN has_role(auth.uid(), 'label') OR has_role(auth.uid(), 'whitelabel') THEN
        r.label_name = get_user_full_name(auth.uid())
      WHEN has_role(auth.uid(), 'artist') THEN
        r.artist_user_id = auth.uid() OR (r.artist_user_id IS NULL AND r.artist = get_user_full_name(auth.uid()))
      ELSE false
    END
  GROUP BY r.platform
  ORDER BY revenue DESC
  LIMIT _limit;
$$;

-- Get royalty country summary
CREATE OR REPLACE FUNCTION public.get_royalty_country_summary(_limit INTEGER DEFAULT 10)
RETURNS TABLE(country TEXT, revenue NUMERIC, streams BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.country,
    SUM(r.net_revenue) AS revenue,
    SUM(r.sales_unit)::bigint AS streams
  FROM royalties r
  WHERE
    CASE
      WHEN is_admin(auth.uid()) THEN true
      WHEN has_role(auth.uid(), 'label') OR has_role(auth.uid(), 'whitelabel') THEN
        r.label_name = get_user_full_name(auth.uid())
      WHEN has_role(auth.uid(), 'artist') THEN
        r.artist_user_id = auth.uid() OR (r.artist_user_id IS NULL AND r.artist = get_user_full_name(auth.uid()))
      ELSE false
    END
  GROUP BY r.country
  ORDER BY revenue DESC
  LIMIT _limit;
$$;

-- Get royalty periods
CREATE OR REPLACE FUNCTION public.get_royalty_periods()
RETURNS TABLE(period TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT r.period
  FROM royalties r
  WHERE
    CASE
      WHEN is_admin(auth.uid()) THEN true
      WHEN has_role(auth.uid(), 'label') OR has_role(auth.uid(), 'whitelabel') THEN
        r.label_name = get_user_full_name(auth.uid())
      WHEN has_role(auth.uid(), 'artist') THEN
        r.artist_user_id = auth.uid() OR (r.artist_user_id IS NULL AND r.artist = get_user_full_name(auth.uid()))
      ELSE false
    END
  ORDER BY r.period DESC;
$$;

-- Get royalty period summary (with growth calculation)
CREATE OR REPLACE FUNCTION public.get_royalty_period_summary()
RETURNS TABLE(period TEXT, revenue NUMERIC, streams BIGINT, unique_tracks BIGINT, unique_artists BIGINT, unique_labels BIGINT, top_platform TEXT, top_country TEXT, growth NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean := is_admin(_uid);
  _is_label boolean := has_role(_uid, 'label');
  _is_whitelabel boolean := has_role(_uid, 'whitelabel');
  _is_artist boolean := has_role(_uid, 'artist');
  _full_name text := get_user_full_name(_uid);
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
CREATE OR REPLACE FUNCTION public.get_royalty_comparison(_current_periods TEXT[], _previous_periods TEXT[])
RETURNS TABLE(data_type TEXT, period TEXT, revenue NUMERIC, streams BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean := is_admin(_uid);
  _is_label boolean := has_role(_uid, 'label');
  _is_whitelabel boolean := has_role(_uid, 'whitelabel');
  _is_artist boolean := has_role(_uid, 'artist');
  _full_name text := get_user_full_name(_uid);
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
CREATE OR REPLACE FUNCTION public.get_royalty_top_performers(_current_periods TEXT[], _previous_periods TEXT[], _group_by TEXT DEFAULT 'title', _limit INTEGER DEFAULT 10)
RETURNS TABLE(name TEXT, revenue NUMERIC, streams BIGINT, growth NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean := is_admin(_uid);
  _is_label boolean := has_role(_uid, 'label');
  _is_whitelabel boolean := has_role(_uid, 'whitelabel');
  _is_artist boolean := has_role(_uid, 'artist');
  _full_name text := get_user_full_name(_uid);
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
CREATE OR REPLACE FUNCTION public.get_royalty_label_breakdown(_period TEXT DEFAULT NULL)
RETURNS TABLE(label_name TEXT, revenue NUMERIC, streams BIGINT, artist_share NUMERIC, label_share NUMERIC, admin_share NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean := is_admin(_uid);
  _is_label boolean := has_role(_uid, 'label');
  _is_whitelabel boolean := has_role(_uid, 'whitelabel');
  _is_artist boolean := has_role(_uid, 'artist');
  _full_name text := get_user_full_name(_uid);
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
CREATE OR REPLACE FUNCTION public.get_royalty_artist_breakdown(_period TEXT DEFAULT NULL, _limit INTEGER DEFAULT 20)
RETURNS TABLE(artist_name TEXT, revenue NUMERIC, streams BIGINT, track_count BIGINT, is_soundpub BOOLEAN, artist_share NUMERIC, label_share NUMERIC, admin_share NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean := is_admin(_uid);
  _is_label boolean := has_role(_uid, 'label');
  _is_whitelabel boolean := has_role(_uid, 'whitelabel');
  _is_artist boolean := has_role(_uid, 'artist');
  _full_name text := get_user_full_name(_uid);
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
CREATE OR REPLACE FUNCTION public.get_royalty_track_breakdown(_period TEXT DEFAULT NULL)
RETURNS TABLE(isrc TEXT, title TEXT, artist_name TEXT, label TEXT, revenue NUMERIC, streams BIGINT, platform_count BIGINT, country_count BIGINT, is_soundpub BOOLEAN, artist_share NUMERIC, label_share NUMERIC, admin_share NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean := is_admin(_uid);
  _is_label boolean := has_role(_uid, 'label');
  _is_whitelabel boolean := has_role(_uid, 'whitelabel');
  _is_artist boolean := has_role(_uid, 'artist');
  _full_name text := get_user_full_name(_uid);
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
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, password_set)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data ->> 'password_set')::boolean, true)
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

-- Update timestamp function
CREATE OR REPLACE FUNCTION public.update_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Update balance on payout status change
CREATE OR REPLACE FUNCTION public.update_balance_on_payout_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance DECIMAL(18,2);
  caller_is_admin BOOLEAN;
BEGIN
    caller_is_admin := public.is_admin(auth.uid());
    
    -- Handle transition TO 'paid' status
    IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
        IF NOT caller_is_admin THEN
            RAISE EXCEPTION 'Only administrators can mark payouts as paid';
        END IF;
        
        IF NEW.amount <= 0 THEN
            RAISE EXCEPTION 'Payout amount must be positive';
        END IF;
        
        SELECT balance INTO current_balance
        FROM public.profiles
        WHERE id = NEW.user_id
        FOR UPDATE;
        
        IF current_balance IS NULL THEN
            RAISE EXCEPTION 'User profile not found';
        END IF;
        
        IF current_balance < NEW.amount THEN
            RAISE EXCEPTION 'Insufficient balance: user has %, requested %', 
              current_balance, NEW.amount;
        END IF;
        
        UPDATE public.profiles
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
        
        UPDATE public.profiles
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
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update timestamp triggers
DROP TRIGGER IF EXISTS update_profiles_timestamp ON public.profiles;
CREATE TRIGGER update_profiles_timestamp
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS update_artists_timestamp ON public.artists;
CREATE TRIGGER update_artists_timestamp
  BEFORE UPDATE ON public.artists
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS update_releases_timestamp ON public.releases;
CREATE TRIGGER update_releases_timestamp
  BEFORE UPDATE ON public.releases
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS update_tracks_timestamp ON public.tracks;
CREATE TRIGGER update_tracks_timestamp
  BEFORE UPDATE ON public.tracks
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS update_royalty_uploads_timestamp ON public.royalty_uploads;
CREATE TRIGGER update_royalty_uploads_timestamp
  BEFORE UPDATE ON public.royalty_uploads
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS update_payout_requests_timestamp ON public.payout_requests;
CREATE TRIGGER update_payout_requests_timestamp
  BEFORE UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS update_composer_royalties_timestamp ON public.composer_royalties;
CREATE TRIGGER update_composer_royalties_timestamp
  BEFORE UPDATE ON public.composer_royalties
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- Payout balance update trigger
DROP TRIGGER IF EXISTS on_payout_status_change ON public.payout_requests;
CREATE TRIGGER on_payout_status_change
  BEFORE UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_balance_on_payout_status_change();

-- =====================================================
-- BAGIAN 7: ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.royalty_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.royalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.composer_royalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- BAGIAN 8: RLS POLICIES - PROFILES
-- =====================================================

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles" ON public.profiles
  FOR ALL USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

DROP POLICY IF EXISTS "Labels can view their artists" ON public.profiles;
CREATE POLICY "Labels can view their artists" ON public.profiles
  FOR SELECT USING (has_role(auth.uid(), 'label') AND parent_label_id = auth.uid());

DROP POLICY IF EXISTS "Labels can update their artists" ON public.profiles;
CREATE POLICY "Labels can update their artists" ON public.profiles
  FOR UPDATE 
  USING (has_role(auth.uid(), 'label') AND parent_label_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'label') AND (parent_label_id = auth.uid() OR parent_label_id IS NULL));

DROP POLICY IF EXISTS "Whitelabels can view their artists" ON public.profiles;
CREATE POLICY "Whitelabels can view their artists" ON public.profiles
  FOR SELECT USING (has_role(auth.uid(), 'whitelabel') AND parent_label_id = auth.uid());

DROP POLICY IF EXISTS "Whitelabels can update their artists" ON public.profiles;
CREATE POLICY "Whitelabels can update their artists" ON public.profiles
  FOR UPDATE 
  USING (has_role(auth.uid(), 'whitelabel') AND parent_label_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'whitelabel') AND (parent_label_id = auth.uid() OR parent_label_id IS NULL));

DROP POLICY IF EXISTS "Artists can view their parent label profile" ON public.profiles;
CREATE POLICY "Artists can view their parent label profile" ON public.profiles
  FOR SELECT USING (has_role(auth.uid(), 'artist') AND id = get_user_parent_label_id(auth.uid()));

DROP POLICY IF EXISTS "Users can view label profiles for their releases" ON public.profiles;
CREATE POLICY "Users can view label profiles for their releases" ON public.profiles
  FOR SELECT USING (id IN (SELECT get_user_release_label_ids(auth.uid())));

-- =====================================================
-- BAGIAN 9: RLS POLICIES - USER ROLES
-- =====================================================

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL USING (is_admin(auth.uid()));

-- =====================================================
-- BAGIAN 10: RLS POLICIES - ARTISTS
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all artists" ON public.artists;
CREATE POLICY "Admins can manage all artists" ON public.artists
  FOR ALL USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Labels can manage their own artists" ON public.artists;
CREATE POLICY "Labels can manage their own artists" ON public.artists
  FOR ALL 
  USING (label_id = auth.uid())
  WITH CHECK (label_id = auth.uid());

DROP POLICY IF EXISTS "Whitelabels can manage their own artists" ON public.artists;
CREATE POLICY "Whitelabels can manage their own artists" ON public.artists
  FOR ALL 
  USING (has_role(auth.uid(), 'whitelabel') AND label_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'whitelabel') AND label_id = auth.uid());

DROP POLICY IF EXISTS "Admins, labels and associated artists can view artists" ON public.artists;
CREATE POLICY "Admins, labels and associated artists can view artists" ON public.artists
  FOR SELECT USING (
    is_admin(auth.uid())
    OR label_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.parent_label_id = artists.label_id
      AND has_role(auth.uid(), 'artist')
    )
  );

-- =====================================================
-- BAGIAN 11: RLS POLICIES - RELEASES
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all releases" ON public.releases;
CREATE POLICY "Admins can manage all releases" ON public.releases
  FOR ALL 
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Labels can manage their releases" ON public.releases;
CREATE POLICY "Labels can manage their releases" ON public.releases
  FOR ALL 
  USING (has_role(auth.uid(), 'label') AND label_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'label') AND label_id = auth.uid());

DROP POLICY IF EXISTS "Whitelabels can manage their releases" ON public.releases;
CREATE POLICY "Whitelabels can manage their releases" ON public.releases
  FOR ALL 
  USING (has_role(auth.uid(), 'whitelabel') AND label_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'whitelabel') AND label_id = auth.uid());

DROP POLICY IF EXISTS "Artists can view their releases" ON public.releases;
CREATE POLICY "Artists can view their releases" ON public.releases
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'artist') AND (
      artist_user_id = auth.uid()
      OR (artist_user_id IS NULL AND artist_name = get_user_full_name(auth.uid()))
    )
  );

-- Artist can INSERT releases (auto-set label_id via parent_label_id)
DROP POLICY IF EXISTS "Artists can insert their releases" ON public.releases;
CREATE POLICY "Artists can insert their releases" ON public.releases
  FOR INSERT 
  WITH CHECK (
    has_role(auth.uid(), 'artist')
    AND artist_user_id = auth.uid()
    AND label_id = get_user_parent_label_id(auth.uid())
  );

-- Artist can UPDATE their own releases
DROP POLICY IF EXISTS "Artists can update their releases" ON public.releases;
CREATE POLICY "Artists can update their releases" ON public.releases
  FOR UPDATE 
  USING (
    has_role(auth.uid(), 'artist') AND (
      artist_user_id = auth.uid()
      OR (artist_user_id IS NULL AND artist_name = get_user_full_name(auth.uid()))
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'artist')
    AND artist_user_id = auth.uid()
    AND label_id = get_user_parent_label_id(auth.uid())
  );

-- =====================================================
-- BAGIAN 12: RLS POLICIES - TRACKS
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all tracks" ON public.tracks;
CREATE POLICY "Admins can manage all tracks" ON public.tracks
  FOR ALL 
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Labels can manage tracks for their releases" ON public.tracks;
CREATE POLICY "Labels can manage tracks for their releases" ON public.tracks
  FOR ALL 
  USING (has_role(auth.uid(), 'label') AND release_id IN (SELECT id FROM releases WHERE label_id = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'label') AND release_id IN (SELECT id FROM releases WHERE label_id = auth.uid()));

DROP POLICY IF EXISTS "Whitelabels can manage tracks for their releases" ON public.tracks;
CREATE POLICY "Whitelabels can manage tracks for their releases" ON public.tracks
  FOR ALL 
  USING (has_role(auth.uid(), 'whitelabel') AND release_id IN (SELECT id FROM releases WHERE label_id = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'whitelabel') AND release_id IN (SELECT id FROM releases WHERE label_id = auth.uid()));

DROP POLICY IF EXISTS "Artists can view their tracks" ON public.tracks;
CREATE POLICY "Artists can view their tracks" ON public.tracks
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'artist') AND (
      artist_user_id = auth.uid()
      OR (artist_user_id IS NULL AND artist_name = get_user_full_name(auth.uid()))
      OR artists @> jsonb_build_array(jsonb_build_object('name', get_user_full_name(auth.uid())))
      OR EXISTS (
        SELECT 1 FROM releases 
        WHERE releases.id = tracks.release_id 
        AND (releases.artist_user_id = auth.uid() OR (releases.artist_user_id IS NULL AND releases.artist_name = get_user_full_name(auth.uid())))
      )
    )
  );

-- Artist can INSERT tracks for their releases
DROP POLICY IF EXISTS "Artists can insert tracks for their releases" ON public.tracks;
CREATE POLICY "Artists can insert tracks for their releases" ON public.tracks
  FOR INSERT 
  WITH CHECK (
    has_role(auth.uid(), 'artist')
    AND EXISTS (
      SELECT 1 FROM releases 
      WHERE releases.id = tracks.release_id 
      AND releases.artist_user_id = auth.uid()
      AND releases.label_id = get_user_parent_label_id(auth.uid())
    )
  );

-- Artist can UPDATE tracks for their releases
DROP POLICY IF EXISTS "Artists can update tracks for their releases" ON public.tracks;
CREATE POLICY "Artists can update tracks for their releases" ON public.tracks
  FOR UPDATE 
  USING (
    has_role(auth.uid(), 'artist')
    AND EXISTS (
      SELECT 1 FROM releases 
      WHERE releases.id = tracks.release_id 
      AND (releases.artist_user_id = auth.uid() OR (releases.artist_user_id IS NULL AND releases.artist_name = get_user_full_name(auth.uid())))
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'artist')
    AND EXISTS (
      SELECT 1 FROM releases 
      WHERE releases.id = tracks.release_id 
      AND releases.artist_user_id = auth.uid()
    )
  );

-- =====================================================
-- BAGIAN 13: RLS POLICIES - ROYALTY UPLOADS
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all uploads" ON public.royalty_uploads;
CREATE POLICY "Admins can manage all uploads" ON public.royalty_uploads
  FOR ALL USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view their own uploads" ON public.royalty_uploads;
CREATE POLICY "Users can view their own uploads" ON public.royalty_uploads
  FOR SELECT USING (user_id = auth.uid());

-- =====================================================
-- BAGIAN 14: RLS POLICIES - ROYALTIES
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all royalties" ON public.royalties;
CREATE POLICY "Admins can manage all royalties" ON public.royalties
  FOR ALL USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Labels can view royalties for their artists" ON public.royalties;
CREATE POLICY "Labels can view royalties for their artists" ON public.royalties
  FOR SELECT 
  USING (has_role(auth.uid(), 'label') AND label_name = get_user_full_name(auth.uid()));

DROP POLICY IF EXISTS "Whitelabels can view royalties for their artists" ON public.royalties;
CREATE POLICY "Whitelabels can view royalties for their artists" ON public.royalties
  FOR SELECT 
  USING (has_role(auth.uid(), 'whitelabel') AND label_name = get_user_full_name(auth.uid()));

DROP POLICY IF EXISTS "Artists can view their royalties" ON public.royalties;
CREATE POLICY "Artists can view their royalties" ON public.royalties
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'artist') AND (
      artist_user_id = auth.uid()
      OR (artist_user_id IS NULL AND artist = get_user_full_name(auth.uid()))
    )
  );

-- =====================================================
-- BAGIAN 15: RLS POLICIES - COMPOSER ROYALTIES
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all composer royalties" ON public.composer_royalties;
CREATE POLICY "Admins can manage all composer royalties" ON public.composer_royalties
  FOR ALL USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Copyright users can view composer royalties" ON public.composer_royalties;
CREATE POLICY "Copyright users can view composer royalties" ON public.composer_royalties
  FOR SELECT USING (has_role(auth.uid(), 'copyright'));

-- =====================================================
-- BAGIAN 16: RLS POLICIES - PAYOUT REQUESTS
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all payouts" ON public.payout_requests;
CREATE POLICY "Admins can manage all payouts" ON public.payout_requests
  FOR ALL USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view their own payouts" ON public.payout_requests;
CREATE POLICY "Users can view their own payouts" ON public.payout_requests
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create pending payouts" ON public.payout_requests;
CREATE POLICY "Users can create pending payouts" ON public.payout_requests
  FOR INSERT WITH CHECK (user_id = auth.uid() AND status = 'pending' AND amount > 0);

DROP POLICY IF EXISTS "Users can cancel pending payouts" ON public.payout_requests;
CREATE POLICY "Users can cancel pending payouts" ON public.payout_requests
  FOR DELETE USING (user_id = auth.uid() AND status = 'pending');

-- =====================================================
-- BAGIAN 17: RLS POLICIES - AUDIT LOGS
-- =====================================================

DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view all audit logs" ON public.audit_logs
  FOR SELECT USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.audit_logs;
CREATE POLICY "Service role can insert audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (true);

-- =====================================================
-- BAGIAN 18: RLS POLICIES - APP SETTINGS
-- =====================================================

DROP POLICY IF EXISTS "Anyone can view app settings" ON public.app_settings;
CREATE POLICY "Anyone can view app settings" ON public.app_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Superadmins can manage app settings" ON public.app_settings;
CREATE POLICY "Superadmins can manage app settings" ON public.app_settings
  FOR ALL USING (has_role(auth.uid(), 'superadmin'));

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
  USING (bucket_id = 'release-covers' AND is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'release-covers' AND is_admin(auth.uid()));

CREATE POLICY "Labels can upload release covers" ON storage.objects
  FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'release-covers' AND (has_role(auth.uid(), 'label') OR has_role(auth.uid(), 'whitelabel') OR has_role(auth.uid(), 'artist')));

CREATE POLICY "Labels can update release covers" ON storage.objects
  FOR UPDATE TO authenticated 
  USING (bucket_id = 'release-covers' AND (has_role(auth.uid(), 'label') OR has_role(auth.uid(), 'whitelabel') OR has_role(auth.uid(), 'artist')));

CREATE POLICY "Labels can delete release covers" ON storage.objects
  FOR DELETE TO authenticated 
  USING (bucket_id = 'release-covers' AND (has_role(auth.uid(), 'label') OR has_role(auth.uid(), 'whitelabel') OR is_admin(auth.uid())));

-- track-audio policies (private bucket)
CREATE POLICY "Authenticated users can view track audio" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'track-audio');

CREATE POLICY "Admins can manage track audio" ON storage.objects
  FOR ALL TO authenticated 
  USING (bucket_id = 'track-audio' AND is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'track-audio' AND is_admin(auth.uid()));

CREATE POLICY "Labels can upload track audio" ON storage.objects
  FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'track-audio' AND (has_role(auth.uid(), 'label') OR has_role(auth.uid(), 'whitelabel') OR has_role(auth.uid(), 'artist')));

CREATE POLICY "Labels can update track audio" ON storage.objects
  FOR UPDATE TO authenticated 
  USING (bucket_id = 'track-audio' AND (has_role(auth.uid(), 'label') OR has_role(auth.uid(), 'whitelabel') OR has_role(auth.uid(), 'artist')));

CREATE POLICY "Labels can delete track audio" ON storage.objects
  FOR DELETE TO authenticated 
  USING (bucket_id = 'track-audio' AND (has_role(auth.uid(), 'label') OR has_role(auth.uid(), 'whitelabel') OR is_admin(auth.uid())));

-- track-video policies (private bucket)
CREATE POLICY "Authenticated users can view track video" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'track-video');

CREATE POLICY "Admins can manage track video" ON storage.objects
  FOR ALL TO authenticated 
  USING (bucket_id = 'track-video' AND is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'track-video' AND is_admin(auth.uid()));

CREATE POLICY "Labels can upload track video" ON storage.objects
  FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'track-video' AND (has_role(auth.uid(), 'label') OR has_role(auth.uid(), 'whitelabel') OR has_role(auth.uid(), 'artist')));

CREATE POLICY "Labels can delete track video" ON storage.objects
  FOR DELETE TO authenticated 
  USING (bucket_id = 'track-video' AND (has_role(auth.uid(), 'label') OR has_role(auth.uid(), 'whitelabel') OR is_admin(auth.uid())));

-- audio-clips policies (public bucket)
CREATE POLICY "Anyone can view audio clips" ON storage.objects
  FOR SELECT USING (bucket_id = 'audio-clips');

CREATE POLICY "Admins can manage audio clips" ON storage.objects
  FOR ALL TO authenticated 
  USING (bucket_id = 'audio-clips' AND is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'audio-clips' AND is_admin(auth.uid()));

CREATE POLICY "Labels can upload audio clips" ON storage.objects
  FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'audio-clips' AND (has_role(auth.uid(), 'label') OR has_role(auth.uid(), 'whitelabel') OR has_role(auth.uid(), 'artist')));

CREATE POLICY "Labels can delete audio clips" ON storage.objects
  FOR DELETE TO authenticated 
  USING (bucket_id = 'audio-clips' AND (has_role(auth.uid(), 'label') OR has_role(auth.uid(), 'whitelabel') OR is_admin(auth.uid())));

-- label-logos policies (public bucket)
CREATE POLICY "Anyone can view label logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'label-logos');

CREATE POLICY "Admins can manage label logos" ON storage.objects
  FOR ALL TO authenticated 
  USING (bucket_id = 'label-logos' AND is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'label-logos' AND is_admin(auth.uid()));

CREATE POLICY "Labels can upload label logos" ON storage.objects
  FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'label-logos' AND (has_role(auth.uid(), 'label') OR has_role(auth.uid(), 'whitelabel')));

CREATE POLICY "Labels can update label logos" ON storage.objects
  FOR UPDATE TO authenticated 
  USING (bucket_id = 'label-logos' AND (has_role(auth.uid(), 'label') OR has_role(auth.uid(), 'whitelabel')));

CREATE POLICY "Labels can delete label logos" ON storage.objects
  FOR DELETE TO authenticated 
  USING (bucket_id = 'label-logos' AND (has_role(auth.uid(), 'label') OR has_role(auth.uid(), 'whitelabel') OR is_admin(auth.uid())));

-- =====================================================
-- BAGIAN 21: DEFAULT APP SETTINGS
-- =====================================================

INSERT INTO public.app_settings (key, value) VALUES 
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
-- END OF SCHEMA EXPORT v2.2
-- =====================================================
