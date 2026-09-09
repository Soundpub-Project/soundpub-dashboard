ALTER TABLE Soundpub.takedown_requests
  ADD COLUMN IF NOT EXISTS other_reason text;

CREATE OR REPLACE FUNCTION Soundpub.enforce_takedown_request_required_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO Soundpub, pg_temp
AS $$
DECLARE
  v_other_reason_word_count integer;
BEGIN
  IF NULLIF(btrim(NEW.contact_name), '') IS NULL
    OR NULLIF(btrim(NEW.contact_position), '') IS NULL
    OR NULLIF(btrim(NEW.contact_phone), '') IS NULL
    OR NULLIF(btrim(NEW.contact_email), '') IS NULL
    OR NULLIF(btrim(NEW.contact_address), '') IS NULL THEN
    RAISE EXCEPTION 'Contact name, position, phone, email, and address are required';
  END IF;

  IF NEW.reason_category = 'Lainnya' THEN
    v_other_reason_word_count := cardinality(
      regexp_split_to_array(btrim(COALESCE(NEW.other_reason, '')), '\s+')
    );

    IF NULLIF(btrim(NEW.other_reason), '') IS NULL OR v_other_reason_word_count < 5 THEN
      RAISE EXCEPTION 'Other takedown reason must contain at least 5 words';
    END IF;
  ELSE
    NEW.other_reason := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_takedown_request_required_fields ON Soundpub.takedown_requests;
CREATE TRIGGER enforce_takedown_request_required_fields
BEFORE INSERT OR UPDATE OF reason_category, other_reason, contact_name, contact_position, contact_phone, contact_email, contact_address
ON Soundpub.takedown_requests
FOR EACH ROW EXECUTE FUNCTION Soundpub.enforce_takedown_request_required_fields();

NOTIFY pgrst, 'reload schema';
