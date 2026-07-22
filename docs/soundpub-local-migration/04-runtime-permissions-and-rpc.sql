-- =============================================
-- SOUNDPUB RUNTIME PERMISSIONS AND RPC PATCH
-- Run after schema/import if frontend gets 403 or RPC 404.
-- =============================================

-- Allow PostgREST roles to access the schema and objects.
GRANT USAGE ON SCHEMA soundpub TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA soundpub TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA soundpub TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA soundpub TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA soundpub TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA soundpub GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA soundpub GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA soundpub GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA soundpub GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- Make sure basic self-read policies exist after reset/recreate.
DROP POLICY IF EXISTS "Users can view own profile" ON soundpub.profiles;
CREATE POLICY "Users can view own profile"
ON soundpub.profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON soundpub.profiles;
CREATE POLICY "Users can update own profile"
ON soundpub.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can view own roles" ON soundpub.user_roles;
CREATE POLICY "Users can view own roles"
ON soundpub.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Anyone can view app settings" ON soundpub.app_settings;
CREATE POLICY "Anyone can view app settings"
ON soundpub.app_settings FOR SELECT
TO anon, authenticated
USING (true);

-- RPC 1: overall royalty stats.
CREATE OR REPLACE FUNCTION soundpub.get_royalty_stats()
RETURNS TABLE(
  total_revenue numeric,
  total_streams bigint,
  unique_artists bigint,
  unique_labels bigint,
  unique_platforms bigint,
  unique_tracks bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO soundpub
AS $$
  SELECT
    COALESCE(SUM(r.artist_revenue), 0) AS total_revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS total_streams,
    COUNT(DISTINCT COALESCE(r.artist, r.artist_name)) AS unique_artists,
    COUNT(DISTINCT r.label_name) AS unique_labels,
    COUNT(DISTINCT r.platform) AS unique_platforms,
    COUNT(DISTINCT r.isrc) AS unique_tracks
  FROM soundpub.royalties r;
$$;

-- RPC 2: monthly aggregation.
CREATE OR REPLACE FUNCTION soundpub.get_royalty_monthly_summary()
RETURNS TABLE(
  period text,
  revenue numeric,
  streams bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO soundpub
AS $$
  SELECT
    r.period,
    COALESCE(SUM(r.artist_revenue), 0) AS revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams
  FROM soundpub.royalties r
  GROUP BY r.period
  ORDER BY r.period ASC;
$$;

-- RPC 3: platform aggregation.
CREATE OR REPLACE FUNCTION soundpub.get_royalty_platform_summary(_limit integer DEFAULT 10)
RETURNS TABLE(
  platform text,
  revenue numeric,
  streams bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO soundpub
AS $$
  SELECT
    r.platform,
    COALESCE(SUM(r.artist_revenue), 0) AS revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams
  FROM soundpub.royalties r
  GROUP BY r.platform
  ORDER BY revenue DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION soundpub.get_royalty_stats() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION soundpub.get_royalty_monthly_summary() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION soundpub.get_royalty_platform_summary(integer) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';