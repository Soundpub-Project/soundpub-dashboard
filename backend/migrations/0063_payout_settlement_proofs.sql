ALTER TABLE soundpub.media_objects DROP CONSTRAINT media_objects_resource_type_check;
ALTER TABLE soundpub.media_objects ADD CONSTRAINT media_objects_resource_type_check
  CHECK (resource_type IN ('user','label','release','track','settings','takedown','copyright_registration','payout'));
ALTER TABLE soundpub.media_objects DROP CONSTRAINT media_objects_category_check;
ALTER TABLE soundpub.media_objects ADD CONSTRAINT media_objects_category_check CHECK (category IN
  ('USER_AVATAR','LABEL_LOGO','RELEASE_COVER','TRACK_AUDIO','COPYRIGHT_DOCUMENT','COPYRIGHT_REGISTRATION_DOCUMENT',
    'TAKEDOWN_DOCUMENT','PAYOUT_PROOF','OTHER'));
ALTER TABLE soundpub.media_objects DROP CONSTRAINT media_objects_category_binding_check;
ALTER TABLE soundpub.media_objects ADD CONSTRAINT media_objects_category_binding_check CHECK (
  (resource_type='user' AND category='USER_AVATAR') OR
  (resource_type='label' AND category='LABEL_LOGO') OR
  (resource_type='release' AND category='RELEASE_COVER') OR
  (resource_type='track' AND category='TRACK_AUDIO') OR
  (resource_type='settings' AND category='OTHER' AND resource_id='00000000-0000-4000-8000-0000000003d0'::uuid) OR
  (resource_type='takedown' AND category='TAKEDOWN_DOCUMENT' AND takedown_request_id=resource_id) OR
  (resource_type='copyright_registration' AND category='COPYRIGHT_REGISTRATION_DOCUMENT'
    AND copyright_registration_id=resource_id) OR
  (resource_type='payout' AND category='PAYOUT_PROOF')
);
DROP INDEX soundpub.media_active_binding;
CREATE UNIQUE INDEX media_active_binding ON soundpub.media_objects(category,resource_type,resource_id,variant)
  WHERE status='ACTIVE' AND category NOT IN ('TAKEDOWN_DOCUMENT','COPYRIGHT_REGISTRATION_DOCUMENT','PAYOUT_PROOF');
CREATE TABLE soundpub.payout_settlement_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id uuid NOT NULL UNIQUE REFERENCES soundpub.payout_requests(id) ON DELETE RESTRICT,
  media_object_id uuid NOT NULL UNIQUE REFERENCES soundpub.media_objects(id) ON DELETE RESTRICT,
  uploaded_by uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payout_settlement_proofs_payout_idx ON soundpub.payout_settlement_proofs(payout_id,created_at DESC,id DESC);
CREATE FUNCTION soundpub.payout_settlement_proof_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,soundpub AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM soundpub.payout_requests request
    WHERE request.id=NEW.payout_id AND request.status='approved') THEN
    RAISE EXCEPTION 'payout must be approved before settlement proof is bound' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM soundpub.media_objects media
    WHERE media.id=NEW.media_object_id AND media.status='ACTIVE' AND media.category='PAYOUT_PROOF'
      AND media.resource_type='payout' AND media.resource_id=NEW.payout_id) THEN
    RAISE EXCEPTION 'settlement proof must be active payout proof for payout' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION soundpub.payout_settlement_proof_guard() FROM PUBLIC,soundpub_app;
CREATE TRIGGER payout_settlement_proofs_guard BEFORE INSERT ON soundpub.payout_settlement_proofs
  FOR EACH ROW EXECUTE FUNCTION soundpub.payout_settlement_proof_guard();
REVOKE ALL ON soundpub.payout_settlement_proofs FROM PUBLIC;
GRANT SELECT,INSERT ON soundpub.payout_settlement_proofs TO soundpub_app;
ALTER TABLE soundpub.payout_settlement_proofs ENABLE ROW LEVEL SECURITY;
CREATE POLICY payout_settlement_proofs_backend ON soundpub.payout_settlement_proofs TO soundpub_app USING(true) WITH CHECK(true);
CREATE TRIGGER payout_settlement_proofs_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON soundpub.payout_settlement_proofs
  FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable();
