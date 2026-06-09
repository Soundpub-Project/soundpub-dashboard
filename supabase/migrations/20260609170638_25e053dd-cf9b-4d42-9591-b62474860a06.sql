
-- 1. Prevent profile privilege escalation via trigger
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins (and service role via bypass) can change anything
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- For everyone else, block changes to sensitive/financial/role-affecting columns
  IF NEW.balance IS DISTINCT FROM OLD.balance
     OR NEW.label_revenue IS DISTINCT FROM OLD.label_revenue
     OR NEW.artist_revenue IS DISTINCT FROM OLD.artist_revenue
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_upgraded_at IS DISTINCT FROM OLD.subscription_upgraded_at
     OR NEW.parent_label_id IS DISTINCT FROM OLD.parent_label_id
     OR NEW.composer_code IS DISTINCT FROM OLD.composer_code
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.sso_provider IS DISTINCT FROM OLD.sso_provider
     OR NEW.sso_user_id IS DISTINCT FROM OLD.sso_user_id
     OR NEW.sso_user_type IS DISTINCT FROM OLD.sso_user_type
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.password_set IS DISTINCT FROM OLD.password_set
  THEN
    RAISE EXCEPTION 'Not allowed to modify privileged profile fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 2. Audit logs INSERT - restrict to authenticated and require actor_id = auth.uid()
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users can insert own audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (actor_id = auth.uid());
-- Note: service_role bypasses RLS entirely, so backend edge functions still work.

-- 3. Storage policies for label-logos: enforce folder = user id (or admin/superadmin)
DROP POLICY IF EXISTS "Users can update their own label logo" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own label logo" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload their own label logo" ON storage.objects;

CREATE POLICY "Users can upload their own label logo"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'label-logos'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'superadmin'::app_role)
  )
);

CREATE POLICY "Users can update their own label logo"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'label-logos'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'superadmin'::app_role)
  )
);

CREATE POLICY "Users can delete their own label logo"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'label-logos'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'superadmin'::app_role)
  )
);

-- 4. Revoke anonymous EXECUTE on internal helpers (signed-in users still allowed where needed)
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_full_name(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_parent_label_id(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_release_label_ids(uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_full_name(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_parent_label_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_release_label_ids(uuid) TO authenticated, service_role;
