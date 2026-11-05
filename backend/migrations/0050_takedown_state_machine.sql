ALTER TABLE soundpub.takedown_requests
  ADD COLUMN status_before_cancel text CHECK (status_before_cancel IS NULL OR status_before_cancel IN
    ('SUBMITTED','UNDER_REVIEW','NEED_DOCUMENT','APPROVED'));

CREATE FUNCTION soundpub.takedown_transition_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='SUBMITTED' AND NEW.status IN ('UNDER_REVIEW','CANCEL_REQUESTED')) OR
    (OLD.status='UNDER_REVIEW' AND NEW.status IN ('NEED_DOCUMENT','APPROVED','REJECTED','CANCEL_REQUESTED')) OR
    (OLD.status='NEED_DOCUMENT' AND NEW.status IN ('UNDER_REVIEW','REJECTED','CANCEL_REQUESTED')) OR
    (OLD.status='APPROVED' AND NEW.status IN ('SENT_TO_DSP','CANCEL_REQUESTED')) OR
    (OLD.status='CANCEL_REQUESTED' AND NEW.status='CANCELLED') OR
    (OLD.status='SENT_TO_DSP' AND NEW.status IN ('PROCESSING_DSP','PARTIALLY_COMPLETED','COMPLETED')) OR
    (OLD.status='PROCESSING_DSP' AND NEW.status IN ('PARTIALLY_COMPLETED','COMPLETED')) OR
    (OLD.status='PARTIALLY_COMPLETED' AND NEW.status IN ('PROCESSING_DSP','COMPLETED'))
  ) THEN RAISE EXCEPTION 'invalid takedown transition' USING ERRCODE='23514'; END IF;
  IF NEW.status='CANCEL_REQUESTED' AND NEW.status_before_cancel IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'invalid cancellation source' USING ERRCODE='23514';
  END IF;
  IF OLD.status='CANCEL_REQUESTED' AND NEW.status='CANCELLED' AND NEW.status_before_cancel IS DISTINCT FROM OLD.status_before_cancel THEN
    RAISE EXCEPTION 'cancellation source is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION soundpub.takedown_transition_guard() FROM PUBLIC,soundpub_app;
CREATE TRIGGER takedown_requests_transition_guard BEFORE UPDATE ON soundpub.takedown_requests
  FOR EACH ROW EXECUTE FUNCTION soundpub.takedown_transition_guard();

CREATE FUNCTION soundpub.takedown_target_transition_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='PENDING' AND NEW.status='SUBMITTED') OR
    (OLD.status='SUBMITTED' AND NEW.status IN ('PROCESSING','COMPLETED','REJECTED')) OR
    (OLD.status='PROCESSING' AND NEW.status IN ('COMPLETED','REJECTED'))
  ) THEN RAISE EXCEPTION 'invalid takedown target transition' USING ERRCODE='23514'; END IF;
  NEW.version:=OLD.version+1; NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION soundpub.takedown_target_transition_guard() FROM PUBLIC,soundpub_app;
CREATE TRIGGER takedown_targets_transition_guard BEFORE UPDATE ON soundpub.takedown_request_targets
  FOR EACH ROW EXECUTE FUNCTION soundpub.takedown_target_transition_guard();

GRANT UPDATE (status,status_before_cancel,reviewer_id,review_note,rejection_reason,reviewed_at,sent_to_dsp_at,completed_at,updated_at)
  ON soundpub.takedown_requests TO soundpub_app;
