-- BACKEND_ONLY_RLS_OPTIONAL: private schema, backend-only runtime grants;
-- all reads/writes use server-resolved actors and transaction-locked authority.
CREATE TABLE soundpub.profiles (
  id uuid PRIMARY KEY REFERENCES soundpub.backend_users(id),
  full_name text NOT NULL DEFAULT '' CHECK (length(full_name) <= 200),
  phone text CHECK (length(phone) <= 50),
  address text CHECK (length(address) <= 2000),
  avatar_url text CHECK (length(avatar_url) <= 2048),
  logo_url text CHECK (length(logo_url) <= 2048),
  logo_url_light text CHECK (length(logo_url_light) <= 2048),
  logo_url_dark text CHECK (length(logo_url_dark) <= 2048),
  parent_label_id uuid REFERENCES soundpub.backend_users(id),
  parent_label_reference_id uuid REFERENCES soundpub.identity_references(id),
  composer_code text CHECK (length(composer_code) <= 100),
  balance numeric(20,2) NOT NULL DEFAULT 0,
  password_set boolean,
  subscription_status text,
  subscription_upgraded_at timestamptz,
  sso_provider text,
  artist_profile_completed boolean,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(parent_label_id, parent_label_reference_id) <= 1),
  CHECK (parent_label_id IS DISTINCT FROM id)
);
CREATE INDEX profiles_parent_label_idx ON soundpub.profiles(parent_label_id);
CREATE INDEX backend_users_created_idx ON soundpub.backend_users(created_at DESC, id DESC);
GRANT SELECT ON soundpub.profiles TO soundpub_app;
GRANT INSERT (id) ON soundpub.profiles TO soundpub_app;
GRANT UPDATE (full_name, phone, address, avatar_url, logo_url, logo_url_light, logo_url_dark,
  updated_at) ON soundpub.profiles TO soundpub_app;
GRANT INSERT, DELETE ON soundpub.user_roles TO soundpub_app;
