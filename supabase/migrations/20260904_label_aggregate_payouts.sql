-- Aggregate label revenue and artist balances for label-managed payouts.
CREATE OR REPLACE FUNCTION Soundpub.get_dashboard_role_stats()
RETURNS TABLE(total_revenue numeric, available_balance numeric, total_streams bigint, unique_tracks bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO Soundpub, auth
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT ur.role::text INTO v_role
  FROM Soundpub.user_roles ur
  WHERE ur.user_id = auth.uid()
  ORDER BY CASE ur.role::text WHEN 'superadmin' THEN 1 WHEN 'admin' THEN 2 WHEN 'label' THEN 3 WHEN 'whitelabel' THEN 4 WHEN 'artist' THEN 5 ELSE 9 END
  LIMIT 1;

  RETURN QUERY
  SELECT
    COALESCE(SUM(r.net_revenue), 0)::numeric,
    CASE
      WHEN v_role IN ('label', 'whitelabel') THEN
        COALESCE((SELECT SUM(p.balance) FROM Soundpub.profiles p WHERE p.parent_label_id = auth.uid()), 0)
        + COALESCE((SELECT p.balance FROM Soundpub.profiles p WHERE p.id = auth.uid()), 0)
      WHEN v_role IN ('superadmin', 'admin') THEN COALESCE(SUM(r.Soundpub_revenue), 0)
      WHEN v_role = 'artist' THEN COALESCE(SUM(r.artist_revenue), 0)
      ELSE 0
    END::numeric,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0),
    COUNT(DISTINCT r.isrc)::bigint
  FROM Soundpub.royalties r
  WHERE Soundpub.current_user_can_view_royalty(r.artist_user_id, r.label_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION Soundpub.complete_payout(_payout_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO Soundpub, auth
AS $$
DECLARE
  v_payout Soundpub.payout_requests%ROWTYPE;
  v_remaining numeric;
  v_take numeric;
  v_profile Soundpub.profiles%ROWTYPE;
BEGIN
  IF NOT Soundpub.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_payout FROM Soundpub.payout_requests WHERE id = _payout_id FOR UPDATE;
  IF v_payout IS NULL OR v_payout.status <> 'approved' THEN RAISE EXCEPTION 'Payout must be approved'; END IF;
  v_remaining := v_payout.amount;

  FOR v_profile IN
    SELECT * FROM Soundpub.profiles
    WHERE id = v_payout.user_id OR parent_label_id = v_payout.user_id
    ORDER BY CASE WHEN id = v_payout.user_id THEN 0 ELSE 1 END, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, GREATEST(COALESCE(v_profile.balance, 0), 0));
    IF v_take > 0 THEN
      UPDATE Soundpub.profiles SET balance = balance - v_take WHERE id = v_profile.id;
      v_remaining := v_remaining - v_take;
    END IF;
  END LOOP;
  IF v_remaining > 0 THEN RAISE EXCEPTION 'Saldo tidak mencukupi'; END IF;
  UPDATE Soundpub.payout_requests SET status = 'paid', processed_by = auth.uid(), processed_at = now() WHERE id = _payout_id;
END;
$$;
GRANT EXECUTE ON FUNCTION Soundpub.complete_payout(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
