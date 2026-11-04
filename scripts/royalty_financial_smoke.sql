CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE SCHEMA soundpub;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.test_uid', true), '')::uuid
$$;

CREATE TABLE soundpub.profiles (
  id uuid PRIMARY KEY, full_name text, parent_label_id uuid,
  balance numeric DEFAULT 0, artist_revenue numeric DEFAULT 0,
  label_revenue numeric DEFAULT 0, updated_at timestamptz,
  phone text, avatar_url text, email text, status text, composer_code text,
  subscription_status text, subscription_upgraded_at timestamptz,
  sso_provider text, sso_user_id text, sso_user_type text,
  is_managed_artist boolean DEFAULT false, auth_user_status text
);
CREATE TABLE soundpub.user_roles (user_id uuid, role text);
CREATE TABLE soundpub.releases (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), label_id uuid);
ALTER TABLE soundpub.releases ADD COLUMN artist_user_id uuid;
CREATE TABLE soundpub.tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isrc text NOT NULL, release_id uuid REFERENCES soundpub.releases(id),
  artist_user_id uuid REFERENCES soundpub.profiles(id)
);
CREATE TABLE soundpub.royalty_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  filename text NOT NULL, original_filename text NOT NULL,
  total_records integer NOT NULL DEFAULT 0, inserted_records integer NOT NULL DEFAULT 0,
  status text NOT NULL, summary jsonb, updated_at timestamptz
);
ALTER TABLE soundpub.royalty_uploads ADD CONSTRAINT royalty_uploads_status_check
  CHECK (status IN ('pending', 'processing', 'success', 'partial', 'failed'));
CREATE TABLE soundpub.royalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), upload_id uuid NOT NULL REFERENCES soundpub.royalty_uploads(id),
  period text, isrc text, upc text, title text, artist text, artist_name text,
  label_name text, platform text, country text, sales_type text,
  unit_penjualan integer, pendapatan_kotor_dsp numeric(18,2),
  pendapatan_label_artis numeric(18,2), pendapatan_bersih_soundpub numeric(18,2),
  artist_revenue numeric(18,2), label_revenue numeric(18,2),
  soundpub_revenue numeric(18,2), net_revenue numeric(18,2),
  artist_user_id uuid, label_user_id uuid
);
CREATE TABLE soundpub.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  amount numeric NOT NULL, bank_name text, account_number text,
  account_holder_name text, status text,
  notes text, payment_proof_path text, payment_proof_name text,
  processed_by uuid, processed_at timestamptz
);
CREATE TABLE soundpub.payout_balance_reservations (
  payout_id uuid REFERENCES soundpub.payout_requests(id),
  profile_id uuid REFERENCES soundpub.profiles(id), amount numeric NOT NULL,
  PRIMARY KEY (payout_id, profile_id)
);
CREATE TABLE soundpub.release_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), release_id uuid REFERENCES soundpub.releases(id) ON DELETE CASCADE, user_id uuid,
  amount numeric, status text
);
CREATE TABLE soundpub.audit_logs (
  action text, actor_id uuid, target_id uuid, target_type text, details jsonb
);
CREATE FUNCTION soundpub.is_admin(user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM soundpub.user_roles WHERE user_roles.user_id = is_admin.user_id AND role = 'admin')
$$;
CREATE FUNCTION soundpub.complete_payout(uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
CREATE POLICY "Users can manage own payouts" ON soundpub.payout_requests FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Labels can view their royalties" ON soundpub.royalties FOR SELECT USING (true);
CREATE POLICY "Artists can view their royalties" ON soundpub.royalties FOR SELECT USING (true);
GRANT ALL ON ALL TABLES IN SCHEMA soundpub TO authenticated;
GRANT USAGE ON SCHEMA soundpub, auth TO authenticated;

INSERT INTO soundpub.profiles(id, full_name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Admin'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Label'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Legacy Balance');
UPDATE soundpub.profiles SET balance = 12 WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
INSERT INTO soundpub.profiles(id, full_name, parent_label_id) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Artist', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
INSERT INTO soundpub.user_roles VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'label'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'artist');

UPDATE soundpub.profiles SET status = 'active' WHERE status IS NULL;
