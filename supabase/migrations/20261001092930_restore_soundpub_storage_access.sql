DROP POLICY IF EXISTS "SoundPub authenticated upload buckets" ON storage.objects;
CREATE POLICY "SoundPub authenticated upload buckets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('avatars', 'label-logos', 'iccn-gallery', 'release-covers', 'track-audio', 'track-video', 'audio-clips')
  AND (
    split_part(name, '/', 1) = auth.uid()::text
    OR soundpub.is_admin(auth.uid())
  )
);

DROP POLICY IF EXISTS "SoundPub authenticated read private buckets" ON storage.objects;
CREATE POLICY "SoundPub authenticated read private buckets"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id IN ('release-covers', 'track-audio', 'track-video'));

DROP POLICY IF EXISTS "SoundPub public read public buckets" ON storage.objects;
CREATE POLICY "SoundPub public read public buckets"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id IN ('avatars', 'label-logos', 'iccn-gallery', 'audio-clips'));

DROP POLICY IF EXISTS "SoundPub authenticated update buckets" ON storage.objects;
CREATE POLICY "SoundPub authenticated update buckets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id IN ('avatars', 'label-logos', 'iccn-gallery', 'release-covers', 'track-audio', 'track-video', 'audio-clips')
  AND (
    split_part(name, '/', 1) = auth.uid()::text
    OR soundpub.is_admin(auth.uid())
  )
)
WITH CHECK (
  bucket_id IN ('avatars', 'label-logos', 'iccn-gallery', 'release-covers', 'track-audio', 'track-video', 'audio-clips')
  AND (
    split_part(name, '/', 1) = auth.uid()::text
    OR soundpub.is_admin(auth.uid())
  )
);

DROP POLICY IF EXISTS "SoundPub authenticated delete buckets" ON storage.objects;
CREATE POLICY "SoundPub authenticated delete buckets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id IN ('avatars', 'label-logos', 'iccn-gallery', 'release-covers', 'track-audio', 'track-video', 'audio-clips')
  AND (
    split_part(name, '/', 1) = auth.uid()::text
    OR soundpub.is_admin(auth.uid())
  )
);

DROP POLICY IF EXISTS "SoundPub service role manage buckets" ON storage.objects;
CREATE POLICY "SoundPub service role manage buckets"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id IN ('avatars', 'label-logos', 'iccn-gallery', 'release-covers', 'track-audio', 'track-video', 'audio-clips'))
WITH CHECK (bucket_id IN ('avatars', 'label-logos', 'iccn-gallery', 'release-covers', 'track-audio', 'track-video', 'audio-clips'));
