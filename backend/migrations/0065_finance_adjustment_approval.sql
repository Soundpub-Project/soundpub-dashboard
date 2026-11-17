CREATE TABLE soundpub.finance_adjustment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL CHECK (amount_minor <> 0 AND amount_minor BETWEEN -999999999999999999 AND 999999999999999999),
  currency text NOT NULL DEFAULT 'IDR' CHECK (currency='IDR'),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 240),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  requested_by uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  reviewed_by uuid REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_key text,
  review_hash text CHECK (review_hash IS NULL OR review_hash ~ '^[0-9a-f]{64}$'),
  decision_note text CHECK (decision_note IS NULL OR length(btrim(decision_note)) BETWEEN 10 AND 240),
  finance_event_id uuid UNIQUE REFERENCES soundpub.finance_events(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE(requested_by,idempotency_key),
  CHECK ((status='PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_key IS NULL
      AND review_hash IS NULL AND decision_note IS NULL AND finance_event_id IS NULL AND version=1)
    OR (status='APPROVED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_key IS NOT NULL
      AND review_hash IS NOT NULL AND decision_note IS NOT NULL AND finance_event_id IS NOT NULL AND version=2)
    OR (status='REJECTED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_key IS NOT NULL
      AND review_hash IS NOT NULL AND decision_note IS NOT NULL AND finance_event_id IS NULL AND version=2)),
  CHECK (reviewed_by IS DISTINCT FROM requested_by)
);
CREATE INDEX finance_adjustment_requests_queue ON soundpub.finance_adjustment_requests(status,requested_at DESC,id DESC);
CREATE INDEX finance_adjustment_requests_owner ON soundpub.finance_adjustment_requests(owner_id,requested_at DESC,id DESC);

CREATE FUNCTION soundpub.finance_adjustment_request_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF ROW(NEW.owner_id,NEW.amount_minor,NEW.currency,NEW.reason,NEW.requested_by,NEW.requested_at,
      NEW.idempotency_key,NEW.request_hash)
    IS DISTINCT FROM ROW(OLD.owner_id,OLD.amount_minor,OLD.currency,OLD.reason,OLD.requested_by,OLD.requested_at,
      OLD.idempotency_key,OLD.request_hash) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='FINANCE_ADJUSTMENT_REQUEST_IMMUTABLE';
  END IF;
  IF OLD.status<>'PENDING' OR NEW.status NOT IN ('APPROVED','REJECTED') OR NEW.version<>OLD.version+1
    OR NEW.reviewed_by=NEW.requested_by THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='FINANCE_ADJUSTMENT_TRANSITION_INVALID';
  END IF;
  IF NEW.status='APPROVED' AND NOT EXISTS (
    SELECT 1 FROM soundpub.finance_events event
    JOIN soundpub.backend_users reviewer ON reviewer.id=NEW.reviewed_by AND reviewer.status='active'
    JOIN soundpub.user_roles role ON role.user_id=reviewer.id AND role.role IN ('admin','superadmin')
      AND role.tenant_id IS NULL AND role.verified_at IS NOT NULL
    WHERE event.id=NEW.finance_event_id AND event.owner_id=NEW.owner_id AND event.currency=NEW.currency
      AND event.kind='MANUAL_ADJUSTMENT' AND event.amount_minor=NEW.amount_minor
      AND event.business_reference='manual-adjustment:'||NEW.id::text
      AND event.idempotency_key='manual-adjustment:'||NEW.id::text
      AND event.actor_id=NEW.reviewed_by AND event.evidence=NEW.reason
      AND EXISTS(SELECT 1 FROM soundpub.finance_audit audit JOIN soundpub.outbox_events outbox ON outbox.id=audit.outbox_id
        WHERE audit.event_id=event.id AND audit.old_state=event.old_state AND audit.new_state=event.new_state
          AND outbox.topic='finance.event' AND outbox.payload=jsonb_build_object('eventId',event.id)
          AND outbox.idempotency_key='finance:'||event.id::text)
  ) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='FINANCE_ADJUSTMENT_EVIDENCE_MISMATCH'; END IF;
  IF NEW.status='REJECTED' AND NEW.finance_event_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='FINANCE_ADJUSTMENT_REJECTION_HAS_EVENT';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.finance_adjustment_request_guard() FROM PUBLIC,soundpub_app;
