CREATE TABLE soundpub.rate_limit_windows (
  key_hash text PRIMARY KEY CHECK (length(key_hash) = 64),
  hits integer NOT NULL CHECK (hits > 0),
  reset_at timestamptz NOT NULL
);
CREATE INDEX rate_limit_windows_reset_idx ON soundpub.rate_limit_windows(reset_at);

REVOKE ALL ON soundpub.rate_limit_windows FROM PUBLIC, soundpub_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON soundpub.rate_limit_windows TO soundpub_app;
