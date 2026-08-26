-- =============================================
-- Soundpub: IMPLEMENT ADMIN FEE DISTRIBUTION
-- Migration: 30-implement-admin-fee-distribution.sql
-- Date: 2026-07-28
-- Purpose: Credit 9% admin fee to Soundpub Company profile
-- =============================================

BEGIN;

-- =============================================
-- STEP 1: Add admin_revenue column to profiles
-- =============================================
ALTER TABLE Soundpub.profiles
ADD COLUMN IF NOT EXISTS admin_revenue DECIMAL(18, 2) DEFAULT 0;

COMMENT ON COLUMN Soundpub.profiles.admin_revenue IS 
'Admin/platform fee revenue (9% of royalties). Only used for company/superadmin accounts.';

-- =============================================
-- STEP 2: Create Soundpub Company profile
-- =============================================

-- Generate a fixed UUID for the company profile
-- Using a deterministic UUID based on "Soundpub-company"
DO $$
DECLARE
  company_profile_id UUID := 'a0000000-0000-0000-0000-000000000001'::UUID;
  company_email TEXT := 'company@Soundpub.com';
  company_exists BOOLEAN;
BEGIN
  -- Check if profile already exists
  SELECT EXISTS (
    SELECT 1 FROM Soundpub.profiles WHERE id = company_profile_id
  ) INTO company_exists;

  IF NOT company_exists THEN
    -- Create auth user first (if needed for FK constraint)
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      role
    ) VALUES (
      company_profile_id,
      '00000000-0000-0000-0000-000000000000',
      company_email,
      crypt('Soundpub-COMPANY-2026', gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Soundpub Company"}'::jsonb,
      false,
      'authenticated'
    )
    ON CONFLICT (id) DO NOTHING;

    -- Create profile
    INSERT INTO Soundpub.profiles (
      id,
      email,
      full_name,
      status,
      balance,
      artist_revenue,
      label_revenue,
      admin_revenue,
      created_at,
      updated_at
    ) VALUES (
      company_profile_id,
      company_email,
      'Soundpub Company',
      'active',
      0,
      0,
      0,
      0,
      now(),
      now()
    )
    ON CONFLICT (id) DO NOTHING;

    -- Assign superadmin role
    INSERT INTO Soundpub.user_roles (user_id, role)
    VALUES (company_profile_id, 'superadmin')
    ON CONFLICT (user_id) DO NOTHING;

    RAISE NOTICE 'Soundpub Company profile created: %', company_profile_id;
  ELSE
    RAISE NOTICE 'Soundpub Company profile already exists: %', company_profile_id;
  END IF;
END $$;

-- =============================================
-- STEP 3: Store company profile ID in app_settings
-- =============================================
INSERT INTO Soundpub.app_settings (key, value, description, value_type)
VALUES (
  'Soundpub_company_profile_id',
  'a0000000-0000-0000-0000-000000000001',
  'UUID of the Soundpub Company profile where admin fees (9%) are credited',
  'uuid'
)
ON CONFLICT (key) DO UPDATE 
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = now();

-- =============================================
-- STEP 4: Rebuild all balances INCLUDING admin fee
-- =============================================

-- 4.1: Reset all balances to 0
UPDATE Soundpub.profiles
SET 
  balance = 0,
  artist_revenue = 0,
  label_revenue = 0,
  admin_revenue = 0,
  updated_at = now()
WHERE true;

-- 4.2: Rebuild artist balances
UPDATE Soundpub.profiles p
SET 
  artist_revenue = COALESCE(artist_totals.total, 0),
  balance = COALESCE(artist_totals.total, 0),
  updated_at = now()
FROM (
  SELECT 
    artist_user_id,
    SUM(artist_revenue) AS total
  FROM Soundpub.royalties
  WHERE artist_user_id IS NOT NULL
  GROUP BY artist_user_id
) artist_totals
WHERE p.id = artist_totals.artist_user_id;

-- 4.3: Rebuild label balances
UPDATE Soundpub.profiles p
SET 
  label_revenue = COALESCE(label_totals.total, 0),
  balance = COALESCE(label_totals.total, 0),
  updated_at = now()
FROM (
  SELECT 
    label_user_id,
    SUM(label_revenue) AS total
  FROM Soundpub.royalties
  WHERE label_user_id IS NOT NULL
  GROUP BY label_user_id
) label_totals
WHERE p.id = label_totals.label_user_id;

-- 4.4: Rebuild admin fee balance (NEW!)
DO $$
DECLARE
  company_profile_id UUID := 'a0000000-0000-0000-0000-000000000001'::UUID;
  total_admin_fee DECIMAL(18, 2);
BEGIN
  -- Calculate total admin fees from all royalties
  SELECT COALESCE(SUM(Soundpub_revenue), 0)
  INTO total_admin_fee
  FROM Soundpub.royalties;

  -- Credit to Soundpub Company profile
  UPDATE Soundpub.profiles
  SET 
    admin_revenue = total_admin_fee,
    balance = total_admin_fee,
    updated_at = now()
  WHERE id = company_profile_id;

  RAISE NOTICE 'Admin fee credited: Rp %.2f to profile %', total_admin_fee, company_profile_id;
END $$;

-- =============================================
-- STEP 5: Create helper function to get company profile ID
-- =============================================
CREATE OR REPLACE FUNCTION Soundpub.get_company_profile_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = Soundpub
AS $$
DECLARE
  profile_id UUID;
BEGIN
  SELECT value::UUID
  INTO profile_id
  FROM Soundpub.app_settings
  WHERE key = 'Soundpub_company_profile_id';
  
  RETURN profile_id;
END;
$$;

COMMENT ON FUNCTION Soundpub.get_company_profile_id() IS
'Returns the UUID of the Soundpub Company profile where admin fees are credited';

-- =============================================
-- STEP 6: Verification queries
-- =============================================

-- Show company profile balance
SELECT 
  '=== Soundpub COMPANY PROFILE ===' AS section,
  id,
  full_name,
  email,
  balance,
  admin_revenue,
  artist_revenue,
  label_revenue
FROM Soundpub.profiles
WHERE id = 'a0000000-0000-0000-0000-000000000001'::UUID;

-- Show total admin fees from royalties
SELECT 
  '=== TOTAL ADMIN FEES ===' AS section,
  COUNT(*) AS total_royalty_rows,
  SUM(net_revenue) AS total_gross_revenue,
  SUM(artist_revenue) AS total_artist_share,
  SUM(label_revenue) AS total_label_share,
  SUM(Soundpub_revenue) AS total_admin_fee,
  ROUND((SUM(Soundpub_revenue) / NULLIF(SUM(net_revenue), 0) * 100)::NUMERIC, 2) AS admin_fee_percentage
FROM Soundpub.royalties;

-- Show admin fees per period
SELECT 
  '=== ADMIN FEES PER PERIOD ===' AS section,
  period,
  SUM(Soundpub_revenue) AS admin_fee,
  SUM(net_revenue) AS gross_revenue,
  ROUND((SUM(Soundpub_revenue) / NULLIF(SUM(net_revenue), 0) * 100)::NUMERIC, 2) AS fee_percentage
FROM Soundpub.royalties
GROUP BY period
ORDER BY period DESC
LIMIT 10;

-- Verify balance accuracy
SELECT 
  '=== BALANCE VERIFICATION ===' AS section,
  role::text,
  COUNT(*) AS user_count,
  SUM(balance) AS total_balance,
  SUM(artist_revenue) AS total_artist_revenue,
  SUM(label_revenue) AS total_label_revenue,
  SUM(admin_revenue) AS total_admin_revenue
FROM Soundpub.profiles p
JOIN Soundpub.user_roles ur ON ur.user_id = p.id
GROUP BY role
ORDER BY role::text;

COMMIT;

-- =============================================
-- MANUAL VERIFICATION STEPS
-- =============================================
-- 1. Check company profile exists:
--    SELECT * FROM Soundpub.profiles WHERE id = 'a0000000-0000-0000-0000-000000000001'::UUID;
--
-- 2. Check admin_revenue is populated:
--    SELECT admin_revenue FROM Soundpub.profiles WHERE id = 'a0000000-0000-0000-0000-000000000001'::UUID;
--
-- 3. Check total admin fees match:
--    SELECT SUM(Soundpub_revenue) FROM Soundpub.royalties;
--
-- 4. Test balance rebuild:
--    SELECT Soundpub.get_company_profile_id();
--
-- 5. Check app_settings:
--    SELECT * FROM Soundpub.app_settings WHERE key = 'Soundpub_company_profile_id';

-- =============================================
-- ROLLBACK (if needed)
-- =============================================
-- DROP FUNCTION IF EXISTS Soundpub.get_company_profile_id();
-- DELETE FROM Soundpub.app_settings WHERE key = 'Soundpub_company_profile_id';
-- DELETE FROM Soundpub.user_roles WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::UUID;
-- DELETE FROM Soundpub.profiles WHERE id = 'a0000000-0000-0000-0000-000000000001'::UUID;
-- DELETE FROM auth.users WHERE id = 'a0000000-0000-0000-0000-000000000001'::UUID;
-- ALTER TABLE Soundpub.profiles DROP COLUMN IF EXISTS admin_revenue;
