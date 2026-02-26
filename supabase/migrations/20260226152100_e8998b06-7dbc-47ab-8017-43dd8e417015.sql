
-- Update get_royalty_stats to filter by role
CREATE OR REPLACE FUNCTION public.get_royalty_stats()
 RETURNS TABLE(total_revenue numeric, total_streams bigint, unique_artists bigint, unique_labels bigint, unique_platforms bigint, unique_tracks bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Update get_royalty_monthly_summary to filter by role
CREATE OR REPLACE FUNCTION public.get_royalty_monthly_summary()
 RETURNS TABLE(period text, revenue numeric, streams bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Update get_royalty_platform_summary to filter by role
CREATE OR REPLACE FUNCTION public.get_royalty_platform_summary(_limit integer DEFAULT 10)
 RETURNS TABLE(platform text, revenue numeric, streams bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Update get_royalty_country_summary to filter by role
CREATE OR REPLACE FUNCTION public.get_royalty_country_summary(_limit integer DEFAULT 10)
 RETURNS TABLE(country text, revenue numeric, streams bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Update get_royalty_periods to filter by role
CREATE OR REPLACE FUNCTION public.get_royalty_periods()
 RETURNS TABLE(period text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
