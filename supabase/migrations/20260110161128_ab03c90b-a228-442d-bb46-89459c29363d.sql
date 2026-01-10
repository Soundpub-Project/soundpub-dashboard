-- Drop existing artist tracks policy
DROP POLICY IF EXISTS "Artists can view their tracks" ON public.tracks;

-- Create new policy that checks if artist can view the release
-- Artist can view tracks if:
-- 1. Their name matches the track's artist_name, OR
-- 2. Their name is in the artists jsonb array, OR
-- 3. The track belongs to a release they can view (release.artist_name matches their name)
CREATE POLICY "Artists can view their tracks" ON public.tracks
FOR SELECT USING (
  has_role(auth.uid(), 'artist'::app_role) AND (
    -- Check track artist_name
    artist_name = get_user_full_name(auth.uid()) OR
    -- Check if user is in artists jsonb array
    artists @> jsonb_build_array(jsonb_build_object('name', get_user_full_name(auth.uid()))) OR
    -- Check if track belongs to a release where artist_name matches
    EXISTS (
      SELECT 1 FROM releases 
      WHERE releases.id = tracks.release_id 
      AND releases.artist_name = get_user_full_name(auth.uid())
    )
  )
);