-- Copyright / Publishing registration foundation
-- MVP decisions:
-- - Login required before registration
-- - Rp100.000 registration fee includes 1 e-Meterai
-- - 1 account = 1 composer_code for initial phase
-- - Manual/semi-manual e-Meterai first, API-ready metadata included

CREATE TABLE IF NOT EXISTS soundpub.copyright_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'awaiting_payment',
    'paid_pending_review',
    'in_review',
    'revision_requested',
    'approved',
    'rejected',
    'contract_generated',
    'stamping_pending',
    'stamped',
    'contract_signed',
    'active'
  )),
  legal_name text NOT NULL,
  stage_name text,
  nik text,
  address_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  phone text,
  email text NOT NULL,
  npwp text,
  bank_name text,
  bank_account_number text,
  bank_account_name text,
  applicant_type text NOT NULL DEFAULT 'personal' CHECK (applicant_type IN ('personal', 'band_representative', 'company_label')),
  composer_code text,
  contract_number text,
  admin_notes text,
  revision_notes text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS soundpub.copyright_registration_works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES soundpub.copyright_registrations(id) ON DELETE CASCADE,
  title text NOT NULL,
  alternate_title text,
  composer_name text NOT NULL,
  lyricist_name text,
  ownership_percentage numeric(5,2) NOT NULL DEFAULT 100 CHECK (ownership_percentage >= 0 AND ownership_percentage <= 100),
  is_collaboration boolean NOT NULL DEFAULT false,
  cowriters_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  release_status text NOT NULL DEFAULT 'unreleased' CHECK (release_status IN ('unreleased', 'released', 'unknown')),
  release_date date,
  isrc text,
  upc text,
  links_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  lyrics text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS soundpub.copyright_registration_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES soundpub.copyright_registrations(id) ON DELETE CASCADE,
  work_id uuid REFERENCES soundpub.copyright_registration_works(id) ON DELETE CASCADE,
  file_type text NOT NULL CHECK (file_type IN (
    'ktp',
    'npwp',
    'power_of_attorney',
    'audio_demo',
    'lyrics_document',
    'work_evidence',
    'contract_draft',
    'contract_signed',
    'other'
  )),
  file_url text NOT NULL,
  file_name text,
  mime_type text,
  file_size bigint,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS soundpub.copyright_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL UNIQUE REFERENCES soundpub.copyright_registrations(id) ON DELETE CASCADE,
  contract_number text UNIQUE,
  template_version text NOT NULL DEFAULT 'soundpub-publishing-v1',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generated', 'stamping_pending', 'stamped', 'signed', 'active', 'void')),
  preview_html_url text,
  draft_pdf_url text,
  generated_doc_url text,
  generated_pdf_url text,
  signed_doc_url text,
  stamped_pdf_url text,
  stamp_provider text,
  stamp_transaction_id text,
  stamp_status text,
  stamp_cost numeric(18,2),
  meterai_serial_number text,
  stamped_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS soundpub.copyright_registration_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES soundpub.copyright_registrations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(18,2) NOT NULL DEFAULT 100000 CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'IDR',
  payment_provider text,
  payment_reference text,
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'expired', 'refunded', 'cancelled')),
  includes_emeterai boolean NOT NULL DEFAULT true,
  emeterai_quantity integer NOT NULL DEFAULT 1 CHECK (emeterai_quantity >= 0),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_copyright_registrations_active_composer_code
  ON soundpub.copyright_registrations(composer_code)
  WHERE composer_code IS NOT NULL AND status IN ('approved', 'contract_generated', 'stamping_pending', 'stamped', 'contract_signed', 'active');

CREATE INDEX IF NOT EXISTS idx_copyright_registrations_user_id ON soundpub.copyright_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_copyright_registrations_status ON soundpub.copyright_registrations(status);
CREATE INDEX IF NOT EXISTS idx_copyright_registration_works_registration_id ON soundpub.copyright_registration_works(registration_id);
CREATE INDEX IF NOT EXISTS idx_copyright_registration_files_registration_id ON soundpub.copyright_registration_files(registration_id);
CREATE INDEX IF NOT EXISTS idx_copyright_registration_payments_registration_id ON soundpub.copyright_registration_payments(registration_id);
CREATE INDEX IF NOT EXISTS idx_copyright_contracts_registration_id ON soundpub.copyright_contracts(registration_id);
CREATE INDEX IF NOT EXISTS idx_composer_royalties_composer_id ON soundpub.composer_royalties(composer_id);
CREATE INDEX IF NOT EXISTS idx_composer_royalties_period ON soundpub.composer_royalties(period);
CREATE INDEX IF NOT EXISTS idx_profiles_composer_code ON soundpub.profiles(composer_code);

