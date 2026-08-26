-- AUTO-SYNC PROFILE BALANCE TRIGGER
-- This trigger automatically updates profile.balance, artist_revenue, and label_revenue
-- whenever royalties are inserted, updated, or deleted.
-- Run after 30-implement-admin-fee-distribution.sql

-- Connect as superuser or ensure proper permissions
-- SET ROLE postgres; -- Uncomment if needed

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS sync_profile_balance_on_royalty_change ON Soundpub.royalties;
DROP FUNCTION IF EXISTS Soundpub.sync_profile_balance_from_royalties();

-- Create the trigger function
CREATE OR REPLACE FUNCTION Soundpub.sync_profile_balance_from_royalties()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO Soundpub, public, pg_catalog
AS $$
DECLARE
  affected_artist_id uuid;
  affected_label_id uuid;
BEGIN
  -- Collect affected user IDs from OLD and NEW
  IF TG_OP = 'DELETE' THEN
    affected_artist_id := OLD.artist_user_id;
    affected_label_id := OLD.label_user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    affected_artist_id := COALESCE(NEW.artist_user_id, OLD.artist_user_id);
    affected_label_id := COALESCE(NEW.label_user_id, OLD.label_user_id);
  ELSE -- INSERT
    affected_artist_id := NEW.artist_user_id;
    affected_label_id := NEW.label_user_id;
  END IF;

  -- Update artist profile balance
  IF affected_artist_id IS NOT NULL THEN
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
      WHERE artist_user_id = affected_artist_id
      GROUP BY artist_user_id
    ) artist_totals
    WHERE p.id = artist_totals.artist_user_id;
    
    -- If no royalties left, reset to 0
    IF NOT FOUND THEN
      UPDATE Soundpub.profiles
      SET 
        artist_revenue = 0,
        balance = 0,
        updated_at = now()
      WHERE id = affected_artist_id
        AND EXISTS (
          SELECT 1 FROM Soundpub.user_roles 
          WHERE user_id = affected_artist_id AND role = 'artist'
        );
    END IF;
  END IF;

  -- Update label profile balance
  IF affected_label_id IS NOT NULL THEN
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
      WHERE label_user_id = affected_label_id
      GROUP BY label_user_id
    ) label_totals
    WHERE p.id = label_totals.label_user_id;
    
    -- If no royalties left, reset to 0
    IF NOT FOUND THEN
      UPDATE Soundpub.profiles
      SET 
        label_revenue = 0,
        balance = 0,
        updated_at = now()
      WHERE id = affected_label_id
        AND EXISTS (
          SELECT 1 FROM Soundpub.user_roles 
          WHERE user_id = affected_label_id AND role IN ('label', 'whitelabel')
        );
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Create the trigger
CREATE TRIGGER sync_profile_balance_on_royalty_change
AFTER INSERT OR UPDATE OR DELETE ON Soundpub.royalties
FOR EACH ROW
EXECUTE FUNCTION Soundpub.sync_profile_balance_from_royalties();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION Soundpub.sync_profile_balance_from_royalties() TO anon, authenticated, service_role;

-- Rebuild all existing balances to ensure consistency
DO $$
BEGIN
  -- Reset all balances to 0
  UPDATE Soundpub.profiles
  SET 
    balance = 0,
    artist_revenue = 0,
    label_revenue = 0,
    updated_at = now()
  WHERE true;

  -- Rebuild artist balances
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

  -- Rebuild label balances
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

  -- Report summary
  RAISE NOTICE 'Profile Balance Sync Completed';
END;
$$;

-- Verify the sync
SELECT 
  'Profile Balance Sync Completed' AS status,
  COUNT(*) AS total_profiles_updated,
  SUM(balance)::numeric(16,2) AS total_balance,
  SUM(artist_revenue)::numeric(16,2) AS total_artist_revenue,
  SUM(label_revenue)::numeric(16,2) AS total_label_revenue
FROM Soundpub.profiles
WHERE balance > 0 OR artist_revenue > 0 OR label_revenue > 0;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
