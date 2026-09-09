-- Only labels and whitelabels may create payouts from the aggregated label balance.
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
  IF NOT EXISTS (
    SELECT 1 FROM Soundpub.user_roles
    WHERE user_id = v_user AND role IN ('label', 'whitelabel')
  ) THEN RAISE EXCEPTION 'Only labels can request payouts'; END IF;

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
NOTIFY pgrst, 'reload schema';
