
-- 1. Notifications UPDATE: split owner-only vs admin-managed global
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2. Profiles: tighten label/whitelabel UPDATE WITH CHECK (no NULL parent_label_id)
DROP POLICY IF EXISTS "Labels can update their artists" ON public.profiles;
CREATE POLICY "Labels can update their artists"
  ON public.profiles FOR UPDATE
  USING (has_role(auth.uid(), 'label'::app_role) AND parent_label_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'label'::app_role) AND parent_label_id = auth.uid());

DROP POLICY IF EXISTS "Whitelabels can update their artists" ON public.profiles;
CREATE POLICY "Whitelabels can update their artists"
  ON public.profiles FOR UPDATE
  USING (has_role(auth.uid(), 'whitelabel'::app_role) AND parent_label_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'whitelabel'::app_role) AND parent_label_id = auth.uid());

-- 3. Storage policies — scope UPDATE/DELETE/SELECT by folder ownership

-- track-audio SELECT: admins or owner (path[1] = uid)
DROP POLICY IF EXISTS "Authenticated users can read track-audio" ON storage.objects;
DROP POLICY IF EXISTS "Artists can view track audio" ON storage.objects;
CREATE POLICY "Owners and admins can read track-audio"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'track-audio'
    AND (is_admin(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text)
  );

-- track-video SELECT
DROP POLICY IF EXISTS "Artists can view track video" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read track-video" ON storage.objects;
CREATE POLICY "Owners and admins can read track-video"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'track-video'
    AND (is_admin(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text)
  );

-- track-audio DELETE/UPDATE: owner or admin
DROP POLICY IF EXISTS "Authenticated users with proper roles can delete from track-audio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can update track-audio" ON storage.objects;
CREATE POLICY "Owners and admins can delete track-audio"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'track-audio'
    AND (is_admin(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text)
  );
CREATE POLICY "Owners and admins can update track-audio"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'track-audio'
    AND (is_admin(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text)
  );

-- track-video DELETE/UPDATE
DROP POLICY IF EXISTS "Authenticated users with proper roles can delete from track-video" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can update track-video" ON storage.objects;
CREATE POLICY "Owners and admins can delete track-video"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'track-video'
    AND (is_admin(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text)
  );
CREATE POLICY "Owners and admins can update track-video"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'track-video'
    AND (is_admin(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text)
  );

-- audio-clips DELETE/UPDATE: owner or admin
DROP POLICY IF EXISTS "Authenticated users with proper roles can delete from audio-clips" ON storage.objects;
DROP POLICY IF EXISTS "Labels can delete their own audio clips" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can update audio-clips" ON storage.objects;
CREATE POLICY "Owners and admins can delete audio-clips"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'audio-clips'
    AND (is_admin(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text)
  );
CREATE POLICY "Owners and admins can update audio-clips"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'audio-clips'
    AND (is_admin(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text)
  );

-- release-covers DELETE/UPDATE: owner or admin
DROP POLICY IF EXISTS "Admins and labels can delete release covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can delete from release-covers" ON storage.objects;
DROP POLICY IF EXISTS "Admins and labels can update release covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can update release-covers" ON storage.objects;
CREATE POLICY "Owners and admins can delete release-covers"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'release-covers'
    AND (is_admin(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text)
  );
CREATE POLICY "Owners and admins can update release-covers"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'release-covers'
    AND (is_admin(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text)
  );

-- 4. Revoke EXECUTE on SECURITY DEFINER helpers from anon/public
REVOKE EXECUTE ON FUNCTION public.get_royalty_stats() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_royalty_country_summary(integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_royalty_platform_summary(integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_whitelabel(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_royalty_periods() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_artist_user_id_by_name(text, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_royalty_track_breakdown(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_royalty_comparison(text[], text[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_royalty_artist_breakdown(text, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_royalty_top_performers(text[], text[], text, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_royalty_monthly_summary() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_artist_name(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_royalty_label_breakdown(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_royalty_period_summary() FROM anon, PUBLIC;
