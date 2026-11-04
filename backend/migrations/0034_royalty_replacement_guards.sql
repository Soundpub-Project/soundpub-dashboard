CREATE FUNCTION soundpub.royalty_replacement_guard() RETURNS trigger
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

CREATE CONSTRAINT TRIGGER royalty_replacement_relation_guard
  AFTER INSERT ON soundpub.royalty_import_replacements
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION soundpub.royalty_replacement_guard();
