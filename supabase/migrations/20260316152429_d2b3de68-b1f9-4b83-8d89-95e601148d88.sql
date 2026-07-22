-- 1. get_royalty_period_summary
CREATE OR REPLACE FUNCTION public.get_royalty_period_summary()
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
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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

-- 2. get_royalty_label_breakdown
CREATE OR REPLACE FUNCTION public.get_royalty_label_breakdown(_period text DEFAULT NULL)
RETURNS TABLE(
  label_name text,
  revenue numeric,
  streams bigint,
  artist_share numeric,
  label_share numeric,
  admin_share numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
    CASE WHEN LOWER(r.label_name) = 'soundpub music'
      THEN SUM(r.net_revenue) * 0.70
      ELSE SUM(r.net_revenue) * 0.49
    END AS artist_share,
    CASE WHEN LOWER(r.label_name) = 'soundpub music'
      THEN SUM(r.net_revenue) * 0.30
      ELSE SUM(r.net_revenue) * 0.21
    END AS label_share,
    CASE WHEN LOWER(r.label_name) = 'soundpub music'
      THEN 0::numeric
      ELSE SUM(r.net_revenue) * 0.30
    END AS admin_share
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

-- 3. get_royalty_artist_breakdown
CREATE OR REPLACE FUNCTION public.get_royalty_artist_breakdown(_period text DEFAULT NULL, _limit integer DEFAULT 20)
RETURNS TABLE(
  artist_name text,
  revenue numeric,
  streams bigint,
  track_count bigint,
  is_soundpub boolean,
  artist_share numeric,
  label_share numeric,
  admin_share numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
    (COUNT(DISTINCT r.label_name) = 1 AND LOWER(MIN(r.label_name)) = 'soundpub music') AS is_soundpub,
    CASE WHEN COUNT(DISTINCT r.label_name) = 1 AND LOWER(MIN(r.label_name)) = 'soundpub music'
      THEN SUM(r.net_revenue) * 0.70
      ELSE SUM(r.net_revenue) * 0.49
    END AS artist_share,
    CASE WHEN COUNT(DISTINCT r.label_name) = 1 AND LOWER(MIN(r.label_name)) = 'soundpub music'
      THEN SUM(r.net_revenue) * 0.30
      ELSE SUM(r.net_revenue) * 0.21
    END AS label_share,
    CASE WHEN COUNT(DISTINCT r.label_name) = 1 AND LOWER(MIN(r.label_name)) = 'soundpub music'
      THEN 0::numeric
      ELSE SUM(r.net_revenue) * 0.30
    END AS admin_share
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

-- 4. get_royalty_track_breakdown
CREATE OR REPLACE FUNCTION public.get_royalty_track_breakdown(_period text DEFAULT NULL)
RETURNS TABLE(
  isrc text,
  title text,
  artist_name text,
  label text,
  revenue numeric,
  streams bigint,
  platform_count bigint,
  country_count bigint,
  is_soundpub boolean,
  artist_share numeric,
  label_share numeric,
  admin_share numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
    (LOWER(MAX(r.label_name)) = 'soundpub music') AS is_soundpub,
    CASE WHEN LOWER(MAX(r.label_name)) = 'soundpub music'
      THEN SUM(r.net_revenue) * 0.70
      ELSE SUM(r.net_revenue) * 0.49
    END AS artist_share,
    CASE WHEN LOWER(MAX(r.label_name)) = 'soundpub music'
      THEN SUM(r.net_revenue) * 0.30
      ELSE SUM(r.net_revenue) * 0.21
    END AS label_share,
    CASE WHEN LOWER(MAX(r.label_name)) = 'soundpub music'
      THEN 0::numeric
      ELSE SUM(r.net_revenue) * 0.30
    END AS admin_share
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

-- 5. get_royalty_comparison
CREATE OR REPLACE FUNCTION public.get_royalty_comparison(
  _current_periods text[],
  _previous_periods text[]
)
RETURNS TABLE(
  data_type text,
  period text,
  revenue numeric,
  streams bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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

-- 6. get_royalty_top_performers
CREATE OR REPLACE FUNCTION public.get_royalty_top_performers(
  _current_periods text[],
  _previous_periods text[],
  _group_by text DEFAULT 'title',
  _limit integer DEFAULT 10
)
RETURNS TABLE(
  name text,
  revenue numeric,
  streams bigint,
  growth numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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