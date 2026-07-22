
-- RPC 1: get_royalty_stats - aggregated KPI stats
CREATE OR REPLACE FUNCTION public.get_royalty_stats()
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
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(SUM(net_revenue), 0) AS total_revenue,
    COALESCE(SUM(sales_unit)::bigint, 0) AS total_streams,
    COUNT(DISTINCT artist) AS unique_artists,
    COUNT(DISTINCT label_name) AS unique_labels,
    COUNT(DISTINCT platform) AS unique_platforms,
    COUNT(DISTINCT isrc) AS unique_tracks
  FROM royalties;
$$;

-- RPC 2: get_royalty_monthly_summary - monthly aggregation for charts
CREATE OR REPLACE FUNCTION public.get_royalty_monthly_summary()
RETURNS TABLE(
  period text,
  revenue numeric,
  streams bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    r.period,
    SUM(r.net_revenue) AS revenue,
    SUM(r.sales_unit)::bigint AS streams
  FROM royalties r
  GROUP BY r.period
  ORDER BY r.period ASC;
$$;

-- RPC 3: get_royalty_platform_summary - top platforms
CREATE OR REPLACE FUNCTION public.get_royalty_platform_summary(_limit integer DEFAULT 10)
RETURNS TABLE(
  platform text,
  revenue numeric,
  streams bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    r.platform,
    SUM(r.net_revenue) AS revenue,
    SUM(r.sales_unit)::bigint AS streams
  FROM royalties r
  GROUP BY r.platform
  ORDER BY revenue DESC
  LIMIT _limit;
$$;

-- RPC 4: get_royalty_country_summary - top countries
CREATE OR REPLACE FUNCTION public.get_royalty_country_summary(_limit integer DEFAULT 10)
RETURNS TABLE(
  country text,
  revenue numeric,
  streams bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    r.country,
    SUM(r.net_revenue) AS revenue,
    SUM(r.sales_unit)::bigint AS streams
  FROM royalties r
  GROUP BY r.country
  ORDER BY revenue DESC
  LIMIT _limit;
$$;

-- RPC 5: get_royalty_periods - unique periods list
CREATE OR REPLACE FUNCTION public.get_royalty_periods()
RETURNS TABLE(period text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT r.period FROM royalties r ORDER BY r.period DESC;
$$;
