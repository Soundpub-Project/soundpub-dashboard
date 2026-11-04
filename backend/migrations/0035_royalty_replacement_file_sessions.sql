ALTER TABLE soundpub.royalty_import_sessions
  ADD COLUMN operation_kind text NOT NULL DEFAULT 'IMPORT',
  ADD COLUMN replaces_batch_id uuid REFERENCES soundpub.royalty_import_batches(id),
  ADD COLUMN replacement_reason text,
  ADD COLUMN request_key text,
  ADD CONSTRAINT royalty_import_sessions_operation_kind_check
    CHECK (operation_kind IN ('IMPORT','REPLACEMENT')),
  ADD CONSTRAINT royalty_import_sessions_operation_shape_check CHECK (
    (operation_kind='IMPORT' AND replaces_batch_id IS NULL AND replacement_reason IS NULL)
    OR
    (operation_kind='REPLACEMENT' AND replaces_batch_id IS NOT NULL
      AND replacement_reason IS NOT NULL
      AND length(btrim(replacement_reason)) BETWEEN 1 AND 1000)
  );

CREATE UNIQUE INDEX royalty_import_sessions_request_key_unique
  ON soundpub.royalty_import_sessions(requester_id,request_key)
  WHERE request_key IS NOT NULL;

ALTER TABLE soundpub.royalty_import_replacements
  ADD COLUMN session_id uuid UNIQUE REFERENCES soundpub.royalty_import_sessions(id);

CREATE OR REPLACE FUNCTION soundpub.royalty_replacement_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
  old_source text;
  old_period text;
  old_currency text;
  old_validation jsonb;
  new_source text;
  new_period text;
  new_currency text;
  new_validation jsonb;
BEGIN
  IF NEW.session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM soundpub.royalty_import_sessions replacement_session
    WHERE replacement_session.id=NEW.session_id
      AND replacement_session.operation_kind='REPLACEMENT'
      AND replacement_session.replaces_batch_id=NEW.old_batch_id
      AND replacement_session.replacement_reason=NEW.reason
      AND replacement_session.requester_id=NEW.actor_id
  ) THEN
    RAISE EXCEPTION 'ROYALTY_REPLACEMENT_SESSION_MISMATCH' USING ERRCODE='23514';
  END IF;

  SELECT old_batch.source,old_batch.period,old_batch.currency,old_batch.validation_result,
    new_batch.source,new_batch.period,new_batch.currency,new_batch.validation_result
  INTO old_source,old_period,old_currency,old_validation,
    new_source,new_period,new_currency,new_validation
  FROM soundpub.royalty_import_batches old_batch
  JOIN soundpub.royalty_import_batches new_batch ON new_batch.id=NEW.new_batch_id
  WHERE old_batch.id=NEW.old_batch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROYALTY_REPLACEMENT_BATCH_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM soundpub.royalty_import_corrections correction
    WHERE correction.batch_id=NEW.old_batch_id
  ) THEN
    RAISE EXCEPTION 'ROYALTY_REPLACEMENT_CORRECTION_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF old_source IS DISTINCT FROM new_source THEN
    RAISE EXCEPTION 'ROYALTY_REPLACEMENT_SOURCE_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF old_period IS DISTINCT FROM new_period THEN
    RAISE EXCEPTION 'ROYALTY_REPLACEMENT_PERIOD_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF old_currency IS DISTINCT FROM new_currency THEN
    RAISE EXCEPTION 'ROYALTY_REPLACEMENT_CURRENCY_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF jsonb_typeof(old_validation->'policy_code') IS DISTINCT FROM 'string'
    OR jsonb_typeof(new_validation->'policy_code') IS DISTINCT FROM 'string'
    OR old_validation->>'policy_code' IS DISTINCT FROM new_validation->>'policy_code' THEN
    RAISE EXCEPTION 'ROYALTY_REPLACEMENT_POLICY_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF new_validation->'replaces_batch_id' IS DISTINCT FROM to_jsonb(NEW.old_batch_id) THEN
    RAISE EXCEPTION 'ROYALTY_REPLACEMENT_PROVENANCE_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION soundpub.royalty_replacement_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION soundpub.royalty_replacement_guard() FROM soundpub_app;
