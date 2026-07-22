DROP POLICY IF EXISTS "Users can update release covers in own folder" ON storage.objects;

CREATE POLICY "Users can update release covers in own folder"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'release-covers'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'release-covers'
  AND (storage.foldername(name))[1] = auth.uid()::text
);