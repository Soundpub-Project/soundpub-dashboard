ALTER TABLE soundpub.payment_invoices
  DROP CONSTRAINT payment_invoices_provider_check,
  DROP CONSTRAINT payment_invoices_status_check,
  ALTER COLUMN provider_invoice_id DROP NOT NULL,
  ADD COLUMN provider_external_id text,
  ADD COLUMN provider_invoice_url text,
  ADD COLUMN provider_status text;

ALTER TABLE soundpub.payment_invoices
  ADD CONSTRAINT payment_invoices_provider_check CHECK (provider IN ('mock','xendit')),
  ADD CONSTRAINT payment_invoices_status_check CHECK (status IN ('CREATING','PENDING','PAID','FAILED','EXPIRED','REFUNDED')),
  ADD CONSTRAINT payment_invoices_provider_fields_check CHECK (
    (provider='mock' AND provider_invoice_id IS NOT NULL AND provider_external_id IS NULL
      AND provider_invoice_url IS NULL AND provider_status IS NULL)
    OR
    (provider='xendit' AND (
      (status='CREATING' AND provider_invoice_id IS NULL AND provider_external_id IS NOT NULL
        AND provider_invoice_url IS NULL AND provider_status IS NULL)
      OR
      (status<>'CREATING' AND provider_invoice_id IS NOT NULL AND provider_external_id IS NOT NULL
        AND provider_invoice_url IS NOT NULL
        AND provider_invoice_url ~ '^https://(checkout|invoice)\.xendit\.co/'
        AND provider_status IS NOT NULL
        AND provider_status IN ('PENDING','PAID','EXPIRED','FAILED'))
    ))
  );

GRANT UPDATE(provider_invoice_id,provider_invoice_url,provider_status,status,updated_at)
  ON soundpub.payment_invoices TO soundpub_app;