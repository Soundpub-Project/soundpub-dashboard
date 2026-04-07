
-- Fix 1: Allow artists to update their own releases with 'draft' status (not just 'pending')
DROP POLICY IF EXISTS "Artists can update their pending releases" ON public.releases;
CREATE POLICY "Artists can update their own draft or pending releases"
ON public.releases
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'artist'::app_role) 
  AND ((artist_user_id = auth.uid()) OR ((artist_user_id IS NULL) AND (artist_name = get_user_full_name(auth.uid()))))
  AND (status IN ('pending', 'draft'))
)
WITH CHECK (
  has_role(auth.uid(), 'artist'::app_role)
  AND ((artist_user_id = auth.uid()) OR ((artist_user_id IS NULL) AND (artist_name = get_user_full_name(auth.uid()))))
  AND (status IN ('pending', 'draft'))
);

-- Fix 2: Allow artists to update tracks for their draft or pending releases
DROP POLICY IF EXISTS "Artists can update tracks for their pending releases" ON public.tracks;
CREATE POLICY "Artists can update tracks for their draft or pending releases"
ON public.tracks
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'artist'::app_role) 
  AND (release_id IN (
    SELECT releases.id FROM releases
    WHERE ((releases.artist_user_id = auth.uid()) OR ((releases.artist_user_id IS NULL) AND (releases.artist_name = get_user_full_name(auth.uid()))))
    AND (releases.status IN ('pending', 'draft'))
  ))
)
WITH CHECK (
  has_role(auth.uid(), 'artist'::app_role) 
  AND (release_id IN (
    SELECT releases.id FROM releases
    WHERE ((releases.artist_user_id = auth.uid()) OR ((releases.artist_user_id IS NULL) AND (releases.artist_name = get_user_full_name(auth.uid()))))
    AND (releases.status IN ('pending', 'draft'))
  ))
);

-- Fix 3: Allow artists to delete tracks from their draft/pending releases (needed when editing tracks)
DROP POLICY IF EXISTS "Artists can delete tracks for their draft or pending releases" ON public.tracks;
CREATE POLICY "Artists can delete tracks for their draft or pending releases"
ON public.tracks
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'artist'::app_role) 
  AND (release_id IN (
    SELECT releases.id FROM releases
    WHERE ((releases.artist_user_id = auth.uid()) OR ((releases.artist_user_id IS NULL) AND (releases.artist_name = get_user_full_name(auth.uid()))))
    AND (releases.status IN ('pending', 'draft'))
  ))
);

-- Fix 4: Allow artists to view track-audio files (signed URLs for playback)
DROP POLICY IF EXISTS "Artists can view track audio" ON storage.objects;
CREATE POLICY "Artists can view track audio"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'track-audio' AND has_role(auth.uid(), 'artist'::app_role)
);

-- Fix 5: Allow whitelabels to view track-audio
DROP POLICY IF EXISTS "Whitelabels can view track audio" ON storage.objects;
CREATE POLICY "Whitelabels can view track audio"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'track-audio' AND has_role(auth.uid(), 'whitelabel'::app_role)
);

-- Fix 6: Allow artists to upload video
DROP POLICY IF EXISTS "Artists can upload video for their releases" ON storage.objects;
CREATE POLICY "Artists can upload video for their releases"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'track-video' AND has_role(auth.uid(), 'artist'::app_role)
);

-- Fix 7: Allow whitelabels to upload video
DROP POLICY IF EXISTS "Whitelabels can upload video" ON storage.objects;
CREATE POLICY "Whitelabels can upload video"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'track-video' AND (has_role(auth.uid(), 'whitelabel'::app_role))
);

-- Fix 8: Allow whitelabels to view video
DROP POLICY IF EXISTS "Whitelabels can view track video" ON storage.objects;
CREATE POLICY "Whitelabels can view track video"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'track-video' AND has_role(auth.uid(), 'whitelabel'::app_role)
);

-- Fix 9: Allow artists to view track-video
DROP POLICY IF EXISTS "Artists can view track video" ON storage.objects;
CREATE POLICY "Artists can view track video"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'track-video' AND has_role(auth.uid(), 'artist'::app_role)
);
