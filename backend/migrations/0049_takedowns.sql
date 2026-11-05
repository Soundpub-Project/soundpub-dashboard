CREATE TABLE soundpub.takedown_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_code text NOT NULL UNIQUE CHECK (request_code ~ '^TD-[0-9A-F]{12}$'),
  scope_key text NOT NULL CHECK (scope_key ~ '^[0-9a-f]{64}$'),
  requester_id uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  label_id uuid NOT NULL REFERENCES soundpub.profiles(id) ON DELETE RESTRICT,
  request_type text NOT NULL DEFAULT 'standard' CHECK (request_type IN ('standard','partial','urgent')),
  reason_category text NOT NULL CHECK (length(btrim(reason_category)) BETWEEN 1 AND 200),
  reason_detail text NOT NULL CHECK (length(btrim(reason_detail)) BETWEEN 1 AND 10000),
  other_reason text CHECK (length(btrim(other_reason)) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','UNDER_REVIEW','NEED_DOCUMENT','APPROVED',
    'SENT_TO_DSP','PROCESSING_DSP','PARTIALLY_COMPLETED','COMPLETED','REJECTED','CANCEL_REQUESTED','CANCELLED')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
  contact_name text NOT NULL CHECK (length(btrim(contact_name)) BETWEEN 1 AND 200),
  contact_position text NOT NULL CHECK (length(btrim(contact_position)) BETWEEN 1 AND 200),
  contact_phone text NOT NULL CHECK (length(btrim(contact_phone)) BETWEEN 1 AND 50),
  contact_email text NOT NULL CHECK (length(contact_email) <= 320 AND position('@' in contact_email) > 1),
  contact_address text NOT NULL CHECK (length(btrim(contact_address)) BETWEEN 1 AND 2000),
  declaration_version text NOT NULL CHECK (declaration_version = 'takedown-tor-v1'),
  declaration_checksum text NOT NULL CHECK (declaration_checksum ~ '^[0-9a-f]{64}$'),
  declaration_accepted_at timestamptz NOT NULL,
  reviewer_id uuid REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  review_note text CHECK (length(review_note) <= 10000),
  rejection_reason text CHECK (length(rejection_reason) <= 10000),
  submitted_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, sent_to_dsp_at timestamptz, completed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((reason_category = 'Lainnya') = (other_reason IS NOT NULL)),
  CHECK (reason_category <> 'Lainnya' OR cardinality(regexp_split_to_array(btrim(other_reason), '\s+')) >= 5)
);
CREATE UNIQUE INDEX takedown_requests_active_scope_idx ON soundpub.takedown_requests(scope_key)
  WHERE status NOT IN ('COMPLETED','REJECTED','CANCELLED');
CREATE INDEX takedown_requests_requester_idx ON soundpub.takedown_requests(requester_id, created_at DESC, id DESC);
CREATE INDEX takedown_requests_label_idx ON soundpub.takedown_requests(label_id, created_at DESC, id DESC);
CREATE INDEX takedown_requests_status_idx ON soundpub.takedown_requests(status, created_at DESC, id DESC);

CREATE TABLE soundpub.takedown_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES soundpub.takedown_requests(id) ON DELETE CASCADE,
  release_id uuid NOT NULL REFERENCES soundpub.releases(id) ON DELETE RESTRICT, track_id uuid REFERENCES soundpub.tracks(id) ON DELETE RESTRICT,
  title_snapshot text NOT NULL, artist_name_snapshot text NOT NULL, upc_snapshot text, isrc_snapshot text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (request_id, release_id, track_id)
);
CREATE INDEX takedown_items_release_idx ON soundpub.takedown_request_items(release_id, request_id);

CREATE TABLE soundpub.takedown_request_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES soundpub.takedown_requests(id) ON DELETE CASCADE,
  dsp_name text NOT NULL CHECK (dsp_name IN ('Spotify','Apple Music','YouTube Music','Meta','TikTok','Deezer','Amazon Music','Tidal')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUBMITTED','PROCESSING','COMPLETED','REJECTED')),
  external_reference text CHECK (length(external_reference) <= 1000), submitted_at timestamptz, completed_at timestamptz,
  failure_reason text CHECK (length(failure_reason) <= 10000), admin_note text CHECK (length(admin_note) <= 10000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, dsp_name)
);

