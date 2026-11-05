CREATE OR REPLACE FUNCTION soundpub.copyright_royalty_reconciliation_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE expected_action text; batch_uploader uuid; actor_valid boolean;
BEGIN
  SELECT uploader_id INTO batch_uploader FROM soundpub.copyright_royalty_batches WHERE id=NEW.batch_id;
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
