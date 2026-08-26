-- =============================================
-- Soundpub ROYALTY DASHBOARD RPC PATCH
-- Adds RPC functions used by src/hooks/useRoyaltyData.ts
-- =============================================

CREATE OR REPLACE FUNCTION Soundpub.get_royalty_periods()
RETURNS TABLE(period text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO Soundpub
AS $$
  SELECT DISTINCT r.period
  FROM Soundpub.royalties r
  WHERE r.period IS NOT NULL
  ORDER BY r.period DESC;
$$;

CREATE OR REPLACE FUNCTION Soundpub.get_royalty_period_summary()
RETURNS TABLE(
  period text,
  revenue numeric,
  streams bigint,
  unique_tracks bigint,
  unique_artists bigint,
  unique_labels bigint,
  top_platform text,
  top_country text,
  growth numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO Soundpub
AS $$
  WITH base AS (
    SELECT
      r.period,
      COALESCE(SUM(r.artist_revenue), 0) AS revenue,
      COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams,
      COUNT(DISTINCT r.isrc) AS unique_tracks,
      COUNT(DISTINCT COALESCE(r.artist, r.artist_name)) AS unique_artists,
      COUNT(DISTINCT r.label_name) AS unique_labels
    FROM Soundpub.royalties r
    GROUP BY r.period
  ), platform_rank AS (
    SELECT period, platform,
      ROW_NUMBER() OVER (PARTITION BY period ORDER BY SUM(artist_revenue) DESC) AS rank
    FROM Soundpub.royalties
    GROUP BY period, platform
  ), country_rank AS (
    SELECT period, country,
      ROW_NUMBER() OVER (PARTITION BY period ORDER BY SUM(artist_revenue) DESC) AS rank
    FROM Soundpub.royalties
    GROUP BY period, country
  )
  SELECT
    b.period,
    b.revenue,
    b.streams,
    b.unique_tracks,
    b.unique_artists,
    b.unique_labels,
    COALESCE(p.platform, '-') AS top_platform,
    COALESCE(c.country, '-') AS top_country,
    0::numeric AS growth
  FROM base b
  LEFT JOIN platform_rank p ON p.period = b.period AND p.rank = 1
  LEFT JOIN country_rank c ON c.period = b.period AND c.rank = 1
  ORDER BY b.period DESC;
$$;

CREATE OR REPLACE FUNCTION Soundpub.get_royalty_label_breakdown(_period text DEFAULT NULL)
RETURNS TABLE(
  label_name text,
  revenue numeric,
  streams bigint,
  artist_share numeric,
  label_share numeric,
  admin_share numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO Soundpub
AS $$
  SELECT
    r.label_name,
    COALESCE(SUM(r.artist_revenue), 0) AS revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams,
    COALESCE(SUM(r.artist_revenue), 0) AS artist_share,
    COALESCE(SUM(r.pendapatan_label_artis), 0) AS label_share,
    COALESCE(SUM(r.Soundpub_revenue), 0) AS admin_share
  FROM Soundpub.royalties r
  WHERE _period IS NULL OR r.period = _period
  GROUP BY r.label_name
  ORDER BY revenue DESC;
$$;

CREATE OR REPLACE FUNCTION Soundpub.get_royalty_artist_breakdown(_period text DEFAULT NULL, _limit integer DEFAULT 20)
RETURNS TABLE(
  artist_name text,
  revenue numeric,
  streams bigint,
  track_count bigint,
  is_Soundpub boolean,
  artist_share numeric,
  label_share numeric,
  admin_share numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO Soundpub
AS $$
  SELECT
    COALESCE(r.artist, r.artist_name, 'Unknown') AS artist_name,
    COALESCE(SUM(r.artist_revenue), 0) AS revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams,
    COUNT(DISTINCT r.isrc) AS track_count,
    true AS is_Soundpub,
    COALESCE(SUM(r.artist_revenue), 0) AS artist_share,
    COALESCE(SUM(r.pendapatan_label_artis), 0) AS label_share,
    COALESCE(SUM(r.Soundpub_revenue), 0) AS admin_share
  FROM Soundpub.royalties r
  WHERE _period IS NULL OR r.period = _period
  GROUP BY COALESCE(r.artist, r.artist_name, 'Unknown')
  ORDER BY revenue DESC
  LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION Soundpub.get_royalty_track_breakdown(_period text DEFAULT NULL)
RETURNS TABLE(
  isrc text,
  title text,
  artist_name text,
  label text,
  revenue numeric,
  streams bigint,
  platform_count bigint,
  country_count bigint,
  is_Soundpub boolean,
  artist_share numeric,
  label_share numeric,
  admin_share numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO Soundpub
AS $$
  SELECT
    r.isrc,
    COALESCE(MAX(r.title), 'Unknown') AS title,
    COALESCE(MAX(COALESCE(r.artist, r.artist_name)), 'Unknown') AS artist_name,
    COALESCE(MAX(r.label_name), '') AS label,
    COALESCE(SUM(r.artist_revenue), 0) AS revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams,
    COUNT(DISTINCT r.platform) AS platform_count,
    COUNT(DISTINCT r.country) AS country_count,
    true AS is_Soundpub,
    COALESCE(SUM(r.artist_revenue), 0) AS artist_share,
    COALESCE(SUM(r.pendapatan_label_artis), 0) AS label_share,
    COALESCE(SUM(r.Soundpub_revenue), 0) AS admin_share
  FROM Soundpub.royalties r
  WHERE (_period IS NULL OR r.period = _period)
    AND r.isrc IS NOT NULL
  GROUP BY r.isrc
  ORDER BY revenue DESC;
$$;

CREATE OR REPLACE FUNCTION Soundpub.get_royalty_country_summary(_limit integer DEFAULT 10)
RETURNS TABLE(country text, revenue numeric, streams bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO Soundpub
AS $$
  SELECT
    r.country,
    COALESCE(SUM(r.artist_revenue), 0) AS revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams
  FROM Soundpub.royalties r
  GROUP BY r.country
  ORDER BY revenue DESC
  LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION Soundpub.get_royalty_comparison(_current_periods text[], _previous_periods text[])
RETURNS TABLE(data_type text, period text, revenue numeric, streams bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO Soundpub
AS $$
  SELECT 'current'::text AS data_type, r.period,
    COALESCE(SUM(r.artist_revenue), 0) AS revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams
  FROM Soundpub.royalties r
  WHERE r.period = ANY(_current_periods)
  GROUP BY r.period
  UNION ALL
  SELECT 'previous'::text AS data_type, r.period,
    COALESCE(SUM(r.artist_revenue), 0) AS revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams
  FROM Soundpub.royalties r
  WHERE r.period = ANY(_previous_periods)
  GROUP BY r.period;
$$;

CREATE OR REPLACE FUNCTION Soundpub.get_royalty_top_performers(
  _current_periods text[],
  _previous_periods text[],
  _group_by text DEFAULT 'title',
  _limit integer DEFAULT 10
)
RETURNS TABLE(name text, revenue numeric, streams bigint, growth numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO Soundpub
AS $$
BEGIN
  RETURN QUERY
  WITH current_data AS (
    SELECT
      CASE
        WHEN _group_by = 'platform' THEN COALESCE(r.platform, 'Unknown')
        WHEN _group_by = 'country' THEN COALESCE(r.country, 'Unknown')
        ELSE COALESCE(r.title, 'Unknown')
      END AS group_name,
      COALESCE(SUM(r.artist_revenue), 0) AS current_revenue,
      COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS current_streams
    FROM Soundpub.royalties r
    WHERE r.period = ANY(_current_periods)
    GROUP BY group_name
  ), previous_data AS (
    SELECT
      CASE
        WHEN _group_by = 'platform' THEN COALESCE(r.platform, 'Unknown')
        WHEN _group_by = 'country' THEN COALESCE(r.country, 'Unknown')
        ELSE COALESCE(r.title, 'Unknown')
      END AS group_name,
      COALESCE(SUM(r.artist_revenue), 0) AS previous_revenue
    FROM Soundpub.royalties r
    WHERE r.period = ANY(_previous_periods)
    GROUP BY group_name
  )
  SELECT
    c.group_name AS name,
    c.current_revenue AS revenue,
    c.current_streams AS streams,
    CASE
      WHEN COALESCE(p.previous_revenue, 0) = 0 THEN 0::numeric
      ELSE ROUND(((c.current_revenue - p.previous_revenue) / p.previous_revenue) * 100, 2)
    END AS growth
  FROM current_data c
  LEFT JOIN previous_data p ON p.group_name = c.group_name
  ORDER BY c.current_revenue DESC
  LIMIT _limit;
END;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA Soundpub TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';