CREATE TABLE soundpub.copyright_registration_mock_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL UNIQUE REFERENCES soundpub.copyright_registration_payments(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'mock-copyright-registration' CHECK (provider='mock-copyright-registration'),
  provider_external_id text NOT NULL UNIQUE CHECK (length(provider_external_id) BETWEEN 1 AND 200),
  provider_invoice_id text NOT NULL UNIQUE CHECK (length(provider_invoice_id) BETWEEN 1 AND 200),
  invoice_url text NOT NULL CHECK (invoice_url ~ '^https://copyright-registration-payments\.invalid/'),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 9007199254740991),
  currency text NOT NULL CHECK (currency='IDR'),
  request_idempotency_key text NOT NULL CHECK (length(request_idempotency_key) BETWEEN 8 AND 200),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(payment_id,request_idempotency_key)
);

CREATE TABLE soundpub.copyright_registration_payment_callback_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider='mock-copyright-registration'),
  event_id text NOT NULL CHECK (length(event_id) BETWEEN 1 AND 200),
  payment_id uuid REFERENCES soundpub.copyright_registration_payments(id) ON DELETE RESTRICT,
  provider_invoice_id text NOT NULL CHECK (length(provider_invoice_id) BETWEEN 1 AND 200),
  callback_status text NOT NULL CHECK (callback_status IN ('PAID','FAILED','EXPIRED','CANCELLED')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 9007199254740991),
  currency text NOT NULL CHECK (currency='IDR'),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  disposition text NOT NULL CHECK (disposition IN ('APPLIED','UNKNOWN_INVOICE','AMOUNT_MISMATCH','INVALID_TRANSITION')),
  audit_log_id uuid UNIQUE REFERENCES soundpub.audit_logs(id) ON DELETE RESTRICT,
  outbox_id uuid UNIQUE REFERENCES soundpub.outbox_events(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(provider,event_id),
  FOREIGN KEY(provider,event_id) REFERENCES soundpub.webhook_events(provider,event_id) ON DELETE RESTRICT,
  CHECK ((disposition='APPLIED') = (payment_id IS NOT NULL AND audit_log_id IS NOT NULL AND outbox_id IS NOT NULL))
);

CREATE FUNCTION soundpub.copyright_registration_payment_append_only() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'copyright registration payment evidence is append-only' USING ERRCODE='23514';
END $$;
REVOKE ALL ON FUNCTION soundpub.copyright_registration_payment_append_only() FROM PUBLIC,soundpub_app;
CREATE TRIGGER copyright_registration_mock_invoices_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
  ON soundpub.copyright_registration_mock_invoices FOR EACH STATEMENT
  EXECUTE FUNCTION soundpub.copyright_registration_payment_append_only();
CREATE TRIGGER copyright_registration_payment_receipts_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
  ON soundpub.copyright_registration_payment_callback_receipts FOR EACH STATEMENT
  EXECUTE FUNCTION soundpub.copyright_registration_payment_append_only();

REVOKE ALL ON soundpub.copyright_registration_mock_invoices,
  soundpub.copyright_registration_payment_callback_receipts FROM PUBLIC,soundpub_app;
GRANT SELECT,INSERT ON soundpub.copyright_registration_mock_invoices,
  soundpub.copyright_registration_payment_callback_receipts TO soundpub_app;
