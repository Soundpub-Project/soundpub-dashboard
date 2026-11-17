ALTER TABLE soundpub.copyright_registration_payments
  DROP CONSTRAINT copyright_registration_payments_status_check;

DO $$
DECLARE constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='soundpub.copyright_registration_payments'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%INTENT%'
  LOOP
    EXECUTE format('ALTER TABLE soundpub.copyright_registration_payments DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END $$;

ALTER TABLE soundpub.copyright_registration_payments
  ADD CONSTRAINT copyright_registration_payments_status_check
    CHECK (status IN ('INTENT','CREATING','PROVIDER_PENDING','PAID','FAILED','EXPIRED','CANCELLED','REFUNDED','RECONCILIATION_REQUIRED')),
  ADD CONSTRAINT copyright_registration_payments_provider_value_check CHECK (provider IS NULL OR provider IN ('mock-copyright-registration','xendit')),
  ADD CONSTRAINT copyright_registration_payments_provider_state_check CHECK (
    (status='INTENT' AND provider IS NULL AND provider_external_id IS NULL AND provider_invoice_id IS NULL AND provider_invoice_url IS NULL)
    OR (status='CREATING' AND provider='xendit' AND provider_external_id IS NOT NULL AND provider_invoice_id IS NULL AND provider_invoice_url IS NULL)
    OR (status NOT IN ('INTENT','CREATING') AND provider IS NOT NULL AND provider_external_id IS NOT NULL)
  ),
  ADD CONSTRAINT copyright_registration_payments_xendit_evidence_check CHECK (
    provider<>'xendit' OR
    (status='CREATING' AND provider_invoice_id IS NULL AND provider_invoice_url IS NULL AND provider_status IS NULL) OR
    (status<>'CREATING' AND provider_invoice_id IS NOT NULL AND
      provider_invoice_url ~ '^https://(checkout|invoice)\.xendit\.co/' AND
      provider_status IN ('PENDING','PAID','FAILED','EXPIRED','CANCELLED'))
  );

DO $$
DECLARE constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='soundpub.copyright_registration_payment_callback_receipts'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%mock-copyright-registration%'
  LOOP
    EXECUTE format('ALTER TABLE soundpub.copyright_registration_payment_callback_receipts DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END $$;

ALTER TABLE soundpub.copyright_registration_payment_callback_receipts
  ADD CONSTRAINT copyright_registration_payment_callback_receipts_provider_check
    CHECK (provider IN ('mock-copyright-registration','xendit-registration'));

CREATE OR REPLACE FUNCTION soundpub.copyright_payment_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.provider IS NOT NULL AND (NEW.provider IS DISTINCT FROM OLD.provider OR
    NEW.provider_external_id IS DISTINCT FROM OLD.provider_external_id)
  THEN RAISE EXCEPTION 'copyright payment provider identity is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.provider_invoice_id IS NOT NULL AND (NEW.provider_invoice_id IS DISTINCT FROM OLD.provider_invoice_id OR
    NEW.provider_invoice_url IS DISTINCT FROM OLD.provider_invoice_url)
  THEN RAISE EXCEPTION 'copyright provider invoice identity is immutable' USING ERRCODE='23514'; END IF;
  IF ROW(NEW.id,NEW.registration_id,NEW.owner_id,NEW.amount_minor,NEW.currency,NEW.precision,NEW.includes_emeterai,
    NEW.emeterai_quantity,NEW.idempotency_key,NEW.request_hash,NEW.created_at) IS DISTINCT FROM
    ROW(OLD.id,OLD.registration_id,OLD.owner_id,OLD.amount_minor,OLD.currency,OLD.precision,OLD.includes_emeterai,
    OLD.emeterai_quantity,OLD.idempotency_key,OLD.request_hash,OLD.created_at)
  THEN RAISE EXCEPTION 'copyright payment intent is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='INTENT' AND NEW.status IN ('CREATING','PROVIDER_PENDING','CANCELLED')) OR
    (OLD.status='CREATING' AND NEW.status IN ('PROVIDER_PENDING','FAILED','EXPIRED','CANCELLED','RECONCILIATION_REQUIRED')) OR
    (OLD.status='PROVIDER_PENDING' AND NEW.status IN ('PAID','FAILED','EXPIRED','CANCELLED','RECONCILIATION_REQUIRED')) OR
    (OLD.status IN ('FAILED','EXPIRED') AND NEW.status='RECONCILIATION_REQUIRED') OR
    (OLD.status='PAID' AND NEW.status IN ('REFUNDED','RECONCILIATION_REQUIRED')))
  THEN RAISE EXCEPTION 'invalid copyright payment transition' USING ERRCODE='23514'; END IF;
  NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
