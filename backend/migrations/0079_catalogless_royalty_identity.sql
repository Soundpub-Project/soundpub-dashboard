-- Royalty rows may precede catalog delivery. Do not invent a release or track.
ALTER TABLE soundpub.royalty_import_entries
  ALTER COLUMN release_id DROP NOT NULL,
  ALTER COLUMN track_id DROP NOT NULL,
  ADD COLUMN source_title text,
  ADD COLUMN source_artist text,
  ADD COLUMN source_label text,
  ADD CONSTRAINT royalty_entry_catalogless_shape CHECK (
    (release_id IS NOT NULL AND track_id IS NOT NULL)
    OR (release_id IS NULL AND track_id IS NULL AND artist_id IS NOT NULL
      AND source_isrc IS NOT NULL
      AND source_artist IS NOT NULL AND source_label IS NOT NULL
      AND length(btrim(source_artist)) BETWEEN 1 AND 200
      AND length(btrim(source_label)) BETWEEN 1 AND 200)
  ),
  ADD CONSTRAINT royalty_entry_source_title_length CHECK (
    source_title IS NULL OR length(btrim(source_title)) BETWEEN 1 AND 200
  );

CREATE OR REPLACE FUNCTION soundpub.royalty_attribution_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE expected_owner uuid; custom_unit uuid;
BEGIN
  IF NEW.track_id IS NULL AND NEW.release_id IS NULL THEN
    SELECT CASE WHEN a.management_mode='LABEL_CUSTOM_MANAGED' THEN unit.owner_user_id
      ELSE a.artist_user_id END INTO expected_owner
    FROM soundpub.artists a
    LEFT JOIN soundpub.label_custom_units unit ON unit.id=a.label_custom_unit_id AND unit.status='active'
    LEFT JOIN soundpub.profiles artist_profile ON artist_profile.id=a.artist_user_id
    JOIN soundpub.backend_users u ON u.id=CASE WHEN a.management_mode='LABEL_CUSTOM_MANAGED'
      THEN unit.owner_user_id ELSE a.artist_user_id END AND u.status='active'
    JOIN soundpub.backend_users label_user ON label_user.id=a.label_id AND label_user.status='active'
    JOIN soundpub.profiles label_profile ON label_profile.id=a.label_id
    WHERE a.id=NEW.artist_id AND a.label_id=NEW.label_owner_user_id AND a.verified_at IS NOT NULL
      AND lower(regexp_replace(btrim(a.name),'[[:space:]]+',' ','g'))=
        lower(regexp_replace(btrim(NEW.source_artist),'[[:space:]]+',' ','g'))
      AND lower(regexp_replace(btrim(label_profile.full_name),'[[:space:]]+',' ','g'))=
        lower(regexp_replace(btrim(NEW.source_label),'[[:space:]]+',' ','g'))
      AND ((a.management_mode='LOGIN_ACCOUNT' AND artist_profile.parent_label_id=a.label_id
        AND EXISTS (SELECT 1 FROM soundpub.user_roles role WHERE role.user_id=u.id
          AND role.role='artist' AND role.verified_at IS NOT NULL)
        AND EXISTS (SELECT 1 FROM soundpub.user_roles role WHERE role.user_id=label_user.id
          AND role.role IN ('label','whitelabel') AND role.verified_at IS NOT NULL))
      OR (a.management_mode='LABEL_CUSTOM_MANAGED' AND unit.owner_user_id=a.label_id
        AND EXISTS (SELECT 1 FROM soundpub.user_roles role WHERE role.user_id=u.id
          AND role.role='label_custom' AND role.verified_at IS NOT NULL)))
    FOR SHARE OF a,u,label_user,label_profile;
    IF expected_owner IS NULL OR NEW.financial_owner_user_id IS DISTINCT FROM expected_owner
      OR NEW.beneficiary_id IS DISTINCT FROM expected_owner THEN
      RAISE EXCEPTION 'ROYALTY_OWNER_MAPPING_REQUIRED' USING ERRCODE='23514';
    END IF;
    SELECT unit.id INTO custom_unit FROM soundpub.label_custom_units unit JOIN soundpub.artists a
      ON a.label_custom_unit_id=unit.id WHERE a.id=NEW.artist_id AND unit.status='active'
      FOR SHARE OF unit;
    IF EXISTS(SELECT 1 FROM soundpub.artists WHERE id=NEW.artist_id AND management_mode='LABEL_CUSTOM_MANAGED')
      AND custom_unit IS NULL THEN
      RAISE EXCEPTION 'ACTIVE_PIC_UNIT_REQUIRED' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT CASE WHEN a.management_mode='LABEL_CUSTOM_MANAGED' THEN unit.owner_user_id
    ELSE a.artist_user_id END INTO expected_owner
  FROM soundpub.tracks t JOIN soundpub.releases r ON r.id=t.release_id
  JOIN soundpub.artists a ON a.id=r.artist_id AND a.id=t.artist_id
  LEFT JOIN soundpub.label_custom_units unit ON unit.id=a.label_custom_unit_id
  JOIN soundpub.backend_users u ON u.id=CASE WHEN a.management_mode='LABEL_CUSTOM_MANAGED'
    THEN unit.owner_user_id ELSE a.artist_user_id END
  WHERE t.id=NEW.track_id AND r.id=NEW.release_id AND a.id=NEW.artist_id AND u.status='active'
    AND ((a.management_mode='LOGIN_ACCOUNT' AND a.artist_user_id=COALESCE(t.artist_user_id,r.artist_user_id))
      OR (a.management_mode='LABEL_CUSTOM_MANAGED' AND unit.status='active'
        AND a.label_id=unit.owner_user_id AND r.label_id=unit.owner_user_id
        AND t.artist_user_id IS NULL AND r.artist_user_id IS NULL
        AND EXISTS(SELECT 1 FROM soundpub.user_roles ur WHERE ur.user_id=u.id AND ur.role='label_custom')))
  FOR SHARE OF t,r,a,u;
  IF expected_owner IS NULL OR NEW.financial_owner_user_id IS DISTINCT FROM expected_owner
    OR NEW.beneficiary_id IS DISTINCT FROM expected_owner THEN
    RAISE EXCEPTION 'ROYALTY_OWNER_MAPPING_REQUIRED' USING ERRCODE='23514';
  END IF;
  SELECT unit.id INTO custom_unit FROM soundpub.label_custom_units unit JOIN soundpub.artists a
    ON a.label_custom_unit_id=unit.id WHERE a.id=NEW.artist_id AND unit.status='active'
    FOR SHARE OF unit;
  IF EXISTS(SELECT 1 FROM soundpub.artists WHERE id=NEW.artist_id AND management_mode='LABEL_CUSTOM_MANAGED')
    AND custom_unit IS NULL THEN
    RAISE EXCEPTION 'ACTIVE_PIC_UNIT_REQUIRED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION soundpub.royalty_label_owner_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE expected_label uuid;
BEGIN
  IF NEW.release_id IS NULL THEN
    SELECT artist.label_id INTO expected_label FROM soundpub.artists artist
    WHERE artist.id=NEW.artist_id FOR SHARE;
  ELSE
    SELECT release.label_id INTO expected_label FROM soundpub.releases release
    WHERE release.id=NEW.release_id FOR SHARE;
  END IF;
  IF expected_label IS NULL OR NEW.label_owner_user_id IS DISTINCT FROM expected_label THEN
    RAISE EXCEPTION 'ROYALTY_LABEL_OWNER_MAPPING_REQUIRED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;