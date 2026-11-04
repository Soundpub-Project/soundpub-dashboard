CREATE OR REPLACE FUNCTION soundpub.lock_user_role_authority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  first_id uuid;
  second_id uuid;
BEGIN
  first_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.user_id ELSE OLD.user_id END;
  second_id := CASE WHEN TG_OP = 'UPDATE' AND NEW.user_id <> OLD.user_id THEN NEW.user_id ELSE NULL END;
  IF second_id IS NOT NULL AND second_id < first_id THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(second_id::text, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended(first_id::text, 0));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(first_id::text, 0));
    IF second_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(second_id::text, 0));
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.lock_user_role_authority() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soundpub.lock_user_role_authority() TO soundpub_owner;
CREATE TRIGGER user_roles_authority_lock
BEFORE INSERT OR UPDATE OR DELETE ON soundpub.user_roles
FOR EACH ROW EXECUTE FUNCTION soundpub.lock_user_role_authority();
