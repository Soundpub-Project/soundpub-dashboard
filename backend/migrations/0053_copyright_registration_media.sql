ALTER TABLE soundpub.media_objects DROP CONSTRAINT media_objects_resource_type_check;
ALTER TABLE soundpub.media_objects ADD CONSTRAINT media_objects_resource_type_check
  CHECK (resource_type IN ('user','label','release','track','settings','takedown','copyright_registration'));

ALTER TABLE soundpub.media_objects DROP CONSTRAINT media_objects_category_check;
ALTER TABLE soundpub.media_objects ADD CONSTRAINT media_objects_category_check CHECK (category IN
  ('USER_AVATAR','LABEL_LOGO','RELEASE_COVER','TRACK_AUDIO','COPYRIGHT_DOCUMENT','COPYRIGHT_REGISTRATION_DOCUMENT','TAKEDOWN_DOCUMENT','OTHER'));

ALTER TABLE soundpub.media_objects DROP CONSTRAINT media_objects_category_binding_check;
ALTER TABLE soundpub.media_objects ADD COLUMN copyright_registration_id uuid
  REFERENCES soundpub.copyright_registrations(id) ON DELETE RESTRICT,
  ADD COLUMN copyright_document_type text CHECK (copyright_document_type IS NULL OR copyright_document_type IN
    ('IDENTITY','TAX','POWER_OF_ATTORNEY','AUDIO_DEMO','LYRICS','WORK_EVIDENCE','CONTRACT_GENERATED',
      'CONTRACT_STAMPED','CONTRACT_SIGNED','OTHER'));
ALTER TABLE soundpub.media_objects ADD CONSTRAINT media_objects_category_binding_check CHECK (
  (resource_type='user' AND category='USER_AVATAR') OR
  (resource_type='label' AND category='LABEL_LOGO') OR
  (resource_type='release' AND category='RELEASE_COVER') OR
  (resource_type='track' AND category='TRACK_AUDIO') OR
  (resource_type='settings' AND category='OTHER' AND resource_id='00000000-0000-4000-8000-0000000003d0'::uuid) OR
  (resource_type='takedown' AND category='TAKEDOWN_DOCUMENT' AND takedown_request_id=resource_id) OR
  (resource_type='copyright_registration' AND category='COPYRIGHT_REGISTRATION_DOCUMENT'
    AND copyright_registration_id=resource_id)
);
ALTER TABLE soundpub.media_objects ADD CONSTRAINT media_objects_copyright_binding_shape CHECK (
  (resource_type='copyright_registration' AND copyright_registration_id IS NOT NULL) OR
  (resource_type<>'copyright_registration' AND copyright_registration_id IS NULL)
);

DROP INDEX soundpub.media_active_binding;
CREATE UNIQUE INDEX media_active_binding ON soundpub.media_objects(category,resource_type,resource_id,variant)
  WHERE status='ACTIVE' AND category NOT IN ('TAKEDOWN_DOCUMENT','COPYRIGHT_REGISTRATION_DOCUMENT');
CREATE INDEX media_copyright_registration_documents_idx
  ON soundpub.media_objects(copyright_registration_id,created_at,id)
  WHERE category='COPYRIGHT_REGISTRATION_DOCUMENT';

ALTER TABLE soundpub.copyright_registration_files
  ADD COLUMN detached_at timestamptz,
  ADD COLUMN frozen_at timestamptz;

DROP TRIGGER copyright_files_draft_guard ON soundpub.copyright_registration_files;
CREATE FUNCTION soundpub.copyright_registration_file_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF ROW(NEW.id,NEW.registration_id,NEW.work_id,NEW.media_object_id,NEW.file_type,NEW.uploaded_by,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.registration_id,OLD.work_id,OLD.media_object_id,OLD.file_type,OLD.uploaded_by,OLD.created_at)
  THEN RAISE EXCEPTION 'copyright registration file is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.frozen_at IS NULL AND NEW.frozen_at IS NOT NULL AND NEW.detached_at IS NOT DISTINCT FROM OLD.detached_at THEN RETURN NEW; END IF;
  IF NEW.frozen_at IS DISTINCT FROM OLD.frozen_at OR OLD.detached_at IS NOT NULL OR NEW.detached_at IS NULL
  THEN RAISE EXCEPTION 'copyright registration file is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.frozen_at IS NOT NULL OR NOT EXISTS (SELECT 1 FROM soundpub.copyright_registrations registration
    WHERE registration.id=OLD.registration_id AND registration.status IN ('DRAFT','REVISION_REQUESTED'))
  THEN RAISE EXCEPTION 'copyright registration file is frozen' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION soundpub.copyright_registration_file_guard() FROM PUBLIC,soundpub_app;
CREATE TRIGGER copyright_files_guard BEFORE UPDATE ON soundpub.copyright_registration_files
  FOR EACH ROW EXECUTE FUNCTION soundpub.copyright_registration_file_guard();
CREATE TRIGGER copyright_files_immutable BEFORE DELETE OR TRUNCATE ON soundpub.copyright_registration_files
  FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable();

CREATE FUNCTION soundpub.copyright_registration_freeze_files() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,soundpub AS $$
BEGIN
  IF OLD.status IN ('DRAFT','REVISION_REQUESTED') AND NEW.status NOT IN ('DRAFT','REVISION_REQUESTED') THEN
    UPDATE soundpub.copyright_registration_files SET frozen_at=clock_timestamp()
      WHERE registration_id=NEW.id AND detached_at IS NULL AND frozen_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION soundpub.copyright_registration_freeze_files() FROM PUBLIC,soundpub_app;
CREATE TRIGGER copyright_registration_freeze_files AFTER UPDATE OF status ON soundpub.copyright_registrations
  FOR EACH ROW EXECUTE FUNCTION soundpub.copyright_registration_freeze_files();

GRANT INSERT (copyright_registration_id,copyright_document_type) ON soundpub.media_objects TO soundpub_app;
GRANT UPDATE (detached_at) ON soundpub.copyright_registration_files TO soundpub_app;
