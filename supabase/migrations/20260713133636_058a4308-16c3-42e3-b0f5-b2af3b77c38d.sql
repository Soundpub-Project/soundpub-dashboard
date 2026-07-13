
-- app_settings
DROP POLICY IF EXISTS "Superadmins can manage app settings" ON public.app_settings;
CREATE POLICY "Superadmins can manage app settings" ON public.app_settings
  AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

-- artists
DROP POLICY IF EXISTS "Whitelabels can manage their own artists" ON public.artists;
CREATE POLICY "Whitelabels can manage their own artists" ON public.artists
  AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'whitelabel'::app_role) AND label_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'whitelabel'::app_role) AND label_id = auth.uid());

-- composer_royalties
DROP POLICY IF EXISTS "Admins can manage all composer royalties" ON public.composer_royalties;
CREATE POLICY "Admins can manage all composer royalties" ON public.composer_royalties
  AS PERMISSIVE FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Copyright users can view composer royalties" ON public.composer_royalties;
CREATE POLICY "Copyright users can view composer royalties" ON public.composer_royalties
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'copyright'::app_role));

-- releases
DROP POLICY IF EXISTS "Admins can manage all releases" ON public.releases;
CREATE POLICY "Admins can manage all releases" ON public.releases
  AS PERMISSIVE FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- storage.objects — admin/owner-gated policies scoped to authenticated
DROP POLICY IF EXISTS "Admins can delete ICCN gallery photos" ON storage.objects;
CREATE POLICY "Admins can delete ICCN gallery photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'iccn-gallery' AND is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update ICCN gallery photos" ON storage.objects;
CREATE POLICY "Admins can update ICCN gallery photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'iccn-gallery' AND is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can upload ICCN gallery photos" ON storage.objects;
CREATE POLICY "Admins can upload ICCN gallery photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'iccn-gallery' AND is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage all audio clips" ON storage.objects;
CREATE POLICY "Admins can manage all audio clips" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'audio-clips' AND is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'audio-clips' AND is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage all audio files" ON storage.objects;
CREATE POLICY "Admins can manage all audio files" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'track-audio' AND is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'track-audio' AND is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage all video files" ON storage.objects;
CREATE POLICY "Admins can manage all video files" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'track-video' AND is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'track-video' AND is_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners and admins can delete audio-clips" ON storage.objects;
CREATE POLICY "Owners and admins can delete audio-clips" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'audio-clips' AND (is_admin(auth.uid()) OR (storage.foldername(name))[1] = (auth.uid())::text));

DROP POLICY IF EXISTS "Owners and admins can delete release-covers" ON storage.objects;
CREATE POLICY "Owners and admins can delete release-covers" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'release-covers' AND (is_admin(auth.uid()) OR (storage.foldername(name))[1] = (auth.uid())::text));

DROP POLICY IF EXISTS "Owners and admins can delete track-audio" ON storage.objects;
CREATE POLICY "Owners and admins can delete track-audio" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'track-audio' AND (is_admin(auth.uid()) OR (storage.foldername(name))[1] = (auth.uid())::text));

DROP POLICY IF EXISTS "Owners and admins can delete track-video" ON storage.objects;
CREATE POLICY "Owners and admins can delete track-video" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'track-video' AND (is_admin(auth.uid()) OR (storage.foldername(name))[1] = (auth.uid())::text));

DROP POLICY IF EXISTS "Owners and admins can read track-audio" ON storage.objects;
CREATE POLICY "Owners and admins can read track-audio" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'track-audio' AND (is_admin(auth.uid()) OR (storage.foldername(name))[1] = (auth.uid())::text));

DROP POLICY IF EXISTS "Owners and admins can read track-video" ON storage.objects;
CREATE POLICY "Owners and admins can read track-video" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'track-video' AND (is_admin(auth.uid()) OR (storage.foldername(name))[1] = (auth.uid())::text));

DROP POLICY IF EXISTS "Owners and admins can update audio-clips" ON storage.objects;
CREATE POLICY "Owners and admins can update audio-clips" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'audio-clips' AND (is_admin(auth.uid()) OR (storage.foldername(name))[1] = (auth.uid())::text));

DROP POLICY IF EXISTS "Owners and admins can update release-covers" ON storage.objects;
CREATE POLICY "Owners and admins can update release-covers" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'release-covers' AND (is_admin(auth.uid()) OR (storage.foldername(name))[1] = (auth.uid())::text));

DROP POLICY IF EXISTS "Owners and admins can update track-audio" ON storage.objects;
CREATE POLICY "Owners and admins can update track-audio" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'track-audio' AND (is_admin(auth.uid()) OR (storage.foldername(name))[1] = (auth.uid())::text));

DROP POLICY IF EXISTS "Owners and admins can update track-video" ON storage.objects;
CREATE POLICY "Owners and admins can update track-video" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'track-video' AND (is_admin(auth.uid()) OR (storage.foldername(name))[1] = (auth.uid())::text));
