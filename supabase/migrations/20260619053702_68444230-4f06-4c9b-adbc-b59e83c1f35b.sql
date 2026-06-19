
-- Storage: drop broad role-only INSERT policies; rely on path-scoped policies
DROP POLICY IF EXISTS "Admins and labels can upload release covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can upload to release-cov" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can upload to track-audio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can upload to audio-clips" ON storage.objects;
DROP POLICY IF EXISTS "Labels can upload audio for their releases" ON storage.objects;
DROP POLICY IF EXISTS "Labels can upload video for their releases" ON storage.objects;
DROP POLICY IF EXISTS "Labels can upload audio clips" ON storage.objects;
DROP POLICY IF EXISTS "Whitelabels can upload video" ON storage.objects;
DROP POLICY IF EXISTS "Artists can upload video for their releases" ON storage.objects;

-- Audio clips: enforce path ownership for INSERT (mirror track-audio pattern)
DROP POLICY IF EXISTS "Users can upload audio clips to own folder" ON storage.objects;
CREATE POLICY "Users can upload audio clips to own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'audio-clips'
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND (
    is_admin(auth.uid())
    OR has_role(auth.uid(), 'label'::app_role)
    OR has_role(auth.uid(), 'whitelabel'::app_role)
    OR has_role(auth.uid(), 'artist'::app_role)
  )
);

-- Add track-video path-scoped INSERT policy if it doesn't already cover whitelabel/artist
-- (the existing "Users can upload track video to own folder" already covers all roles)

-- Audit logs: remove direct authenticated INSERT. Edge functions use service_role and bypass RLS.
DROP POLICY IF EXISTS "Authenticated users can insert own audit logs" ON public.audit_logs;
