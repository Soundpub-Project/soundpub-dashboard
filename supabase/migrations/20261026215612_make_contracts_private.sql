UPDATE storage.buckets
SET public = false,
    updated_at = now()
WHERE id = 'contracts';

DROP POLICY IF EXISTS "SoundPub contract owners and admins read" ON storage.objects;
CREATE POLICY "SoundPub contract owners and admins read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'contracts'
  AND (
    soundpub.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM soundpub.copyright_registrations registration
      WHERE registration.id::text = split_part(storage.objects.name, '/', 2)
        AND registration.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "SoundPub admins upload contracts" ON storage.objects;
CREATE POLICY "SoundPub admins upload contracts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'contracts'
  AND soundpub.is_admin(auth.uid())
  AND split_part(storage.objects.name, '/', 1) IN ('draft', 'generated', 'signed', 'stamped')
  AND EXISTS (
    SELECT 1
    FROM soundpub.copyright_registrations registration
    WHERE registration.id::text = split_part(storage.objects.name, '/', 2)
  )
);

DROP POLICY IF EXISTS "SoundPub admins update contracts" ON storage.objects;
CREATE POLICY "SoundPub admins update contracts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'contracts' AND soundpub.is_admin(auth.uid()))
WITH CHECK (
  bucket_id = 'contracts'
  AND soundpub.is_admin(auth.uid())
  AND split_part(storage.objects.name, '/', 1) IN ('draft', 'generated', 'signed', 'stamped')
  AND EXISTS (
    SELECT 1
    FROM soundpub.copyright_registrations registration
    WHERE registration.id::text = split_part(storage.objects.name, '/', 2)
  )
);

DROP POLICY IF EXISTS "SoundPub admins delete contracts" ON storage.objects;
CREATE POLICY "SoundPub admins delete contracts"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'contracts' AND soundpub.is_admin(auth.uid()));

DROP POLICY IF EXISTS "SoundPub service role manages contracts" ON storage.objects;
CREATE POLICY "SoundPub service role manages contracts"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'contracts')
WITH CHECK (bucket_id = 'contracts');
