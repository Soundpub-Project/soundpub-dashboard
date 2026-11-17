ALTER TABLE soundpub.copyright_registration_payments
  ADD COLUMN reconciliation_required boolean NOT NULL DEFAULT false;

CREATE INDEX copyright_registration_payments_reconciliation_pending_idx
  ON soundpub.copyright_registration_payments (created_at, id)
  WHERE reconciliation_required;

GRANT UPDATE (reconciliation_required) ON soundpub.copyright_registration_payments TO soundpub_app;
