-- BACKEND_ONLY_RLS_OPTIONAL: existing private backend tables and privileges.
-- Historical unresolved catalog identity remains NULL, never guessed from names/email.
ALTER TABLE soundpub.royalty_import_entries
  ADD COLUMN artist_id uuid REFERENCES soundpub.artists(id) ON DELETE RESTRICT,
  ADD COLUMN financial_owner_user_id uuid REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT;
ALTER TABLE soundpub.royalty_import_entries DISABLE TRIGGER royalty_entries_immutable;
UPDATE soundpub.royalty_import_entries e
SET artist_id=a.id, financial_owner_user_id=e.beneficiary_id
FROM soundpub.tracks t JOIN soundpub.releases r ON r.id=t.release_id
JOIN soundpub.artists a ON a.id=r.artist_id AND a.id=t.artist_id
WHERE e.track_id=t.id AND e.release_id=r.id
  AND a.management_mode='LOGIN_ACCOUNT' AND a.artist_user_id=e.beneficiary_id;
-- Preserve existing financial ownership even when catalog mapping cannot be resolved.
UPDATE soundpub.royalty_import_entries
SET financial_owner_user_id=beneficiary_id WHERE financial_owner_user_id IS NULL;
ALTER TABLE soundpub.royalty_import_entries ENABLE TRIGGER royalty_entries_immutable;
ALTER TABLE soundpub.royalty_import_entries
  ALTER COLUMN financial_owner_user_id SET NOT NULL,
  ADD CONSTRAINT royalty_entry_owner_snapshot CHECK (beneficiary_id=financial_owner_user_id);
CREATE INDEX royalty_entry_owner_artist_period ON soundpub.royalty_import_entries
  (financial_owner_user_id,artist_id,period,release_id);

CREATE FUNCTION soundpub.royalty_attribution_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE expected_owner uuid; custom_unit uuid;
BEGIN
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
  -- Lock nullable join separately so archive cannot race posting.
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
REVOKE ALL ON FUNCTION soundpub.royalty_attribution_guard() FROM PUBLIC,soundpub_app;
CREATE TRIGGER royalty_attribution_guard BEFORE INSERT ON soundpub.royalty_import_entries
  FOR EACH ROW EXECUTE FUNCTION soundpub.royalty_attribution_guard();
-- Existing table INSERT grant covers additive columns. UPDATE/DELETE remain forbidden.
-- Payout reconciliation intentionally remains closed: batches have immutable UNRECONCILED status.
-- No approval state is invented here; durable evidence + independent approval workflow remains required.

-- Defense in depth: a custom PIC can never allocate a payout from roster accounts.
CREATE FUNCTION soundpub.custom_payout_allocation_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE payout_owner uuid;
BEGIN
  SELECT user_id INTO payout_owner FROM soundpub.payout_requests WHERE id=NEW.payout_id;
  IF EXISTS(SELECT 1 FROM soundpub.user_roles WHERE user_id=payout_owner AND role='label_custom') THEN
    IF NEW.owner_id IS DISTINCT FROM payout_owner OR NOT EXISTS(
      SELECT 1 FROM soundpub.label_custom_units unit JOIN soundpub.backend_users u ON u.id=unit.owner_user_id
      WHERE unit.owner_user_id=payout_owner AND unit.status='active' AND u.status='active'
    ) THEN
      RAISE EXCEPTION 'PIC_ACCOUNT_ONLY' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.custom_payout_allocation_guard() FROM PUBLIC,soundpub_app;
CREATE TRIGGER custom_payout_allocation_guard BEFORE INSERT ON soundpub.payout_allocations
  FOR EACH ROW EXECUTE FUNCTION soundpub.custom_payout_allocation_guard();
