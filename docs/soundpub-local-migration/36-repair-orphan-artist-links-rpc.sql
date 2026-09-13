-- 36-repair-orphan-artist-links-rpc.sql
-- Purpose:
--   Add a safe, per-item repair function for /dashboard/users/orphan-audit.
--   This function does NOT move historical royalties to another label.
--
-- Safe repairs supported:
--   1) RELEASE_WITHOUT_ARTIST_USER_ID
--      Exact-match artist profile by full_name under the release label, then fill releases.artist_user_id.
--   2) ARTIST_WITHOUT_PARENT_LABEL
--      Assign artist profile parent_label_id to the related label from existing release/track/royalty data.
--
-- Not repaired intentionally:
--   ARTIST_LABEL_MISMATCH where rows are historical royalties/release ownership.
--   Per current policy, old royalties stay with the old label.

BEGIN;

CREATE OR REPLACE FUNCTION Soundpub.repair_orphan_artist_link(
  _issue_type text,
  _profile_id uuid DEFAULT NULL,
  _full_name text DEFAULT NULL,
  _related_label_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = Soundpub, public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  is_admin boolean := false;
  matched_artist_id uuid;
  matched_artist_count integer := 0;
  updated_releases integer := 0;
  updated_tracks integer := 0;
  inserted_artist_helper boolean := false;
  artist_name text;
  label_name text;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM Soundpub.user_roles ur
    WHERE ur.user_id = current_user_id
      AND ur.role::text IN ('admin', 'superadmin')
  ) INTO is_admin;

  IF NOT is_admin THEN
    RAISE EXCEPTION 'Only admin or superadmin can repair orphan artist links';
  END IF;

  IF _issue_type = 'RELEASE_WITHOUT_ARTIST_USER_ID' THEN
    IF NULLIF(trim(_full_name), '') IS NULL OR _related_label_id IS NULL THEN
      RAISE EXCEPTION 'full_name and related_label_id are required for RELEASE_WITHOUT_ARTIST_USER_ID repair';
    END IF;

    SELECT count(*), min(p.id)
    INTO matched_artist_count, matched_artist_id
    FROM Soundpub.profiles p
    WHERE p.parent_label_id = _related_label_id
      AND lower(trim(p.full_name)) = lower(trim(_full_name))
      AND EXISTS (
        SELECT 1
        FROM Soundpub.user_roles ur
        WHERE ur.user_id = p.id
          AND ur.role::text = 'artist'
      )
      AND lower(coalesce(p.status, '')) NOT IN ('suspended', 'deleted');

    IF matched_artist_count = 0 THEN
      RAISE EXCEPTION 'No matching artist profile found under this label for %', _full_name;
    END IF;

    IF matched_artist_count > 1 THEN
      RAISE EXCEPTION 'Multiple matching artist profiles found under this label for %. Repair manually.', _full_name;
    END IF;

    UPDATE Soundpub.releases r
    SET artist_user_id = matched_artist_id
    WHERE r.artist_user_id IS NULL
      AND r.label_id = _related_label_id
      AND lower(trim(r.artist_name)) = lower(trim(_full_name));

    GET DIAGNOSTICS updated_releases = ROW_COUNT;

    UPDATE Soundpub.tracks t
    SET artist_user_id = matched_artist_id
    FROM Soundpub.releases r
    WHERE t.release_id = r.id
      AND t.artist_user_id IS NULL
      AND r.artist_user_id = matched_artist_id
      AND r.label_id = _related_label_id;

    GET DIAGNOSTICS updated_tracks = ROW_COUNT;

    SELECT p.full_name INTO artist_name FROM Soundpub.profiles p WHERE p.id = matched_artist_id;
    SELECT p.full_name INTO label_name FROM Soundpub.profiles p WHERE p.id = _related_label_id;

    INSERT INTO Soundpub.audit_logs (action, actor_id, target_id, target_type, details)
    VALUES (
      'orphan_artist_link_repaired',
      current_user_id,
      matched_artist_id,
      'user',
      jsonb_build_object(
        'issue_type', _issue_type,
        'artist_name', artist_name,
        'label_id', _related_label_id,
        'label_name', label_name,
        'updated_releases', updated_releases,
        'updated_tracks', updated_tracks,
        'royalty_policy', 'historical royalties unchanged'
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'issue_type', _issue_type,
      'artist_user_id', matched_artist_id,
      'updated_releases', updated_releases,
      'updated_tracks', updated_tracks,
      'updated_royalties', 0,
      'message', 'Release artist_user_id repaired. Historical royalties unchanged.'
    );
  END IF;

  IF _issue_type = 'ARTIST_WITHOUT_PARENT_LABEL' THEN
    IF _profile_id IS NULL OR _related_label_id IS NULL THEN
      RAISE EXCEPTION 'profile_id and related_label_id are required for ARTIST_WITHOUT_PARENT_LABEL repair';
    END IF;

    SELECT p.full_name INTO artist_name
    FROM Soundpub.profiles p
    WHERE p.id = _profile_id
      AND p.parent_label_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM Soundpub.user_roles ur
        WHERE ur.user_id = p.id
          AND ur.role::text = 'artist'
      );

    IF artist_name IS NULL THEN
      RAISE EXCEPTION 'Artist profile not found, not artist role, or already has parent_label_id';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM Soundpub.user_roles ur
      WHERE ur.user_id = _related_label_id
        AND ur.role::text IN ('label', 'whitelabel')
    ) THEN
      RAISE EXCEPTION 'related_label_id is not a label/whitelabel';
    END IF;

    UPDATE Soundpub.profiles
    SET parent_label_id = _related_label_id
    WHERE id = _profile_id
      AND parent_label_id IS NULL;

    GET DIAGNOSTICS updated_releases = ROW_COUNT;

    INSERT INTO Soundpub.artists (name, label_id)
    SELECT artist_name, _related_label_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM Soundpub.artists a
      WHERE a.label_id = _related_label_id
        AND lower(trim(a.name)) = lower(trim(artist_name))
    );

    GET DIAGNOSTICS updated_tracks = ROW_COUNT;
    inserted_artist_helper := updated_tracks > 0;

    SELECT p.full_name INTO label_name FROM Soundpub.profiles p WHERE p.id = _related_label_id;

    INSERT INTO Soundpub.audit_logs (action, actor_id, target_id, target_type, details)
    VALUES (
      'orphan_artist_link_repaired',
      current_user_id,
      _profile_id,
      'user',
      jsonb_build_object(
        'issue_type', _issue_type,
        'artist_name', artist_name,
        'label_id', _related_label_id,
        'label_name', label_name,
        'parent_label_updated', true,
        'artist_helper_inserted', inserted_artist_helper,
        'royalty_policy', 'historical royalties unchanged'
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'issue_type', _issue_type,
      'artist_user_id', _profile_id,
      'updated_parent_label', true,
      'inserted_artist_helper', inserted_artist_helper,
      'updated_royalties', 0,
      'message', 'Artist parent_label_id repaired. Historical royalties unchanged.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', false,
    'issue_type', _issue_type,
    'updated_royalties', 0,
    'message', 'This issue type is audit-only under the current policy. Historical royalties stay with the old label.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION Soundpub.repair_orphan_artist_link(text, uuid, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Test examples after running:
-- SELECT Soundpub.repair_orphan_artist_link('RELEASE_WITHOUT_ARTIST_USER_ID', NULL, 'Rio Fiendy', '2408459a-d132-42a1-b267-d0b340f5d00f');
-- SELECT Soundpub.repair_orphan_artist_link('ARTIST_WITHOUT_PARENT_LABEL', '37e238fb-3240-4aa5-bdf0-ded917b523bd', NULL, '8825a7dd-7c3a-4878-8f6a-cb9554eaa6cf');
