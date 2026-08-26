ALTER TABLE Soundpub.auth_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE Soundpub.auth_events FROM anon, authenticated;
GRANT SELECT ON TABLE Soundpub.auth_events TO authenticated;

DROP POLICY IF EXISTS "Admins can view auth events" ON Soundpub.auth_events;
CREATE POLICY "Admins can view auth events"
  ON Soundpub.auth_events
  FOR SELECT
  TO authenticated
  USING (Soundpub.is_admin(auth.uid()));

REVOKE EXECUTE ON FUNCTION Soundpub.has_role(uuid, Soundpub.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION Soundpub.is_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION Soundpub.handle_new_user() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION Soundpub.has_role(uuid, Soundpub.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION Soundpub.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION Soundpub.handle_new_user() TO supabase_auth_admin, service_role;