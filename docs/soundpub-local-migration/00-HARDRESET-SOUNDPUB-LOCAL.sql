-- =============================================
-- HARD RESET Soundpub LOCAL DATABASE
-- Target Supabase: Local/self-hosted
-- Target schema: Soundpub
--
-- WARNING:
--   This script removes ALL Soundpub data in schema `Soundpub`.
--   It also removes auth.users rows whose id exists in Soundpub.profiles.
--   It does NOT drop other project schemas in the same Postgres instance.
--
-- Recommended use:
--   1) Run this file first.
--   2) Run 01-reset-and-recreate-Soundpub.sql.
--   3) Run 02 through 19 in order.
--   4) Run pnpm import:csv from docs/Soundpub-local-migration.
-- =============================================

BEGIN;

-- Keep a copy of Soundpub auth user IDs before dropping the schema.
CREATE TEMP TABLE IF NOT EXISTS _Soundpub_reset_auth_users (
  id uuid PRIMARY KEY
) ON COMMIT DROP;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'Soundpub'
      AND table_name = 'profiles'
  ) THEN
    INSERT INTO _Soundpub_reset_auth_users (id)
    SELECT id
    FROM Soundpub.profiles
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;


-- Storage cleanup note:
-- Supabase Storage blocks direct DELETE from storage.objects/storage.buckets via SQL.
-- If storage cleanup is needed, delete objects via Storage API or Dashboard after this reset.
-- This hard reset intentionally skips direct storage table deletion.

-- Drop the Soundpub application schema completely.
DROP SCHEMA IF EXISTS Soundpub CASCADE;

-- Remove auth identities and auth users that belonged to Soundpub.
-- This prevents duplicate-email errors on the next CSV import / user recreation.
DELETE FROM auth.identities
WHERE user_id::text IN (SELECT id::text FROM _Soundpub_reset_auth_users);

DELETE FROM auth.sessions
WHERE user_id::text IN (SELECT id::text FROM _Soundpub_reset_auth_users);

DELETE FROM auth.refresh_tokens
WHERE user_id::text IN (SELECT id::text FROM _Soundpub_reset_auth_users);

DELETE FROM auth.mfa_factors
WHERE user_id::text IN (SELECT id::text FROM _Soundpub_reset_auth_users);

DELETE FROM auth.users
WHERE id IN (SELECT id FROM _Soundpub_reset_auth_users);

-- Force PostgREST schema cache reload.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verification after reset.
SELECT
  'Soundpub_schema_exists' AS check_name,
  EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'Soundpub') AS result
UNION ALL
SELECT
  'Soundpub_profiles_table_exists' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'Soundpub' AND table_name = 'profiles'
  ) AS result;


