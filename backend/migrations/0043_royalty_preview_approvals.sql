CREATE TABLE soundpub.royalty_import_session_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES soundpub.royalty_import_sessions(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  preview_checksum text NOT NULL CHECK (preview_checksum ~ '^[0-9a-f]{64}$'),
  staging_checksum text NOT NULL CHECK (staging_checksum ~ '^[0-9a-f]{64}$'),
  evidence text NOT NULL CHECK (length(btrim(evidence)) BETWEEN 1 AND 500),
  audit_log_id uuid NOT NULL UNIQUE REFERENCES soundpub.audit_logs(id) ON DELETE RESTRICT,
  outbox_id uuid NOT NULL UNIQUE REFERENCES soundpub.outbox_events(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION soundpub.royalty_preview_approval_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE valid boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM soundpub.royalty_import_sessions session
    JOIN soundpub.backend_users actor ON actor.id=NEW.actor_id AND actor.status='active'
    JOIN soundpub.user_roles role ON role.user_id=actor.id AND role.role IN ('admin','superadmin')
      AND role.tenant_id IS NULL AND role.verified_at IS NOT NULL
    JOIN soundpub.audit_logs audit ON audit.id=NEW.audit_log_id
    JOIN soundpub.outbox_events outbox ON outbox.id=NEW.outbox_id
    WHERE session.id=NEW.session_id AND session.status='PREVIEW_READY'
      AND session.preview_checksum=NEW.preview_checksum AND session.staging_checksum=NEW.staging_checksum
      AND audit.actor_user_id=NEW.actor_id AND audit.action='royalty.preview_approved'
      AND audit.resource_type='royalty_import_session' AND audit.resource_id=NEW.session_id::text
      AND audit.metadata=jsonb_build_object('preview_checksum',NEW.preview_checksum,
        'staging_checksum',NEW.staging_checksum,'evidence',NEW.evidence)
      AND outbox.topic='royalty.changed'
      AND outbox.payload=jsonb_build_object('session_id',NEW.session_id,'action','royalty.preview_approved',
        'preview_checksum',NEW.preview_checksum,'staging_checksum',NEW.staging_checksum)
      AND outbox.idempotency_key='royalty.preview_approved:'||NEW.session_id::text
  ) INTO valid;
  IF NOT valid THEN RAISE EXCEPTION 'ROYALTY_PREVIEW_APPROVAL_EVIDENCE_MISMATCH' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.royalty_preview_approval_guard() FROM PUBLIC,soundpub_app;

REVOKE ALL ON soundpub.royalty_import_session_approvals FROM PUBLIC,soundpub_app;
GRANT SELECT,INSERT ON soundpub.royalty_import_session_approvals TO soundpub_app;
CREATE TRIGGER royalty_preview_approvals_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
  ON soundpub.royalty_import_session_approvals FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable();
CREATE CONSTRAINT TRIGGER royalty_preview_approval_evidence
  AFTER INSERT ON soundpub.royalty_import_session_approvals DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION soundpub.royalty_preview_approval_guard();
ALTER TABLE soundpub.royalty_import_session_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY royalty_preview_approvals_backend ON soundpub.royalty_import_session_approvals
  TO soundpub_app USING (true) WITH CHECK (true);

