-- Admin writes to `profiles` that the browser used to perform directly.
--
-- `status`, `parent_label_id` and `balance` are no longer in the column-level
-- UPDATE grant (20260929_restrict_privileges.sql), because a user who may edit
-- their own profile row must not be able to un-suspend themselves, re-parent
-- themselves under another label, or set their own balance. The privileged
-- edits move here, where the caller's role is checked server-side.

BEGIN;

-- ---------------------------------------------------------------------------
-- Set a user's account status.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION Soundpub.admin_set_profile_status(
  p_user_id UUID,
  p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = Soundpub, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_is_admin BOOLEAN;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Mirrors the CHECK constraint on the column, so a bad value is rejected as
  -- a clear error rather than a constraint violation.
  IF p_status NOT IN ('active', 'inactive', 'suspended') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  IF p_user_id = v_actor THEN
    RAISE EXCEPTION 'Cannot change your own status';
  END IF;

  v_is_admin := Soundpub.is_admin(v_actor);

  -- A label may only touch its own artists; admins may touch anyone.
  IF NOT v_is_admin THEN
    IF NOT EXISTS (
      SELECT 1 FROM Soundpub.profiles
      WHERE id = p_user_id AND parent_label_id = v_actor
    ) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  -- Only a superadmin may suspend a superadmin, so a plain admin cannot lock
  -- the owners out of their own dashboard.
  IF Soundpub.has_role(p_user_id, 'superadmin'::Soundpub.app_role)
     AND NOT Soundpub.has_role(v_actor, 'superadmin'::Soundpub.app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE Soundpub.profiles SET status = p_status WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Re-parent a user under a label.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION Soundpub.admin_set_parent_label(
  p_user_id UUID,
  p_parent_label_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = Soundpub, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT Soundpub.is_admin(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_parent_label_id IS NOT NULL THEN
    -- A self-reference would make the hierarchy walk loop forever.
    IF p_parent_label_id = p_user_id THEN
      RAISE EXCEPTION 'A user cannot be its own parent label';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM Soundpub.profiles WHERE id = p_parent_label_id) THEN
      RAISE EXCEPTION 'Parent label not found';
    END IF;
  END IF;

  UPDATE Soundpub.profiles SET parent_label_id = p_parent_label_id WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Credit a balance (release refund).
--
-- Also fixes a lost update: the browser used to SELECT the balance and write
-- back `balance + amount`, so two concurrent refunds could drop one of them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION Soundpub.admin_credit_balance(
  p_user_id UUID,
  p_amount NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = Soundpub, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_new_balance NUMERIC;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT Soundpub.is_admin(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  UPDATE Soundpub.profiles
  SET balance = balance + p_amount
  WHERE id = p_user_id
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  INSERT INTO Soundpub.audit_logs (action, actor_id, target_id, target_type, details)
  VALUES ('balance_credited', v_actor, p_user_id, 'user',
          jsonb_build_object('amount', p_amount, 'new_balance', v_new_balance));

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION Soundpub.admin_set_profile_status(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION Soundpub.admin_set_parent_label(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION Soundpub.admin_credit_balance(UUID, NUMERIC) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION Soundpub.admin_set_profile_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION Soundpub.admin_set_parent_label(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION Soundpub.admin_credit_balance(UUID, NUMERIC) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
