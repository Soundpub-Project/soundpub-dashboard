ALTER TABLE soundpub.media_objects DROP CONSTRAINT media_objects_resource_type_check;
ALTER TABLE soundpub.media_objects ADD CONSTRAINT media_objects_resource_type_check
  CHECK (resource_type IN ('user','label','release','track','settings','takedown'));
ALTER TABLE soundpub.media_objects DROP CONSTRAINT media_objects_category_binding_check;
ALTER TABLE soundpub.media_objects ADD COLUMN takedown_request_id uuid REFERENCES soundpub.takedown_requests(id) ON DELETE RESTRICT,
  ADD COLUMN original_filename text CHECK (original_filename IS NULL OR length(btrim(original_filename)) BETWEEN 1 AND 255);
ALTER TABLE soundpub.media_objects ADD CONSTRAINT media_objects_category_binding_check CHECK (
  (resource_type='user' AND category='USER_AVATAR') OR
  (resource_type='label' AND category='LABEL_LOGO') OR
  (resource_type='release' AND category='RELEASE_COVER') OR
  (resource_type='track' AND category='TRACK_AUDIO') OR
  (resource_type='settings' AND category='OTHER' AND resource_id='00000000-0000-4000-8000-0000000003d0'::uuid) OR
  (resource_type='takedown' AND category='TAKEDOWN_DOCUMENT' AND takedown_request_id=resource_id)
);
DROP INDEX soundpub.media_active_binding;
CREATE UNIQUE INDEX media_active_binding ON soundpub.media_objects(category,resource_type,resource_id,variant)
  WHERE status='ACTIVE' AND category<>'TAKEDOWN_DOCUMENT';
CREATE INDEX media_takedown_documents_idx ON soundpub.media_objects(takedown_request_id,created_at,id)
  WHERE category='TAKEDOWN_DOCUMENT';

ALTER TABLE soundpub.takedown_request_documents ALTER COLUMN storage_asset_id DROP NOT NULL;
ALTER TABLE soundpub.takedown_request_documents ADD COLUMN media_object_id uuid UNIQUE
  REFERENCES soundpub.media_objects(id) ON DELETE RESTRICT;
ALTER TABLE soundpub.takedown_request_documents ADD CONSTRAINT takedown_document_storage_source
  CHECK (num_nonnulls(storage_asset_id,media_object_id)=1);
GRANT INSERT (id,request_id,uploaded_by,media_object_id,file_name,document_type)
  ON soundpub.takedown_request_documents TO soundpub_app;
