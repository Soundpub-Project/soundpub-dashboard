DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM soundpub.external_identities
    WHERE provider = 'iccn'
    GROUP BY application_user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'ICCN identity migration blocked: multiple ICCN bindings exist for one or more users';
  END IF;
END $$;

CREATE UNIQUE INDEX external_identities_iccn_user_unique
  ON soundpub.external_identities(application_user_id)
  WHERE provider = 'iccn';

GRANT INSERT (application_user_id, provider, issuer, subject, verified_at, binding_provenance)
  ON soundpub.external_identities TO soundpub_app;

GRANT UPDATE (verified_at, binding_provenance) ON soundpub.external_identities TO soundpub_app;

GRANT UPDATE (sso_provider, updated_at) ON soundpub.profiles TO soundpub_app;