CREATE TABLE soundpub.takedown_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES soundpub.takedown_requests(id) ON DELETE CASCADE,
  old_status text CHECK (old_status IS NULL OR old_status IN ('SUBMITTED','UNDER_REVIEW','NEED_DOCUMENT','APPROVED','SENT_TO_DSP',
    'PROCESSING_DSP','PARTIALLY_COMPLETED','COMPLETED','REJECTED','CANCEL_REQUESTED','CANCELLED')),
  new_status text NOT NULL CHECK (new_status IN ('SUBMITTED','UNDER_REVIEW','NEED_DOCUMENT','APPROVED','SENT_TO_DSP',
    'PROCESSING_DSP','PARTIALLY_COMPLETED','COMPLETED','REJECTED','CANCEL_REQUESTED','CANCELLED')),
  changed_by uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT, note text CHECK (length(note) <= 10000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX takedown_history_request_idx ON soundpub.takedown_status_history(request_id, created_at, id);

CREATE TABLE soundpub.takedown_request_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES soundpub.takedown_requests(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  storage_asset_id uuid NOT NULL UNIQUE REFERENCES soundpub.storage_assets(id) ON DELETE RESTRICT,
  file_name text NOT NULL CHECK (length(btrim(file_name)) BETWEEN 1 AND 500), document_type text CHECK (length(document_type) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION soundpub.takedown_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW.id,NEW.requester_id,NEW.label_id,NEW.request_type,NEW.reason_category,NEW.reason_detail,NEW.other_reason,
      NEW.request_code,NEW.scope_key,NEW.contact_name,NEW.contact_position,NEW.contact_phone,NEW.contact_email,NEW.contact_address,
      NEW.declaration_version,NEW.declaration_checksum,NEW.declaration_accepted_at,
      NEW.submitted_at,NEW.created_at) IS DISTINCT FROM
      ROW(OLD.id,OLD.requester_id,OLD.label_id,OLD.request_type,OLD.reason_category,OLD.reason_detail,OLD.other_reason,
      OLD.request_code,OLD.scope_key,OLD.contact_name,OLD.contact_position,OLD.contact_phone,OLD.contact_email,OLD.contact_address,
      OLD.declaration_version,OLD.declaration_checksum,OLD.declaration_accepted_at,
      OLD.submitted_at,OLD.created_at) THEN RAISE EXCEPTION 'takedown submission is immutable' USING ERRCODE='23514'; END IF;
    NEW.version:=OLD.version+1; NEW.updated_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION soundpub.takedown_guard() FROM PUBLIC,soundpub_app;
CREATE TRIGGER takedown_requests_guard BEFORE UPDATE ON soundpub.takedown_requests FOR EACH ROW EXECUTE FUNCTION soundpub.takedown_guard();

REVOKE ALL ON soundpub.takedown_requests,soundpub.takedown_request_items,soundpub.takedown_request_targets,
  soundpub.takedown_status_history,soundpub.takedown_request_documents FROM PUBLIC,soundpub_app;
GRANT SELECT ON soundpub.takedown_requests,soundpub.takedown_request_items,soundpub.takedown_request_targets,
  soundpub.takedown_status_history,soundpub.takedown_request_documents TO soundpub_app;
GRANT INSERT (id,request_code,scope_key,requester_id,label_id,request_type,reason_category,reason_detail,other_reason,status,priority,contact_name,
  contact_position,contact_phone,contact_email,contact_address,declaration_version,declaration_checksum,declaration_accepted_at)
  ON soundpub.takedown_requests TO soundpub_app;
GRANT UPDATE (status,reviewer_id,review_note,rejection_reason,reviewed_at,sent_to_dsp_at,completed_at,updated_at)
  ON soundpub.takedown_requests TO soundpub_app;
GRANT INSERT (id,request_id,release_id,track_id,title_snapshot,artist_name_snapshot,upc_snapshot,isrc_snapshot)
  ON soundpub.takedown_request_items TO soundpub_app;
GRANT INSERT (id,request_id,dsp_name) ON soundpub.takedown_request_targets TO soundpub_app;
GRANT INSERT (id,request_id,old_status,new_status,changed_by,note) ON soundpub.takedown_status_history TO soundpub_app;
GRANT UPDATE (status,external_reference,submitted_at,completed_at,failure_reason,admin_note,updated_at)
  ON soundpub.takedown_request_targets TO soundpub_app;
GRANT INSERT (id,request_id,uploaded_by,storage_asset_id,file_name,document_type)
  ON soundpub.takedown_request_documents TO soundpub_app;
