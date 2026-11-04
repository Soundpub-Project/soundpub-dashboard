-- Private file sessions may stage large statements. Financial posting remains
-- atomic and append-only in final royalty tables.
ALTER TABLE soundpub.royalty_import_batches
  DROP CONSTRAINT royalty_import_batches_row_count_check,
  ADD CONSTRAINT royalty_import_batches_row_count_check CHECK (row_count BETWEEN 1 AND 100000);

ALTER TABLE soundpub.royalty_import_sessions
  ADD CONSTRAINT royalty_import_sessions_progress_check CHECK (
    total_rows IS NULL OR processed_rows <= total_rows
  );

CREATE TABLE soundpub.royalty_import_session_rows (
  session_id uuid NOT NULL REFERENCES soundpub.royalty_import_sessions(id) ON DELETE CASCADE,
  source_row_number integer NOT NULL CHECK (source_row_number BETWEEN 2 AND 100001),
  source_row_id text NOT NULL CHECK (length(source_row_id) BETWEEN 66 AND 80),
  row_status text NOT NULL CHECK (row_status IN ('MATCHED','INVALID')),
  issue jsonb,
  period text,
  source_isrc text,
  source_upc text,
  title text,
  artist_name text,
  label_name text,
  platform text,
  country text,
  sales_type text,
  sales_unit integer,
  net_amount numeric(18,2),
  track_id uuid REFERENCES soundpub.tracks(id) ON DELETE RESTRICT,
  release_id uuid REFERENCES soundpub.releases(id) ON DELETE RESTRICT,
  artist_id uuid REFERENCES soundpub.artists(id) ON DELETE RESTRICT,
  financial_owner_user_id uuid REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  label_owner_user_id uuid REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  artist_amount numeric(18,2),
  label_amount numeric(18,2),
  soundpub_amount numeric(18,2),
  calculation_policy_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id,source_row_number),
  UNIQUE (session_id,source_row_id),
  CONSTRAINT royalty_import_session_rows_shape_check CHECK (
    (row_status='INVALID' AND issue IS NOT NULL
      AND period IS NULL AND source_isrc IS NULL AND track_id IS NULL AND release_id IS NULL
      AND artist_id IS NULL AND financial_owner_user_id IS NULL AND label_owner_user_id IS NULL
      AND net_amount IS NULL AND artist_amount IS NULL AND label_amount IS NULL AND soundpub_amount IS NULL
      AND calculation_policy_code IS NULL)
    OR
    (row_status='MATCHED' AND issue IS NULL
      AND period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      AND source_isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'
      AND platform IS NOT NULL AND length(btrim(platform)) BETWEEN 1 AND 200
      AND country ~ '^[A-Z]{2}$' AND sales_unit >= 0 AND net_amount >= 0
      AND track_id IS NOT NULL AND release_id IS NOT NULL AND artist_id IS NOT NULL
      AND financial_owner_user_id IS NOT NULL AND label_owner_user_id IS NOT NULL
      AND artist_amount >= 0 AND label_amount >= 0 AND soundpub_amount >= 0
      AND artist_amount+label_amount+soundpub_amount=net_amount
      AND length(btrim(calculation_policy_code)) BETWEEN 1 AND 100)
  )
);

CREATE INDEX royalty_import_session_rows_status
  ON soundpub.royalty_import_session_rows(session_id,row_status,source_row_number);
CREATE INDEX royalty_import_session_rows_catalog
  ON soundpub.royalty_import_session_rows(track_id,release_id,artist_id)
  WHERE row_status='MATCHED';

CREATE UNIQUE INDEX royalty_import_entries_batch_source_row_unique
  ON soundpub.royalty_import_entries(batch_id,source_row_number)
  WHERE source_row_number IS NOT NULL;

REVOKE ALL ON soundpub.royalty_import_session_rows FROM PUBLIC,soundpub_app;
GRANT SELECT,INSERT,DELETE ON soundpub.royalty_import_session_rows TO soundpub_app;
ALTER TABLE soundpub.royalty_import_session_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY royalty_import_session_rows_backend ON soundpub.royalty_import_session_rows
  TO soundpub_app USING (true) WITH CHECK (true);
