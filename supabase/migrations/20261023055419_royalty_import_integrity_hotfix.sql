BEGIN;
ALTER TABLE soundpub.royalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.royalty_uploads ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON soundpub.royalties FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON soundpub.royalty_uploads FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION soundpub.commit_royalty_upload(
  p_rows jsonb, p_actor_id uuid, p_filename text, p_original_filename text,
  p_replace_existing boolean DEFAULT false, p_replace_mode text DEFAULT 'filename_period',
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = soundpub, public AS $$
DECLARE
  v_upload soundpub.royalty_uploads%ROWTYPE;
  v_existing soundpub.royalty_uploads%ROWTYPE;
  v_row_count integer;
  v_replaced_rows integer := 0;
  v_replaced_uploads integer := 0;
  v_existing_period_rows integer := 0;
  v_replacement_rows integer := 0;
  v_periods text[];
  v_period text;
  v_invalid_count integer;
  v_removed_profile_share numeric := 0;
  v_new_profile_share numeric := 0;
  v_expected_balance_delta numeric := 0;
  v_actual_balance_delta numeric := 0;
  v_balance_updates jsonb := '[]'::jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('soundpub_royalty_financial_mutation'));
  IF p_actor_id IS NULL OR NOT soundpub.is_admin(p_actor_id) THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN RAISE EXCEPTION 'No royalty rows supplied'; END IF;
  IF NULLIF(btrim(p_filename), '') IS NULL OR NULLIF(btrim(p_original_filename), '') IS NULL THEN RAISE EXCEPTION 'Filename is required'; END IF;
  IF p_idempotency_key IS NULL OR NULLIF(btrim(p_idempotency_key), '') IS NULL THEN RAISE EXCEPTION 'Upload idempotency key is required'; END IF;

  SELECT * INTO v_existing FROM soundpub.royalty_uploads
  WHERE idempotency_key = btrim(p_idempotency_key) FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'success' THEN
      RETURN jsonb_build_object(
        'success', true, 'insertedCount', v_existing.inserted_records,
        'uploadId', v_existing.id, 'idempotentReplay', true,
        'replacedUploads', COALESCE((v_existing.summary->>'replaced_uploads')::integer, 0),
        'replacedRows', COALESCE((v_existing.summary->>'replaced_rows')::integer, 0),
        'managedArtistsCreated', 0, 'managedArtistsReused', 0,
        'balanceErrors', jsonb_build_array(),
        'balanceUpdates', COALESCE(v_existing.summary->'balance_updates', '[]'::jsonb),
        'totalErrors', 0
      );
    END IF;
    RAISE EXCEPTION 'Upload with this idempotency key is already being processed';
  END IF;

  WITH input_rows AS (SELECT value row_data FROM jsonb_array_elements(p_rows))
  SELECT COUNT(*) INTO v_invalid_count FROM input_rows
  WHERE NULLIF(btrim(row_data->>'period'), '') IS NULL
     OR NULLIF(btrim(row_data->>'isrc'), '') IS NULL
     OR NULLIF(btrim(row_data->>'platform'), '') IS NULL
     OR NULLIF(btrim(row_data->>'country'), '') IS NULL
     OR NULLIF(row_data->>'artist_user_id', '') IS NULL
     OR NULLIF(row_data->>'label_user_id', '') IS NULL
     OR COALESCE(jsonb_typeof(row_data->'sales_unit'), '') <> 'number'
     OR COALESCE(jsonb_typeof(row_data->'net_revenue'), '') <> 'number';
  IF v_invalid_count > 0 THEN RAISE EXCEPTION 'Royalty payload contains % invalid rows', v_invalid_count; END IF;

  SELECT ARRAY_AGG(DISTINCT btrim(value->>'period')), COUNT(DISTINCT btrim(value->>'period'))
  INTO v_periods, v_invalid_count FROM jsonb_array_elements(p_rows);
  IF v_invalid_count <> 1 THEN RAISE EXCEPTION 'Each upload must contain exactly one royalty period'; END IF;
  v_period := v_periods[1];
  IF v_period !~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Royalty period must use YYYY-MM format';
  END IF;

  WITH input_rows AS (
    SELECT upper(replace(btrim(value->>'isrc'), '-', '')) isrc,
      (value->>'artist_user_id')::uuid artist_user_id,
      (value->>'label_user_id')::uuid label_user_id
    FROM jsonb_array_elements(p_rows)
  )
  SELECT COUNT(*) INTO v_invalid_count
  FROM input_rows input
  LEFT JOIN soundpub.profiles artist_profile ON artist_profile.id = input.artist_user_id
  LEFT JOIN soundpub.profiles label_profile ON label_profile.id = input.label_user_id
  WHERE artist_profile.id IS NULL OR artist_profile.status IS DISTINCT FROM 'active'
     OR label_profile.id IS NULL OR label_profile.status IS DISTINCT FROM 'active'
     OR NOT EXISTS (
       SELECT 1 FROM soundpub.user_roles role
       WHERE role.user_id = input.artist_user_id AND role.role::text = 'artist'
     )
     OR NOT EXISTS (
       SELECT 1 FROM soundpub.user_roles role
       WHERE role.user_id = input.label_user_id
         AND role.role::text IN ('label', 'whitelabel', 'admin', 'superadmin')
     )
     OR NOT (
       (
         SELECT COUNT(*) FROM (
           SELECT DISTINCT release.label_id,
             COALESCE(track.artist_user_id, release.artist_user_id) artist_user_id
           FROM soundpub.tracks track
           JOIN soundpub.releases release ON release.id = track.release_id
           WHERE upper(replace(btrim(track.isrc), '-', '')) = input.isrc
             AND release.label_id IS NOT NULL
             AND COALESCE(track.artist_user_id, release.artist_user_id) IS NOT NULL
         ) catalog_pairs
       ) = 1
       AND EXISTS (
         SELECT 1 FROM soundpub.tracks track
         JOIN soundpub.releases release ON release.id = track.release_id
         WHERE upper(replace(btrim(track.isrc), '-', '')) = input.isrc
           AND release.label_id = input.label_user_id
           AND COALESCE(track.artist_user_id, release.artist_user_id) = input.artist_user_id
       )
       OR (
         NOT EXISTS (
           SELECT 1 FROM soundpub.tracks track
           JOIN soundpub.releases release ON release.id = track.release_id
           WHERE upper(replace(btrim(track.isrc), '-', '')) = input.isrc
             AND release.label_id IS NOT NULL
             AND COALESCE(track.artist_user_id, release.artist_user_id) IS NOT NULL
         )
         AND artist_profile.parent_label_id = input.label_user_id
       )
     );
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Royalty payload contains inactive, ambiguous, or catalog-conflicting recipients';
  END IF;

  WITH input_rows AS (
    SELECT (value->>'net_revenue')::numeric revenue, (value->>'sales_unit')::numeric units
    FROM jsonb_array_elements(p_rows)
  )
  SELECT COUNT(*), COALESCE(SUM(revenue - round(revenue * 0.09, 2)), 0)
  INTO v_invalid_count, v_new_profile_share FROM input_rows
  WHERE revenue < 0 OR revenue <> round(revenue, 2) OR units <> trunc(units)
     OR abs(revenue) > 9999999999999999.99 OR units < 0 OR units > 2147483647;
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Royalty amounts require nonnegative values, two decimal places, and nonnegative integer units';
  END IF;
  SELECT COALESCE(SUM((value->>'net_revenue')::numeric - round((value->>'net_revenue')::numeric * 0.09, 2)), 0)
  INTO v_new_profile_share FROM jsonb_array_elements(p_rows);

  SELECT COUNT(*), COALESCE(SUM(artist_revenue + label_revenue), 0)
  INTO v_existing_period_rows, v_removed_profile_share
  FROM soundpub.royalties WHERE period = v_period;

  IF p_replace_existing THEN
    IF p_replace_mode <> 'filename_period' THEN
      RAISE EXCEPTION 'Only exact filename and period replacement is permitted';
    END IF;
    SELECT COUNT(*) INTO v_replacement_rows
    FROM soundpub.royalties royalty
    JOIN soundpub.royalty_uploads upload ON upload.id = royalty.upload_id
    WHERE royalty.period = v_period AND upload.original_filename = p_original_filename;
    IF v_existing_period_rows = 0 OR v_replacement_rows <> v_existing_period_rows THEN
      RAISE EXCEPTION 'Replacement requires one existing period entirely owned by the same original filename: %', p_original_filename;
    END IF;
  ELSIF v_existing_period_rows > 0 THEN
    RAISE EXCEPTION 'Royalty period % already contains % rows; upload full corrected period with the exact same filename and confirmed replacement', v_period, v_existing_period_rows;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS royalty_balance_before (
    id uuid PRIMARY KEY, balance numeric
  ) ON COMMIT DROP;
  TRUNCATE royalty_balance_before;
  INSERT INTO royalty_balance_before SELECT id, balance FROM soundpub.profiles;

  CREATE TEMP TABLE IF NOT EXISTS royalty_expected_profile_delta (
    profile_id uuid PRIMARY KEY, delta numeric NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE royalty_expected_profile_delta;
  INSERT INTO royalty_expected_profile_delta(profile_id, delta)
  SELECT profile_id, SUM(amount) FROM (
    SELECT (value->>'artist_user_id')::uuid profile_id,
      round((value->>'net_revenue')::numeric * 0.70, 2) amount
    FROM jsonb_array_elements(p_rows)
    UNION ALL
    SELECT (value->>'label_user_id')::uuid,
      (value->>'net_revenue')::numeric - round((value->>'net_revenue')::numeric * 0.09, 2) - round((value->>'net_revenue')::numeric * 0.70, 2)
    FROM jsonb_array_elements(p_rows)
  ) allocation GROUP BY profile_id
  ON CONFLICT (profile_id) DO UPDATE
    SET delta = royalty_expected_profile_delta.delta + EXCLUDED.delta;
  IF p_replace_existing THEN
    INSERT INTO royalty_expected_profile_delta(profile_id, delta)
    SELECT profile_id, -SUM(amount) FROM (
      SELECT royalty.artist_user_id profile_id, royalty.artist_revenue amount
      FROM soundpub.royalties royalty
      JOIN soundpub.royalty_uploads upload ON upload.id = royalty.upload_id
      WHERE royalty.period = v_period AND upload.original_filename = p_original_filename
      UNION ALL
      SELECT royalty.label_user_id, royalty.label_revenue
      FROM soundpub.royalties royalty
      JOIN soundpub.royalty_uploads upload ON upload.id = royalty.upload_id
      WHERE royalty.period = v_period AND upload.original_filename = p_original_filename
    ) removed WHERE profile_id IS NOT NULL GROUP BY profile_id
    ON CONFLICT (profile_id) DO UPDATE
      SET delta = royalty_expected_profile_delta.delta + EXCLUDED.delta;
  END IF;
  SELECT COALESCE(SUM(delta), 0) INTO v_expected_balance_delta
  FROM royalty_expected_profile_delta;

  IF p_replace_existing THEN
    CREATE TEMP TABLE IF NOT EXISTS royalty_affected_uploads(id uuid PRIMARY KEY) ON COMMIT DROP;
    TRUNCATE royalty_affected_uploads;
    INSERT INTO royalty_affected_uploads(id)
    SELECT DISTINCT royalty.upload_id FROM soundpub.royalties royalty
    JOIN soundpub.royalty_uploads upload ON upload.id = royalty.upload_id
    WHERE royalty.period = v_period AND upload.original_filename = p_original_filename ON CONFLICT DO NOTHING;
    INSERT INTO soundpub.archived_royalties(id, upload_id, row_data, archived_by, reason)
    SELECT royalty.id, royalty.upload_id, to_jsonb(royalty), p_actor_id, 'replace_filename_period'
    FROM soundpub.royalties royalty JOIN soundpub.royalty_uploads upload ON upload.id = royalty.upload_id
    WHERE royalty.period = v_period AND upload.original_filename = p_original_filename;
    WITH deleted AS (
      DELETE FROM soundpub.royalties royalty USING soundpub.royalty_uploads upload
      WHERE royalty.upload_id = upload.id AND royalty.period = v_period AND upload.original_filename = p_original_filename RETURNING royalty.id
    ) SELECT COUNT(*) INTO v_replaced_rows FROM deleted;
    SELECT COUNT(*) INTO v_replaced_uploads FROM royalty_affected_uploads;
    UPDATE soundpub.royalty_uploads upload SET status = 'replaced', updated_at = now()
    WHERE upload.id IN (SELECT id FROM royalty_affected_uploads)
      AND NOT EXISTS (SELECT 1 FROM soundpub.royalties royalty WHERE royalty.upload_id = upload.id);
  END IF;

  v_row_count := jsonb_array_length(p_rows);
  INSERT INTO soundpub.royalty_uploads (
    user_id, filename, original_filename, total_records, inserted_records, status, idempotency_key, summary
  ) VALUES (
    p_actor_id, p_filename, p_original_filename, v_row_count, v_row_count, 'success', btrim(p_idempotency_key),
    jsonb_build_object('replace_existing', p_replace_existing, 'replace_mode', p_replace_mode,
      'replace_periods', to_jsonb(v_periods), 'replaced_uploads', v_replaced_uploads, 'replaced_rows', v_replaced_rows)
  ) RETURNING * INTO v_upload;

  INSERT INTO soundpub.royalties (
    upload_id, source_row_number, period, isrc, upc, title, artist, artist_name, label_name,
    platform, country, sales_type, unit_penjualan, pendapatan_kotor_dsp,
    pendapatan_label_artis, pendapatan_bersih_soundpub, artist_revenue,
    label_revenue, soundpub_revenue, net_revenue, artist_user_id, label_user_id
  )
  SELECT v_upload.id, input.ordinality::integer, btrim(input.value->>'period'),
    upper(replace(btrim(input.value->>'isrc'), '-', '')), COALESCE(btrim(input.value->>'upc'), ''),
    NULLIF(btrim(input.value->>'title'), ''), NULLIF(btrim(input.value->>'artist'), ''),
    COALESCE(NULLIF(btrim(input.value->>'artist'), ''), ''), COALESCE(NULLIF(btrim(input.value->>'label_name'), ''), ''),
    btrim(input.value->>'platform'), upper(btrim(input.value->>'country')), COALESCE(btrim(input.value->>'sales_type'), ''),
    (input.value->>'sales_unit')::integer, (input.value->>'net_revenue')::numeric, (input.value->>'net_revenue')::numeric,
    round((input.value->>'net_revenue')::numeric * 0.09, 2), round((input.value->>'net_revenue')::numeric * 0.70, 2),
    (input.value->>'net_revenue')::numeric - round((input.value->>'net_revenue')::numeric * 0.09, 2)
      - round((input.value->>'net_revenue')::numeric * 0.70, 2),
    round((input.value->>'net_revenue')::numeric * 0.09, 2), (input.value->>'net_revenue')::numeric,
    (input.value->>'artist_user_id')::uuid, (input.value->>'label_user_id')::uuid
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS input(value, ordinality);

  PERFORM soundpub.rebuild_royalty_balances();
  IF EXISTS (SELECT 1 FROM soundpub.profiles WHERE balance < 0) THEN
    RAISE EXCEPTION 'Replacement would create negative available balance; reconcile payout obligations first';
  END IF;
  SELECT COALESCE(SUM(profile.balance - before.balance), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'profileId', profile.id,
      'beforeBalance', before.balance,
      'afterBalance', profile.balance,
      'delta', profile.balance - before.balance
    ) ORDER BY abs(profile.balance - before.balance) DESC) FILTER (
      WHERE profile.balance IS DISTINCT FROM before.balance
    ), '[]'::jsonb)
  INTO v_actual_balance_delta, v_balance_updates
  FROM soundpub.profiles profile JOIN royalty_balance_before before ON before.id = profile.id;
  WITH actual AS (
    SELECT profile.id profile_id, profile.balance - before.balance delta
    FROM soundpub.profiles profile
    JOIN royalty_balance_before before ON before.id = profile.id
  )
  SELECT COUNT(*) INTO v_invalid_count
  FROM royalty_expected_profile_delta expected
  FULL OUTER JOIN actual ON actual.profile_id = expected.profile_id
  WHERE abs(COALESCE(expected.delta, 0) - COALESCE(actual.delta, 0)) > 0.01;
  IF v_invalid_count > 0 OR abs(v_actual_balance_delta - v_expected_balance_delta) > 0.01 THEN
    RAISE EXCEPTION 'Royalty balance delta mismatch for % profiles: expected total %, actual total %',
      v_invalid_count, v_expected_balance_delta, v_actual_balance_delta;
  END IF;

  UPDATE soundpub.royalty_uploads
  SET summary = summary || jsonb_build_object(
    'balance_updates', v_balance_updates,
    'expected_balance_delta', v_expected_balance_delta,
    'actual_balance_delta', v_actual_balance_delta
  ) WHERE id = v_upload.id;

  INSERT INTO soundpub.audit_logs(action, actor_id, target_id, target_type, details)
  VALUES ('commit_royalty_upload', p_actor_id, v_upload.id, 'royalty_upload',
    jsonb_build_object('filename', p_original_filename, 'period', v_period,
      'inserted_records', v_row_count, 'replaced_uploads', v_replaced_uploads,
      'replaced_rows', v_replaced_rows, 'idempotency_key', btrim(p_idempotency_key),
      'expected_balance_delta', v_expected_balance_delta,
      'actual_balance_delta', v_actual_balance_delta));
  RETURN jsonb_build_object(
    'success', true, 'insertedCount', v_row_count, 'uploadId', v_upload.id,
    'idempotentReplay', false, 'replacedUploads', v_replaced_uploads,
    'replacedRows', v_replaced_rows, 'managedArtistsCreated', 0,
    'managedArtistsReused', 0, 'balanceErrors', jsonb_build_array(),
    'balanceUpdates', v_balance_updates, 'expectedBalanceDelta', v_expected_balance_delta,
    'actualBalanceDelta', v_actual_balance_delta, 'totalErrors', 0
  );
END;
$$;
REVOKE ALL ON FUNCTION soundpub.commit_royalty_upload(jsonb, uuid, text, text, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION soundpub.commit_royalty_upload(jsonb, uuid, text, text, boolean, text, text) TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
