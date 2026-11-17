ALTER TABLE soundpub.royalty_import_sessions
  ADD COLUMN replacement_batch_ids uuid[] NOT NULL DEFAULT '{}';
UPDATE soundpub.royalty_import_sessions
  SET replacement_batch_ids=ARRAY[replaces_batch_id] WHERE operation_kind='REPLACEMENT';
ALTER TABLE soundpub.royalty_import_sessions
  ADD CONSTRAINT royalty_import_sessions_replacement_batch_ids_check CHECK (
    (operation_kind='IMPORT' AND cardinality(replacement_batch_ids)=0)
    OR (operation_kind='REPLACEMENT' AND cardinality(replacement_batch_ids) BETWEEN 1 AND 1000
      AND replaces_batch_id=ANY(replacement_batch_ids))
  );

ALTER TABLE soundpub.royalty_import_replacements
  DROP CONSTRAINT royalty_import_replacements_new_batch_id_key,
  DROP CONSTRAINT royalty_import_replacements_session_id_key;

CREATE INDEX royalty_replacements_new_batch_idx
  ON soundpub.royalty_import_replacements(new_batch_id,old_batch_id);
CREATE INDEX royalty_replacements_session_idx
  ON soundpub.royalty_import_replacements(session_id) WHERE session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION soundpub.royalty_replacement_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
  old_period text;
  old_currency text;
  old_filename text;
  old_validation jsonb;
  new_period text;
  new_currency text;
  new_filename text;
  new_validation jsonb;
  related_ids jsonb;
BEGIN
  SELECT old_batch.period,old_batch.currency,old_batch.filename,old_batch.validation_result,
    new_batch.period,new_batch.currency,new_batch.filename,new_batch.validation_result
  INTO old_period,old_currency,old_filename,old_validation,
    new_period,new_currency,new_filename,new_validation
  FROM soundpub.royalty_import_batches old_batch
  JOIN soundpub.royalty_import_batches new_batch ON new_batch.id=NEW.new_batch_id
  WHERE old_batch.id=NEW.old_batch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROYALTY_REPLACEMENT_BATCH_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF NEW.session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM soundpub.royalty_import_sessions replacement_session
    WHERE replacement_session.id=NEW.session_id
      AND replacement_session.operation_kind='REPLACEMENT'
      AND to_jsonb(replacement_session.replaces_batch_id)=new_validation->'replaces_batch_id'
      AND to_jsonb(replacement_session.replacement_batch_ids)=new_validation->'replaces_batch_ids'
      AND replacement_session.replacement_reason=NEW.reason
      AND replacement_session.requester_id=NEW.actor_id
  ) THEN
    RAISE EXCEPTION 'ROYALTY_REPLACEMENT_SESSION_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM soundpub.royalty_import_corrections correction
    WHERE correction.batch_id=NEW.old_batch_id) THEN
    RAISE EXCEPTION 'ROYALTY_REPLACEMENT_CORRECTION_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF old_period IS DISTINCT FROM new_period THEN
    RAISE EXCEPTION 'ROYALTY_REPLACEMENT_PERIOD_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF old_filename IS DISTINCT FROM new_filename THEN
    RAISE EXCEPTION 'ROYALTY_REPLACEMENT_FILENAME_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF old_currency IS DISTINCT FROM new_currency THEN
    RAISE EXCEPTION 'ROYALTY_REPLACEMENT_CURRENCY_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF jsonb_typeof(old_validation->'policy_code') IS DISTINCT FROM 'string'
    OR jsonb_typeof(new_validation->'policy_code') IS DISTINCT FROM 'string'
    OR old_validation->>'policy_code' IS DISTINCT FROM new_validation->>'policy_code' THEN
    RAISE EXCEPTION 'ROYALTY_REPLACEMENT_POLICY_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF jsonb_typeof(new_validation->'replaces_batch_ids')='array' THEN
    SELECT COALESCE(jsonb_agg(replacement.old_batch_id ORDER BY replacement.old_batch_id),'[]'::jsonb)
      INTO related_ids FROM soundpub.royalty_import_replacements replacement
      WHERE replacement.new_batch_id=NEW.new_batch_id;
    IF related_ids IS DISTINCT FROM new_validation->'replaces_batch_ids'
      OR NOT (related_ids @> jsonb_build_array(NEW.old_batch_id))
      OR NOT (related_ids @> jsonb_build_array(new_validation->'replaces_batch_id')) THEN
      RAISE EXCEPTION 'ROYALTY_REPLACEMENT_PROVENANCE_MISMATCH' USING ERRCODE='23514';
    END IF;
  ELSIF new_validation->'replaces_batch_id' IS DISTINCT FROM to_jsonb(NEW.old_batch_id) THEN
    RAISE EXCEPTION 'ROYALTY_REPLACEMENT_PROVENANCE_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
