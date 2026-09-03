CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE Soundpub.takedown_request_type AS ENUM ('standard', 'partial', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE Soundpub.takedown_status AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'NEED_DOCUMENT', 'APPROVED', 'SENT_TO_DSP', 'PROCESSING_DSP', 'PARTIALLY_COMPLETED', 'COMPLETED', 'REJECTED', 'CANCEL_REQUESTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE Soundpub.takedown_target_status AS ENUM ('PENDING', 'SUBMITTED', 'PROCESSING', 'COMPLETED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION Soundpub.get_soundpub_label_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = Soundpub, public AS $$
  SELECT p.id FROM Soundpub.profiles p JOIN Soundpub.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'label'
    AND lower(regexp_replace(trim(p.full_name), '\s+', ' ', 'g')) IN ('soundpub', 'soundpub music', 'soundpub music ecosystem')
  ORDER BY CASE lower(regexp_replace(trim(p.full_name), '\s+', ' ', 'g')) WHEN 'soundpub music' THEN 1 ELSE 2 END
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION Soundpub.is_soundpub_takedown_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = Soundpub, public AS $$
  SELECT Soundpub.is_admin(_user_id) OR _user_id = Soundpub.get_soundpub_label_id()
    OR EXISTS (SELECT 1 FROM Soundpub.profiles p WHERE p.id = _user_id AND p.parent_label_id = Soundpub.get_soundpub_label_id())
$$;

CREATE OR REPLACE FUNCTION Soundpub.can_access_takedown_release(_user_id uuid, _release_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = Soundpub, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM Soundpub.releases r
    WHERE r.id = _release_id AND r.label_id = Soundpub.get_soundpub_label_id()
      AND (Soundpub.is_admin(_user_id) OR r.label_id = _user_id OR r.artist_user_id = _user_id OR r.created_by = _user_id)
  )
$$;

CREATE TABLE IF NOT EXISTS Soundpub.takedown_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), requester_id uuid NOT NULL REFERENCES Soundpub.profiles(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES Soundpub.profiles(id) ON DELETE RESTRICT, request_type Soundpub.takedown_request_type NOT NULL DEFAULT 'standard',
  reason_category text NOT NULL, reason_detail text NOT NULL, status Soundpub.takedown_status NOT NULL DEFAULT 'SUBMITTED',
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent')), declaration_accepted boolean NOT NULL DEFAULT false,
  declaration_accepted_at timestamptz, reviewer_id uuid REFERENCES Soundpub.profiles(id) ON DELETE SET NULL, review_note text,
  rejection_reason text, submitted_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, sent_to_dsp_at timestamptz,
  completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT takedown_requests_soundpub_label CHECK (label_id = Soundpub.get_soundpub_label_id()),
  CONSTRAINT takedown_requests_declaration CHECK (declaration_accepted = true)
);

CREATE TABLE IF NOT EXISTS Soundpub.takedown_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES Soundpub.takedown_requests(id) ON DELETE CASCADE,
  release_id uuid NOT NULL REFERENCES Soundpub.releases(id) ON DELETE RESTRICT, track_id uuid REFERENCES Soundpub.tracks(id) ON DELETE RESTRICT,
  title_snapshot text NOT NULL, artist_name_snapshot text NOT NULL, upc_snapshot text, isrc_snapshot text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS Soundpub.takedown_request_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES Soundpub.takedown_requests(id) ON DELETE CASCADE,
  dsp_name text NOT NULL, status Soundpub.takedown_target_status NOT NULL DEFAULT 'PENDING', external_reference text, submitted_at timestamptz,
  completed_at timestamptz, failure_reason text, admin_note text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS Soundpub.takedown_request_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES Soundpub.takedown_requests(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES Soundpub.profiles(id) ON DELETE CASCADE, file_name text NOT NULL, storage_path text NOT NULL,
  file_type text, file_size bigint, document_type text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (storage_path)
);
CREATE TABLE IF NOT EXISTS Soundpub.takedown_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES Soundpub.takedown_requests(id) ON DELETE CASCADE,
  old_status Soundpub.takedown_status, new_status Soundpub.takedown_status NOT NULL, changed_by uuid REFERENCES Soundpub.profiles(id) ON DELETE SET NULL,
  note text, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_takedown_requests_requester ON Soundpub.takedown_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_takedown_requests_label_status ON Soundpub.takedown_requests(label_id, status);
CREATE INDEX IF NOT EXISTS idx_takedown_items_release ON Soundpub.takedown_request_items(release_id);
CREATE INDEX IF NOT EXISTS idx_takedown_targets_request ON Soundpub.takedown_request_targets(request_id);
CREATE INDEX IF NOT EXISTS idx_takedown_documents_request ON Soundpub.takedown_request_documents(request_id);
ALTER TABLE Soundpub.takedown_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE Soundpub.takedown_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE Soundpub.takedown_request_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE Soundpub.takedown_request_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE Soundpub.takedown_status_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON Soundpub.takedown_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON Soundpub.takedown_request_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON Soundpub.takedown_request_targets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON Soundpub.takedown_request_documents TO authenticated;
GRANT SELECT, INSERT ON Soundpub.takedown_status_history TO authenticated;
GRANT EXECUTE ON FUNCTION Soundpub.get_soundpub_label_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION Soundpub.is_soundpub_takedown_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION Soundpub.can_access_takedown_release(uuid, uuid) TO authenticated, service_role;

