-- =============================================
-- HARD RESET SOUNDPUB LOCAL DATABASE
-- Target Supabase: Local/self-hosted
-- Target schema: soundpub
--
-- WARNING:
--   This script removes ALL SoundPub data in schema `soundpub`.
--   It also removes auth.users rows whose id exists in soundpub.profiles.
--   It does NOT drop other project schemas in the same Postgres instance.
--
-- Recommended use:
--   1) Run this file first.
--   2) Run 01-reset-and-recreate-soundpub.sql.
--   3) Run 02 through 19 in order.
--   4) Run pnpm import:csv from docs/soundpub-local-migration.
-- =============================================

BEGIN;

-- Keep a copy of SoundPub auth user IDs before dropping the schema.
CREATE TEMP TABLE IF NOT EXISTS _soundpub_reset_auth_users (
  id uuid PRIMARY KEY
) ON COMMIT DROP;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'soundpub'
      AND table_name = 'profiles'
  ) THEN
    INSERT INTO _soundpub_reset_auth_users (id)
    SELECT id
    FROM soundpub.profiles
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;


-- Storage cleanup note:
-- Supabase Storage blocks direct DELETE from storage.objects/storage.buckets via SQL.
-- If storage cleanup is needed, delete objects via Storage API or Dashboard after this reset.
-- This hard reset intentionally skips direct storage table deletion.

-- Drop the SoundPub application schema completely.
DROP SCHEMA IF EXISTS soundpub CASCADE;

-- Remove auth identities and auth users that belonged to SoundPub.
-- This prevents duplicate-email errors on the next CSV import / user recreation.
DELETE FROM auth.identities
WHERE user_id::text IN (SELECT id::text FROM _soundpub_reset_auth_users);

DELETE FROM auth.sessions
WHERE user_id::text IN (SELECT id::text FROM _soundpub_reset_auth_users);

DELETE FROM auth.refresh_tokens
WHERE user_id::text IN (SELECT id::text FROM _soundpub_reset_auth_users);

DELETE FROM auth.mfa_factors
WHERE user_id::text IN (SELECT id::text FROM _soundpub_reset_auth_users);

DELETE FROM auth.users
WHERE id IN (SELECT id FROM _soundpub_reset_auth_users);

-- Force PostgREST schema cache reload.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verification after reset.
SELECT
  'soundpub_schema_exists' AS check_name,
  EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'soundpub') AS result
UNION ALL
SELECT
  'soundpub_profiles_table_exists' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'soundpub' AND table_name = 'profiles'
  ) AS result;


