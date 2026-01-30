-- Create RLS policies for storage buckets to allow authorized users to upload

-- For track-audio bucket (private)
CREATE POLICY "Authenticated users with proper roles can upload to track-audio"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'track-audio' 
  AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'label'::public.app_role)
    OR public.has_role(auth.uid(), 'whitelabel'::public.app_role)
  )
);

CREATE POLICY "Authenticated users with proper roles can update track-audio"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'track-audio' 
  AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'label'::public.app_role)
    OR public.has_role(auth.uid(), 'whitelabel'::public.app_role)
  )
);

CREATE POLICY "Authenticated users with proper roles can delete from track-audio"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'track-audio' 
  AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'label'::public.app_role)
    OR public.has_role(auth.uid(), 'whitelabel'::public.app_role)
  )
);

CREATE POLICY "Authenticated users can read track-audio"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'track-audio');

-- For audio-clips bucket (public)
CREATE POLICY "Authenticated users with proper roles can upload to audio-clips"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'audio-clips' 
  AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'label'::public.app_role)
    OR public.has_role(auth.uid(), 'whitelabel'::public.app_role)
  )
);

CREATE POLICY "Authenticated users with proper roles can update audio-clips"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'audio-clips' 
  AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'label'::public.app_role)
    OR public.has_role(auth.uid(), 'whitelabel'::public.app_role)
  )
);

CREATE POLICY "Authenticated users with proper roles can delete from audio-clips"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'audio-clips' 
  AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'label'::public.app_role)
    OR public.has_role(auth.uid(), 'whitelabel'::public.app_role)
  )
);

CREATE POLICY "Anyone can read audio-clips"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'audio-clips');

-- For release-covers bucket (private)
CREATE POLICY "Authenticated users with proper roles can upload to release-covers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'release-covers' 
  AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'label'::public.app_role)
    OR public.has_role(auth.uid(), 'whitelabel'::public.app_role)
  )
);

CREATE POLICY "Authenticated users with proper roles can update release-covers"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'release-covers' 
  AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'label'::public.app_role)
    OR public.has_role(auth.uid(), 'whitelabel'::public.app_role)
  )
);

CREATE POLICY "Authenticated users with proper roles can delete from release-covers"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'release-covers' 
  AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'label'::public.app_role)
    OR public.has_role(auth.uid(), 'whitelabel'::public.app_role)
  )
);

CREATE POLICY "Authenticated users can read release-covers"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'release-covers');

-- For label-logos bucket (public) - used for admin dashboard logos
CREATE POLICY "Superadmins can upload to label-logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'label-logos' 
  AND public.has_role(auth.uid(), 'superadmin'::public.app_role)
);

CREATE POLICY "Superadmins can update label-logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'label-logos' 
  AND public.has_role(auth.uid(), 'superadmin'::public.app_role)
);

CREATE POLICY "Superadmins can delete from label-logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'label-logos' 
  AND public.has_role(auth.uid(), 'superadmin'::public.app_role)
);

CREATE POLICY "Anyone can read label-logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'label-logos');