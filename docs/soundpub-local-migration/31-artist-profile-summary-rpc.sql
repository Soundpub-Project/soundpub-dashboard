-- ARTIST PROFILE SUMMARY RPC
-- Aggregates artist dashboard data server-side to avoid REST row limits.
-- Run after artist profile RLS/schema migrations.

DROP FUNCTION IF EXISTS Soundpub.get_artist_profile_summary(uuid);

CREATE OR REPLACE FUNCTION Soundpub.get_artist_profile_summary(_artist_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO Soundpub, auth
AS $$
DECLARE
  can_view boolean;
  summary jsonb;
BEGIN
  SELECT
    auth.uid() = _artist_user_id
    OR Soundpub.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM Soundpub.profiles p
      WHERE p.id = _artist_user_id
        AND p.parent_label_id = auth.uid()
    )
  INTO can_view;

  IF NOT COALESCE(can_view, false) THEN
    RAISE EXCEPTION 'Not allowed to view artist profile summary';
  END IF;

  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      'totalRevenue', COALESCE((SELECT SUM(r.net_revenue) FROM Soundpub.royalties r WHERE r.artist_user_id = _artist_user_id), 0),
      'artistBalance', COALESCE((SELECT SUM(r.artist_revenue) FROM Soundpub.royalties r WHERE r.artist_user_id = _artist_user_id), 0),
      'totalStreams', COALESCE((SELECT SUM(r.unit_penjualan)::bigint FROM Soundpub.royalties r WHERE r.artist_user_id = _artist_user_id), 0),
      'uniqueTracks', COALESCE((SELECT COUNT(DISTINCT r.isrc) FROM Soundpub.royalties r WHERE r.artist_user_id = _artist_user_id), 0),
      'releaseCount', COALESCE((SELECT COUNT(*) FROM Soundpub.releases rel WHERE rel.artist_user_id = _artist_user_id), 0),
      'trackCount', COALESCE((SELECT COUNT(*) FROM Soundpub.tracks t WHERE t.artist_user_id = _artist_user_id), 0)
    ),
    'topTracks', COALESCE((
      SELECT jsonb_agg(row_to_json(track_row)::jsonb ORDER BY (track_row.artist_revenue) DESC)
      FROM (
        SELECT
          COALESCE(r.title, 'Untitled') AS title,
          r.isrc,
          COALESCE(SUM(r.net_revenue), 0) AS total_revenue,
          COALESCE(SUM(r.artist_revenue), 0) AS artist_revenue,
          COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams,
          COUNT(DISTINCT r.platform) AS platform_count
        FROM Soundpub.royalties r
        WHERE r.artist_user_id = _artist_user_id
        GROUP BY COALESCE(r.title, 'Untitled'), r.isrc
        ORDER BY artist_revenue DESC
        LIMIT 10
      ) track_row
    ), '[]'::jsonb),
    'recentReleases', COALESCE((
      SELECT jsonb_agg(row_to_json(release_row)::jsonb ORDER BY release_row.created_at DESC)
      FROM (
        SELECT
          rel.id,
          rel.title,
          rel.status,
          rel.release_type,
          rel.cover_url,
          rel.upc,
          rel.created_at,
          rel.release_date
        FROM Soundpub.releases rel
        WHERE rel.artist_user_id = _artist_user_id
        ORDER BY rel.created_at DESC
        LIMIT 8
      ) release_row
    ), '[]'::jsonb),
    'monthlyRevenue', COALESCE((
      SELECT jsonb_agg(row_to_json(month_row)::jsonb ORDER BY month_row.period)
      FROM (
        SELECT
          r.period,
          COALESCE(SUM(r.net_revenue), 0) AS total_revenue,
          COALESCE(SUM(r.artist_revenue), 0) AS artist_revenue,
          COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams
        FROM Soundpub.royalties r
        WHERE r.artist_user_id = _artist_user_id
        GROUP BY r.period
        ORDER BY r.period
        LIMIT 12
      ) month_row
    ), '[]'::jsonb)
  ) INTO summary;

  RETURN summary;
END;
$$;

GRANT EXECUTE ON FUNCTION Soundpub.get_artist_profile_summary(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
