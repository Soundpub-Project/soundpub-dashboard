ALTER TABLE Soundpub.payout_requests
  ADD COLUMN IF NOT EXISTS payment_proof_path text,
  ADD COLUMN IF NOT EXISTS payment_proof_name text;

CREATE TABLE IF NOT EXISTS Soundpub.payout_balance_reservations (
  payout_id uuid NOT NULL REFERENCES Soundpub.payout_requests(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES Soundpub.profiles(id),
  amount numeric NOT NULL CHECK (amount > 0),
  PRIMARY KEY (payout_id, profile_id)
);

ALTER TABLE Soundpub.payout_balance_reservations ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('payout-proofs', 'payout-proofs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admin upload payout proofs" ON storage.objects;
CREATE POLICY "Admin upload payout proofs" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'payout-proofs' AND Soundpub.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin read payout proofs" ON storage.objects;
CREATE POLICY "Admin read payout proofs" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'payout-proofs' AND Soundpub.is_admin(auth.uid()));

DROP POLICY IF EXISTS "User read own payout proofs" ON storage.objects;
CREATE POLICY "User read own payout proofs" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'payout-proofs' AND split_part(name, '/', 1) = auth.uid()::text);

CREATE OR REPLACE FUNCTION Soundpub.request_payout(
  _amount numeric, _bank_name text, _account_number text, _account_holder_name text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO Soundpub, auth
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_remaining numeric := _amount;
  v_take numeric;
  v_profile Soundpub.profiles%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_user IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Invalid payout request'; END IF;
  INSERT INTO Soundpub.payout_requests (user_id, amount, bank_name, account_number, account_holder_name, status)
  VALUES (v_user, _amount, _bank_name, _account_number, _account_holder_name, 'pending')
  RETURNING id INTO v_id;
  FOR v_profile IN
    SELECT * FROM Soundpub.profiles
    WHERE id = v_user OR parent_label_id = v_user
    ORDER BY CASE WHEN id = v_user THEN 0 ELSE 1 END, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, GREATEST(COALESCE(v_profile.balance, 0), 0));
    IF v_take > 0 THEN
      UPDATE Soundpub.profiles SET balance = balance - v_take WHERE id = v_profile.id;
      INSERT INTO Soundpub.payout_balance_reservations (payout_id, profile_id, amount) VALUES (v_id, v_profile.id, v_take);
      v_remaining := v_remaining - v_take;
    END IF;
  END LOOP;
  IF v_remaining > 0 THEN RAISE EXCEPTION 'Saldo tidak mencukupi'; END IF;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION Soundpub.request_payout(numeric, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION Soundpub.update_payout_status(
  _payout_id uuid, _status text, _notes text DEFAULT NULL, _proof_path text DEFAULT NULL, _proof_name text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO Soundpub, auth
AS $$
DECLARE v_payout Soundpub.payout_requests%ROWTYPE;
BEGIN
  IF NOT Soundpub.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_payout FROM Soundpub.payout_requests WHERE id = _payout_id FOR UPDATE;
  IF v_payout IS NULL THEN RAISE EXCEPTION 'Payout not found'; END IF;
  IF _status NOT IN ('approved', 'rejected', 'paid') THEN RAISE EXCEPTION 'Invalid payout status'; END IF;
  IF _status = 'approved' AND v_payout.status <> 'pending' THEN RAISE EXCEPTION 'Payout must be pending'; END IF;
  IF _status = 'rejected' AND v_payout.status NOT IN ('pending', 'approved') THEN RAISE EXCEPTION 'Payout cannot be rejected'; END IF;
  IF _status = 'paid' AND v_payout.status <> 'approved' THEN RAISE EXCEPTION 'Payout must be approved'; END IF;
  IF _status = 'paid' AND COALESCE(_proof_path, '') = '' THEN RAISE EXCEPTION 'Payment proof is required'; END IF;
  IF _status = 'rejected' THEN
    UPDATE Soundpub.profiles p SET balance = COALESCE(p.balance, 0) + r.amount
    FROM Soundpub.payout_balance_reservations r WHERE r.payout_id = _payout_id AND r.profile_id = p.id;
  END IF;
  UPDATE Soundpub.payout_requests SET status = _status, notes = COALESCE(_notes, notes), payment_proof_path = COALESCE(_proof_path, payment_proof_path), payment_proof_name = COALESCE(_proof_name, payment_proof_name), processed_by = auth.uid(), processed_at = now() WHERE id = _payout_id;
END;
$$;
GRANT EXECUTE ON FUNCTION Soundpub.update_payout_status(uuid, text, text, text, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
