GRANT SELECT (id, registration_id, status, provider_status, reconciliation_required)
  ON soundpub.copyright_registration_payments TO soundpub_auditor;
GRANT SELECT (provider, event_id, payment_id, provider_invoice_id, callback_status, disposition)
  ON soundpub.copyright_registration_payment_callback_receipts TO soundpub_auditor;

CREATE INDEX copyright_registration_payment_receipts_unresolved_idx
  ON soundpub.copyright_registration_payment_callback_receipts (provider, event_id)
  WHERE disposition <> 'APPLIED';
