CREATE INDEX finance_events_global_reference ON soundpub.finance_events(kind,business_reference,owner_id);

CREATE TABLE soundpub.finance_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('PASS','FAIL')),
  issue_count integer NOT NULL CHECK (issue_count >= 0),
  issues jsonb NOT NULL CHECK (jsonb_typeof(issues)='array'),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  snapshot_checksum text NOT NULL CHECK (snapshot_checksum ~ '^[0-9a-f]{64}$'),
  runner text NOT NULL CHECK (length(btrim(runner)) BETWEEN 1 AND 100),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (finished_at >= started_at),
  CHECK ((status='PASS' AND issue_count=0) OR (status='FAIL' AND issue_count>0))
);
CREATE INDEX finance_reconciliation_runs_finished ON soundpub.finance_reconciliation_runs(finished_at DESC,id DESC);

CREATE FUNCTION soundpub.royalty_correction_intact(target_batch_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
  WITH expected AS (
    SELECT allocation.owner_id,sum(allocation.amount*100)::bigint AS amount_minor
    FROM soundpub.royalty_import_allocations allocation
    JOIN soundpub.royalty_import_entries entry ON entry.id=allocation.entry_id
    WHERE entry.batch_id=target_batch_id AND allocation.owner_id IS NOT NULL GROUP BY allocation.owner_id
  ), earnings AS (
    SELECT owner_id,sum(amount_minor)::bigint AS amount_minor FROM soundpub.finance_events
    WHERE business_reference='royalty:'||target_batch_id::text AND kind='ROYALTY_EARNING' GROUP BY owner_id
  ), adjustments AS (
    SELECT owner_id,-sum(amount_minor)::bigint AS amount_minor FROM soundpub.finance_events
    WHERE business_reference='royalty:'||target_batch_id::text AND kind='ROYALTY_ADJUSTMENT' GROUP BY owner_id
  ) SELECT EXISTS(SELECT 1 FROM soundpub.royalty_import_corrections WHERE batch_id=target_batch_id)
    AND NOT EXISTS(SELECT 1 FROM expected FULL JOIN earnings USING(owner_id)
      WHERE COALESCE(expected.amount_minor,0) IS DISTINCT FROM COALESCE(earnings.amount_minor,0))
    AND NOT EXISTS(SELECT 1 FROM expected FULL JOIN adjustments USING(owner_id)
      WHERE COALESCE(expected.amount_minor,0) IS DISTINCT FROM COALESCE(adjustments.amount_minor,0))
    AND NOT EXISTS(SELECT 1 FROM soundpub.finance_events event
      LEFT JOIN soundpub.finance_audit audit ON audit.event_id=event.id
      LEFT JOIN soundpub.outbox_events outbox ON outbox.id=audit.outbox_id
      WHERE event.business_reference='royalty:'||target_batch_id::text
        AND event.kind IN ('ROYALTY_EARNING','ROYALTY_ADJUSTMENT')
        AND (audit.event_id IS NULL OR outbox.id IS NULL OR audit.old_state IS DISTINCT FROM event.old_state
          OR audit.new_state IS DISTINCT FROM event.new_state OR outbox.topic IS DISTINCT FROM 'finance.event'
          OR outbox.payload IS DISTINCT FROM jsonb_build_object('eventId',event.id)
          OR outbox.idempotency_key IS DISTINCT FROM 'finance:'||event.id::text))
    AND EXISTS(SELECT 1 FROM soundpub.audit_logs audit JOIN soundpub.outbox_events outbox
      ON outbox.topic='royalty.changed' AND outbox.payload->>'batch_id'=target_batch_id::text
        AND outbox.payload->>'action'=audit.action
      WHERE audit.resource_type='royalty_import' AND audit.resource_id=target_batch_id::text
        AND audit.action IN ('royalty.corrected','royalty.replaced'));
$$;
REVOKE ALL ON FUNCTION soundpub.royalty_correction_intact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soundpub.royalty_correction_intact(uuid) TO soundpub_app,soundpub_auditor;
GRANT EXECUTE ON FUNCTION soundpub.royalty_batch_finance_intact(uuid),
  soundpub.royalty_reconciliation_intact(uuid) TO soundpub_auditor;

GRANT USAGE ON SCHEMA soundpub TO soundpub_auditor;

REVOKE ALL ON soundpub.finance_reconciliation_runs FROM PUBLIC,soundpub_app,soundpub_auditor;
GRANT SELECT ON soundpub.finance_reconciliation_runs TO soundpub_app;
GRANT SELECT,INSERT ON soundpub.finance_reconciliation_runs TO soundpub_auditor;
GRANT SELECT ON soundpub.royalty_import_batches,soundpub.royalty_import_entries,soundpub.royalty_import_allocations,
  soundpub.royalty_import_corrections,soundpub.royalty_import_reconciliations,
  soundpub.backend_users,soundpub.user_roles,
  soundpub.payout_requests,soundpub.payout_allocations,soundpub.payment_invoices,soundpub.payment_mock_invoices,
  soundpub.payment_effects,soundpub.payment_callback_receipts,soundpub.webhook_events,soundpub.payment_refunds,soundpub.releases,
  soundpub.tracks,soundpub.finance_events,soundpub.finance_audit,soundpub.audit_logs,soundpub.outbox_events
  TO soundpub_auditor;
GRANT INSERT ON soundpub.outbox_events TO soundpub_auditor;

CREATE POLICY royalty_batches_reconciler ON soundpub.royalty_import_batches
  FOR ALL TO soundpub_reconciler USING (true) WITH CHECK (true);
CREATE POLICY royalty_entries_reconciler ON soundpub.royalty_import_entries
  FOR SELECT TO soundpub_reconciler USING (true);
CREATE POLICY royalty_allocations_reconciler ON soundpub.royalty_import_allocations
  FOR SELECT TO soundpub_reconciler USING (true);
CREATE POLICY royalty_corrections_reconciler ON soundpub.royalty_import_corrections
  FOR SELECT TO soundpub_reconciler USING (true);
CREATE POLICY finance_events_reconciler ON soundpub.finance_events
  FOR SELECT TO soundpub_reconciler USING (true);
CREATE POLICY finance_audit_reconciler ON soundpub.finance_audit
  FOR SELECT TO soundpub_reconciler USING (true);

CREATE POLICY royalty_batches_auditor ON soundpub.royalty_import_batches
  FOR SELECT TO soundpub_auditor USING (true);
CREATE POLICY royalty_entries_auditor ON soundpub.royalty_import_entries
  FOR SELECT TO soundpub_auditor USING (true);
CREATE POLICY royalty_allocations_auditor ON soundpub.royalty_import_allocations
  FOR SELECT TO soundpub_auditor USING (true);
CREATE POLICY royalty_corrections_auditor ON soundpub.royalty_import_corrections
  FOR SELECT TO soundpub_auditor USING (true);
CREATE POLICY royalty_reconciliations_auditor ON soundpub.royalty_import_reconciliations
  FOR SELECT TO soundpub_auditor USING (true);
CREATE POLICY finance_events_auditor ON soundpub.finance_events
  FOR SELECT TO soundpub_auditor USING (true);
CREATE POLICY finance_audit_auditor ON soundpub.finance_audit
  FOR SELECT TO soundpub_auditor USING (true);
CREATE POLICY payout_requests_auditor ON soundpub.payout_requests
  FOR SELECT TO soundpub_auditor USING (true);
CREATE POLICY payout_allocations_auditor ON soundpub.payout_allocations
  FOR SELECT TO soundpub_auditor USING (true);

ALTER TABLE soundpub.finance_reconciliation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_reconciliation_runs_app ON soundpub.finance_reconciliation_runs TO soundpub_app USING (true);
CREATE POLICY finance_reconciliation_runs_auditor ON soundpub.finance_reconciliation_runs
  TO soundpub_auditor USING (true) WITH CHECK (true);
CREATE TRIGGER finance_reconciliation_runs_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
  ON soundpub.finance_reconciliation_runs FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable();
