CREATE TABLE soundpub.backend_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text CHECK (email IS NULL OR (length(email) <= 320 AND position('@' in email) > 1)),
  email_verified_at timestamptz,
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'suspended')),
  migration_source jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(migration_source) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX backend_users_email_idx ON soundpub.backend_users (lower(email));

CREATE TABLE soundpub.external_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_user_id uuid NOT NULL REFERENCES soundpub.backend_users(id),
  provider text NOT NULL CHECK (length(provider) > 0),
  issuer text NOT NULL CHECK (length(issuer) > 0),
  subject text NOT NULL CHECK (length(subject) > 0),
  verified_at timestamptz,
  binding_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_system text,
  source_auth_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, issuer, subject),
  UNIQUE (source_system, source_auth_user_id),
  CHECK ((source_system IS NULL) = (source_auth_user_id IS NULL))
);
CREATE INDEX external_identities_user_idx ON soundpub.external_identities(application_user_id);

CREATE TABLE soundpub.identity_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL,
  source_user_id uuid NOT NULL,
  reference_kind text NOT NULL,
  source_table text NOT NULL,
  source_column text NOT NULL,
  source_record_locator text NOT NULL,
  reason text NOT NULL,
  validation_state text NOT NULL DEFAULT 'pending' CHECK (validation_state IN ('pending', 'verified', 'rejected')),
  resolved_application_user_id uuid REFERENCES soundpub.backend_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE soundpub.roles (
  name text PRIMARY KEY CHECK (name IN ('superadmin', 'admin', 'label', 'copyright', 'whitelabel', 'artist', 'user'))
);
INSERT INTO soundpub.roles(name) VALUES ('superadmin'), ('admin'), ('label'), ('copyright'), ('whitelabel'), ('artist'), ('user');
CREATE TABLE soundpub.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES soundpub.backend_users(id),
  role text NOT NULL REFERENCES soundpub.roles(name),
  tenant_id uuid,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (user_id, role, tenant_id)
);

CREATE TABLE soundpub.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES soundpub.backend_users(id),
  actor_reference_id uuid REFERENCES soundpub.identity_references(id),
  action text NOT NULL CHECK (length(action) > 0),
  resource_type text NOT NULL,
  resource_id text,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(actor_user_id, actor_reference_id) <= 1)
);
CREATE INDEX audit_logs_resource_idx ON soundpub.audit_logs(resource_type, resource_id, created_at);

CREATE TABLE soundpub.storage_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL CHECK (length(bucket) > 0),
  object_key text NOT NULL CHECK (length(object_key) > 0),
  owner_user_id uuid REFERENCES soundpub.backend_users(id),
  owner_reference_id uuid REFERENCES soundpub.identity_references(id),
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  checksum_sha256 text CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'deleted', 'failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, object_key),
  CHECK (num_nonnulls(owner_user_id, owner_reference_id) = 1)
);
CREATE INDEX storage_assets_owner_idx ON soundpub.storage_assets(owner_user_id);

CREATE TABLE soundpub.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL CHECK (length(topic) > 0),
  payload jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CHECK ((status = 'processing') = (locked_at IS NOT NULL AND locked_by IS NOT NULL))
);
CREATE INDEX outbox_pending_idx ON soundpub.outbox_events(available_at, created_at) WHERE status IN ('pending', 'processing');

CREATE TABLE soundpub.idempotency_keys (
  scope text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed')),
  response_status integer CHECK (response_status BETWEEN 100 AND 599),
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (scope, key),
  CHECK (expires_at > created_at),
  CHECK (status <> 'completed' OR response_status IS NOT NULL)
);
CREATE INDEX idempotency_keys_expiry_idx ON soundpub.idempotency_keys(expires_at);

CREATE TABLE soundpub.integration_effects (
  consumer text NOT NULL CHECK (length(consumer) > 0),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, idempotency_key)
);

CREATE TABLE soundpub.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  payload jsonb,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, event_id)
);

