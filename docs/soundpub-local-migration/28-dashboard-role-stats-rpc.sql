-- DASHBOARD ROLE STATS RPC
-- Fixes frontend undercount caused by Supabase REST row limits.
-- Run after 17-role-aware-royalty-rpcs.sql.

DROP FUNCTION IF EXISTS soundpub.get_dashboard_role_stats();

CREATE OR REPLACE FUNCTION soundpub.get_dashboard_role_stats()
RETURNS TABLE(
  total_revenue numeric,
  available_balance numeric,
  total_streams bigint,
  unique_tracks bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO soundpub, auth
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT ur.role::text
  INTO v_role
  FROM soundpub.user_roles ur
  WHERE ur.user_id = auth.uid()
  ORDER BY CASE ur.role::text
    WHEN 'superadmin' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'label' THEN 3
    WHEN 'whitelabel' THEN 4
    WHEN 'artist' THEN 5
    ELSE 9
  END
  LIMIT 1;

  RETURN QUERY
  SELECT
    COALESCE(SUM(r.net_revenue), 0)::numeric AS total_revenue,
    COALESCE(SUM(
      CASE
        WHEN v_role IN ('superadmin', 'admin') THEN COALESCE(r.soundpub_revenue, 0)
        WHEN v_role = 'artist' THEN COALESCE(r.artist_revenue, 0)
        WHEN v_role IN ('label', 'whitelabel') THEN COALESCE(r.label_revenue, 0)
        ELSE 0
      END
    ), 0)::numeric AS available_balance,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS total_streams,
    COUNT(DISTINCT r.isrc)::bigint AS unique_tracks
  FROM soundpub.royalties r
  WHERE soundpub.current_user_can_view_royalty(r.artist_user_id, r.label_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION soundpub.get_dashboard_role_stats() TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
