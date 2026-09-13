ALTER TABLE Soundpub.release_payments
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS invoice_pdf_path text,
  ADD COLUMN IF NOT EXISTS invoice_pdf_generated_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS release_payments_invoice_number_key
  ON Soundpub.release_payments (invoice_number)
  WHERE invoice_number IS NOT NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('release-invoices', 'release-invoices', false)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
