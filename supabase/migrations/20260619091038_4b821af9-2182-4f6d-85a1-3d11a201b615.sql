CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Service role (edge functions / admin client) bypasses this guard.
  -- When called via service role JWT, auth.uid() is NULL and the session role is 'service_role'.
  IF auth.uid() IS NULL OR current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Admins can change anything
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
$function$;