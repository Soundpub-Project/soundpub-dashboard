ALTER TABLE soundpub.payment_invoices
  ADD COLUMN invoice_number text,
  ADD COLUMN invoice_pdf_path text,
  ADD COLUMN invoice_pdf_generated_at timestamptz,
  ADD CONSTRAINT payment_invoice_number_shape CHECK (
    invoice_number IS NULL OR invoice_number ~ '^SPB-[0-9]{6}-[A-F0-9]{8}$'
  ),
  ADD CONSTRAINT payment_invoice_document_consistency CHECK (
    (invoice_number IS NULL AND invoice_pdf_path IS NULL AND invoice_pdf_generated_at IS NULL)
    OR (invoice_number IS NOT NULL AND invoice_pdf_path IS NOT NULL AND invoice_pdf_generated_at IS NOT NULL
      AND invoice_pdf_path = financial_owner_id::text || '/' || id::text || '/' || invoice_number || '.pdf')
  );

CREATE UNIQUE INDEX payment_invoice_number_unique ON soundpub.payment_invoices(invoice_number)
  WHERE invoice_number IS NOT NULL;

GRANT UPDATE (invoice_number, invoice_pdf_path, invoice_pdf_generated_at)
  ON soundpub.payment_invoices TO soundpub_app;

CREATE FUNCTION soundpub.payment_invoice_document_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF ROW(NEW.invoice_number,NEW.invoice_pdf_path,NEW.invoice_pdf_generated_at)
    IS DISTINCT FROM ROW(OLD.invoice_number,OLD.invoice_pdf_path,OLD.invoice_pdf_generated_at)
    AND OLD.invoice_number IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PAYMENT_INVOICE_DOCUMENT_IMMUTABLE';
  END IF;
  IF OLD.invoice_number IS NULL AND NEW.invoice_number IS NOT NULL AND NEW.status <> 'PAID' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PAYMENT_INVOICE_MUST_BE_PAID';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.payment_invoice_document_guard() FROM PUBLIC,soundpub_app;
CREATE TRIGGER payment_invoice_document_guard BEFORE UPDATE ON soundpub.payment_invoices
  FOR EACH ROW EXECUTE FUNCTION soundpub.payment_invoice_document_guard();
