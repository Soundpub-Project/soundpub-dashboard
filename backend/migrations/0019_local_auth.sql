CREATE TABLE soundpub.local_auth_credentials (
  user_id uuid PRIMARY KEY REFERENCES soundpub.backend_users(id) ON DELETE CASCADE,
  login_email text NOT NULL CHECK (
    login_email = lower(btrim(login_email)) AND
    length(login_email) <= 320 AND position('@' in login_email) > 1
  ),
  password_hash text NOT NULL CHECK (password_hash LIKE 'scrypt$v=1$%'),
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  requires_password_reset boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX local_auth_login_email_unique ON soundpub.local_auth_credentials (lower(login_email));

CREATE TABLE soundpub.auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE CASCADE,
  token_sha256 bytea NOT NULL UNIQUE CHECK (octet_length(token_sha256) = 32),
  csrf_sha256 bytea NOT NULL CHECK (octet_length(csrf_sha256) = 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (idle_expires_at > created_at),
  CHECK (expires_at >= idle_expires_at),
  CHECK (last_seen_at >= created_at)
);
CREATE INDEX auth_sessions_user_active_idx ON soundpub.auth_sessions(user_id, expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX auth_sessions_expiry_idx ON soundpub.auth_sessions(expires_at);

CREATE TABLE soundpub.auth_one_time_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('email_verification', 'password_reset', 'email_change')),
  token_sha256 bytea NOT NULL UNIQUE CHECK (octet_length(token_sha256) = 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);
CREATE INDEX auth_one_time_tokens_active_idx ON soundpub.auth_one_time_tokens(user_id, purpose, expires_at)
  WHERE consumed_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON soundpub.local_auth_credentials TO soundpub_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON soundpub.auth_sessions TO soundpub_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON soundpub.auth_one_time_tokens TO soundpub_app;
