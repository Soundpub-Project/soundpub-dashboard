-- Script SQL untuk konfigurasi Google OAuth di Supabase Self-Hosted
-- Jalankan di Supabase Studio -> SQL Editor

-- 1. Enable Google OAuth provider
INSERT INTO auth.sso_providers (id, sso_provider_id, sso_domain)
VALUES (
  gen_random_uuid(),
  'google',
  'supabase.carubra.com'
) ON CONFLICT DO NOTHING;

-- 2. Configure Google OAuth settings
INSERT INTO auth.config (
  key,
  value,
  created_at,
  updated_at
) VALUES 
(
  'GOTRUE_EXTERNAL_GOOGLE_ENABLED',
  'true',
  NOW(),
  NOW()
),
(
  'GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID',
  'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
  NOW(),
  NOW()
),
(
  'GOTRUE_EXTERNAL_GOOGLE_SECRET',
  'YOUR_GOOGLE_CLIENT_SECRET',
  NOW(),
  NOW()
),
(
  'GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI',
  'https://supabase.carubra.com/auth/v1/callback',
  NOW(),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
