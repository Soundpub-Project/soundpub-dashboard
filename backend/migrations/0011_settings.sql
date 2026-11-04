-- Backend-only tables: soundpub_app is trusted server runtime; no browser grants.
CREATE TABLE soundpub.application_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
INSERT INTO soundpub.application_settings(id) VALUES (true);
CREATE TABLE soundpub.user_settings (
  user_id uuid PRIMARY KEY REFERENCES soundpub.backend_users(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
REVOKE ALL ON soundpub.application_settings, soundpub.user_settings FROM PUBLIC;
GRANT SELECT, UPDATE ON soundpub.application_settings TO soundpub_app;
GRANT SELECT, INSERT, UPDATE ON soundpub.user_settings TO soundpub_app;
CREATE INDEX audit_logs_listing_idx ON soundpub.audit_logs(created_at DESC, id DESC);
-- Existing audit_logs runtime grants remain SELECT/INSERT only. No edit/delete API.
