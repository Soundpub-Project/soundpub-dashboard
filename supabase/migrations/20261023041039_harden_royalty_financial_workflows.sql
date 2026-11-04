BEGIN;

ALTER TABLE soundpub.royalty_uploads ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS royalty_uploads_idempotency_key_unique
  ON soundpub.royalty_uploads (idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE soundpub.royalty_uploads DROP CONSTRAINT IF EXISTS royalty_uploads_status_check;
ALTER TABLE soundpub.royalty_uploads ADD CONSTRAINT royalty_uploads_status_check
  CHECK (status IN ('pending', 'processing', 'success', 'partial', 'failed', 'replaced'));

ALTER TABLE soundpub.royalties ADD COLUMN IF NOT EXISTS source_row_number integer;
CREATE UNIQUE INDEX IF NOT EXISTS royalties_upload_source_row_unique
  ON soundpub.royalties (upload_id, source_row_number) WHERE source_row_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS soundpub.balance_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES soundpub.profiles(id),
  amount numeric(18,2) NOT NULL CHECK (amount <> 0),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id)
);
ALTER TABLE soundpub.balance_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON soundpub.balance_adjustments FROM PUBLIC, anon, authenticated;
GRANT ALL ON soundpub.balance_adjustments TO service_role;

WITH allocations AS (
  SELECT artist_user_id profile_id, artist_revenue amount
  FROM soundpub.royalties WHERE artist_user_id IS NOT NULL
  UNION ALL
  SELECT label_user_id, label_revenue
  FROM soundpub.royalties WHERE label_user_id IS NOT NULL
), gross AS (
  SELECT profile_id, SUM(amount) amount FROM allocations GROUP BY profile_id
), reserved AS (
  SELECT reservation.profile_id, SUM(reservation.amount) amount
  FROM soundpub.payout_balance_reservations reservation
  JOIN soundpub.payout_requests payout ON payout.id = reservation.payout_id
  WHERE payout.status IN ('pending', 'approved', 'paid')
  GROUP BY reservation.profile_id
), opening_adjustments AS (
  SELECT profile.id profile_id,
    COALESCE(profile.balance, 0) - COALESCE(gross.amount, 0) + COALESCE(reserved.amount, 0) amount
  FROM soundpub.profiles profile
  LEFT JOIN gross ON gross.profile_id = profile.id
  LEFT JOIN reserved ON reserved.profile_id = profile.id
)
INSERT INTO soundpub.balance_adjustments(profile_id, amount, source_type, source_id)
SELECT profile_id, amount, 'migration_opening_balance', profile_id
FROM opening_adjustments WHERE amount <> 0
ON CONFLICT (source_type, source_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS soundpub.archived_royalties (
  id uuid PRIMARY KEY,
  upload_id uuid NOT NULL,
  row_data jsonb NOT NULL,
  archived_by uuid NOT NULL,
  reason text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE soundpub.archived_royalties ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON soundpub.archived_royalties FROM PUBLIC, anon, authenticated;
GRANT ALL ON soundpub.archived_royalties TO service_role;

CREATE OR REPLACE FUNCTION soundpub.rebuild_royalty_balances()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = soundpub, public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('soundpub_royalty_financial_mutation'));
  IF EXISTS (
    SELECT 1 FROM soundpub.payout_requests payout
    WHERE payout.status = 'paid'
      AND NOT EXISTS (
        SELECT 1 FROM soundpub.payout_balance_reservations reservation
        WHERE reservation.payout_id = payout.id
      )
  ) THEN
    RAISE EXCEPTION 'Paid payouts without reservations require reconciliation before rebuilding balances';
  END IF;
  WITH allocations AS (
    SELECT artist_user_id profile_id, artist_revenue artist_amount, 0::numeric label_amount
    FROM soundpub.royalties WHERE artist_user_id IS NOT NULL
    UNION ALL
    SELECT label_user_id, 0::numeric, label_revenue
    FROM soundpub.royalties WHERE label_user_id IS NOT NULL
  ), gross AS (
    SELECT profile_id, SUM(artist_amount) artist_revenue, SUM(label_amount) label_revenue
    FROM allocations GROUP BY profile_id
  ), reserved AS (
    SELECT reservation.profile_id, SUM(reservation.amount) amount
    FROM soundpub.payout_balance_reservations reservation
    JOIN soundpub.payout_requests payout ON payout.id = reservation.payout_id
    WHERE payout.status IN ('pending', 'approved', 'paid')
    GROUP BY reservation.profile_id
  ), adjustments AS (
    SELECT profile_id, SUM(amount) amount
    FROM soundpub.balance_adjustments GROUP BY profile_id
  ), calculated AS (
    SELECT profile.id,
      COALESCE(gross.artist_revenue, 0) artist_revenue,
      COALESCE(gross.label_revenue, 0) label_revenue,
      COALESCE(gross.artist_revenue, 0) + COALESCE(gross.label_revenue, 0)
        + COALESCE(adjustments.amount, 0) - COALESCE(reserved.amount, 0) balance
    FROM soundpub.profiles profile
    LEFT JOIN gross ON gross.profile_id = profile.id
    LEFT JOIN reserved ON reserved.profile_id = profile.id
    LEFT JOIN adjustments ON adjustments.profile_id = profile.id
  )
  UPDATE soundpub.profiles profile
  SET artist_revenue = calculated.artist_revenue,
      label_revenue = calculated.label_revenue,
      balance = calculated.balance,
      updated_at = now()
  FROM calculated WHERE profile.id = calculated.id;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.rebuild_royalty_balances() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION soundpub.rebuild_royalty_balances() TO service_role;

CREATE OR REPLACE FUNCTION soundpub.request_payout(
  _amount numeric, _bank_name text, _account_number text, _account_holder_name text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = soundpub, auth, public AS $$
DECLARE
  v_user uuid := auth.uid(); v_remaining numeric := _amount; v_take numeric;
  v_profile soundpub.profiles%ROWTYPE; v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('soundpub_royalty_financial_mutation'));
  IF v_user IS NULL OR _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Invalid payout request'; END IF;
  IF NULLIF(btrim(_bank_name), '') IS NULL OR NULLIF(btrim(_account_number), '') IS NULL OR NULLIF(btrim(_account_holder_name), '') IS NULL THEN
    RAISE EXCEPTION 'Bank information is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM soundpub.user_roles WHERE user_id = v_user AND role IN ('label', 'whitelabel')) THEN
    RAISE EXCEPTION 'Only labels can request payouts';
  END IF;
  PERFORM soundpub.rebuild_royalty_balances();
  INSERT INTO soundpub.payout_requests (user_id, amount, bank_name, account_number, account_holder_name, status)
  VALUES (v_user, _amount, btrim(_bank_name), btrim(_account_number), btrim(_account_holder_name), 'pending')
  RETURNING id INTO v_id;
  FOR v_profile IN
    SELECT profile.* FROM soundpub.profiles profile
    WHERE profile.id = v_user OR profile.parent_label_id = v_user
    ORDER BY CASE WHEN profile.id = v_user THEN 0 ELSE 1 END, profile.id FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, GREATEST(COALESCE(v_profile.balance, 0), 0));
    IF v_take > 0 THEN
      UPDATE soundpub.profiles SET balance = balance - v_take WHERE id = v_profile.id;
      INSERT INTO soundpub.payout_balance_reservations (payout_id, profile_id, amount) VALUES (v_id, v_profile.id, v_take);
      v_remaining := v_remaining - v_take;
    END IF;
  END LOOP;
  IF v_remaining > 0 THEN RAISE EXCEPTION 'Saldo tidak mencukupi'; END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.request_payout(numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION soundpub.request_payout(numeric, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION soundpub.update_payout_status(
  _payout_id uuid, _status text, _notes text DEFAULT NULL,
  _proof_path text DEFAULT NULL, _proof_name text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = soundpub, auth, public AS $$
DECLARE v_payout soundpub.payout_requests%ROWTYPE; v_reserved numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('soundpub_royalty_financial_mutation'));
  IF NOT soundpub.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_payout FROM soundpub.payout_requests WHERE id = _payout_id FOR UPDATE;
  IF v_payout IS NULL THEN RAISE EXCEPTION 'Payout not found'; END IF;
  IF _status NOT IN ('approved', 'rejected', 'paid') THEN RAISE EXCEPTION 'Invalid payout status'; END IF;
  IF _status = 'approved' AND v_payout.status <> 'pending' THEN RAISE EXCEPTION 'Payout must be pending'; END IF;
  IF _status = 'rejected' AND v_payout.status NOT IN ('pending', 'approved') THEN RAISE EXCEPTION 'Payout cannot be rejected'; END IF;
  IF _status = 'paid' AND v_payout.status <> 'approved' THEN RAISE EXCEPTION 'Payout must be approved'; END IF;
  IF _status = 'paid' AND COALESCE(_proof_path, '') = '' THEN RAISE EXCEPTION 'Payment proof is required'; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_reserved FROM soundpub.payout_balance_reservations WHERE payout_id = _payout_id;
  IF _status IN ('approved', 'paid') AND v_reserved <> v_payout.amount THEN RAISE EXCEPTION 'Payout reservation mismatch'; END IF;
  UPDATE soundpub.payout_requests
  SET status = _status, notes = COALESCE(_notes, notes),
      payment_proof_path = COALESCE(_proof_path, payment_proof_path),
      payment_proof_name = COALESCE(_proof_name, payment_proof_name),
      processed_by = auth.uid(), processed_at = now()
  WHERE id = _payout_id;
  IF _status = 'rejected' THEN PERFORM soundpub.rebuild_royalty_balances(); END IF;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.update_payout_status(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION soundpub.update_payout_status(uuid, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION soundpub.delete_release_with_refund(p_release_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = soundpub, auth, public AS $$
DECLARE
  v_release soundpub.releases%ROWTYPE;
  v_payment soundpub.release_payments%ROWTYPE;
  v_refund numeric := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('soundpub_royalty_financial_mutation'));
  SELECT * INTO v_release FROM soundpub.releases WHERE id = p_release_id FOR UPDATE;
  IF v_release.id IS NULL THEN RAISE EXCEPTION 'Release not found'; END IF;
  IF NOT soundpub.is_admin(auth.uid()) AND (
    v_release.label_id IS DISTINCT FROM auth.uid()
    OR EXISTS (SELECT 1 FROM soundpub.release_payments WHERE release_id = p_release_id AND status = 'paid')
  ) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_payment FROM soundpub.release_payments
  WHERE release_id = p_release_id AND status = 'paid' FOR UPDATE;
  IF v_payment.id IS NOT NULL THEN
    INSERT INTO soundpub.balance_adjustments(profile_id, amount, source_type, source_id)
    VALUES (v_payment.user_id, v_payment.amount, 'release_refund', v_payment.id);
    v_refund := v_payment.amount;
  END IF;
  DELETE FROM soundpub.releases WHERE id = p_release_id;
  PERFORM soundpub.rebuild_royalty_balances();
  INSERT INTO soundpub.audit_logs(action, actor_id, target_id, target_type, details)
  VALUES ('delete_release_with_refund', auth.uid(), p_release_id, 'release',
    jsonb_build_object('payment_id', v_payment.id, 'refund_amount', v_refund));
  RETURN jsonb_build_object('deleted', true, 'refundAmount', v_refund);
END;
$$;
REVOKE ALL ON FUNCTION soundpub.delete_release_with_refund(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION soundpub.delete_release_with_refund(uuid) TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('soundpub.complete_payout(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION soundpub.complete_payout(uuid) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

REVOKE INSERT, UPDATE, DELETE ON soundpub.payout_requests FROM authenticated;
DROP POLICY IF EXISTS "Users can manage own payouts" ON soundpub.payout_requests;
DROP POLICY IF EXISTS "Users can view own payouts" ON soundpub.payout_requests;
CREATE POLICY "Users can view own payouts" ON soundpub.payout_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION soundpub.guard_profile_sensitive_update()
RETURNS trigger LANGUAGE plpgsql
SET search_path = soundpub, auth, public AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.balance, 0) <> 0 OR COALESCE(NEW.artist_revenue, 0) <> 0
       OR COALESCE(NEW.label_revenue, 0) <> 0 THEN
      RAISE EXCEPTION 'Financial profile fields cannot be set on direct insert';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.balance IS DISTINCT FROM OLD.balance
     OR NEW.artist_revenue IS DISTINCT FROM OLD.artist_revenue
     OR NEW.label_revenue IS DISTINCT FROM OLD.label_revenue THEN
    RAISE EXCEPTION 'Financial profile fields cannot be updated directly';
  END IF;
  IF OLD.id = auth.uid() AND (
    NEW.parent_label_id IS DISTINCT FROM OLD.parent_label_id
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.composer_code IS DISTINCT FROM OLD.composer_code
    OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
    OR NEW.subscription_upgraded_at IS DISTINCT FROM OLD.subscription_upgraded_at
    OR NEW.sso_provider IS DISTINCT FROM OLD.sso_provider
    OR NEW.sso_user_id IS DISTINCT FROM OLD.sso_user_id
    OR NEW.sso_user_type IS DISTINCT FROM OLD.sso_user_type
    OR NEW.is_managed_artist IS DISTINCT FROM OLD.is_managed_artist
    OR NEW.auth_user_status IS DISTINCT FROM OLD.auth_user_status
  ) THEN
    RAISE EXCEPTION 'Sensitive profile fields require an authorized server operation';
  END IF;
  IF OLD.parent_label_id = auth.uid() AND NEW.parent_label_id IS DISTINCT FROM OLD.parent_label_id THEN
    RAISE EXCEPTION 'Artist ownership transfer requires an authorized server operation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_profile_sensitive_update ON soundpub.profiles;
CREATE TRIGGER guard_profile_sensitive_update
BEFORE INSERT OR UPDATE ON soundpub.profiles FOR EACH ROW
EXECUTE FUNCTION soundpub.guard_profile_sensitive_update();
GRANT UPDATE ON soundpub.profiles TO authenticated;

DROP POLICY IF EXISTS "Labels can view their royalties" ON soundpub.royalties;
CREATE POLICY "Labels can view their royalties" ON soundpub.royalties
  FOR SELECT TO authenticated USING (
    label_user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM soundpub.profiles artist_profile
      WHERE artist_profile.id = royalties.artist_user_id AND artist_profile.parent_label_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Artists can view their royalties" ON soundpub.royalties;
CREATE POLICY "Artists can view their royalties" ON soundpub.royalties
  FOR SELECT TO authenticated USING (artist_user_id = auth.uid());

CREATE OR REPLACE FUNCTION soundpub.commit_royalty_upload(
  p_rows jsonb, p_actor_id uuid, p_filename text, p_original_filename text,
  p_replace_existing boolean DEFAULT false, p_replace_mode text DEFAULT 'filename_period',
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = soundpub, public AS $$
DECLARE
  v_upload soundpub.royalty_uploads%ROWTYPE; v_existing soundpub.royalty_uploads%ROWTYPE;
  v_row_count integer; v_replaced_rows integer := 0; v_replaced_uploads integer := 0;
  v_periods text[]; v_invalid_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('soundpub_royalty_financial_mutation'));
  IF p_actor_id IS NULL OR NOT soundpub.is_admin(p_actor_id) THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN RAISE EXCEPTION 'No royalty rows supplied'; END IF;
  IF p_replace_mode NOT IN ('filename_period', 'period') THEN RAISE EXCEPTION 'Invalid replace mode'; END IF;
  IF NULLIF(btrim(p_filename), '') IS NULL OR NULLIF(btrim(p_original_filename), '') IS NULL THEN RAISE EXCEPTION 'Filename is required'; END IF;
  IF p_idempotency_key IS NULL OR NULLIF(btrim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'Upload idempotency key is required';
  END IF;

  IF NULLIF(btrim(p_idempotency_key), '') IS NOT NULL THEN
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
          'balanceErrors', jsonb_build_array(), 'balanceUpdates', jsonb_build_array(), 'totalErrors', 0
        );
      END IF;
      RAISE EXCEPTION 'Upload with this idempotency key is already being processed';
    END IF;
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

  WITH input_rows AS (
    SELECT (value->>'artist_user_id')::uuid artist_user_id, (value->>'label_user_id')::uuid label_user_id
    FROM jsonb_array_elements(p_rows)
  )
  SELECT COUNT(*) INTO v_invalid_count FROM input_rows input
  WHERE NOT EXISTS (SELECT 1 FROM soundpub.profiles label_profile WHERE label_profile.id = input.label_user_id)
     OR NOT EXISTS (
       SELECT 1 FROM soundpub.profiles artist_profile
       WHERE artist_profile.id = input.artist_user_id AND artist_profile.parent_label_id = input.label_user_id
     );
  IF v_invalid_count > 0 THEN RAISE EXCEPTION 'Royalty payload contains recipients outside the selected label'; END IF;

  SELECT ARRAY_AGG(DISTINCT value->>'period') INTO v_periods FROM jsonb_array_elements(p_rows);
  WITH input_rows AS (
    SELECT (value->>'net_revenue')::numeric revenue, (value->>'sales_unit')::numeric units
    FROM jsonb_array_elements(p_rows)
  )
  SELECT COUNT(*) INTO v_invalid_count FROM input_rows
  WHERE revenue <> round(revenue, 2) OR units <> trunc(units)
     OR abs(revenue) > 9999999999999999.99 OR units < 0 OR units > 2147483647;
  IF v_invalid_count > 0 THEN RAISE EXCEPTION 'Royalty amounts require two decimal places and nonnegative integer units'; END IF;
  IF p_replace_existing THEN
    CREATE TEMP TABLE royalty_affected_uploads(id uuid PRIMARY KEY) ON COMMIT DROP;
    IF p_replace_mode = 'filename_period' THEN
      INSERT INTO royalty_affected_uploads(id)
      SELECT DISTINCT royalty.upload_id FROM soundpub.royalties royalty
      JOIN soundpub.royalty_uploads upload ON upload.id = royalty.upload_id
      WHERE upload.original_filename = p_original_filename AND royalty.period = ANY(v_periods)
      ON CONFLICT DO NOTHING;
      INSERT INTO soundpub.archived_royalties(id, upload_id, row_data, archived_by, reason)
      SELECT royalty.id, royalty.upload_id, to_jsonb(royalty), p_actor_id, 'replace_filename_period'
      FROM soundpub.royalties royalty
      JOIN soundpub.royalty_uploads upload ON upload.id = royalty.upload_id
      WHERE upload.original_filename = p_original_filename AND royalty.period = ANY(v_periods);
      WITH deleted AS (
        DELETE FROM soundpub.royalties royalty USING soundpub.royalty_uploads upload
        WHERE upload.id = royalty.upload_id AND upload.original_filename = p_original_filename
          AND royalty.period = ANY(v_periods) RETURNING royalty.id
      ) SELECT COUNT(*) INTO v_replaced_rows FROM deleted;
    ELSE
      INSERT INTO royalty_affected_uploads(id)
      SELECT DISTINCT upload_id FROM soundpub.royalties WHERE period = ANY(v_periods) ON CONFLICT DO NOTHING;
      INSERT INTO soundpub.archived_royalties(id, upload_id, row_data, archived_by, reason)
      SELECT royalty.id, royalty.upload_id, to_jsonb(royalty), p_actor_id, 'replace_period'
      FROM soundpub.royalties royalty WHERE royalty.period = ANY(v_periods);
      WITH deleted AS (
        DELETE FROM soundpub.royalties WHERE period = ANY(v_periods) RETURNING id
      ) SELECT COUNT(*) INTO v_replaced_rows FROM deleted;
    END IF;
    SELECT COUNT(*) INTO v_replaced_uploads FROM royalty_affected_uploads;
    UPDATE soundpub.royalty_uploads upload SET status = 'replaced', updated_at = now()
    WHERE upload.id IN (SELECT id FROM royalty_affected_uploads)
      AND NOT EXISTS (SELECT 1 FROM soundpub.royalties royalty WHERE royalty.upload_id = upload.id);
  END IF;

  v_row_count := jsonb_array_length(p_rows);
  INSERT INTO soundpub.royalty_uploads (
    user_id, filename, original_filename, total_records, inserted_records, status, idempotency_key, summary
  ) VALUES (
    p_actor_id, p_filename, p_original_filename, v_row_count, v_row_count, 'success', NULLIF(btrim(p_idempotency_key), ''),
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
  INSERT INTO soundpub.audit_logs(action, actor_id, target_id, target_type, details)
  VALUES ('commit_royalty_upload', p_actor_id, v_upload.id, 'royalty_upload',
    jsonb_build_object('filename', p_original_filename, 'inserted_records', v_row_count,
      'replaced_uploads', v_replaced_uploads, 'replaced_rows', v_replaced_rows,
      'idempotency_key', NULLIF(btrim(p_idempotency_key), '')));
  RETURN jsonb_build_object(
    'success', true, 'insertedCount', v_row_count, 'uploadId', v_upload.id, 'idempotentReplay', false,
    'replacedUploads', v_replaced_uploads, 'replacedRows', v_replaced_rows,
    'managedArtistsCreated', 0, 'managedArtistsReused', 0,
    'balanceErrors', jsonb_build_array(), 'balanceUpdates', jsonb_build_array(), 'totalErrors', 0
  );
END;
$$;
REVOKE ALL ON FUNCTION soundpub.commit_royalty_upload(jsonb, uuid, text, text, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION soundpub.commit_royalty_upload(jsonb, uuid, text, text, boolean, text, text) TO service_role;

CREATE OR REPLACE FUNCTION soundpub.reverse_royalty_upload(
  p_upload_id uuid, p_actor_id uuid, p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = soundpub, public AS $$
DECLARE v_upload soundpub.royalty_uploads%ROWTYPE; v_deleted integer; v_negative_profiles integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('soundpub_royalty_financial_mutation'));
  IF p_actor_id IS NULL OR NOT soundpub.is_admin(p_actor_id) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO v_upload FROM soundpub.royalty_uploads WHERE id = p_upload_id FOR UPDATE;
  IF v_upload.id IS NULL THEN RAISE EXCEPTION 'Upload not found'; END IF;
  INSERT INTO soundpub.archived_royalties(id, upload_id, row_data, archived_by, reason)
  SELECT royalty.id, royalty.upload_id, to_jsonb(royalty), p_actor_id, 'delete_upload'
  FROM soundpub.royalties royalty WHERE royalty.upload_id = p_upload_id;
  WITH deleted AS (DELETE FROM soundpub.royalties WHERE upload_id = p_upload_id RETURNING id)
  SELECT COUNT(*) INTO v_deleted FROM deleted;
  DELETE FROM soundpub.royalty_uploads WHERE id = p_upload_id;
  PERFORM soundpub.rebuild_royalty_balances();
  SELECT COUNT(*) INTO v_negative_profiles FROM soundpub.profiles WHERE balance < 0;
  IF v_negative_profiles > 0 THEN
    RAISE EXCEPTION 'Reversal exceeds available funds for % profiles; reconcile payout obligations first', v_negative_profiles;
  END IF;
  INSERT INTO soundpub.audit_logs(action, actor_id, target_id, target_type, details)
  VALUES ('reverse_royalty_upload', p_actor_id, p_upload_id, 'royalty_upload',
    jsonb_build_object('filename', v_upload.original_filename, 'deleted_records', v_deleted,
      'reason', NULLIF(btrim(p_reason), ''), 'negative_profiles_after_rebuild', v_negative_profiles));
  RETURN jsonb_build_object('ok', true, 'deletedRecords', v_deleted, 'negativeProfiles', v_negative_profiles);
END;
$$;
REVOKE ALL ON FUNCTION soundpub.reverse_royalty_upload(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION soundpub.reverse_royalty_upload(uuid, uuid, text) TO service_role;

-- Normalize cached revenue columns while opening adjustments preserve existing balances.
SELECT soundpub.rebuild_royalty_balances();

COMMIT;
NOTIFY pgrst, 'reload schema';
