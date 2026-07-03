
-- Drop overly-permissive role-based write policies for release-covers and audio-clips
DROP POLICY IF EXISTS "Roles can update release-covers" ON storage.objects;
DROP POLICY IF EXISTS "Roles can delete release-covers" ON storage.objects;
DROP POLICY IF EXISTS "Roles can upload to release-covers" ON storage.objects;
DROP POLICY IF EXISTS "Roles can update audio-clips" ON storage.objects;
DROP POLICY IF EXISTS "Roles can delete audio-clips" ON storage.objects;

-- Drop broad read policies for release-covers
DROP POLICY IF EXISTS "Authenticated users can view release covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read release-covers" ON storage.objects;

-- Add scoped SELECT for release-covers: owner folder, admins, or the file owner's parent label
CREATE POLICY "Scoped read release-covers"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'release-covers'
  AND (
    public.is_admin(auth.uid())
    OR (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.parent_label_id = auth.uid()
    )
  )
);
