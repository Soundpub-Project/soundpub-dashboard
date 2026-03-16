-- Update get_royalty_label_breakdown to flat 70/21/9 split
CREATE OR REPLACE FUNCTION public.get_royalty_label_breakdown(_period text DEFAULT NULL::text)
 RETURNS TABLE(label_name text, revenue numeric, streams bigint, artist_share numeric, label_share numeric, admin_share numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Update get_royalty_artist_breakdown to flat 70/21/9 split
CREATE OR REPLACE FUNCTION public.get_royalty_artist_breakdown(_period text DEFAULT NULL::text, _limit integer DEFAULT 20)
 RETURNS TABLE(artist_name text, revenue numeric, streams bigint, track_count bigint, is_soundpub boolean, artist_share numeric, label_share numeric, admin_share numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Update get_royalty_track_breakdown to flat 70/21/9 split
CREATE OR REPLACE FUNCTION public.get_royalty_track_breakdown(_period text DEFAULT NULL::text)
 RETURNS TABLE(isrc text, title text, artist_name text, label text, revenue numeric, streams bigint, platform_count bigint, country_count bigint, is_soundpub boolean, artist_share numeric, label_share numeric, admin_share numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;