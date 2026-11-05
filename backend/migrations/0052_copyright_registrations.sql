-- Backend-owned Copyright Registration aggregate. No legacy rows are imported.
CREATE TABLE soundpub.copyright_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_code text NOT NULL UNIQUE CHECK (registration_code ~ '^CR-[0-9A-F]{12}$'),
  owner_id uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  applicant_type text NOT NULL CHECK (applicant_type IN ('PERSONAL','BAND_REPRESENTATIVE','COMPANY_LABEL')),
  legal_name text NOT NULL CHECK (length(btrim(legal_name)) BETWEEN 1 AND 200),
  stage_name text CHECK (stage_name IS NULL OR length(btrim(stage_name)) BETWEEN 1 AND 200),
  identity_number text CHECK (identity_number IS NULL OR length(btrim(identity_number)) BETWEEN 4 AND 100),
  tax_number text CHECK (tax_number IS NULL OR length(btrim(tax_number)) BETWEEN 4 AND 100),
  email text NOT NULL CHECK (length(email) <= 320 AND position('@' in email) > 1),
  phone text NOT NULL CHECK (length(btrim(phone)) BETWEEN 3 AND 50),
  address jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(address)='object'),
  bank_name text CHECK (bank_name IS NULL OR length(btrim(bank_name)) BETWEEN 1 AND 200),
  bank_account_number text CHECK (bank_account_number IS NULL OR length(btrim(bank_account_number)) BETWEEN 1 AND 100),
  bank_account_name text CHECK (bank_account_name IS NULL OR length(btrim(bank_account_name)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','AWAITING_PAYMENT','PAID_PENDING_REVIEW','IN_REVIEW',
    'REVISION_REQUESTED','APPROVED','REJECTED','CONTRACT_GENERATED','STAMPING_PENDING','STAMPED','CONTRACT_SIGNED','ACTIVE')),
  terms_version text CHECK (terms_version IS NULL OR length(btrim(terms_version)) BETWEEN 1 AND 100),
  terms_checksum text CHECK (terms_checksum IS NULL OR terms_checksum ~ '^[0-9a-f]{64}$'),
  terms_accepted_at timestamptz,
  reviewer_id uuid REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 10000),
  revision_note text CHECK (revision_note IS NULL OR length(revision_note) <= 10000),
  submitted_at timestamptz, reviewed_at timestamptz, approved_at timestamptz, rejected_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((bank_account_number IS NULL) = (bank_account_name IS NULL)),
  CHECK (num_nonnulls(terms_version,terms_checksum,terms_accepted_at) IN (0,3)),
  CHECK (status='DRAFT' OR terms_accepted_at IS NOT NULL),
  CHECK (status NOT IN ('REVISION_REQUESTED') OR revision_note IS NOT NULL),
  CHECK (status NOT IN ('REJECTED') OR review_note IS NOT NULL),
  UNIQUE(id,owner_id), UNIQUE(owner_id)
);
CREATE INDEX copyright_registrations_owner_idx ON soundpub.copyright_registrations(owner_id,created_at DESC,id DESC);
CREATE INDEX copyright_registrations_status_idx ON soundpub.copyright_registrations(status,created_at DESC,id DESC);

CREATE TABLE soundpub.copyright_registration_works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES soundpub.copyright_registrations(id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 1000),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 500),
  alternate_title text CHECK (alternate_title IS NULL OR length(btrim(alternate_title)) BETWEEN 1 AND 500),
  composer_name text NOT NULL CHECK (length(btrim(composer_name)) BETWEEN 1 AND 500),
  lyricist_name text CHECK (lyricist_name IS NULL OR length(btrim(lyricist_name)) BETWEEN 1 AND 500),
  ownership_basis_points integer NOT NULL CHECK (ownership_basis_points BETWEEN 1 AND 10000),
  collaboration boolean NOT NULL DEFAULT false,
  cowriters jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(cowriters)='array'),
  release_status text NOT NULL DEFAULT 'UNRELEASED' CHECK (release_status IN ('UNRELEASED','RELEASED','UNKNOWN')),
  release_date date, isrc text CHECK (isrc IS NULL OR isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'),
  upc text CHECK (upc IS NULL OR upc ~ '^[0-9]{8,14}$'),
  links jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(links)='array'),
  lyrics text CHECK (lyrics IS NULL OR length(lyrics) <= 200000), notes text CHECK (notes IS NULL OR length(notes) <= 10000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(registration_id,position), UNIQUE(id,registration_id),
  CHECK ((release_status='RELEASED') = (release_date IS NOT NULL))
);
CREATE INDEX copyright_registration_works_registration_idx ON soundpub.copyright_registration_works(registration_id,id);

