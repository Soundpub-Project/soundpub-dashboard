-- Stop double-debiting payout balances and reconcile KADITRUDIT.
BEGIN;

DROP TRIGGER IF EXISTS update_balance_on_payout_status_change ON Soundpub.payout_requests;

DO $$
DECLARE
  v_label_id uuid := '442b47f0-29ab-43de-97d8-49007f7d313f';
  v_balance numeric;
  v_paid numeric;
  v_reserved numeric;
BEGIN
  SELECT COALESCE(balance, 0) INTO v_balance
  FROM Soundpub.profiles
  WHERE id = v_label_id
  FOR UPDATE;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM Soundpub.payout_requests
  WHERE user_id = v_label_id AND status = 'paid';

  SELECT COALESCE(SUM(r.amount), 0) INTO v_reserved
  FROM Soundpub.payout_balance_reservations r
  JOIN Soundpub.payout_requests p ON p.id = r.payout_id
  WHERE p.user_id = v_label_id AND p.status = 'paid';

  IF v_balance <> -1400000 OR v_paid <> 1400000 OR v_reserved <> 1400000 THEN
    RAISE EXCEPTION 'KADITRUDIT reconciliation precondition failed: balance=%, paid=%, reserved=%', v_balance, v_paid, v_reserved;
  END IF;

  UPDATE Soundpub.profiles
  SET balance = balance + 1400000,
      updated_at = now()
  WHERE id = v_label_id;

  INSERT INTO Soundpub.audit_logs (
    action, target_id, target_type, details, before_data, after_data, changed_fields
  ) VALUES (
    'balance_reconciliation',
    v_label_id,
    'profile',
    jsonb_build_object(
      'reason', 'Remove legacy payout trigger double deduction',
      'adjustment', 1400000,
      'paid_payout_total', v_paid,
      'paid_reservation_total', v_reserved
    ),
    jsonb_build_object('balance', v_balance),
    jsonb_build_object('balance', v_balance + 1400000),
    '["balance"]'::jsonb
  );
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

