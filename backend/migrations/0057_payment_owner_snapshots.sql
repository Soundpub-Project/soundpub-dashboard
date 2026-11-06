ALTER TABLE soundpub.payment_invoices
  ADD COLUMN payer_owner_id uuid REFERENCES soundpub.backend_users(id),
  ADD COLUMN financial_owner_id uuid REFERENCES soundpub.backend_users(id),
  ADD COLUMN artist_id uuid REFERENCES soundpub.artists(id),
  ADD COLUMN ownership_policy text;

UPDATE soundpub.payment_invoices invoice
SET payer_owner_id = artist.artist_user_id,
    financial_owner_id = artist.artist_user_id,
    artist_id = artist.id,
    ownership_policy = 'LOGIN_ACCOUNT'
FROM soundpub.releases release
JOIN soundpub.artists artist ON artist.id = release.artist_id
WHERE invoice.business_id = release.id
  AND artist.management_mode = 'LOGIN_ACCOUNT'
  AND artist.artist_user_id IS NOT NULL
  AND artist.artist_user_id = release.artist_user_id
  AND NOT EXISTS (
    SELECT 1 FROM soundpub.finance_events event
    WHERE event.business_reference = invoice.id::text
      AND event.kind IN ('PAYMENT_CHARGE','PAYMENT_REFUND')
      AND event.owner_id IS DISTINCT FROM artist.artist_user_id
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM soundpub.payment_invoices WHERE payer_owner_id IS NULL OR financial_owner_id IS NULL OR artist_id IS NULL) THEN
    RAISE EXCEPTION 'Existing payment invoice has no canonical owner snapshot';
  END IF;
END $$;

ALTER TABLE soundpub.payment_invoices
  ALTER COLUMN payer_owner_id SET NOT NULL,
  ALTER COLUMN financial_owner_id SET NOT NULL,
  ALTER COLUMN artist_id SET NOT NULL,
  ALTER COLUMN ownership_policy SET NOT NULL,
  ADD CONSTRAINT payment_invoices_ownership_policy CHECK (ownership_policy IN ('LOGIN_ACCOUNT','LABEL_CUSTOM_PIC')),
  ADD CONSTRAINT payment_invoices_owner_alignment CHECK (payer_owner_id = financial_owner_id);

CREATE FUNCTION soundpub.payment_invoice_owner_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $payment_guard$
BEGIN
  IF ROW(NEW.payer_owner_id, NEW.financial_owner_id, NEW.artist_id, NEW.ownership_policy)
    IS DISTINCT FROM ROW(OLD.payer_owner_id, OLD.financial_owner_id, OLD.artist_id, OLD.ownership_policy) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PAYMENT_OWNER_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$payment_guard$;
REVOKE ALL ON FUNCTION soundpub.payment_invoice_owner_guard() FROM PUBLIC, soundpub_app;
CREATE TRIGGER payment_invoice_owner_guard BEFORE UPDATE ON soundpub.payment_invoices
  FOR EACH ROW EXECUTE FUNCTION soundpub.payment_invoice_owner_guard();

CREATE INDEX payment_invoices_financial_owner_idx ON soundpub.payment_invoices(financial_owner_id, created_at DESC);
