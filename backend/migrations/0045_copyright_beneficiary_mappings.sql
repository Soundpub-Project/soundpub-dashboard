CREATE TABLE soundpub.copyright_beneficiary_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  composer_code text NOT NULL CHECK (
    composer_code = btrim(composer_code)
    AND length(composer_code) BETWEEN 1 AND 64
    AND composer_code ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'
  ),
  owner_id uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  canonical_name text NOT NULL CHECK (
    canonical_name = btrim(canonical_name)
    AND length(canonical_name) BETWEEN 1 AND 200
  ),
  valid_from text NOT NULL CHECK (
    valid_from ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  ),
  valid_through text CHECK (
    valid_through IS NULL OR (
      valid_through ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      AND valid_through >= valid_from
    )
  ),
  created_by uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX copyright_beneficiary_mappings_lookup_idx
  ON soundpub.copyright_beneficiary_mappings (upper(btrim(composer_code)), valid_from, valid_through);
CREATE INDEX copyright_beneficiary_mappings_owner_idx
  ON soundpub.copyright_beneficiary_mappings (owner_id, created_at DESC, id DESC);

CREATE FUNCTION soundpub.copyright_beneficiary_mapping_overlap_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(upper(btrim(NEW.composer_code)), 45));

  IF EXISTS (
    SELECT 1
    FROM soundpub.copyright_beneficiary_mappings existing
    WHERE upper(btrim(existing.composer_code)) = upper(btrim(NEW.composer_code))
      AND existing.valid_from <= COALESCE(NEW.valid_through, '9999-12')
      AND NEW.valid_from <= COALESCE(existing.valid_through, '9999-12')
  ) THEN
    RAISE EXCEPTION 'COPYRIGHT_BENEFICIARY_MAPPING_PERIOD_OVERLAP' USING ERRCODE='23P01';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION soundpub.copyright_beneficiary_mapping_overlap_guard() FROM PUBLIC,soundpub_app;

CREATE TRIGGER copyright_beneficiary_mappings_overlap_guard
  BEFORE INSERT ON soundpub.copyright_beneficiary_mappings
  FOR EACH ROW EXECUTE FUNCTION soundpub.copyright_beneficiary_mapping_overlap_guard();
CREATE TRIGGER copyright_beneficiary_mappings_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON soundpub.copyright_beneficiary_mappings
  FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable();

CREATE TABLE soundpub.copyright_beneficiary_mapping_revocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id uuid NOT NULL UNIQUE REFERENCES soundpub.copyright_beneficiary_mappings(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (reason = btrim(reason) AND length(reason) BETWEEN 1 AND 500),
  revoked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX copyright_beneficiary_mapping_revocations_actor_idx
  ON soundpub.copyright_beneficiary_mapping_revocations (actor_id, revoked_at DESC, id DESC);
CREATE TRIGGER copyright_beneficiary_mapping_revocations_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON soundpub.copyright_beneficiary_mapping_revocations
  FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable();

REVOKE ALL ON soundpub.copyright_beneficiary_mappings FROM PUBLIC,soundpub_app;
REVOKE ALL ON soundpub.copyright_beneficiary_mapping_revocations FROM PUBLIC,soundpub_app;
GRANT SELECT,INSERT ON soundpub.copyright_beneficiary_mappings TO soundpub_app;
GRANT SELECT,INSERT ON soundpub.copyright_beneficiary_mapping_revocations TO soundpub_app;

ALTER TABLE soundpub.copyright_beneficiary_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.copyright_beneficiary_mapping_revocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY copyright_beneficiary_mappings_backend ON soundpub.copyright_beneficiary_mappings
  TO soundpub_app USING (true) WITH CHECK (true);
CREATE POLICY copyright_beneficiary_mapping_revocations_backend ON soundpub.copyright_beneficiary_mapping_revocations
  TO soundpub_app USING (true) WITH CHECK (true);
