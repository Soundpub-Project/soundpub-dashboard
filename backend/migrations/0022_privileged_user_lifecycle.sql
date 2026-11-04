CREATE FUNCTION soundpub.preserve_deleted_audit_actor() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, soundpub
AS $$
BEGIN
  UPDATE soundpub.audit_logs
  SET actor_user_id = NULL,
      metadata = metadata || jsonb_build_object('deletedActorUserId', OLD.id::text)
  WHERE actor_user_id = OLD.id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION soundpub.preserve_deleted_audit_actor() FROM PUBLIC;

CREATE TRIGGER preserve_deleted_audit_actor
BEFORE DELETE ON soundpub.backend_users
FOR EACH ROW EXECUTE FUNCTION soundpub.preserve_deleted_audit_actor();
