-- =============================================
-- SOUNDPUB PATCH: USER PROFILE AND ROLE SUPPORT
-- Adds missing roles and profile columns used by frontend user/profile features.
-- =============================================

ALTER TYPE soundpub.app_role ADD VALUE IF NOT EXISTS 'copyright';
ALTER TYPE soundpub.app_role ADD VALUE IF NOT EXISTS 'whitelabel';

ALTER TABLE soundpub.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS sso_provider TEXT,
  ADD COLUMN IF NOT EXISTS artist_profile_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS province TEXT,
  ADD COLUMN IF NOT EXISTS sso_user_id TEXT,
  ADD COLUMN IF NOT EXISTS sso_user_type TEXT,
  ADD COLUMN IF NOT EXISTS email_notif_payout BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_notif_release BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_notif_payment BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_notif_announcement BOOLEAN DEFAULT true;

-- Admin pages need all profile/role rows. Existing self policies stay in place.
DROP POLICY IF EXISTS "Admins can view all profiles" ON soundpub.profiles;
CREATE POLICY "Admins can view all profiles"
ON soundpub.profiles FOR SELECT
TO authenticated
USING (soundpub.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all roles" ON soundpub.user_roles;
CREATE POLICY "Admins can view all roles"
ON soundpub.user_roles FOR SELECT
TO authenticated
USING (soundpub.is_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON soundpub.profiles TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON soundpub.user_roles TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';