CREATE TRIGGER finance_adjustment_request_guard BEFORE UPDATE ON soundpub.finance_adjustment_requests
  FOR EACH ROW EXECUTE FUNCTION soundpub.finance_adjustment_request_guard();
CREATE TRIGGER finance_adjustment_request_append_only BEFORE DELETE OR TRUNCATE ON soundpub.finance_adjustment_requests
  FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable();

ALTER TABLE soundpub.finance_adjustment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_adjustment_requests_backend ON soundpub.finance_adjustment_requests
  TO soundpub_app USING (true) WITH CHECK (true);
CREATE POLICY finance_adjustment_requests_auditor ON soundpub.finance_adjustment_requests
  TO soundpub_auditor,soundpub_reconciler USING (true);
REVOKE ALL ON soundpub.finance_adjustment_requests FROM PUBLIC,soundpub_app;
GRANT SELECT,INSERT ON soundpub.finance_adjustment_requests TO soundpub_app;
GRANT UPDATE(status,reviewed_by,reviewed_at,review_key,review_hash,decision_note,finance_event_id,version)
  ON soundpub.finance_adjustment_requests TO soundpub_app;

CREATE FUNCTION soundpub.finance_adjustments_intact(target_owner_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT NOT EXISTS(
    SELECT 1 FROM soundpub.finance_events event
    LEFT JOIN soundpub.finance_adjustment_requests request ON request.finance_event_id=event.id
    WHERE event.owner_id=target_owner_id AND event.currency='IDR' AND event.kind='MANUAL_ADJUSTMENT'
      AND (request.id IS NULL OR request.status<>'APPROVED' OR request.owner_id<>event.owner_id
        OR request.amount_minor<>event.amount_minor OR event.actor_id<>request.reviewed_by
        OR event.business_reference<>'manual-adjustment:'||request.id::text
        OR event.idempotency_key<>'manual-adjustment:'||request.id::text OR event.evidence<>request.reason)
  ) AND NOT EXISTS(
    SELECT 1 FROM soundpub.finance_adjustment_requests request
    LEFT JOIN soundpub.finance_events event ON event.id=request.finance_event_id
    WHERE request.owner_id=target_owner_id AND request.status='APPROVED'
      AND (event.id IS NULL OR event.kind<>'MANUAL_ADJUSTMENT' OR event.owner_id<>request.owner_id
        OR event.amount_minor<>request.amount_minor OR event.actor_id<>request.reviewed_by
        OR event.business_reference<>'manual-adjustment:'||request.id::text
        OR event.idempotency_key<>'manual-adjustment:'||request.id::text OR event.evidence<>request.reason)
  );
$$;
REVOKE ALL ON FUNCTION soundpub.finance_adjustments_intact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soundpub.finance_adjustments_intact(uuid) TO soundpub_app,soundpub_auditor,soundpub_reconciler;
GRANT SELECT ON soundpub.finance_adjustment_requests TO soundpub_auditor,soundpub_reconciler;

CREATE FUNCTION soundpub.finance_manual_adjustment_event_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.kind='MANUAL_ADJUSTMENT' AND NOT soundpub.finance_adjustments_intact(NEW.owner_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='FINANCE_ADJUSTMENT_APPROVAL_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.finance_manual_adjustment_event_guard() FROM PUBLIC,soundpub_app;
CREATE CONSTRAINT TRIGGER finance_manual_adjustment_event_guard
  AFTER INSERT ON soundpub.finance_events DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION soundpub.finance_manual_adjustment_event_guard();
