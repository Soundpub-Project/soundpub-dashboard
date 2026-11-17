ALTER TABLE soundpub.media_objects
  ADD COLUMN upload_method text NOT NULL DEFAULT 'PUT',
  ADD COLUMN multipart_upload_id text;
ALTER TABLE soundpub.media_objects
  ADD CONSTRAINT media_objects_upload_method_check CHECK (upload_method IN ('PUT','MULTIPART')),
  ADD CONSTRAINT media_objects_multipart_binding_check CHECK (
    (upload_method='PUT' AND multipart_upload_id IS NULL) OR
    (upload_method='MULTIPART' AND multipart_upload_id IS NOT NULL AND length(multipart_upload_id) BETWEEN 1 AND 1024
      AND category='TRACK_AUDIO' AND size > 25165824)
  );
CREATE INDEX media_pending_multipart_expiry_idx ON soundpub.media_objects(expires_at,id)
  WHERE status='PENDING' AND upload_method='MULTIPART';
