CREATE TABLE soundpub.royalty_import_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES soundpub.royalty_import_batches(id),
  actor_id uuid NOT NULL REFERENCES soundpub.backend_users(id),
  result text NOT NULL CHECK (result IN ('MATCHED','MISMATCH')),
  evidence text NOT NULL CHECK (length(btrim(evidence)) BETWEEN 1 AND 500),
  snapshot_checksum text NOT NULL CHECK (snapshot_checksum ~ '^[0-9a-f]{64}$'),
  snapshot jsonb NOT NULL,
  issues jsonb NOT NULL CHECK (jsonb_typeof(issues)='array'),
  audit_log_id uuid UNIQUE REFERENCES soundpub.audit_logs(id),
  outbox_id uuid UNIQUE REFERENCES soundpub.outbox_events(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (audit_log_id IS NOT NULL AND outbox_id IS NOT NULL),
  UNIQUE(batch_id,snapshot_checksum,result)
);

CREATE UNIQUE INDEX royalty_import_reconciliations_matched_batch
  ON soundpub.royalty_import_reconciliations(batch_id) WHERE result='MATCHED';
CREATE INDEX finance_events_royalty_reference
  ON soundpub.finance_events(business_reference,kind,owner_id)
  WHERE kind IN ('ROYALTY_EARNING','ROYALTY_ADJUSTMENT');

