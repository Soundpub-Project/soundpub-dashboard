-- `email_verified` used to be written straight from the browser, which means
-- the flag asserted nothing: any user could set it on their own row. It is now
-- outside the column-level UPDATE grant (see 20260929_restrict_privileges.sql),
-- and this function is the only way to set it — derived from
-- `auth.users.email_confirmed_at`, which only GoTrue writes.

CREATE OR REPLACE FUNCTION Soundpub.sync_email_verified()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = Soundpub, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_confirmed TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email_confirmed_at INTO v_confirmed
  FROM auth.users
  WHERE id = v_uid;

  IF v_confirmed IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE Soundpub.profiles
  SET email_verified = TRUE
  WHERE id = v_uid
    AND email_verified IS DISTINCT FROM TRUE;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION Soundpub.sync_email_verified() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION Soundpub.sync_email_verified() TO authenticated;

COMMENT ON FUNCTION Soundpub.sync_email_verified() IS
  'Mirrors auth.users.email_confirmed_at onto profiles.email_verified for the calling user.';
