-- =============================================
-- SOUNDPUB INITIAL SEED
-- Execute after SOUNDPUB_RESET_AND_RECREATE.sql
-- =============================================

-- Default application settings
INSERT INTO soundpub.app_settings (key, value) VALUES
('dashboard_logo', null),
('ga4_enabled', 'false'),
('gcs_enabled', 'false'),
('release_pricing_mode', 'per_track'),
('release_price_per_track', '50000'),
('release_price_single', '50000'),
('release_price_ep', '150000'),
('release_price_album', '300000')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = now();

-- =============================================
-- ADMIN ROLE TEMPLATE
-- =============================================
-- Step 1: Create admin user from Supabase Auth UI first.
-- Step 2: Replace admin@example.com below with the real admin email.
-- Step 3: Run only this block after the user exists in auth.users.

-- Example:
-- WITH target_user AS (
--   SELECT id, email
--   FROM auth.users
--   WHERE email = 'admin@example.com'
--   LIMIT 1
-- ), upsert_profile AS (
--   INSERT INTO soundpub.profiles (id, email, full_name, status)
--   SELECT id, email, 'SoundPub Admin', 'active'
--   FROM target_user
--   ON CONFLICT (id) DO UPDATE SET
--     email = EXCLUDED.email,
--     full_name = EXCLUDED.full_name,
--     status = EXCLUDED.status,
--     updated_at = now()
--   RETURNING id
-- )
-- INSERT INTO soundpub.user_roles (user_id, role)
-- SELECT id, 'superadmin'::soundpub.app_role
-- FROM upsert_profile
-- ON CONFLICT (user_id, role) DO NOTHING;