CREATE FUNCTION soundpub.royalty_batch_finance_intact(target_batch_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
  WITH batch AS (
    SELECT id,row_count,total_amount,checksum FROM soundpub.royalty_import_batches WHERE id=target_batch_id
  ), entries AS (
    SELECT count(*)::integer AS count,COALESCE(sum(net_amount),0)::numeric(24,2) AS amount
    FROM soundpub.royalty_import_entries WHERE batch_id=target_batch_id
  ), expected AS (
    SELECT allocation.owner_id,sum(allocation.amount*100)::bigint AS amount_minor
    FROM soundpub.royalty_import_allocations allocation
    JOIN soundpub.royalty_import_entries entry ON entry.id=allocation.entry_id
    WHERE entry.batch_id=target_batch_id AND allocation.owner_id IS NOT NULL GROUP BY allocation.owner_id
  ), actual AS (
    SELECT owner_id,sum(amount_minor)::bigint AS amount_minor
    FROM soundpub.finance_events WHERE business_reference='royalty:'||target_batch_id::text
      AND kind='ROYALTY_EARNING' GROUP BY owner_id
  ) SELECT EXISTS(SELECT 1 FROM batch)
    AND (SELECT count FROM entries)=(SELECT row_count FROM batch)
    AND (SELECT amount FROM entries)=(SELECT total_amount FROM batch)
    AND NOT EXISTS(SELECT 1 FROM expected FULL JOIN actual USING(owner_id)
      WHERE COALESCE(expected.amount_minor,0) IS DISTINCT FROM COALESCE(actual.amount_minor,0))
    AND NOT EXISTS(SELECT 1 FROM soundpub.finance_events event
      LEFT JOIN soundpub.finance_audit audit ON audit.event_id=event.id
      LEFT JOIN soundpub.outbox_events outbox ON outbox.id=audit.outbox_id
      WHERE event.business_reference='royalty:'||target_batch_id::text
        AND (event.kind<>'ROYALTY_EARNING' OR audit.event_id IS NULL OR outbox.id IS NULL
          OR audit.old_state IS DISTINCT FROM event.old_state OR audit.new_state IS DISTINCT FROM event.new_state
          OR outbox.topic IS DISTINCT FROM 'finance.event'
          OR outbox.payload IS DISTINCT FROM jsonb_build_object('eventId',event.id)
          OR outbox.idempotency_key IS DISTINCT FROM 'finance:'||event.id::text))
    AND EXISTS(SELECT 1 FROM soundpub.audit_logs audit JOIN soundpub.outbox_events outbox
      ON outbox.topic='royalty.changed' AND outbox.payload->>'batch_id'=target_batch_id::text
        AND outbox.payload->>'action'=audit.action AND outbox.idempotency_key=audit.action||':'||target_batch_id::text
      WHERE audit.resource_type='royalty_import' AND audit.resource_id=target_batch_id::text
        AND audit.action IN ('royalty.imported','royalty.csv_imported','royalty.replacement_imported')
        AND audit.metadata->>'idempotency_reference'=(SELECT checksum FROM batch));
$$;
REVOKE ALL ON FUNCTION soundpub.royalty_batch_finance_intact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soundpub.royalty_batch_finance_intact(uuid) TO soundpub_app,soundpub_reconciler;

CREATE FUNCTION soundpub.royalty_reconciliation_intact(target_batch_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT soundpub.royalty_batch_finance_intact(target_batch_id)
    AND NOT EXISTS(SELECT 1 FROM soundpub.royalty_import_corrections WHERE batch_id=target_batch_id)
    AND EXISTS(SELECT 1 FROM soundpub.royalty_import_reconciliations reconciliation
      JOIN soundpub.audit_logs audit ON audit.id=reconciliation.audit_log_id
      JOIN soundpub.outbox_events outbox ON outbox.id=reconciliation.outbox_id
      JOIN soundpub.backend_users actor ON actor.id=reconciliation.actor_id AND actor.status='active'
      JOIN soundpub.user_roles role ON role.user_id=actor.id AND role.role IN ('admin','superadmin')
      JOIN soundpub.royalty_import_batches batch ON batch.id=reconciliation.batch_id
      WHERE reconciliation.batch_id=target_batch_id AND reconciliation.result='MATCHED'
        AND reconciliation.actor_id<>batch.uploader_id
        AND audit.actor_user_id=reconciliation.actor_id AND audit.action='royalty.reconciled'
        AND audit.resource_type='royalty_import' AND audit.resource_id=target_batch_id::text
        AND audit.metadata->>'evidence'=reconciliation.evidence
        AND audit.metadata->>'idempotency_reference'=reconciliation.snapshot_checksum
        AND outbox.topic='royalty.changed'
        AND outbox.payload=jsonb_build_object('batch_id',target_batch_id,
          'reconciliation_checksum',reconciliation.snapshot_checksum,'result','MATCHED')
        AND outbox.idempotency_key='royalty.reconciled:'||target_batch_id::text);
$$;
REVOKE ALL ON FUNCTION soundpub.royalty_reconciliation_intact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soundpub.royalty_reconciliation_intact(uuid) TO soundpub_app,soundpub_reconciler;

CREATE FUNCTION soundpub.royalty_reconciliation_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE expected_action text; batch_uploader uuid; actor_valid boolean;
BEGIN
  SELECT uploader_id INTO batch_uploader FROM soundpub.royalty_import_batches WHERE id=NEW.batch_id FOR SHARE;
  SELECT EXISTS(SELECT 1 FROM soundpub.backend_users actor JOIN soundpub.user_roles role ON role.user_id=actor.id
    WHERE actor.id=NEW.actor_id AND actor.status='active' AND role.role IN ('admin','superadmin')) INTO actor_valid;
  expected_action:=CASE WHEN NEW.result='MATCHED' THEN 'royalty.reconciled' ELSE 'royalty.reconciliation_mismatch' END;
  IF batch_uploader IS NULL OR NOT actor_valid OR NEW.actor_id=batch_uploader
    OR EXISTS(SELECT 1 FROM soundpub.royalty_import_corrections WHERE batch_id=NEW.batch_id)
    OR (NEW.result='MATCHED' AND NOT soundpub.royalty_batch_finance_intact(NEW.batch_id))
    OR NOT EXISTS(SELECT 1 FROM soundpub.audit_logs audit WHERE audit.id=NEW.audit_log_id
      AND audit.actor_user_id=NEW.actor_id AND audit.action=expected_action
      AND audit.resource_type='royalty_import' AND audit.resource_id=NEW.batch_id::text
      AND audit.metadata->>'evidence'=NEW.evidence
      AND audit.metadata->>'idempotency_reference'=NEW.snapshot_checksum)
    OR NOT EXISTS(SELECT 1 FROM soundpub.outbox_events outbox WHERE outbox.id=NEW.outbox_id
      AND outbox.topic='royalty.changed'
      AND outbox.payload=jsonb_build_object('batch_id',NEW.batch_id,'reconciliation_checksum',NEW.snapshot_checksum,
        'result',NEW.result)
      AND outbox.idempotency_key=CASE WHEN NEW.result='MATCHED' THEN 'royalty.reconciled:'||NEW.batch_id::text
        ELSE 'royalty.reconciliation-mismatch:'||NEW.batch_id::text||':'||NEW.snapshot_checksum END) THEN
    RAISE EXCEPTION 'ROYALTY_RECONCILIATION_EVIDENCE_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.royalty_reconciliation_guard() FROM PUBLIC,soundpub_app;
CREATE TRIGGER royalty_reconciliation_evidence_guard BEFORE INSERT ON soundpub.royalty_import_reconciliations
  FOR EACH ROW EXECUTE FUNCTION soundpub.royalty_reconciliation_guard();

CREATE OR REPLACE FUNCTION soundpub.royalty_batch_allocation_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
  entry_count integer;
  entry_total numeric(24,2);
  allocation_total numeric(24,2);
  artist_total numeric(24,2);
  label_total numeric(24,2);
  soundpub_total numeric(24,2);
  owner_mismatches integer;
  entry_mismatches integer;
BEGIN
  SELECT count(*)::integer,COALESCE(sum(entry.net_amount),0)::numeric(24,2)
  INTO entry_count,entry_total FROM soundpub.royalty_import_entries entry WHERE entry.batch_id=NEW.id;

  SELECT COALESCE(sum(allocation.amount),0)::numeric(24,2),
    COALESCE(sum(allocation.amount) FILTER (WHERE allocation.component='ARTIST'),0)::numeric(24,2),
    COALESCE(sum(allocation.amount) FILTER (WHERE allocation.component='LABEL'),0)::numeric(24,2),
    COALESCE(sum(allocation.amount) FILTER (WHERE allocation.component='SOUNDPUB'),0)::numeric(24,2),
    count(*) FILTER (WHERE
      (allocation.component='ARTIST' AND allocation.owner_id IS DISTINCT FROM entry.financial_owner_user_id)
      OR (allocation.component='LABEL' AND allocation.owner_id IS DISTINCT FROM entry.label_owner_user_id)
      OR (allocation.component='SOUNDPUB' AND allocation.owner_id IS NOT NULL)
      OR (allocation.component='LEGACY_OWNER' AND allocation.owner_id IS DISTINCT FROM entry.beneficiary_id))::integer
  INTO allocation_total,artist_total,label_total,soundpub_total,owner_mismatches
  FROM soundpub.royalty_import_entries entry
  JOIN soundpub.royalty_import_allocations allocation ON allocation.entry_id=entry.id
  WHERE entry.batch_id=NEW.id;

  SELECT count(*)::integer INTO entry_mismatches FROM (
    SELECT entry.id,entry.net_amount,COALESCE(sum(allocation.amount),0)::numeric(24,2) AS allocated
    FROM soundpub.royalty_import_entries entry
    LEFT JOIN soundpub.royalty_import_allocations allocation ON allocation.entry_id=entry.id
    WHERE entry.batch_id=NEW.id GROUP BY entry.id,entry.net_amount
  ) totals WHERE totals.allocated IS DISTINCT FROM totals.net_amount;

  IF entry_count IS DISTINCT FROM NEW.row_count OR entry_count=0
    OR entry_total IS DISTINCT FROM NEW.total_amount OR allocation_total IS DISTINCT FROM NEW.total_amount
    OR entry_mismatches<>0
    OR (NEW.validation_result->>'policy_code'='SOUNDPUB_LEGACY_70_21_9' AND (
      artist_total IS DISTINCT FROM (NEW.validation_result->>'artist_amount')::numeric
      OR label_total IS DISTINCT FROM (NEW.validation_result->>'label_amount')::numeric
      OR soundpub_total IS DISTINCT FROM (NEW.validation_result->>'soundpub_amount')::numeric))
    OR owner_mismatches<>0 THEN
    RAISE EXCEPTION 'ROYALTY_ALLOCATION_SUM_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION soundpub.royalty_entry_write_window_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM new_entries inserted JOIN soundpub.royalty_import_batches batch ON batch.id=inserted.batch_id
    WHERE batch.write_xid IS DISTINCT FROM pg_current_xact_id()
  ) THEN RAISE EXCEPTION 'ROYALTY_BATCH_CLOSED' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION soundpub.royalty_correction_finance_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE mismatch_count integer; earning_mismatch_count integer; broken_count integer;
BEGIN
  WITH expected AS (
    SELECT allocation.owner_id,sum(allocation.amount*100)::bigint AS amount_minor
    FROM soundpub.royalty_import_allocations allocation
    JOIN soundpub.royalty_import_entries entry ON entry.id=allocation.entry_id
    WHERE entry.batch_id=NEW.batch_id AND allocation.owner_id IS NOT NULL GROUP BY allocation.owner_id
  ), actual AS (
    SELECT owner_id,-sum(amount_minor)::bigint AS amount_minor
    FROM soundpub.finance_events WHERE business_reference='royalty:'||NEW.batch_id::text
      AND kind='ROYALTY_ADJUSTMENT' GROUP BY owner_id
  ) SELECT count(*)::integer INTO mismatch_count FROM expected FULL JOIN actual USING(owner_id)
    WHERE COALESCE(expected.amount_minor,0) IS DISTINCT FROM COALESCE(actual.amount_minor,0);

  WITH expected AS (
    SELECT allocation.owner_id,sum(allocation.amount*100)::bigint AS amount_minor
    FROM soundpub.royalty_import_allocations allocation
    JOIN soundpub.royalty_import_entries entry ON entry.id=allocation.entry_id
    WHERE entry.batch_id=NEW.batch_id AND allocation.owner_id IS NOT NULL GROUP BY allocation.owner_id
  ), actual AS (
    SELECT owner_id,sum(amount_minor)::bigint AS amount_minor
    FROM soundpub.finance_events WHERE business_reference='royalty:'||NEW.batch_id::text
      AND kind='ROYALTY_EARNING' GROUP BY owner_id
  ) SELECT count(*)::integer INTO earning_mismatch_count FROM expected FULL JOIN actual USING(owner_id)
    WHERE COALESCE(expected.amount_minor,0) IS DISTINCT FROM COALESCE(actual.amount_minor,0);

  SELECT count(*)::integer INTO broken_count FROM soundpub.finance_events event
  LEFT JOIN soundpub.finance_audit audit ON audit.event_id=event.id
  LEFT JOIN soundpub.outbox_events outbox ON outbox.id=audit.outbox_id
  WHERE event.business_reference='royalty:'||NEW.batch_id::text AND event.kind IN ('ROYALTY_EARNING','ROYALTY_ADJUSTMENT')
    AND (audit.event_id IS NULL OR outbox.id IS NULL OR audit.old_state IS DISTINCT FROM event.old_state
      OR audit.new_state IS DISTINCT FROM event.new_state OR outbox.topic IS DISTINCT FROM 'finance.event'
      OR outbox.payload IS DISTINCT FROM jsonb_build_object('eventId',event.id)
      OR outbox.idempotency_key IS DISTINCT FROM 'finance:'||event.id::text);
  IF mismatch_count<>0 OR earning_mismatch_count<>0 OR broken_count<>0 THEN
    RAISE EXCEPTION 'ROYALTY_CORRECTION_FINANCE_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.royalty_correction_finance_guard() FROM PUBLIC,soundpub_app;
CREATE CONSTRAINT TRIGGER royalty_correction_finance_integrity
  AFTER INSERT ON soundpub.royalty_import_corrections DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION soundpub.royalty_correction_finance_guard();

REVOKE ALL ON soundpub.royalty_import_reconciliations FROM PUBLIC,soundpub_app,soundpub_reconciler;
GRANT USAGE ON SCHEMA soundpub TO soundpub_reconciler;
GRANT SELECT ON soundpub.royalty_import_reconciliations TO soundpub_app;
GRANT SELECT ON soundpub.backend_users,soundpub.user_roles,soundpub.royalty_import_batches,
  soundpub.royalty_import_entries,soundpub.royalty_import_allocations,soundpub.royalty_import_corrections,
  soundpub.finance_events,soundpub.finance_audit,soundpub.audit_logs,soundpub.outbox_events,
  soundpub.royalty_import_reconciliations TO soundpub_reconciler;
GRANT UPDATE(status) ON soundpub.royalty_import_batches TO soundpub_reconciler;
GRANT INSERT ON soundpub.audit_logs,soundpub.outbox_events,soundpub.royalty_import_reconciliations TO soundpub_reconciler;
CREATE TRIGGER royalty_reconciliations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
  ON soundpub.royalty_import_reconciliations FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable();
ALTER TABLE soundpub.royalty_import_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY royalty_reconciliations_backend ON soundpub.royalty_import_reconciliations
  TO soundpub_app,soundpub_reconciler USING (true) WITH CHECK (true);
