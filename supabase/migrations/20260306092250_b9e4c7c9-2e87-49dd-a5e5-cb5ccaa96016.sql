-- Add artist role to storage upload policies for track-audio, audio-clips, and release-covers

-- Update track-audio INSERT policy
DROP POLICY IF EXISTS "Authenticated users with proper roles can upload to track-audio" ON storage.objects;
CREATE POLICY "Authenticated users with proper roles can upload to track-audio"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'track-audio' AND (
    is_admin(auth.uid()) OR
    has_role(auth.uid(), 'label'::app_role) OR
    has_role(auth.uid(), 'whitelabel'::app_role) OR
    has_role(auth.uid(), 'artist'::app_role)
  )
);

-- Update audio-clips INSERT policy
DROP POLICY IF EXISTS "Authenticated users with proper roles can upload to audio-clips" ON storage.objects;
CREATE POLICY "Authenticated users with proper roles can upload to audio-clips"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'audio-clips' AND (
    is_admin(auth.uid()) OR
    has_role(auth.uid(), 'label'::app_role) OR
    has_role(auth.uid(), 'whitelabel'::app_role) OR
    has_role(auth.uid(), 'artist'::app_role)
  )
);

-- Update release-covers INSERT policy
DROP POLICY IF EXISTS "Authenticated users with proper roles can upload to release-cov" ON storage.objects;
CREATE POLICY "Authenticated users with proper roles can upload to release-covers"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'release-covers' AND (
    is_admin(auth.uid()) OR
    has_role(auth.uid(), 'label'::app_role) OR
    has_role(auth.uid(), 'whitelabel'::app_role) OR
    has_role(auth.uid(), 'artist'::app_role)
  )
);

-- Also update UPDATE policies for these buckets to include artist
DROP POLICY IF EXISTS "Authenticated users with proper roles can update track-audio" ON storage.objects;
CREATE POLICY "Authenticated users with proper roles can update track-audio"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'track-audio' AND (
    is_admin(auth.uid()) OR
    has_role(auth.uid(), 'label'::app_role) OR
    has_role(auth.uid(), 'whitelabel'::app_role) OR
    has_role(auth.uid(), 'artist'::app_role)
  )
);

DROP POLICY IF EXISTS "Authenticated users with proper roles can update audio-clips" ON storage.objects;
CREATE POLICY "Authenticated users with proper roles can update audio-clips"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'audio-clips' AND (
    is_admin(auth.uid()) OR
    has_role(auth.uid(), 'label'::app_role) OR
    has_role(auth.uid(), 'whitelabel'::app_role) OR
    has_role(auth.uid(), 'artist'::app_role)
  )
);

DROP POLICY IF EXISTS "Authenticated users with proper roles can update release-covers" ON storage.objects;
CREATE POLICY "Authenticated users with proper roles can update release-covers"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'release-covers' AND (
    is_admin(auth.uid()) OR
    has_role(auth.uid(), 'label'::app_role) OR
    has_role(auth.uid(), 'whitelabel'::app_role) OR
    has_role(auth.uid(), 'artist'::app_role)
  )
);