ALTER TABLE soundpub.copyright_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.copyright_registration_works ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.copyright_registration_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.copyright_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.copyright_registration_payments ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_copyright_registrations_timestamp ON soundpub.copyright_registrations;
CREATE TRIGGER update_copyright_registrations_timestamp
  BEFORE UPDATE ON soundpub.copyright_registrations
  FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();

DROP TRIGGER IF EXISTS update_copyright_registration_works_timestamp ON soundpub.copyright_registration_works;
CREATE TRIGGER update_copyright_registration_works_timestamp
  BEFORE UPDATE ON soundpub.copyright_registration_works
  FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();

DROP TRIGGER IF EXISTS update_copyright_contracts_timestamp ON soundpub.copyright_contracts;
CREATE TRIGGER update_copyright_contracts_timestamp
  BEFORE UPDATE ON soundpub.copyright_contracts
  FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();

DROP TRIGGER IF EXISTS update_copyright_registration_payments_timestamp ON soundpub.copyright_registration_payments;
CREATE TRIGGER update_copyright_registration_payments_timestamp
  BEFORE UPDATE ON soundpub.copyright_registration_payments
  FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();

-- copyright_registrations policies
DROP POLICY IF EXISTS "Users can view their copyright registrations" ON soundpub.copyright_registrations;
CREATE POLICY "Users can view their copyright registrations"
  ON soundpub.copyright_registrations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR soundpub.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can create their copyright registrations" ON soundpub.copyright_registrations;
CREATE POLICY "Users can create their copyright registrations"
  ON soundpub.copyright_registrations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update draft copyright registrations" ON soundpub.copyright_registrations;
CREATE POLICY "Users can update draft copyright registrations"
  ON soundpub.copyright_registrations FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status IN ('draft', 'revision_requested', 'awaiting_payment'))
  WITH CHECK (
    user_id = auth.uid()
    AND status IN ('draft', 'awaiting_payment', 'revision_requested')
    AND composer_code IS NULL
    AND contract_number IS NULL
  );

DROP POLICY IF EXISTS "Admins can manage copyright registrations" ON soundpub.copyright_registrations;
CREATE POLICY "Admins can manage copyright registrations"
  ON soundpub.copyright_registrations FOR ALL TO authenticated
  USING (soundpub.is_admin(auth.uid()))
  WITH CHECK (soundpub.is_admin(auth.uid()));

-- works policies inherit registration ownership
DROP POLICY IF EXISTS "Users can view their copyright works" ON soundpub.copyright_registration_works;
CREATE POLICY "Users can view their copyright works"
  ON soundpub.copyright_registration_works FOR SELECT TO authenticated
  USING (
    soundpub.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM soundpub.copyright_registrations cr
      WHERE cr.id = registration_id AND cr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage draft copyright works" ON soundpub.copyright_registration_works;
CREATE POLICY "Users can manage draft copyright works"
  ON soundpub.copyright_registration_works FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM soundpub.copyright_registrations cr
      WHERE cr.id = registration_id
        AND cr.user_id = auth.uid()
        AND cr.status IN ('draft', 'revision_requested')
    )
    OR soundpub.is_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM soundpub.copyright_registrations cr
      WHERE cr.id = registration_id
        AND cr.user_id = auth.uid()
        AND cr.status IN ('draft', 'revision_requested')
    )
    OR soundpub.is_admin(auth.uid())
  );

-- files policies inherit registration ownership
DROP POLICY IF EXISTS "Users can view their copyright files" ON soundpub.copyright_registration_files;
CREATE POLICY "Users can view their copyright files"
  ON soundpub.copyright_registration_files FOR SELECT TO authenticated
  USING (
    soundpub.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM soundpub.copyright_registrations cr
      WHERE cr.id = registration_id AND cr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can upload copyright files" ON soundpub.copyright_registration_files;
CREATE POLICY "Users can upload copyright files"
  ON soundpub.copyright_registration_files FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      soundpub.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM soundpub.copyright_registrations cr
        WHERE cr.id = registration_id
          AND cr.user_id = auth.uid()
          AND cr.status IN ('draft', 'revision_requested')
      )
    )
  );

