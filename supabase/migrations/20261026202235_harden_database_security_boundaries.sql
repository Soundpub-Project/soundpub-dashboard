BEGIN;

ALTER TABLE soundpub.user_roles ENABLE ROW LEVEL SECURITY;

ALTER POLICY "Admins can manage permitted roles" ON soundpub.user_roles
  USING (
    soundpub.is_admin(auth.uid())
    AND user_id <> auth.uid()
    AND (
      soundpub.is_superadmin(auth.uid())
      OR (
        role <> 'superadmin'::soundpub.app_role
        AND NOT soundpub.has_role(user_id, 'superadmin'::soundpub.app_role)
      )
    )
  )
  WITH CHECK (
    soundpub.is_admin(auth.uid())
    AND user_id <> auth.uid()
    AND (
      soundpub.is_superadmin(auth.uid())
      OR (
        role <> 'superadmin'::soundpub.app_role
        AND NOT soundpub.has_role(user_id, 'superadmin'::soundpub.app_role)
      )
    )
  );

REVOKE ALL PRIVILEGES ON TABLE soundpub.user_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE soundpub.user_roles TO anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE soundpub.rate_limits FROM PUBLIC, anon, authenticated;
ALTER TABLE soundpub.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE EXECUTE ON FUNCTION soundpub.check_rate_limit(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION soundpub.cleanup_rate_limits()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION soundpub.check_rate_limit(text, text, integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION soundpub.cleanup_rate_limits() TO service_role;


COMMIT;