CREATE POLICY "Takedown users can view scoped requests" ON Soundpub.takedown_requests FOR SELECT TO authenticated
USING (Soundpub.is_admin(auth.uid()) OR requester_id = auth.uid() OR label_id = auth.uid());
CREATE POLICY "Soundpub scoped users can create requests" ON Soundpub.takedown_requests FOR INSERT TO authenticated
WITH CHECK (requester_id = auth.uid() AND label_id = Soundpub.get_soundpub_label_id() AND Soundpub.is_soundpub_takedown_user(auth.uid()));
CREATE POLICY "Admins manage takedown requests" ON Soundpub.takedown_requests FOR UPDATE TO authenticated
USING (Soundpub.is_admin(auth.uid())) WITH CHECK (Soundpub.is_admin(auth.uid()));
CREATE POLICY "Users can cancel own unsent takedown requests" ON Soundpub.takedown_requests FOR UPDATE TO authenticated
USING (requester_id = auth.uid() AND status IN ('SUBMITTED', 'UNDER_REVIEW', 'NEED_DOCUMENT', 'APPROVED'))
WITH CHECK (requester_id = auth.uid() AND status IN ('CANCEL_REQUESTED', 'CANCELLED'));

CREATE POLICY "View takedown items" ON Soundpub.takedown_request_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM Soundpub.takedown_requests tr WHERE tr.id = request_id AND (Soundpub.is_admin(auth.uid()) OR tr.requester_id = auth.uid() OR tr.label_id = auth.uid())));
CREATE POLICY "Create takedown items" ON Soundpub.takedown_request_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM Soundpub.takedown_requests tr WHERE tr.id = request_id AND tr.requester_id = auth.uid()) AND Soundpub.can_access_takedown_release(auth.uid(), release_id));

CREATE POLICY "View takedown targets" ON Soundpub.takedown_request_targets FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM Soundpub.takedown_requests tr WHERE tr.id = request_id AND (Soundpub.is_admin(auth.uid()) OR tr.requester_id = auth.uid() OR tr.label_id = auth.uid())));
CREATE POLICY "Create takedown targets" ON Soundpub.takedown_request_targets FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM Soundpub.takedown_requests tr WHERE tr.id = request_id AND tr.requester_id = auth.uid()));
CREATE POLICY "Admins update takedown targets" ON Soundpub.takedown_request_targets FOR UPDATE TO authenticated
USING (Soundpub.is_admin(auth.uid())) WITH CHECK (Soundpub.is_admin(auth.uid()));

CREATE POLICY "View takedown documents" ON Soundpub.takedown_request_documents FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM Soundpub.takedown_requests tr WHERE tr.id = request_id AND (Soundpub.is_admin(auth.uid()) OR tr.requester_id = auth.uid() OR tr.label_id = auth.uid())));
CREATE POLICY "Upload takedown documents" ON Soundpub.takedown_request_documents FOR INSERT TO authenticated
WITH CHECK (uploaded_by = auth.uid() AND EXISTS (SELECT 1 FROM Soundpub.takedown_requests tr WHERE tr.id = request_id AND (tr.requester_id = auth.uid() OR Soundpub.is_admin(auth.uid()))));

CREATE POLICY "View takedown history" ON Soundpub.takedown_status_history FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM Soundpub.takedown_requests tr WHERE tr.id = request_id AND (Soundpub.is_admin(auth.uid()) OR tr.requester_id = auth.uid() OR tr.label_id = auth.uid())));
CREATE POLICY "Insert takedown history" ON Soundpub.takedown_status_history FOR INSERT TO authenticated
WITH CHECK (changed_by = auth.uid() AND EXISTS (SELECT 1 FROM Soundpub.takedown_requests tr WHERE tr.id = request_id AND (Soundpub.is_admin(auth.uid()) OR tr.requester_id = auth.uid())));

INSERT INTO storage.buckets (id, name, public) VALUES ('takedown-documents', 'takedown-documents', false) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Upload own takedown storage files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'takedown-documents' AND split_part(name, '/', 1) = auth.uid()::text);
CREATE POLICY "Read own or admin takedown storage files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'takedown-documents' AND (split_part(name, '/', 1) = auth.uid()::text OR Soundpub.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Read own or admin takedown storage files" ON storage.objects;
CREATE POLICY "Read scoped takedown storage files" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'takedown-documents'
  AND (
    Soundpub.is_admin(auth.uid())
    OR split_part(name, '/', 1) = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM Soundpub.takedown_request_documents document
      JOIN Soundpub.takedown_requests request ON request.id = document.request_id
      WHERE document.storage_path = name
        AND request.label_id = auth.uid()
    )
  )
);
