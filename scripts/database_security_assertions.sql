\set ON_ERROR_STOP on

BEGIN READ ONLY;

DO $$
DECLARE
  client_role text;
  operation text;
  policy_row record;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF NOT has_table_privilege(client_role, 'soundpub.user_roles', 'SELECT') THEN
      RAISE EXCEPTION '% lost role SELECT', client_role;
    END IF;
    FOREACH operation IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(client_role, 'soundpub.user_roles', operation) THEN
        RAISE EXCEPTION '% retains user_roles %', client_role, operation;
      END IF;
    END LOOP;
    IF has_any_column_privilege(client_role, 'soundpub.user_roles', 'INSERT,UPDATE,REFERENCES') THEN
      RAISE EXCEPTION '% retains user_roles column writes', client_role;
    END IF;
    IF has_table_privilege(client_role, 'soundpub.rate_limits', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_any_column_privilege(client_role, 'soundpub.rate_limits', 'SELECT,INSERT,UPDATE,REFERENCES')
       OR has_function_privilege(client_role, 'soundpub.check_rate_limit(text,text,integer,integer)', 'EXECUTE')
       OR has_function_privilege(client_role, 'soundpub.cleanup_rate_limits()', 'EXECUTE') THEN
      RAISE EXCEPTION '% retains limiter access', client_role;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT FROM pg_class
    WHERE oid IN ('soundpub.user_roles'::regclass, 'soundpub.rate_limits'::regclass)
      AND NOT relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS disabled';
  END IF;

  SELECT * INTO policy_row FROM pg_policies
  WHERE schemaname = 'soundpub' AND tablename = 'user_roles'
    AND policyname = 'Admins can manage permitted roles';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role management policy missing';
  END IF;
  IF policy_row.cmd <> 'ALL' OR policy_row.roles <> ARRAY['authenticated']::name[]
     OR policy_row.qual IS DISTINCT FROM policy_row.with_check
     OR replace(policy_row.qual, 'auth.', '') NOT LIKE '%is_admin(uid())%'
     OR replace(policy_row.qual, 'auth.', '') NOT LIKE '%user_id <> uid()%'
     OR replace(policy_row.qual, 'auth.', '') NOT LIKE '%is_superadmin(uid())%'
     OR policy_row.qual NOT LIKE '%role <> %superadmin%'
     OR policy_row.qual NOT LIKE '%NOT %has_role(user_id,%superadmin%' THEN
    RAISE EXCEPTION 'Role management safeguards changed';
  END IF;
  IF EXISTS (
    SELECT FROM pg_policies WHERE schemaname = 'soundpub'
      AND tablename = 'user_roles' AND cmd <> 'SELECT'
      AND policyname <> 'Admins can manage permitted roles'
  ) OR EXISTS (
    SELECT FROM pg_policies WHERE schemaname = 'soundpub' AND tablename = 'rate_limits'
  ) THEN
    RAISE EXCEPTION 'Unexpected permissive policy requires review';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS required_privilege
    WHERE NOT has_table_privilege('service_role', 'soundpub.user_roles', required_privilege)
       OR NOT has_table_privilege('service_role', 'soundpub.rate_limits', required_privilege)
  ) OR NOT has_function_privilege('service_role', 'soundpub.check_rate_limit(text,text,integer,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'soundpub.cleanup_rate_limits()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Service role access missing';
  END IF;
END;
$$;

ROLLBACK;