-- Media migration will add the COPYRIGHT_REGISTRATION_DOCUMENT category/binding policy.
CREATE TABLE soundpub.copyright_registration_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES soundpub.copyright_registrations(id) ON DELETE RESTRICT,
  work_id uuid,
  media_object_id uuid NOT NULL UNIQUE REFERENCES soundpub.media_objects(id) ON DELETE RESTRICT,
  file_type text NOT NULL CHECK (file_type IN ('IDENTITY','TAX','POWER_OF_ATTORNEY','AUDIO_DEMO','LYRICS','WORK_EVIDENCE',
    'CONTRACT_GENERATED','CONTRACT_STAMPED','CONTRACT_SIGNED','OTHER')),
  uploaded_by uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((file_type IN ('AUDIO_DEMO','LYRICS','WORK_EVIDENCE')) OR work_id IS NULL),
  FOREIGN KEY(work_id,registration_id) REFERENCES soundpub.copyright_registration_works(id,registration_id) ON DELETE RESTRICT
);
CREATE INDEX copyright_registration_files_registration_idx ON soundpub.copyright_registration_files(registration_id,created_at,id);

CREATE TABLE soundpub.copyright_registration_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL UNIQUE REFERENCES soundpub.copyright_registrations(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 9007199254740991),
  currency text NOT NULL DEFAULT 'IDR' CHECK (currency='IDR'), precision smallint NOT NULL DEFAULT 2 CHECK (precision=2),
  includes_emeterai boolean NOT NULL DEFAULT true, emeterai_quantity integer NOT NULL DEFAULT 1 CHECK (emeterai_quantity BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'INTENT' CHECK (status IN ('INTENT','PROVIDER_PENDING','PAID','FAILED','EXPIRED','CANCELLED','REFUNDED','RECONCILIATION_REQUIRED')),
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  provider text CHECK (provider IS NULL OR length(btrim(provider)) BETWEEN 1 AND 64),
  provider_external_id text UNIQUE CHECK (provider_external_id IS NULL OR length(provider_external_id) BETWEEN 1 AND 200),
  provider_invoice_id text UNIQUE CHECK (provider_invoice_id IS NULL OR length(provider_invoice_id) BETWEEN 1 AND 200),
  provider_invoice_url text CHECK (provider_invoice_url IS NULL OR provider_invoice_url ~ '^https://'),
  provider_status text CHECK (provider_status IS NULL OR length(provider_status) BETWEEN 1 AND 64),
  paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((status='INTENT' AND provider IS NULL AND provider_external_id IS NULL AND provider_invoice_id IS NULL AND provider_invoice_url IS NULL)
    OR (status<>'INTENT' AND provider IS NOT NULL AND provider_external_id IS NOT NULL)),
  CHECK (status<>'PROVIDER_PENDING' OR (provider_invoice_id IS NOT NULL AND provider_invoice_url IS NOT NULL)),
  CHECK ((status IN ('PAID','REFUNDED','RECONCILIATION_REQUIRED') AND paid_at IS NOT NULL)
    OR (status NOT IN ('PAID','REFUNDED') AND paid_at IS NULL)),
  FOREIGN KEY(registration_id,owner_id) REFERENCES soundpub.copyright_registrations(id,owner_id) ON DELETE RESTRICT
);
CREATE INDEX copyright_registration_payments_owner_idx ON soundpub.copyright_registration_payments(owner_id,created_at DESC,id DESC);

