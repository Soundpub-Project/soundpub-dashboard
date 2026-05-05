
-- Allow admins to manage all avatars
CREATE POLICY "Admins can manage all avatars"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'avatars' AND is_admin(auth.uid()))
WITH CHECK (bucket_id = 'avatars' AND is_admin(auth.uid()));

-- Allow labels/whitelabels to upload avatars for their artists
-- Folder name = artist user_id; check that artist has parent_label_id = auth.uid()
CREATE POLICY "Labels can upload avatars for their artists"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (has_role(auth.uid(), 'label') OR has_role(auth.uid(), 'whitelabel'))
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id::text = (storage.foldername(name))[1]
      AND p.parent_label_id = auth.uid()
  )
);

CREATE POLICY "Labels can update avatars for their artists"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (has_role(auth.uid(), 'label') OR has_role(auth.uid(), 'whitelabel'))
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id::text = (storage.foldername(name))[1]
      AND p.parent_label_id = auth.uid()
  )
);
