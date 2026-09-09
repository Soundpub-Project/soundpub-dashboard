ALTER TABLE Soundpub.releases
  ADD COLUMN IF NOT EXISTS distribution_service text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS custom_label_name text,
  ADD COLUMN IF NOT EXISTS custom_record_name text,
  ADD COLUMN IF NOT EXISTS price_per_track_snapshot numeric,
  ADD COLUMN IF NOT EXISTS total_payment_snapshot numeric;

ALTER TABLE Soundpub.releases
  DROP CONSTRAINT IF EXISTS releases_distribution_service_check;

ALTER TABLE Soundpub.releases
  ADD CONSTRAINT releases_distribution_service_check
  CHECK (distribution_service IN ('standard', 'custom_label'));

CREATE OR REPLACE FUNCTION Soundpub.is_soundpub_artist_for_release(_user_id uuid, _label_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO Soundpub, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM Soundpub.profiles artist
    JOIN Soundpub.user_roles artist_role
      ON artist_role.user_id = artist.id AND artist_role.role = 'artist'
    JOIN Soundpub.profiles label_profile
      ON label_profile.id = artist.parent_label_id
    JOIN Soundpub.user_roles label_role
      ON label_role.user_id = label_profile.id AND label_role.role = 'label'
    WHERE artist.id = _user_id
      AND artist.parent_label_id = _label_id
      AND COALESCE(lower(artist.status), 'active') NOT IN ('suspended', 'deleted')
      AND lower(regexp_replace(trim(label_profile.full_name), '\s+', ' ', 'g'))
        IN ('soundpub', 'soundpub music', 'soundpub music ecosystem')
  );
$$;

CREATE OR REPLACE FUNCTION Soundpub.enforce_release_distribution_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO Soundpub, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF NEW.distribution_service = 'custom_label' THEN
    IF v_user_id IS NULL
      OR NEW.created_by IS DISTINCT FROM v_user_id
      OR NOT Soundpub.is_soundpub_artist_for_release(v_user_id, NEW.label_id)
      OR NULLIF(btrim(NEW.custom_label_name), '') IS NULL
      OR NULLIF(btrim(NEW.custom_record_name), '') IS NULL THEN
      RAISE EXCEPTION 'Custom Label hanya tersedia untuk artis aktif di bawah label Soundpub dengan metadata lengkap';
    END IF;
  ELSE
    NEW.custom_label_name := NULL;
    NEW.custom_record_name := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_release_distribution_service ON Soundpub.releases;
CREATE TRIGGER enforce_release_distribution_service
BEFORE INSERT OR UPDATE OF distribution_service, custom_label_name, custom_record_name, label_id, created_by
ON Soundpub.releases
FOR EACH ROW EXECUTE FUNCTION Soundpub.enforce_release_distribution_service();

GRANT EXECUTE ON FUNCTION Soundpub.is_soundpub_artist_for_release(uuid, uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
