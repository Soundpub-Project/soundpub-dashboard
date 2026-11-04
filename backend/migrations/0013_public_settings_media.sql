ALTER TABLE soundpub.media_objects DROP CONSTRAINT media_objects_resource_type_check;
ALTER TABLE soundpub.media_objects ADD CONSTRAINT media_objects_resource_type_check
  CHECK (resource_type IN ('user','label','release','track','settings'));
DO $$
DECLARE binding_constraint text;
BEGIN
  SELECT conname INTO binding_constraint FROM pg_constraint
  WHERE conrelid='soundpub.media_objects'::regclass AND contype='c'
    AND pg_get_constraintdef(oid) LIKE '%resource_type%' AND pg_get_constraintdef(oid) LIKE '%USER_AVATAR%'
    AND pg_get_constraintdef(oid) LIKE '%LABEL_LOGO%';
  IF binding_constraint IS NULL THEN RAISE EXCEPTION 'media binding constraint not found'; END IF;
  EXECUTE format('ALTER TABLE soundpub.media_objects DROP CONSTRAINT %I', binding_constraint);
END $$;
ALTER TABLE soundpub.media_objects ADD CONSTRAINT media_objects_category_binding_check CHECK (
  (resource_type='user' AND category='USER_AVATAR') OR
  (resource_type='label' AND category='LABEL_LOGO') OR
  (resource_type='release' AND category='RELEASE_COVER') OR
  (resource_type='track' AND category='TRACK_AUDIO') OR
  (resource_type='settings' AND category='OTHER' AND resource_id='00000000-0000-4000-8000-0000000003d0'::uuid)
);