CREATE TABLE soundpub.copyright_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL UNIQUE REFERENCES soundpub.copyright_registrations(id) ON DELETE RESTRICT,
  contract_number text UNIQUE CHECK (contract_number IS NULL OR length(btrim(contract_number)) BETWEEN 1 AND 200),
  template_version text NOT NULL CHECK (length(btrim(template_version)) BETWEEN 1 AND 100),
  template_checksum text NOT NULL CHECK (template_checksum ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','GENERATED','STAMPING_PENDING','STAMPED','SIGNED','ACTIVE','VOID')),
  generated_media_id uuid UNIQUE REFERENCES soundpub.media_objects(id) ON DELETE RESTRICT,
  stamped_media_id uuid UNIQUE REFERENCES soundpub.media_objects(id) ON DELETE RESTRICT,
  signed_media_id uuid UNIQUE REFERENCES soundpub.media_objects(id) ON DELETE RESTRICT,
  stamp_provider text CHECK (stamp_provider IS NULL OR length(btrim(stamp_provider)) BETWEEN 1 AND 100),
  stamp_transaction_id text UNIQUE CHECK (stamp_transaction_id IS NULL OR length(stamp_transaction_id) BETWEEN 1 AND 200),
  stamp_evidence_checksum text CHECK (stamp_evidence_checksum IS NULL OR stamp_evidence_checksum ~ '^[0-9a-f]{64}$'),
  stamped_at timestamptz, signed_at timestamptz, activated_at timestamptz, void_reason text CHECK (void_reason IS NULL OR length(void_reason) <= 10000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (status NOT IN ('GENERATED','STAMPING_PENDING','STAMPED','SIGNED','ACTIVE') OR generated_media_id IS NOT NULL),
  CHECK (status NOT IN ('STAMPED','SIGNED','ACTIVE') OR (stamped_media_id IS NOT NULL AND stamped_at IS NOT NULL)),
  CHECK (status NOT IN ('SIGNED','ACTIVE') OR (signed_media_id IS NOT NULL AND signed_at IS NOT NULL)),
  CHECK (status<>'ACTIVE' OR activated_at IS NOT NULL), CHECK (status<>'VOID' OR void_reason IS NOT NULL)
);

CREATE TABLE soundpub.copyright_registration_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES soundpub.copyright_registrations(id) ON DELETE RESTRICT,
  old_status text CHECK (old_status IS NULL OR old_status IN ('DRAFT','AWAITING_PAYMENT','PAID_PENDING_REVIEW','IN_REVIEW',
    'REVISION_REQUESTED','APPROVED','REJECTED','CONTRACT_GENERATED','STAMPING_PENDING','STAMPED','CONTRACT_SIGNED','ACTIVE')),
  new_status text NOT NULL CHECK (new_status IN ('DRAFT','AWAITING_PAYMENT','PAID_PENDING_REVIEW','IN_REVIEW',
    'REVISION_REQUESTED','APPROVED','REJECTED','CONTRACT_GENERATED','STAMPING_PENDING','STAMPED','CONTRACT_SIGNED','ACTIVE')),
  changed_by uuid REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  system_actor text CHECK (system_actor IS NULL OR length(btrim(system_actor)) BETWEEN 1 AND 100),
  note text CHECK (note IS NULL OR length(note) <= 10000),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (num_nonnulls(changed_by,system_actor)=1), CHECK (old_status IS DISTINCT FROM new_status),
  UNIQUE(registration_id,idempotency_key)
);
CREATE INDEX copyright_registration_history_idx ON soundpub.copyright_registration_status_history(registration_id,created_at,id);

CREATE FUNCTION soundpub.copyright_registration_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF ROW(NEW.id,NEW.registration_code,NEW.owner_id,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.registration_code,OLD.owner_id,OLD.created_at)
  THEN RAISE EXCEPTION 'copyright registration identity is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.terms_accepted_at IS NOT NULL AND ROW(NEW.terms_version,NEW.terms_checksum,NEW.terms_accepted_at)
    IS DISTINCT FROM ROW(OLD.terms_version,OLD.terms_checksum,OLD.terms_accepted_at)
  THEN RAISE EXCEPTION 'copyright registration terms are immutable' USING ERRCODE='23514'; END IF;
  IF OLD.status='DRAFT' AND NEW.status='AWAITING_PAYMENT' AND NEW.terms_accepted_at IS NULL
  THEN RAISE EXCEPTION 'copyright registration terms required' USING ERRCODE='23514'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='DRAFT' AND NEW.status='AWAITING_PAYMENT') OR
    (OLD.status='AWAITING_PAYMENT' AND NEW.status='PAID_PENDING_REVIEW') OR
    (OLD.status='PAID_PENDING_REVIEW' AND NEW.status='IN_REVIEW') OR
    (OLD.status='IN_REVIEW' AND NEW.status IN ('REVISION_REQUESTED','APPROVED','REJECTED')) OR
    (OLD.status='REVISION_REQUESTED' AND NEW.status='IN_REVIEW') OR
    (OLD.status='APPROVED' AND NEW.status='CONTRACT_GENERATED') OR
    (OLD.status='CONTRACT_GENERATED' AND NEW.status='STAMPING_PENDING') OR
    (OLD.status='STAMPING_PENDING' AND NEW.status='STAMPED') OR
    (OLD.status='STAMPED' AND NEW.status='CONTRACT_SIGNED') OR
    (OLD.status='CONTRACT_SIGNED' AND NEW.status='ACTIVE'))
  THEN RAISE EXCEPTION 'invalid copyright registration transition' USING ERRCODE='23514'; END IF;
  NEW.version:=OLD.version+1; NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;

