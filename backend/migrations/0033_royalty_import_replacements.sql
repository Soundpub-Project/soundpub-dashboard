CREATE TABLE soundpub.royalty_import_replacements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  old_batch_id uuid NOT NULL UNIQUE REFERENCES soundpub.royalty_import_batches(id),
  new_batch_id uuid NOT NULL UNIQUE REFERENCES soundpub.royalty_import_batches(id),
  actor_id uuid NOT NULL REFERENCES soundpub.backend_users(id),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (old_batch_id <> new_batch_id)
);
REVOKE ALL ON soundpub.royalty_import_replacements FROM PUBLIC, soundpub_app;
GRANT SELECT, INSERT ON soundpub.royalty_import_replacements TO soundpub_app;
CREATE TRIGGER royalty_replacements_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON soundpub.royalty_import_replacements
  FOR EACH STATEMENT EXECUTE FUNCTION soundpub.finance_immutable();
ALTER TABLE soundpub.royalty_import_replacements ENABLE ROW LEVEL SECURITY;
CREATE POLICY royalty_replacements_backend ON soundpub.royalty_import_replacements TO soundpub_app USING (true) WITH CHECK (true);