DROP POLICY IF EXISTS "Admins can manage copyright files" ON soundpub.copyright_registration_files;
CREATE POLICY "Admins can manage copyright files"
  ON soundpub.copyright_registration_files FOR ALL TO authenticated
  USING (soundpub.is_admin(auth.uid()))
  WITH CHECK (soundpub.is_admin(auth.uid()));

-- contracts policies
DROP POLICY IF EXISTS "Users can view their copyright contracts" ON soundpub.copyright_contracts;
CREATE POLICY "Users can view their copyright contracts"
  ON soundpub.copyright_contracts FOR SELECT TO authenticated
  USING (
    soundpub.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM soundpub.copyright_registrations cr
      WHERE cr.id = registration_id AND cr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can manage copyright contracts" ON soundpub.copyright_contracts;
CREATE POLICY "Admins can manage copyright contracts"
  ON soundpub.copyright_contracts FOR ALL TO authenticated
  USING (soundpub.is_admin(auth.uid()))
  WITH CHECK (soundpub.is_admin(auth.uid()));

-- payments policies
DROP POLICY IF EXISTS "Users can view their copyright payments" ON soundpub.copyright_registration_payments;
CREATE POLICY "Users can view their copyright payments"
  ON soundpub.copyright_registration_payments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR soundpub.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can create their copyright payments" ON soundpub.copyright_registration_payments;
CREATE POLICY "Users can create their copyright payments"
  ON soundpub.copyright_registration_payments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND amount = 100000
    AND includes_emeterai = true
    AND emeterai_quantity = 1
    AND EXISTS (
      SELECT 1 FROM soundpub.copyright_registrations cr
      WHERE cr.id = registration_id AND cr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can manage copyright payments" ON soundpub.copyright_registration_payments;
CREATE POLICY "Admins can manage copyright payments"
  ON soundpub.copyright_registration_payments FOR ALL TO authenticated
  USING (soundpub.is_admin(auth.uid()))
  WITH CHECK (soundpub.is_admin(auth.uid()));

-- Harden composer royalties read access around composer_code.
-- Keep admin full access; copyright users can only read rows matching their profile composer_code.
DROP POLICY IF EXISTS "Copyright users can view their composer royalties" ON soundpub.composer_royalties;
DROP POLICY IF EXISTS "Copyright users can view royalties by composer code" ON soundpub.composer_royalties;
CREATE POLICY "Copyright users can view royalties by composer code"
  ON soundpub.composer_royalties FOR SELECT TO authenticated
  USING (
    soundpub.has_role(auth.uid(), 'copyright'::soundpub.app_role)
    AND EXISTS (
      SELECT 1 FROM soundpub.profiles p
      WHERE p.id = auth.uid()
        AND p.composer_code IS NOT NULL
        AND p.composer_code = soundpub.composer_royalties.composer_id
    )
  );

CREATE OR REPLACE FUNCTION soundpub.get_my_composer_royalties(_period text DEFAULT NULL::text)
RETURNS TABLE(
  id uuid,
  composer_code text,
  composer_name text,
  total_net_royalti numeric,
  period text,
  upload_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = soundpub
AS $$
DECLARE
  _uid uuid := auth.uid();
  _composer_code text;
BEGIN
  SELECT p.composer_code INTO _composer_code
  FROM soundpub.profiles p
  WHERE p.id = _uid;

  IF soundpub.is_admin(_uid) THEN
    RETURN QUERY
    SELECT cr.id, cr.composer_id, cr.composer_name, cr.total_net_royalti, cr.period, cr.upload_id, cr.created_at
    FROM soundpub.composer_royalties cr
    WHERE _period IS NULL OR cr.period = _period
    ORDER BY cr.period DESC NULLS LAST, cr.created_at DESC;
    RETURN;
  END IF;

  IF NOT soundpub.has_role(_uid, 'copyright'::soundpub.app_role) OR _composer_code IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT cr.id, cr.composer_id, cr.composer_name, cr.total_net_royalti, cr.period, cr.upload_id, cr.created_at
  FROM soundpub.composer_royalties cr
  WHERE cr.composer_id = _composer_code
    AND (_period IS NULL OR cr.period = _period)
  ORDER BY cr.period DESC NULLS LAST, cr.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION soundpub.get_my_composer_royalties(text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION soundpub.get_my_composer_royalties(text) TO authenticated;

CREATE OR REPLACE FUNCTION soundpub.generate_composer_code(_prefix text DEFAULT 'SPC')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = soundpub
AS $$
DECLARE
  _next_number integer;
  _code text;
BEGIN
  IF NOT soundpub.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can generate composer codes';
  END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(composer_code, '[^0-9]', '', 'g'), '')::integer), 0) + 1
  INTO _next_number
  FROM soundpub.profiles
  WHERE composer_code LIKE _prefix || '%';

  _code := _prefix || lpad(_next_number::text, 5, '0');
  RETURN _code;
END;
$$;

REVOKE EXECUTE ON FUNCTION soundpub.generate_composer_code(text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION soundpub.generate_composer_code(text) TO authenticated;

CREATE OR REPLACE FUNCTION soundpub.generate_copyright_contract_number(_prefix text DEFAULT 'Soundpub')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = soundpub
AS $$
DECLARE
  _next_number integer;
BEGIN
  IF NOT soundpub.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can generate contract numbers';
  END IF;

  SELECT COUNT(*)::integer + 1 INTO _next_number
  FROM soundpub.copyright_contracts
  WHERE date_trunc('year', created_at) = date_trunc('year', now());

  RETURN 'P' || lpad(_next_number::text, 5, '0') || '/' || _prefix || '/' || to_char(now(), 'MM') || '/PBLSR/' || to_char(now(), 'YYYY');
END;
$$;

REVOKE EXECUTE ON FUNCTION soundpub.generate_copyright_contract_number(text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION soundpub.generate_copyright_contract_number(text) TO authenticated;

CREATE OR REPLACE FUNCTION soundpub.admin_review_copyright_registration(
  _registration_id uuid,
  _status text,
  _admin_notes text DEFAULT NULL,
  _revision_notes text DEFAULT NULL,
  _composer_code text DEFAULT NULL,
  _contract_number text DEFAULT NULL
)
RETURNS soundpub.copyright_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = soundpub
AS $$
DECLARE
  _updated soundpub.copyright_registrations;
BEGIN
  IF NOT soundpub.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can review copyright registrations';
  END IF;

  IF _status NOT IN (
    'in_review',
    'revision_requested',
    'approved',
    'rejected',
    'contract_generated',
    'stamping_pending',
    'stamped',
    'contract_signed',
    'active'
  ) THEN
    RAISE EXCEPTION 'Invalid copyright registration review status: %', _status;
  END IF;

  UPDATE soundpub.copyright_registrations
  SET
    status = _status,
    admin_notes = COALESCE(_admin_notes, admin_notes),
    revision_notes = CASE WHEN _status = 'revision_requested' THEN _revision_notes ELSE revision_notes END,
    composer_code = COALESCE(_composer_code, composer_code),
    contract_number = COALESCE(_contract_number, contract_number),
    reviewed_at = CASE WHEN reviewed_at IS NULL THEN now() ELSE reviewed_at END,
    approved_at = CASE WHEN _status IN ('approved', 'contract_generated', 'stamping_pending', 'stamped', 'contract_signed', 'active') THEN COALESCE(approved_at, now()) ELSE approved_at END,
    rejected_at = CASE WHEN _status = 'rejected' THEN now() ELSE rejected_at END,
    updated_at = now()
  WHERE id = _registration_id
  RETURNING * INTO _updated;

  IF _updated.id IS NULL THEN
    RAISE EXCEPTION 'Copyright registration not found: %', _registration_id;
  END IF;

  IF _updated.composer_code IS NOT NULL THEN
    UPDATE soundpub.profiles
    SET composer_code = _updated.composer_code,
        updated_at = now()
    WHERE id = _updated.user_id;
  END IF;

  IF _status = 'active' THEN
    UPDATE soundpub.user_roles
    SET role = 'copyright'::soundpub.app_role
    WHERE user_id = _updated.user_id
      AND role = 'user'::soundpub.app_role;

    IF NOT EXISTS (
      SELECT 1 FROM soundpub.user_roles
      WHERE user_id = _updated.user_id
        AND role = 'copyright'::soundpub.app_role
    ) THEN
      INSERT INTO soundpub.user_roles (user_id, role)
      VALUES (_updated.user_id, 'copyright'::soundpub.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;

  RETURN _updated;
END;
$$;

REVOKE EXECUTE ON FUNCTION soundpub.admin_review_copyright_registration(uuid,text,text,text,text,text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION soundpub.admin_review_copyright_registration(uuid,text,text,text,text,text) TO authenticated;




