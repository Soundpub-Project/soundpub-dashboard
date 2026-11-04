ALTER TABLE soundpub.royalty_import_sessions
  ADD COLUMN staging_checksum text CHECK (staging_checksum IS NULL OR staging_checksum ~ '^[a-f0-9]{64}$');

ALTER TABLE soundpub.royalty_import_session_rows
  ADD COLUMN row_checksum text CHECK (row_checksum IS NULL OR row_checksum ~ '^[a-f0-9]{64}$'),
  DROP CONSTRAINT royalty_import_session_rows_shape_check,
  ADD CONSTRAINT royalty_import_session_rows_shape_check CHECK (
    (row_status='INVALID' AND issue IS NOT NULL AND row_checksum IS NULL
      AND period IS NULL AND source_isrc IS NULL AND track_id IS NULL AND release_id IS NULL
      AND artist_id IS NULL AND financial_owner_user_id IS NULL AND label_owner_user_id IS NULL
      AND net_amount IS NULL AND artist_amount IS NULL AND label_amount IS NULL AND soundpub_amount IS NULL
      AND calculation_policy_code IS NULL)
    OR
    (row_status='MATCHED' AND issue IS NULL AND row_checksum IS NOT NULL
      AND period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      AND source_isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'
      AND platform IS NOT NULL AND length(btrim(platform)) BETWEEN 1 AND 200
      AND country ~ '^[A-Z]{2}$' AND sales_unit >= 0 AND net_amount >= 0
      AND track_id IS NOT NULL AND release_id IS NOT NULL AND artist_id IS NOT NULL
      AND financial_owner_user_id IS NOT NULL AND label_owner_user_id IS NOT NULL
      AND artist_amount >= 0 AND label_amount >= 0 AND soundpub_amount >= 0
      AND artist_amount+label_amount+soundpub_amount=net_amount
      AND length(btrim(calculation_policy_code)) BETWEEN 1 AND 100)
  );

CREATE FUNCTION soundpub.royalty_staging_insert_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM new_staging rows
    JOIN soundpub.royalty_import_sessions session ON session.id=rows.session_id
    WHERE session.status<>'PARSING' OR session.lease_owner IS NULL
  ) THEN
    RAISE EXCEPTION 'ROYALTY_STAGING_FROZEN' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.royalty_staging_insert_guard() FROM PUBLIC,soundpub_app;

CREATE FUNCTION soundpub.royalty_staging_delete_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM old_staging rows
    JOIN soundpub.royalty_import_sessions session ON session.id=rows.session_id
    WHERE session.status NOT IN ('PARSING','CLEANING')
      OR (session.status='PARSING' AND session.lease_owner IS NULL)
  ) THEN
    RAISE EXCEPTION 'ROYALTY_STAGING_FROZEN' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.royalty_staging_delete_guard() FROM PUBLIC,soundpub_app;
CREATE TRIGGER royalty_staging_insert_guard
  AFTER INSERT ON soundpub.royalty_import_session_rows
  REFERENCING NEW TABLE AS new_staging FOR EACH STATEMENT
  EXECUTE FUNCTION soundpub.royalty_staging_insert_guard();
CREATE TRIGGER royalty_staging_delete_guard
  AFTER DELETE ON soundpub.royalty_import_session_rows
  REFERENCING OLD TABLE AS old_staging FOR EACH STATEMENT
  EXECUTE FUNCTION soundpub.royalty_staging_delete_guard();
