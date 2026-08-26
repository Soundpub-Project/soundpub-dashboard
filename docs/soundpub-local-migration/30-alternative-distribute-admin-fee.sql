-- Alternative: Distribute admin fee to ALL admin/superadmin profiles
-- Location: docs/Soundpub-local-migration/30-alternative-distribute-admin-fee.sql

BEGIN;

-- 1. Add admin_revenue column (same as before)
ALTER TABLE Soundpub.profiles
ADD COLUMN IF NOT EXISTS admin_revenue DECIMAL(18, 2) DEFAULT 0;

-- 2. NO need to create company profile (skip this step)

-- 3. Rebuild balances INCLUDING admin fee distribution
DO $$
DECLARE
  total_admin_fee DECIMAL(18,2);
  admin_count INTEGER;
  admin_share DECIMAL(18,2);
BEGIN
  -- Calculate total admin fees
  SELECT COALESCE(SUM(Soundpub_revenue), 0) INTO total_admin_fee
  FROM Soundpub.royalties;
  
  -- Count active admin/superadmin
  SELECT COUNT(*) INTO admin_count
  FROM Soundpub.user_roles
  WHERE role IN ('admin', 'superadmin');
  
  -- Calculate share per admin
  IF admin_count > 0 THEN
    admin_share := total_admin_fee / admin_count;
    
    -- Distribute to all admin/superadmin
    UPDATE Soundpub.profiles p
    SET 
      admin_revenue = admin_share,
      balance = balance + admin_share,
      updated_at = now()
    FROM Soundpub.user_roles ur
    WHERE ur.user_id = p.id
      AND ur.role IN ('admin', 'superadmin');
    
    RAISE NOTICE 'Admin fee distributed: Rp %.2f to % admins', admin_share, admin_count;
  END IF;
END $$;

COMMIT;

-- Verification
SELECT 
  p.id,
  p.full_name,
  ur.role::text,
  p.balance,
  p.admin_revenue
FROM Soundpub.profiles p
JOIN Soundpub.user_roles ur ON ur.user_id = p.id
WHERE ur.role IN ('admin', 'superadmin');
