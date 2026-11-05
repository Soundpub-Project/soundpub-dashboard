CREATE TABLE soundpub.copyright_royalty_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source=btrim(source) AND length(source) BETWEEN 1 AND 100),
  source_batch text NOT NULL CHECK (source_batch=btrim(source_batch) AND length(source_batch) BETWEEN 1 AND 200),
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  currency text NOT NULL DEFAULT 'IDR' CHECK (currency='IDR'),
  checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  uploader_id uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  row_count integer NOT NULL CHECK (row_count>0),
  total_amount numeric(24,2) NOT NULL CHECK (total_amount>0),
  policy_code text NOT NULL DEFAULT 'LEGACY_AGGREGATE_100_PERCENT_TO_RESOLVED_BENEFICIARY_V1'
    CHECK (policy_code='LEGACY_AGGREGATE_100_PERCENT_TO_RESOLVED_BENEFICIARY_V1'),
  policy_checksum text NOT NULL CHECK (policy_checksum ~ '^[0-9a-f]{64}$'),
  write_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(source,source_batch,period),
  UNIQUE(checksum)
);

CREATE TABLE soundpub.copyright_royalty_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES soundpub.copyright_royalty_batches(id) ON DELETE RESTRICT,
  row_number integer NOT NULL CHECK (row_number>0),
  composer_code text NOT NULL CHECK (composer_code=btrim(composer_code) AND length(composer_code) BETWEEN 1 AND 64),
  composer_name text NOT NULL CHECK (composer_name=btrim(composer_name) AND length(composer_name) BETWEEN 1 AND 200),
  mapping_id uuid NOT NULL REFERENCES soundpub.copyright_beneficiary_mappings(id) ON DELETE RESTRICT,
  beneficiary_id uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  canonical_name text NOT NULL CHECK (canonical_name=btrim(canonical_name) AND length(canonical_name) BETWEEN 1 AND 200),
  amount numeric(24,2) NOT NULL CHECK (amount>0),
  policy_code text NOT NULL CHECK (policy_code='LEGACY_AGGREGATE_100_PERCENT_TO_RESOLVED_BENEFICIARY_V1'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(batch_id,row_number)
);

CREATE INDEX copyright_royalty_entries_batch_beneficiary_idx
  ON soundpub.copyright_royalty_entries(batch_id,beneficiary_id);

