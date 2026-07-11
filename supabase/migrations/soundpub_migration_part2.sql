-- =============================================
-- PART 2: HELPER FUNCTIONS
-- =============================================

CREATE OR REPLACE FUNCTION soundpub.has_role(user_id UUID, role soundpub.app_role)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM soundpub.user_roles
    WHERE user_roles.user_id = $1 AND user_roles.role = $2
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = soundpub;

CREATE OR REPLACE FUNCTION soundpub.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN soundpub.has_role($1, 'superadmin'::soundpub.app_role) 
      OR soundpub.has_role($1, 'admin'::soundpub.app_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = soundpub;

CREATE OR REPLACE FUNCTION soundpub.get_user_full_name(user_id UUID)
RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT full_name FROM soundpub.profiles WHERE id = $1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = soundpub;