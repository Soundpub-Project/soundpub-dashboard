-- Prevent admins from changing their own role or granting superadmin.
-- Superadmins retain full role-management access.

-- Create is_superadmin helper if not exists
CREATE OR REPLACE FUNCTION Soundpub.is_superadmin(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = Soundpub, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM Soundpub.user_roles
    WHERE user_roles.user_id = $1
      AND user_roles.role = 'superadmin'::Soundpub.app_role
  );
$$;

DROP POLICY IF EXISTS "Admins can manage all roles" ON Soundpub.user_roles;

CREATE POLICY "Admins can manage permitted roles" ON Soundpub.user_roles
  FOR ALL
  TO authenticated
  USING (
    Soundpub.is_admin(auth.uid())
    AND (
      Soundpub.is_superadmin(auth.uid())
      OR user_id <> auth.uid()
    )
  )
  WITH CHECK (
    Soundpub.is_superadmin(auth.uid())
    OR (
      user_id <> auth.uid()
      AND role <> 'superadmin'::Soundpub.app_role
    )
  );

