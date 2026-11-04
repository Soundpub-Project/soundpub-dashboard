-- BACKEND_ONLY_RLS_OPTIONAL: private backend schema, no Data API grants.
CREATE TABLE soundpub.royalty_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  currency text NOT NULL CHECK (currency = 'IDR'),
  checksum text NOT NULL UNIQUE CHECK (checksum ~ '^[0-9a-f]{64}$'),
  filename text NOT NULL,
  uploader_id uuid NOT NULL REFERENCES soundpub.backend_users(id),
  row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 1000),
  total_amount numeric(24,2) NOT NULL CHECK (total_amount >= 0),
  validation_result jsonb NOT NULL,
  status text NOT NULL DEFAULT 'UNRECONCILED' CHECK (status = 'UNRECONCILED'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE soundpub.royalty_import_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES soundpub.royalty_import_batches(id),
  source text NOT NULL,
  period text NOT NULL,
  source_row_id text NOT NULL,
  beneficiary_id uuid NOT NULL REFERENCES soundpub.backend_users(id),
  release_id uuid NOT NULL REFERENCES soundpub.releases(id),
  track_id uuid NOT NULL REFERENCES soundpub.tracks(id),
  gross_amount numeric(18,2) NOT NULL CHECK (gross_amount >= 0),
  deduction_amount numeric(18,2) NOT NULL CHECK (deduction_amount >= 0),
  net_amount numeric(18,2) NOT NULL CHECK (net_amount >= 0 AND net_amount = gross_amount - deduction_amount),
  UNIQUE (source, period, source_row_id)
);
CREATE INDEX royalty_import_entries_beneficiary ON soundpub.royalty_import_entries(beneficiary_id, batch_id);
CREATE TABLE soundpub.royalty_import_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL UNIQUE REFERENCES soundpub.royalty_import_batches(id),
  actor_id uuid NOT NULL REFERENCES soundpub.backend_users(id),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Append-only even for runtime SQL. Corrections offset original rows without deleting them.
REVOKE ALL ON soundpub.royalty_import_batches, soundpub.royalty_import_entries,
  soundpub.royalty_import_corrections FROM PUBLIC, soundpub_app;
GRANT SELECT, INSERT ON soundpub.royalty_import_batches, soundpub.royalty_import_entries,
  soundpub.royalty_import_corrections TO soundpub_app;
-- Row locks need column UPDATE permission; trigger still forbids mutation.
GRANT UPDATE(status) ON soundpub.royalty_import_batches TO soundpub_app;
CREATE TRIGGER royalty_batches_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON soundpub.royalty_import_batches
  FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable();
CREATE TRIGGER royalty_entries_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON soundpub.royalty_import_entries
  FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable();
CREATE TRIGGER royalty_corrections_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON soundpub.royalty_import_corrections
  FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable();
ALTER TABLE soundpub.royalty_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.royalty_import_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.royalty_import_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY royalty_batches_backend ON soundpub.royalty_import_batches TO soundpub_app USING (true) WITH CHECK (true);
CREATE POLICY royalty_entries_backend ON soundpub.royalty_import_entries TO soundpub_app USING (true) WITH CHECK (true);
CREATE POLICY royalty_corrections_backend ON soundpub.royalty_import_corrections TO soundpub_app USING (true) WITH CHECK (true);