CREATE FUNCTION soundpub.copyright_payment_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF ROW(NEW.id,NEW.registration_id,NEW.owner_id,NEW.amount_minor,NEW.currency,NEW.precision,NEW.includes_emeterai,
    NEW.emeterai_quantity,NEW.idempotency_key,NEW.request_hash,NEW.created_at) IS DISTINCT FROM
    ROW(OLD.id,OLD.registration_id,OLD.owner_id,OLD.amount_minor,OLD.currency,OLD.precision,OLD.includes_emeterai,
    OLD.emeterai_quantity,OLD.idempotency_key,OLD.request_hash,OLD.created_at)
  THEN RAISE EXCEPTION 'copyright payment intent is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='INTENT' AND NEW.status IN ('PROVIDER_PENDING','CANCELLED')) OR
    (OLD.status='PROVIDER_PENDING' AND NEW.status IN ('PAID','FAILED','EXPIRED','CANCELLED','RECONCILIATION_REQUIRED')) OR
    (OLD.status IN ('FAILED','EXPIRED') AND NEW.status='RECONCILIATION_REQUIRED') OR
    (OLD.status='PAID' AND NEW.status IN ('REFUNDED','RECONCILIATION_REQUIRED')))
  THEN RAISE EXCEPTION 'invalid copyright payment transition' USING ERRCODE='23514'; END IF;
  NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;

CREATE FUNCTION soundpub.copyright_contract_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF ROW(NEW.id,NEW.registration_id,NEW.template_version,NEW.template_checksum,NEW.created_at) IS DISTINCT FROM
    ROW(OLD.id,OLD.registration_id,OLD.template_version,OLD.template_checksum,OLD.created_at)
  THEN RAISE EXCEPTION 'copyright contract identity is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='DRAFT' AND NEW.status IN ('GENERATED','VOID')) OR
    (OLD.status='GENERATED' AND NEW.status IN ('STAMPING_PENDING','VOID')) OR
    (OLD.status='STAMPING_PENDING' AND NEW.status IN ('STAMPED','VOID')) OR
    (OLD.status='STAMPED' AND NEW.status IN ('SIGNED','VOID')) OR
    (OLD.status='SIGNED' AND NEW.status IN ('ACTIVE','VOID')))
  THEN RAISE EXCEPTION 'invalid copyright contract transition' USING ERRCODE='23514'; END IF;
  NEW.version:=OLD.version+1; NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;

CREATE FUNCTION soundpub.copyright_draft_child_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE parent_status text;
BEGIN
  SELECT status INTO parent_status FROM soundpub.copyright_registrations
    WHERE id=COALESCE(NEW.registration_id,OLD.registration_id) FOR SHARE;
  IF parent_status NOT IN ('DRAFT','REVISION_REQUESTED')
  THEN RAISE EXCEPTION 'copyright registration evidence is frozen' USING ERRCODE='23514'; END IF;
  RETURN COALESCE(NEW,OLD);
END $$;

REVOKE ALL ON FUNCTION soundpub.copyright_registration_guard(),soundpub.copyright_payment_guard(),soundpub.copyright_contract_guard(),
  soundpub.copyright_draft_child_guard()
  FROM PUBLIC,soundpub_app;
