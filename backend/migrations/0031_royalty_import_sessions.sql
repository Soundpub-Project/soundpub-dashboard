CREATE TABLE soundpub.royalty_import_sessions (
  id uuid PRIMARY KEY,
  requester_id uuid NOT NULL REFERENCES soundpub.backend_users(id),
  source text NOT NULL CHECK (length(btrim(source)) BETWEEN 1 AND 200 AND source !~ '[\x00-\x1f\x7f]'),
  filename text NOT NULL CHECK (length(btrim(filename)) BETWEEN 1 AND 200 AND filename !~ '[\\/\x00-\x1f\x7f]'),
  bucket text NOT NULL CHECK (length(bucket) > 0),
  object_key text NOT NULL UNIQUE CHECK (length(object_key) > 0),
  mime_type text NOT NULL DEFAULT 'text/csv' CHECK (mime_type = 'text/csv'),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 104857600),
  source_checksum text NOT NULL CHECK (source_checksum ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'UPLOAD_PENDING' CHECK (status IN
    ('UPLOAD_PENDING','UPLOADED','QUEUED','PARSING','PREVIEW_READY','FAILED','COMMITTING','COMMITTED','DELETED')),
  phase text NOT NULL DEFAULT 'UPLOAD' CHECK (phase IN ('UPLOAD','QUEUED','PARSE','MATCH','PREVIEW','COMMIT','DONE')),
  processed_rows integer NOT NULL DEFAULT 0 CHECK (processed_rows >= 0),
  total_rows integer CHECK (total_rows IS NULL OR total_rows >= 0),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  preview_checksum text CHECK (preview_checksum IS NULL OR preview_checksum ~ '^[a-f0-9]{64}$'),
  preview_result jsonb,
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[A-Z0-9_]{1,100}$'),
  batch_id uuid REFERENCES soundpub.royalty_import_batches(id),
  upload_expires_at timestamptz NOT NULL,
  cleanup_after timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL)),
  CHECK ((status='COMMITTED') = (batch_id IS NOT NULL)),
  CHECK (status IN ('PREVIEW_READY','COMMITTING','COMMITTED') OR preview_checksum IS NULL),
  CHECK (status <> 'PREVIEW_READY' OR preview_result IS NOT NULL)
);
CREATE INDEX royalty_import_sessions_requester ON soundpub.royalty_import_sessions(requester_id,created_at DESC);
CREATE INDEX royalty_import_sessions_jobs ON soundpub.royalty_import_sessions(status,next_attempt_at,created_at)
  WHERE status IN ('QUEUED','PARSING');
CREATE INDEX royalty_import_sessions_cleanup ON soundpub.royalty_import_sessions(status,cleanup_after)
  WHERE status IN ('UPLOAD_PENDING','FAILED','DELETED');
GRANT SELECT, INSERT, UPDATE ON soundpub.royalty_import_sessions TO soundpub_app;
REVOKE ALL ON soundpub.royalty_import_sessions FROM PUBLIC;
