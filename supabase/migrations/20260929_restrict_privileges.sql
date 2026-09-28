-- Tighten the blanket privileges granted to `anon` and `authenticated`.
--
-- Earlier setup scripts ran `GRANT ALL ON ALL TABLES ... TO authenticated` and
-- `GRANT CREATE ON SCHEMA Soundpub TO ... anon`. RLS still gates which *rows* a
-- caller may touch, but privileges decide which *columns* and which statements
-- are reachable at all, and these were wide open:
--
--   * `GRANT ALL` includes TRUNCATE — which is not filtered by RLS, so a policy
--     allowing a user to see their own row does not stop them emptying the
--     table.
--   * UPDATE on every column of `profiles` means a user whose RLS policy lets
--     them edit their own profile can also set their own `balance`,
--     `parent_label_id`, `status`, or a password-reset token.
--   * CREATE on the schema lets any anonymous visitor add objects to it.
--
-- Run as the schema owner (postgres / supabase_admin).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Schema-level: no object creation from the API roles.
-- ---------------------------------------------------------------------------
REVOKE CREATE ON SCHEMA Soundpub FROM anon, authenticated;
GRANT USAGE ON SCHEMA Soundpub TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Table-level: drop TRUNCATE/REFERENCES/TRIGGER, keep only DML.
--    RLS remains the row-level gate; this just removes statements RLS cannot
--    filter.
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA Soundpub FROM anon, authenticated;

GRANT SELECT ON ALL TABLES IN SCHEMA Soundpub TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA Soundpub TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA Soundpub
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA Soundpub
  GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA Soundpub
  GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- Sequences: usage only, never ownership.
REVOKE ALL ON ALL SEQUENCES IN SCHEMA Soundpub FROM anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA Soundpub TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Column-level UPDATE on `profiles`.
--    The self-service surface is small and fixed; everything else (money,
--    hierarchy, status, verification state, reset tokens) may only be written
--    by a SECURITY DEFINER function or the service role.
--
--    Driven off the catalog so a column added later is NOT writable by
--    default — an unknown column stays locked until it is added here
--    deliberately.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cols TEXT;
  v_allowed TEXT[] := ARRAY[
    'full_name',
    'phone',
    'address',
    'avatar_url',
    'logo_url',
    'logo_url_light',
    'logo_url_dark',
    'composer_code',
    'email_notif_payout',
    'email_notif_release',
    'email_notif_payment',
    'email_notif_announcement',
    'artist_profile_completed'
  ];
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'Soundpub'
    AND table_name = 'profiles'
    AND column_name = ANY (v_allowed);

  EXECUTE 'REVOKE UPDATE ON Soundpub.profiles FROM authenticated';

  IF v_cols IS NOT NULL THEN
    EXECUTE format('GRANT UPDATE (%s) ON Soundpub.profiles TO authenticated', v_cols);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. `anon` writes nothing. The public catalog is served by an Edge Function
--    holding the service role, so the anonymous PostgREST role needs read only.
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA Soundpub FROM anon;

COMMIT;

-- Verification (run manually):
--   SELECT grantee, privilege_type, string_agg(column_name, ', ')
--   FROM information_schema.column_privileges
--   WHERE table_schema = 'Soundpub' AND table_name = 'profiles'
--     AND grantee IN ('anon', 'authenticated') AND privilege_type = 'UPDATE'
--   GROUP BY grantee, privilege_type;
