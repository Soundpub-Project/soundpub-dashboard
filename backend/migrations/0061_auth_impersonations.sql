CREATE TABLE soundpub.auth_impersonations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  initiating_session_id uuid NOT NULL UNIQUE REFERENCES soundpub.auth_sessions(id) ON DELETE RESTRICT,
  impersonated_session_id uuid UNIQUE REFERENCES soundpub.auth_sessions(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  ended_reason text CHECK (ended_reason IS NULL OR ended_reason IN ('stopped', 'logout', 'expired', 'invalidated')),
  CHECK (actor_user_id <> target_user_id),
  CHECK (expires_at > created_at),
  CHECK (ended_at IS NULL OR ended_at >= created_at)
);
CREATE UNIQUE INDEX auth_impersonations_actor_active_unique ON soundpub.auth_impersonations(actor_user_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX auth_impersonations_target_active_unique ON soundpub.auth_impersonations(target_user_id) WHERE ended_at IS NULL;
CREATE INDEX auth_impersonations_expiry_idx ON soundpub.auth_impersonations(expires_at) WHERE ended_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON soundpub.auth_impersonations TO soundpub_app;
