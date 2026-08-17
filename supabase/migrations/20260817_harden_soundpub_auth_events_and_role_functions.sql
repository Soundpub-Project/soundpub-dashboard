ALTER TABLE soundpub.auth_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE soundpub.auth_events FROM anon, authenticated;
GRANT SELECT ON TABLE soundpub.auth_events TO authenticated;

DROP POLICY IF EXISTS "Admins can view auth events" ON soundpub.auth_events;
CREATE POLICY "Admins can view auth events"
  ON soundpub.auth_events
  FOR SELECT
  TO authenticated
  USING (soundpub.is_admin(auth.uid()));

REVOKE EXECUTE ON FUNCTION soundpub.has_role(uuid, soundpub.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION soundpub.is_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION soundpub.handle_new_user() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION soundpub.has_role(uuid, soundpub.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION soundpub.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION soundpub.handle_new_user() TO supabase_auth_admin, service_role;