CREATE TRIGGER copyright_registrations_guard BEFORE UPDATE ON soundpub.copyright_registrations
  FOR EACH ROW EXECUTE FUNCTION soundpub.copyright_registration_guard();
CREATE TRIGGER copyright_payments_guard BEFORE UPDATE ON soundpub.copyright_registration_payments
  FOR EACH ROW EXECUTE FUNCTION soundpub.copyright_payment_guard();
CREATE TRIGGER copyright_contracts_guard BEFORE UPDATE ON soundpub.copyright_contracts
  FOR EACH ROW EXECUTE FUNCTION soundpub.copyright_contract_guard();
CREATE TRIGGER copyright_works_draft_guard BEFORE UPDATE OR DELETE ON soundpub.copyright_registration_works
  FOR EACH ROW EXECUTE FUNCTION soundpub.copyright_draft_child_guard();
CREATE TRIGGER copyright_files_draft_guard BEFORE UPDATE OR DELETE ON soundpub.copyright_registration_files
  FOR EACH ROW EXECUTE FUNCTION soundpub.copyright_draft_child_guard();
CREATE TRIGGER copyright_history_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON soundpub.copyright_registration_status_history
  FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable();

REVOKE ALL ON soundpub.copyright_registrations,soundpub.copyright_registration_works,soundpub.copyright_registration_files,
  soundpub.copyright_registration_payments,soundpub.copyright_contracts,soundpub.copyright_registration_status_history
  FROM PUBLIC,soundpub_app;
GRANT SELECT ON soundpub.copyright_registrations,soundpub.copyright_registration_works,soundpub.copyright_registration_files,
  soundpub.copyright_registration_payments,soundpub.copyright_contracts,soundpub.copyright_registration_status_history TO soundpub_app;
GRANT INSERT (id,registration_code,owner_id,applicant_type,legal_name,stage_name,identity_number,tax_number,email,phone,address,
  bank_name,bank_account_number,bank_account_name,status,terms_version,terms_checksum,terms_accepted_at)
  ON soundpub.copyright_registrations TO soundpub_app;
GRANT UPDATE (applicant_type,legal_name,stage_name,identity_number,tax_number,email,phone,address,bank_name,bank_account_number,bank_account_name,
  status,terms_version,terms_checksum,terms_accepted_at,reviewer_id,review_note,revision_note,submitted_at,reviewed_at,
  approved_at,rejected_at,updated_at)
  ON soundpub.copyright_registrations TO soundpub_app;
GRANT INSERT (id,registration_id,position,title,alternate_title,composer_name,lyricist_name,ownership_basis_points,collaboration,
  cowriters,release_status,release_date,isrc,upc,links,lyrics,notes) ON soundpub.copyright_registration_works TO soundpub_app;
GRANT UPDATE (position,title,alternate_title,composer_name,lyricist_name,ownership_basis_points,collaboration,cowriters,
  release_status,release_date,isrc,upc,links,lyrics,notes,updated_at), DELETE ON soundpub.copyright_registration_works TO soundpub_app;
GRANT INSERT (id,registration_id,work_id,media_object_id,file_type,uploaded_by) ON soundpub.copyright_registration_files TO soundpub_app;
GRANT DELETE ON soundpub.copyright_registration_files TO soundpub_app;
GRANT INSERT (id,registration_id,owner_id,amount_minor,currency,precision,includes_emeterai,emeterai_quantity,status,idempotency_key,request_hash)
  ON soundpub.copyright_registration_payments TO soundpub_app;
GRANT UPDATE (status,provider,provider_external_id,provider_invoice_id,provider_invoice_url,provider_status,paid_at,updated_at)
  ON soundpub.copyright_registration_payments TO soundpub_app;
GRANT INSERT (id,registration_id,contract_number,template_version,template_checksum,status) ON soundpub.copyright_contracts TO soundpub_app;
GRANT UPDATE (contract_number,status,generated_media_id,stamped_media_id,signed_media_id,stamp_provider,stamp_transaction_id,
  stamp_evidence_checksum,stamped_at,signed_at,activated_at,void_reason,updated_at) ON soundpub.copyright_contracts TO soundpub_app;
GRANT INSERT (id,registration_id,old_status,new_status,changed_by,system_actor,note,idempotency_key,request_hash)
  ON soundpub.copyright_registration_status_history TO soundpub_app;
