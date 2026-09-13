-- =============================================
-- Soundpub RUNTIME PERMISSIONS AND RPC PATCH
-- Run after schema/import if frontend gets 403 or RPC 404.
-- =============================================

-- Allow PostgREST roles to access the schema and objects.
GRANT USAGE ON SCHEMA Soundpub TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA Soundpub TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA Soundpub TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA Soundpub TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA Soundpub TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA Soundpub GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA Soundpub GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA Soundpub GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA Soundpub GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- Make sure basic self-read policies exist after reset/recreate.
DROP POLICY IF EXISTS "Users can view own profile" ON Soundpub.profiles;
CREATE POLICY "Users can view own profile"
ON Soundpub.profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON Soundpub.profiles;
CREATE POLICY "Users can update own profile"
ON Soundpub.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can view own roles" ON Soundpub.user_roles;
CREATE POLICY "Users can view own roles"
ON Soundpub.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Anyone can view app settings" ON Soundpub.app_settings;
CREATE POLICY "Anyone can view app settings"
ON Soundpub.app_settings FOR SELECT
TO anon, authenticated
USING (true);

-- RPC 1: overall royalty stats.
CREATE OR REPLACE FUNCTION Soundpub.get_royalty_stats()
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
SET search_path TO Soundpub
AS $$
  SELECT
    COALESCE(SUM(r.artist_revenue), 0) AS total_revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS total_streams,
    COUNT(DISTINCT COALESCE(r.artist, r.artist_name)) AS unique_artists,
    COUNT(DISTINCT r.label_name) AS unique_labels,
    COUNT(DISTINCT r.platform) AS unique_platforms,
    COUNT(DISTINCT r.isrc) AS unique_tracks
  FROM Soundpub.royalties r;
$$;

-- RPC 2: monthly aggregation.
CREATE OR REPLACE FUNCTION Soundpub.get_royalty_monthly_summary()
RETURNS TABLE(
  period text,
  revenue numeric,
  streams bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO Soundpub
AS $$
  SELECT
    r.period,
    COALESCE(SUM(r.artist_revenue), 0) AS revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams
  FROM Soundpub.royalties r
  GROUP BY r.period
  ORDER BY r.period ASC;
$$;

-- RPC 3: platform aggregation.
CREATE OR REPLACE FUNCTION Soundpub.get_royalty_platform_summary(_limit integer DEFAULT 10)
RETURNS TABLE(
  platform text,
  revenue numeric,
  streams bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO Soundpub
AS $$
  SELECT
    r.platform,
    COALESCE(SUM(r.artist_revenue), 0) AS revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams
  FROM Soundpub.royalties r
  GROUP BY r.platform
  ORDER BY revenue DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION Soundpub.get_royalty_stats() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION Soundpub.get_royalty_monthly_summary() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION Soundpub.get_royalty_platform_summary(integer) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';