CREATE TABLE soundpub.copyright_royalty_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL UNIQUE REFERENCES soundpub.copyright_royalty_batches(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (reason=btrim(reason) AND length(reason) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE soundpub.copyright_royalty_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES soundpub.copyright_royalty_batches(id) ON DELETE RESTRICT,
  result text NOT NULL CHECK (result IN ('MATCHED','MISMATCH')),
  evidence text NOT NULL CHECK (evidence=btrim(evidence) AND length(evidence) BETWEEN 1 AND 500),
  snapshot_checksum text NOT NULL CHECK (snapshot_checksum ~ '^[0-9a-f]{64}$'),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  issues jsonb NOT NULL CHECK (jsonb_typeof(issues)='array'),
  actor_id uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  audit_log_id uuid NOT NULL UNIQUE REFERENCES soundpub.audit_logs(id) ON DELETE RESTRICT,
  outbox_id uuid NOT NULL UNIQUE REFERENCES soundpub.outbox_events(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(batch_id,snapshot_checksum,result)
);

CREATE INDEX copyright_royalty_reconciliations_batch_idx
  ON soundpub.copyright_royalty_reconciliations(batch_id,created_at,id);

CREATE FUNCTION soundpub.copyright_royalty_batch_finance_intact(target_batch_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
  WITH expected AS (
    SELECT beneficiary_id AS owner_id,(sum(amount)*100)::bigint AS amount_minor
    FROM soundpub.copyright_royalty_entries WHERE batch_id=target_batch_id GROUP BY beneficiary_id
  ), actual AS (
    SELECT owner_id,sum(amount_minor)::bigint AS amount_minor FROM soundpub.finance_events
    WHERE business_reference='copyright-royalty:'||target_batch_id::text AND kind='ROYALTY_EARNING'
    GROUP BY owner_id
  ) SELECT EXISTS(SELECT 1 FROM soundpub.copyright_royalty_batches WHERE id=target_batch_id)
    AND NOT EXISTS(SELECT owner_id,amount_minor FROM expected EXCEPT SELECT owner_id,amount_minor FROM actual)
    AND NOT EXISTS(SELECT owner_id,amount_minor FROM actual EXCEPT SELECT owner_id,amount_minor FROM expected)
    AND NOT EXISTS(SELECT 1 FROM soundpub.finance_events
      WHERE business_reference='copyright-royalty:'||target_batch_id::text
        AND kind NOT IN ('ROYALTY_EARNING','ROYALTY_ADJUSTMENT'));
$$;
REVOKE ALL ON FUNCTION soundpub.copyright_royalty_batch_finance_intact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soundpub.copyright_royalty_batch_finance_intact(uuid) TO soundpub_app;

CREATE FUNCTION soundpub.copyright_royalty_correction_intact(target_batch_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
  WITH expected AS (
    SELECT beneficiary_id AS owner_id,-(sum(amount)*100)::bigint AS amount_minor
    FROM soundpub.copyright_royalty_entries WHERE batch_id=target_batch_id GROUP BY beneficiary_id
  ), actual AS (
    SELECT owner_id,sum(amount_minor)::bigint AS amount_minor FROM soundpub.finance_events
    WHERE business_reference='copyright-royalty:'||target_batch_id::text AND kind='ROYALTY_ADJUSTMENT'
    GROUP BY owner_id
  ) SELECT soundpub.copyright_royalty_batch_finance_intact(target_batch_id)
    AND EXISTS(SELECT 1 FROM soundpub.copyright_royalty_corrections WHERE batch_id=target_batch_id)
    AND NOT EXISTS(SELECT owner_id,amount_minor FROM expected EXCEPT SELECT owner_id,amount_minor FROM actual)
    AND NOT EXISTS(SELECT owner_id,amount_minor FROM actual EXCEPT SELECT owner_id,amount_minor FROM expected);
$$;
REVOKE ALL ON FUNCTION soundpub.copyright_royalty_correction_intact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soundpub.copyright_royalty_correction_intact(uuid) TO soundpub_app;

CREATE FUNCTION soundpub.copyright_royalty_reconciliation_intact(target_batch_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT soundpub.copyright_royalty_batch_finance_intact(target_batch_id)
    AND NOT EXISTS(SELECT 1 FROM soundpub.copyright_royalty_corrections WHERE batch_id=target_batch_id)
    AND EXISTS(SELECT 1 FROM soundpub.copyright_royalty_reconciliations reconciliation
      JOIN soundpub.audit_logs audit ON audit.id=reconciliation.audit_log_id
      JOIN soundpub.outbox_events outbox ON outbox.id=reconciliation.outbox_id
      JOIN soundpub.backend_users actor ON actor.id=reconciliation.actor_id AND actor.status='active'
      JOIN soundpub.user_roles role ON role.user_id=actor.id AND role.role IN ('admin','superadmin')
      JOIN soundpub.copyright_royalty_batches batch ON batch.id=reconciliation.batch_id
      WHERE reconciliation.batch_id=target_batch_id AND reconciliation.result='MATCHED'
        AND reconciliation.actor_id<>batch.uploader_id
        AND audit.actor_user_id=reconciliation.actor_id AND audit.action='copyright_royalty.reconciled'
        AND audit.resource_type='copyright_royalty' AND audit.resource_id=target_batch_id::text
        AND audit.metadata->>'evidence'=reconciliation.evidence
        AND audit.metadata->>'idempotency_reference'=reconciliation.snapshot_checksum
        AND outbox.topic='copyright.royalty.changed'
        AND outbox.payload=jsonb_build_object('batch_id',target_batch_id,
          'reconciliation_checksum',reconciliation.snapshot_checksum,'result','MATCHED')
        AND outbox.idempotency_key='copyright-royalty.reconciled:'||target_batch_id::text);
$$;
REVOKE ALL ON FUNCTION soundpub.copyright_royalty_reconciliation_intact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soundpub.copyright_royalty_reconciliation_intact(uuid) TO soundpub_app;

CREATE FUNCTION soundpub.copyright_royalty_batch_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE entry_count integer; entry_total numeric(24,2); owner_mismatches integer; invalid_events integer;
BEGIN
  SELECT count(*)::integer,COALESCE(sum(amount),0)::numeric(24,2)
    INTO entry_count,entry_total
  FROM soundpub.copyright_royalty_entries WHERE batch_id=NEW.id;

  WITH expected AS (
    SELECT beneficiary_id AS owner_id,(sum(amount)*100)::bigint AS amount_minor
    FROM soundpub.copyright_royalty_entries WHERE batch_id=NEW.id GROUP BY beneficiary_id
  ), actual AS (
    SELECT owner_id,sum(amount_minor)::bigint AS amount_minor
    FROM soundpub.finance_events
    WHERE business_reference='copyright-royalty:'||NEW.id::text AND kind='ROYALTY_EARNING'
    GROUP BY owner_id
  ) SELECT count(*)::integer INTO owner_mismatches
    FROM expected FULL JOIN actual USING(owner_id)
    WHERE COALESCE(expected.amount_minor,0) IS DISTINCT FROM COALESCE(actual.amount_minor,0);

  SELECT count(*)::integer INTO invalid_events FROM soundpub.finance_events
  WHERE business_reference='copyright-royalty:'||NEW.id::text AND kind<>'ROYALTY_EARNING';

  IF entry_count IS DISTINCT FROM NEW.row_count OR entry_total IS DISTINCT FROM NEW.total_amount
    OR owner_mismatches<>0 OR invalid_events<>0 THEN
    RAISE EXCEPTION 'COPYRIGHT_ROYALTY_POSTING_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.copyright_royalty_batch_guard() FROM PUBLIC,soundpub_app;

CREATE CONSTRAINT TRIGGER copyright_royalty_batch_integrity
  AFTER INSERT ON soundpub.copyright_royalty_batches
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION soundpub.copyright_royalty_batch_guard();

CREATE FUNCTION soundpub.copyright_royalty_entry_write_window_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM new_entries entry
    JOIN soundpub.copyright_royalty_batches batch ON batch.id=entry.batch_id
    WHERE batch.write_xid IS DISTINCT FROM pg_current_xact_id()
  ) THEN
    RAISE EXCEPTION 'COPYRIGHT_ROYALTY_BATCH_CLOSED' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.copyright_royalty_entry_write_window_guard() FROM PUBLIC,soundpub_app;

CREATE TRIGGER copyright_royalty_entry_write_window
  AFTER INSERT ON soundpub.copyright_royalty_entries
  REFERENCING NEW TABLE AS new_entries FOR EACH STATEMENT
  EXECUTE FUNCTION soundpub.copyright_royalty_entry_write_window_guard();

CREATE FUNCTION soundpub.copyright_royalty_correction_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE earning_mismatches integer; adjustment_mismatches integer; invalid_events integer;
BEGIN
  WITH expected AS (
    SELECT beneficiary_id AS owner_id,(sum(amount)*100)::bigint AS amount_minor
    FROM soundpub.copyright_royalty_entries WHERE batch_id=NEW.batch_id GROUP BY beneficiary_id
  ), actual AS (
    SELECT owner_id,sum(amount_minor)::bigint AS amount_minor FROM soundpub.finance_events
    WHERE business_reference='copyright-royalty:'||NEW.batch_id::text AND kind='ROYALTY_EARNING'
    GROUP BY owner_id
  ) SELECT count(*)::integer INTO earning_mismatches FROM expected FULL JOIN actual USING(owner_id)
    WHERE COALESCE(expected.amount_minor,0) IS DISTINCT FROM COALESCE(actual.amount_minor,0);

  WITH expected AS (
    SELECT beneficiary_id AS owner_id,(sum(amount)*100)::bigint AS amount_minor
    FROM soundpub.copyright_royalty_entries WHERE batch_id=NEW.batch_id GROUP BY beneficiary_id
  ), actual AS (
    SELECT owner_id,-sum(amount_minor)::bigint AS amount_minor FROM soundpub.finance_events
    WHERE business_reference='copyright-royalty:'||NEW.batch_id::text AND kind='ROYALTY_ADJUSTMENT'
    GROUP BY owner_id
  ) SELECT count(*)::integer INTO adjustment_mismatches FROM expected FULL JOIN actual USING(owner_id)
    WHERE COALESCE(expected.amount_minor,0) IS DISTINCT FROM COALESCE(actual.amount_minor,0);

  SELECT count(*)::integer INTO invalid_events FROM soundpub.finance_events
  WHERE business_reference='copyright-royalty:'||NEW.batch_id::text
    AND kind NOT IN ('ROYALTY_EARNING','ROYALTY_ADJUSTMENT');

  IF earning_mismatches<>0 OR adjustment_mismatches<>0 OR invalid_events<>0 THEN
    RAISE EXCEPTION 'COPYRIGHT_ROYALTY_CORRECTION_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.copyright_royalty_correction_guard() FROM PUBLIC,soundpub_app;

CREATE CONSTRAINT TRIGGER copyright_royalty_correction_integrity
  AFTER INSERT ON soundpub.copyright_royalty_corrections
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION soundpub.copyright_royalty_correction_guard();

CREATE FUNCTION soundpub.copyright_royalty_reconciliation_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE expected_action text; batch_uploader uuid; actor_valid boolean;
BEGIN
  SELECT uploader_id INTO batch_uploader FROM soundpub.copyright_royalty_batches WHERE id=NEW.batch_id FOR SHARE;
  SELECT EXISTS(SELECT 1 FROM soundpub.backend_users actor JOIN soundpub.user_roles role ON role.user_id=actor.id
    WHERE actor.id=NEW.actor_id AND actor.status='active' AND role.role IN ('admin','superadmin')) INTO actor_valid;
  expected_action:=CASE WHEN NEW.result='MATCHED' THEN 'copyright_royalty.reconciled'
    ELSE 'copyright_royalty.reconciliation_mismatch' END;
  IF batch_uploader IS NULL OR NOT actor_valid OR NEW.actor_id=batch_uploader
    OR EXISTS(SELECT 1 FROM soundpub.copyright_royalty_corrections WHERE batch_id=NEW.batch_id)
    OR (NEW.result='MATCHED' AND NOT soundpub.copyright_royalty_batch_finance_intact(NEW.batch_id))
    OR NOT EXISTS(SELECT 1 FROM soundpub.audit_logs audit WHERE audit.id=NEW.audit_log_id
      AND audit.actor_user_id=NEW.actor_id AND audit.action=expected_action
      AND audit.resource_type='copyright_royalty' AND audit.resource_id=NEW.batch_id::text
      AND audit.metadata->>'evidence'=NEW.evidence
      AND audit.metadata->>'idempotency_reference'=NEW.snapshot_checksum)
    OR NOT EXISTS(SELECT 1 FROM soundpub.outbox_events outbox WHERE outbox.id=NEW.outbox_id
      AND outbox.topic='copyright.royalty.changed'
      AND outbox.payload=jsonb_build_object('batch_id',NEW.batch_id,'reconciliation_checksum',NEW.snapshot_checksum,
        'result',NEW.result)
      AND outbox.idempotency_key=CASE WHEN NEW.result='MATCHED' THEN 'copyright-royalty.reconciled:'||NEW.batch_id::text
        ELSE 'copyright-royalty.reconciliation-mismatch:'||NEW.batch_id::text||':'||NEW.snapshot_checksum END) THEN
    RAISE EXCEPTION 'COPYRIGHT_ROYALTY_RECONCILIATION_EVIDENCE_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.copyright_royalty_reconciliation_guard() FROM PUBLIC,soundpub_app;
CREATE TRIGGER copyright_royalty_reconciliation_evidence_guard
  BEFORE INSERT ON soundpub.copyright_royalty_reconciliations
  FOR EACH ROW EXECUTE FUNCTION soundpub.copyright_royalty_reconciliation_guard();

CREATE FUNCTION soundpub.copyright_royalty_finance_event_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE target_batch_id uuid; batch_exists boolean; corrected boolean;
  earning_mismatches integer; adjustment_mismatches integer; invalid_events integer;
BEGIN
  BEGIN
    target_batch_id:=substring(NEW.business_reference FROM length('copyright-royalty:')+1)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'COPYRIGHT_ROYALTY_REFERENCE_INVALID' USING ERRCODE='23514';
  END;

  SELECT EXISTS(SELECT 1 FROM soundpub.copyright_royalty_batches WHERE id=target_batch_id),
    EXISTS(SELECT 1 FROM soundpub.copyright_royalty_corrections WHERE batch_id=target_batch_id)
    INTO batch_exists,corrected;

  WITH expected AS (
    SELECT beneficiary_id AS owner_id,(sum(amount)*100)::bigint AS amount_minor
    FROM soundpub.copyright_royalty_entries WHERE batch_id=target_batch_id GROUP BY beneficiary_id
  ), actual AS (
    SELECT owner_id,sum(amount_minor)::bigint AS amount_minor FROM soundpub.finance_events
    WHERE business_reference='copyright-royalty:'||target_batch_id::text AND kind='ROYALTY_EARNING'
    GROUP BY owner_id
  ) SELECT count(*)::integer INTO earning_mismatches FROM expected FULL JOIN actual USING(owner_id)
    WHERE COALESCE(expected.amount_minor,0) IS DISTINCT FROM COALESCE(actual.amount_minor,0);

  WITH expected AS (
    SELECT beneficiary_id AS owner_id,(sum(amount)*100)::bigint AS amount_minor
    FROM soundpub.copyright_royalty_entries WHERE batch_id=target_batch_id GROUP BY beneficiary_id
  ), actual AS (
    SELECT owner_id,-sum(amount_minor)::bigint AS amount_minor FROM soundpub.finance_events
    WHERE business_reference='copyright-royalty:'||target_batch_id::text AND kind='ROYALTY_ADJUSTMENT'
    GROUP BY owner_id
  ) SELECT count(*)::integer INTO adjustment_mismatches FROM expected FULL JOIN actual USING(owner_id)
    WHERE COALESCE(expected.amount_minor,0) IS DISTINCT FROM COALESCE(actual.amount_minor,0);

  SELECT count(*)::integer INTO invalid_events FROM soundpub.finance_events
  WHERE business_reference='copyright-royalty:'||target_batch_id::text
    AND kind NOT IN ('ROYALTY_EARNING','ROYALTY_ADJUSTMENT');

  IF NOT batch_exists OR earning_mismatches<>0 OR invalid_events<>0
    OR (corrected AND adjustment_mismatches<>0)
    OR (NOT corrected AND EXISTS(SELECT 1 FROM soundpub.finance_events
      WHERE business_reference='copyright-royalty:'||target_batch_id::text AND kind='ROYALTY_ADJUSTMENT')) THEN
    RAISE EXCEPTION 'COPYRIGHT_ROYALTY_FINANCE_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.copyright_royalty_finance_event_guard() FROM PUBLIC,soundpub_app;

CREATE CONSTRAINT TRIGGER copyright_royalty_finance_event_integrity
  AFTER INSERT ON soundpub.finance_events
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (NEW.business_reference LIKE 'copyright-royalty:%')
  EXECUTE FUNCTION soundpub.copyright_royalty_finance_event_guard();

CREATE TRIGGER copyright_royalty_batches_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
  ON soundpub.copyright_royalty_batches FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable();
CREATE TRIGGER copyright_royalty_entries_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
  ON soundpub.copyright_royalty_entries FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable();
CREATE TRIGGER copyright_royalty_corrections_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
  ON soundpub.copyright_royalty_corrections FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable();
CREATE TRIGGER copyright_royalty_reconciliations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
  ON soundpub.copyright_royalty_reconciliations FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable();

REVOKE ALL ON soundpub.copyright_royalty_batches,soundpub.copyright_royalty_entries,
  soundpub.copyright_royalty_corrections,soundpub.copyright_royalty_reconciliations FROM PUBLIC,soundpub_app;
GRANT SELECT,INSERT ON soundpub.copyright_royalty_batches,soundpub.copyright_royalty_entries,
  soundpub.copyright_royalty_corrections,soundpub.copyright_royalty_reconciliations TO soundpub_app;

ALTER TABLE soundpub.copyright_royalty_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.copyright_royalty_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.copyright_royalty_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.copyright_royalty_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY copyright_royalty_batches_backend ON soundpub.copyright_royalty_batches
  TO soundpub_app USING (true) WITH CHECK (true);
CREATE POLICY copyright_royalty_entries_backend ON soundpub.copyright_royalty_entries
  TO soundpub_app USING (true) WITH CHECK (true);
CREATE POLICY copyright_royalty_corrections_backend ON soundpub.copyright_royalty_corrections
  TO soundpub_app USING (true) WITH CHECK (true);
CREATE POLICY copyright_royalty_reconciliations_backend ON soundpub.copyright_royalty_reconciliations
  TO soundpub_app USING (true) WITH CHECK (true);
