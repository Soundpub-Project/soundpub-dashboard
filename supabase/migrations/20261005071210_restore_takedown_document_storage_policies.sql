DROP POLICY IF EXISTS "Upload own takedown storage files" ON storage.objects;
CREATE POLICY "Upload own takedown storage files" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'takedown-documents' AND split_part(name, '/', 1) = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "Read scoped takedown storage files" ON storage.objects;
CREATE POLICY "Read scoped takedown storage files" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'takedown-documents'
  AND (
    soundpub.is_admin((SELECT auth.uid()))
    OR split_part(name, '/', 1) = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM soundpub.takedown_request_documents document
      JOIN soundpub.takedown_requests request ON request.id = document.request_id
      WHERE document.storage_path = name
        AND request.label_id = (SELECT auth.uid())
    )
  )
);
