-- Migration: Copyright Royalty Upload System
-- Created: 2026-07-22
-- Purpose: Enable admin to upload CSV royalty data for copyright composers

-- =====================================================
-- PART 1: Upload Tracking Table
-- =====================================================

CREATE TABLE IF NOT EXISTS soundpub.copyright_royalty_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  filename text NOT NULL,
  period text NOT NULL,
  total_rows integer NOT NULL DEFAULT 0,
  success_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed', 'partial')),
  error_summary jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- PART 2: Enhanced Composer Royalties Table (if not exists)
-- =====================================================

-- Add upload_id reference if table exists without it
DO \$\$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'soundpub' 
    AND table_name = 'composer_royalties' 
    AND column_name = 'upload_id'
  ) THEN
    ALTER TABLE soundpub.composer_royalties 
    ADD COLUMN upload_id uuid REFERENCES soundpub.copyright_royalty_uploads(id) ON DELETE SET NULL;
  END IF;
END \$\$;

-- Add unique constraint to prevent duplicate entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_composer_royalties_unique 
  ON soundpub.composer_royalties(composer_id, period);

-- =====================================================
-- PART 3: Validation Function
-- =====================================================

CREATE OR REPLACE FUNCTION soundpub.validate_royalty_csv_row(
  _composer_code text,
  _composer_name text,
  _total_net_royalti text,
  _period text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = soundpub
AS \$\$
DECLARE
  _result jsonb;
  _amount numeric;
  _profile_exists boolean;
  _profile_name text;
  _errors text[] := '{}';
BEGIN
  -- Validate composer_code not empty
  IF _composer_code IS NULL OR trim(_composer_code) = '' THEN
    _errors := array_append(_errors, 'Composer code is required');
  ELSE
    -- Check if composer exists
    SELECT EXISTS(
      SELECT 1 FROM soundpub.profiles 
      WHERE composer_code = _composer_code
    ) INTO _profile_exists;

    IF NOT _profile_exists THEN
      _errors := array_append(_errors, 'Composer code not found in database');
    ELSE
      -- Get profile name for comparison
      SELECT COALESCE(full_name, email) INTO _profile_name
      FROM soundpub.profiles
      WHERE composer_code = _composer_code;

      -- Warning if name mismatch
      IF _composer_name IS NOT NULL AND trim(_composer_name) != '' 
         AND lower(trim(_composer_name)) != lower(trim(_profile_name)) THEN
        _errors := array_append(_errors, format('Warning: Name mismatch. Expected: %s', _profile_name));
      END IF;
    END IF;
  END IF;

  -- Validate amount
  BEGIN
    _amount := _total_net_royalti::numeric;
    IF _amount <= 0 THEN
      _errors := array_append(_errors, 'Amount must be greater than 0');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    _errors := array_append(_errors, 'Invalid amount format');
  END;

  -- Validate period format (YYYY-MM)
  IF _period IS NULL OR _period !~ '^\d{4}-\d{2}\$' THEN
    _errors := array_append(_errors, 'Period must be in YYYY-MM format');
  END IF;

  -- Build result
  _result := jsonb_build_object(
    'is_valid', array_length(_errors, 1) IS NULL OR array_length(_errors, 1) = 0,
    'errors', to_jsonb(_errors),
    'composer_code', _composer_code,
    'composer_name', _composer_name,
    'total_net_royalti', _amount,
    'period', _period
  );

  RETURN _result;
END;
\$\$;

-- =====================================================
-- PART 4: Bulk Import Function
-- =====================================================

CREATE OR REPLACE FUNCTION soundpub.import_composer_royalties(
  _csv_rows jsonb,
  _period text,
  _filename text DEFAULT 'uploaded.csv',
  _replace_existing boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = soundpub
AS \$\$
DECLARE
  _admin_user_id uuid;
  _upload_id uuid;
  _row jsonb;
  _composer_code text;
  _composer_name text;
  _amount numeric;
  _total_rows int := 0;
  _success_rows int := 0;
  _error_rows int := 0;
  _error_summary jsonb := '[]'::jsonb;
  _row_number int := 0;
  _existing_count int;
BEGIN
  _admin_user_id := auth.uid();

  -- Verify admin
  IF NOT soundpub.is_admin(_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can import royalties';
  END IF;

  -- Create upload record
  INSERT INTO soundpub.copyright_royalty_uploads (
    uploaded_by,
    filename,
    period,
    total_rows,
    status
  ) VALUES (
    _admin_user_id,
    _filename,
    _period,
    jsonb_array_length(_csv_rows),
    'processing'
  )
  RETURNING id INTO _upload_id;

  _total_rows := jsonb_array_length(_csv_rows);

  -- Check if period already exists
  IF NOT _replace_existing THEN
    SELECT COUNT(*) INTO _existing_count
    FROM soundpub.composer_royalties
    WHERE period = _period;

    IF _existing_count > 0 THEN
      UPDATE soundpub.copyright_royalty_uploads
      SET 
        status = 'failed',
        error_summary = jsonb_build_array(
          jsonb_build_object(
            'error', format('Period %s already has %s entries. Use replace mode to overwrite.', _period, _existing_count)
          )
        ),
        updated_at = now()
      WHERE id = _upload_id;

      RETURN jsonb_build_object(
        'success', false,
        'upload_id', _upload_id,
        'error', format('Period %s already exists with %s entries', _period, _existing_count)
      );
    END IF;
  ELSE
    -- Delete existing period data
    DELETE FROM soundpub.composer_royalties
    WHERE period = _period;
  END IF;

  -- Process each row
  FOR _row IN SELECT * FROM jsonb_array_elements(_csv_rows)
  LOOP
    _row_number := _row_number + 1;

    BEGIN
      _composer_code := _row->>'composer_code';
      _composer_name := _row->>'composer_name';
      _amount := (_row->>'total_net_royalti')::numeric;

      -- Insert royalty record
      INSERT INTO soundpub.composer_royalties (
        composer_id,
        composer_name,
        total_net_royalti,
        period,
        upload_id,
        created_at,
        updated_at
      ) VALUES (
        _composer_code,
        _composer_name,
        _amount,
        _period,
        _upload_id,
        now(),
        now()
      )
      ON CONFLICT (composer_id, period) DO UPDATE
      SET 
        total_net_royalti = EXCLUDED.total_net_royalti,
        composer_name = EXCLUDED.composer_name,
        upload_id = EXCLUDED.upload_id,
        updated_at = now();

      _success_rows := _success_rows + 1;

    EXCEPTION WHEN OTHERS THEN
      _error_rows := _error_rows + 1;
      _error_summary := _error_summary || jsonb_build_object(
        'row', _row_number,
        'composer_code', _composer_code,
        'error', SQLERRM
      );
    END;
  END LOOP;

  -- Update upload record
  UPDATE soundpub.copyright_royalty_uploads
  SET 
    success_rows = _success_rows,
    error_rows = _error_rows,
    status = CASE 
      WHEN _error_rows = 0 THEN 'completed'
      WHEN _success_rows = 0 THEN 'failed'
      ELSE 'partial'
    END,
    error_summary = _error_summary,
    updated_at = now()
  WHERE id = _upload_id;

  -- Send notifications to affected users
  IF _success_rows > 0 THEN
    PERFORM soundpub.notify_royalty_available(_period);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'upload_id', _upload_id,
    'total_rows', _total_rows,
    'success_rows', _success_rows,
    'error_rows', _error_rows,
    'error_summary', _error_summary
  );
END;
\$\$;

-- =====================================================
-- PART 5: Notification Function for Royalty Available
-- =====================================================

CREATE OR REPLACE FUNCTION soundpub.notify_royalty_available(_period text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = soundpub
AS \$\$
DECLARE
  _composer record;
BEGIN
  -- Notify each composer that has royalty in this period
  FOR _composer IN 
    SELECT DISTINCT 
      cr.composer_id,
      p.id as user_id,
      p.email,
      COALESCE(p.full_name, p.email) as full_name,
      cr.total_net_royalti
    FROM soundpub.composer_royalties cr
    JOIN soundpub.profiles p ON p.composer_code = cr.composer_id
    WHERE cr.period = _period
  LOOP
    -- Create notification
    PERFORM soundpub.create_copyright_notification(
      _composer.user_id,
      'success',
      'Royalti Baru Tersedia! 💰',
      format('Royalti periode %s sebesar Rp %s telah tersedia di dashboard Anda.', 
        _period, 
        to_char(_composer.total_net_royalti, 'FM999,999,999')
      ),
      jsonb_build_object(
        'period', _period,
        'amount', _composer.total_net_royalti,
        'composer_code', _composer.composer_id
      )
    );

    -- Queue email (if email exists)
    IF _composer.email IS NOT NULL THEN
      PERFORM soundpub.queue_copyright_email(
        'copyright_royalty_available',
        _composer.email,
        _composer.user_id,
        jsonb_build_object(
          'legal_name', _composer.full_name,
          'period', _period,
          'amount', to_char(_composer.total_net_royalti, 'FM999,999,999'),
          'composer_code', _composer.composer_id
        )
      );
    END IF;
  END LOOP;
END;
\$\$;

-- =====================================================
-- PART 6: Get Upload History
-- =====================================================

CREATE OR REPLACE FUNCTION soundpub.get_royalty_upload_history(_limit int DEFAULT 50)
RETURNS TABLE(
  id uuid,
  uploaded_by uuid,
  uploader_email text,
  filename text,
  period text,
  total_rows int,
  success_rows int,
  error_rows int,
  status text,
  error_summary jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = soundpub
AS \$\$
BEGIN
  -- Verify admin
  IF NOT soundpub.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can view upload history';
  END IF;

  RETURN QUERY
  SELECT 
    u.id,
    u.uploaded_by,
    au.email as uploader_email,
    u.filename,
    u.period,
    u.total_rows,
    u.success_rows,
    u.error_rows,
    u.status,
    u.error_summary,
    u.created_at,
    u.updated_at
  FROM soundpub.copyright_royalty_uploads u
  LEFT JOIN auth.users au ON au.id = u.uploaded_by
  ORDER BY u.created_at DESC
  LIMIT _limit;
END;
\$\$;

-- =====================================================
-- PART 7: Delete Upload (Soft Delete)
-- =====================================================

CREATE OR REPLACE FUNCTION soundpub.delete_royalty_upload(_upload_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = soundpub
AS \$\$
DECLARE
  _upload record;
  _deleted_count int;
BEGIN
  -- Verify admin
  IF NOT soundpub.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can delete uploads';
  END IF;

  -- Get upload info
  SELECT * INTO _upload
  FROM soundpub.copyright_royalty_uploads
  WHERE id = _upload_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Upload not found';
  END IF;

  -- Delete associated royalty records
  DELETE FROM soundpub.composer_royalties
  WHERE upload_id = _upload_id;

  GET DIAGNOSTICS _deleted_count = ROW_COUNT;

  -- Delete upload record
  DELETE FROM soundpub.copyright_royalty_uploads
  WHERE id = _upload_id;

  RETURN jsonb_build_object(
    'success', true,
    'upload_id', _upload_id,
    'deleted_royalty_records', _deleted_count
  );
END;
\$\$;

-- =====================================================
-- PART 8: Permissions
-- =====================================================

GRANT EXECUTE ON FUNCTION soundpub.validate_royalty_csv_row TO authenticated;
GRANT EXECUTE ON FUNCTION soundpub.import_composer_royalties TO authenticated;
GRANT EXECUTE ON FUNCTION soundpub.notify_royalty_available TO authenticated;
GRANT EXECUTE ON FUNCTION soundpub.get_royalty_upload_history TO authenticated;
GRANT EXECUTE ON FUNCTION soundpub.delete_royalty_upload TO authenticated;

-- =====================================================
-- PART 9: RLS Policies
-- =====================================================

ALTER TABLE soundpub.copyright_royalty_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage royalty uploads" ON soundpub.copyright_royalty_uploads;
CREATE POLICY "Admin can manage royalty uploads"
  ON soundpub.copyright_royalty_uploads FOR ALL TO authenticated
  USING (soundpub.is_admin(auth.uid()))
  WITH CHECK (soundpub.is_admin(auth.uid()));

-- =====================================================
-- PART 10: Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_royalty_uploads_uploaded_by ON soundpub.copyright_royalty_uploads(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_royalty_uploads_period ON soundpub.copyright_royalty_uploads(period);
CREATE INDEX IF NOT EXISTS idx_royalty_uploads_status ON soundpub.copyright_royalty_uploads(status);
CREATE INDEX IF NOT EXISTS idx_royalty_uploads_created ON soundpub.copyright_royalty_uploads(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_composer_royalties_period ON soundpub.composer_royalties(period);
CREATE INDEX IF NOT EXISTS idx_composer_royalties_upload_id ON soundpub.composer_royalties(upload_id);

-- =====================================================
-- PART 11: Update Trigger
-- =====================================================

CREATE OR REPLACE FUNCTION soundpub.update_royalty_upload_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS \$\$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
\$\$;

DROP TRIGGER IF EXISTS trg_royalty_uploads_updated_at ON soundpub.copyright_royalty_uploads;
CREATE TRIGGER trg_royalty_uploads_updated_at
  BEFORE UPDATE ON soundpub.copyright_royalty_uploads
  FOR EACH ROW
  EXECUTE FUNCTION soundpub.update_royalty_upload_timestamp();

-- =====================================================
-- PART 12: Email Template for Royalty Available
-- =====================================================

INSERT INTO soundpub.email_templates (template_key, subject, body_html, body_text, variables, description) 
VALUES (
  'copyright_royalty_available',
  'Royalti Baru Tersedia - Periode {{period}}',
  '<h2>Royalti Baru Tersedia! 💰</h2>
  <p>Halo <strong>{{legal_name}}</strong>,</p>
  <p>Royalti Anda untuk periode <strong>{{period}}</strong> telah tersedia!</p>
  <p><strong>Detail:</strong></p>
  <ul>
    <li>Composer Code: <strong>{{composer_code}}</strong></li>
    <li>Periode: {{period}}</li>
    <li>Jumlah: <strong>Rp {{amount}}</strong></li>
  </ul>
  <p>Silakan login ke dashboard Anda untuk melihat detail lengkap.</p>
  <p>Terima kasih,<br>Tim Soundpub</p>',
  'Halo {{legal_name}}, Royalti Anda untuk periode {{period}} sebesar Rp {{amount}} telah tersedia di dashboard.',
  '["legal_name", "period", "amount", "composer_code"]'::jsonb,
  'Email notifikasi saat royalti baru tersedia untuk composer'
)
ON CONFLICT (template_key) DO UPDATE
SET 
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  body_text = EXCLUDED.body_text,
  variables = EXCLUDED.variables,
  description = EXCLUDED.description,
  updated_at = now();

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON TABLE soundpub.copyright_royalty_uploads IS 'Tracking table for CSV royalty uploads by admin';
COMMENT ON FUNCTION soundpub.validate_royalty_csv_row IS 'Validate a single CSV row for royalty data';
COMMENT ON FUNCTION soundpub.import_composer_royalties IS 'Bulk import royalty data from validated CSV';
COMMENT ON FUNCTION soundpub.notify_royalty_available IS 'Send notifications to all composers with royalty in period';
COMMENT ON FUNCTION soundpub.get_royalty_upload_history IS 'Get upload history for admin dashboard';
COMMENT ON FUNCTION soundpub.delete_royalty_upload IS 'Delete upload and associated royalty records';
