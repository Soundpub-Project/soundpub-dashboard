-- =============================================
-- SOUNDPUB RLS POLICIES AND TRIGGERS
-- =============================================

-- USER ROLES POLICIES
CREATE POLICY "Users can view own roles"
ON soundpub.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
ON soundpub.user_roles FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

-- PROFILES POLICIES
CREATE POLICY "Users can view own profile"
ON soundpub.profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
ON soundpub.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Admins can manage all profiles"
ON soundpub.profiles FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

CREATE POLICY "Labels can view their artists"
ON soundpub.profiles FOR SELECT
TO authenticated
USING (parent_label_id = auth.uid());

-- RELEASES POLICIES
CREATE POLICY "Admins can manage all releases"
ON soundpub.releases FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

CREATE POLICY "Labels can manage own releases"
ON soundpub.releases FOR ALL
TO authenticated
USING (label_id = auth.uid() OR created_by = auth.uid());

CREATE POLICY "Artists can view own releases"
ON soundpub.releases FOR SELECT
TO authenticated
USING (artist_name = soundpub.get_user_full_name(auth.uid()));

-- TRACKS POLICIES
CREATE POLICY "Admins can manage all tracks"
ON soundpub.tracks FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

CREATE POLICY "Labels can manage tracks from own releases"
ON soundpub.tracks FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM soundpub.releases
    WHERE releases.id = tracks.release_id
    AND (releases.label_id = auth.uid() OR releases.created_by = auth.uid())
  )
);

CREATE POLICY "Artists can view own tracks"
ON soundpub.tracks FOR SELECT
TO authenticated
USING (artist_name = soundpub.get_user_full_name(auth.uid()));

-- ROYALTIES POLICIES
CREATE POLICY "Admins can manage all royalties"
ON soundpub.royalties FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

CREATE POLICY "Labels can view their royalties"
ON soundpub.royalties FOR SELECT
TO authenticated
USING (
  soundpub.has_role(auth.uid(), 'label'::soundpub.app_role)
  AND label_name = soundpub.get_user_full_name(auth.uid())
);

CREATE POLICY "Artists can view their royalties"
ON soundpub.royalties FOR SELECT
TO authenticated
USING (
  soundpub.has_role(auth.uid(), 'artist'::soundpub.app_role)
  AND (
    artist_name = soundpub.get_user_full_name(auth.uid())
    OR artist = soundpub.get_user_full_name(auth.uid())
  )
);

-- PAYOUT REQUESTS POLICIES
CREATE POLICY "Admins can manage all payouts"
ON soundpub.payout_requests FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

CREATE POLICY "Users can manage own payouts"
ON soundpub.payout_requests FOR ALL
TO authenticated
USING (user_id = auth.uid());

-- ROYALTY UPLOADS POLICIES
CREATE POLICY "Admins can manage all uploads"
ON soundpub.royalty_uploads FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

CREATE POLICY "Users can view own uploads"
ON soundpub.royalty_uploads FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- TIMESTAMP TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION soundpub.update_timestamp()
RETURNS TRIGGER AS $ $
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;`r
$ $ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_timestamp
BEFORE UPDATE ON soundpub.profiles
FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();

CREATE TRIGGER update_releases_timestamp
BEFORE UPDATE ON soundpub.releases
FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();

CREATE TRIGGER update_tracks_timestamp
BEFORE UPDATE ON soundpub.tracks
FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();

CREATE TRIGGER update_payout_requests_timestamp
BEFORE UPDATE ON soundpub.payout_requests
FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();

CREATE TRIGGER update_royalty_uploads_timestamp
BEFORE UPDATE ON soundpub.royalty_uploads
FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();

-- BALANCE UPDATE TRIGGER
CREATE OR REPLACE FUNCTION soundpub.update_balance_on_payout_status_change()
RETURNS TRIGGER AS $ $
BEGIN
    IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
        UPDATE soundpub.profiles
        SET balance = balance - NEW.amount
        WHERE id = NEW.user_id;
    ELSIF OLD.status = 'paid' AND NEW.status != 'paid' THEN
        UPDATE soundpub.profiles
        SET balance = balance + NEW.amount
        WHERE id = NEW.user_id;
    END IF;

    IF NEW.status IN ('approved', 'rejected', 'paid') AND
       (OLD.status IS NULL OR OLD.status NOT IN ('approved', 'rejected', 'paid')) THEN
        NEW.processed_at = NOW();
    END IF;

    RETURN NEW;
END;`r
$ $ LANGUAGE plpgsql SECURITY DEFINER SET search_path = soundpub;

CREATE TRIGGER update_balance_on_payout_status_change
BEFORE UPDATE ON soundpub.payout_requests
FOR EACH ROW EXECUTE FUNCTION soundpub.update_balance_on_payout_status_change();

-- AUTO-CREATE PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION soundpub.handle_new_user()
RETURNS TRIGGER AS $ $
BEGIN
  INSERT INTO soundpub.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1))
  );

  INSERT INTO soundpub.user_roles (user_id, role)
  VALUES (NEW.id, 'user'::soundpub.app_role);

  RETURN NEW;
END;`r
$ $ LANGUAGE plpgsql SECURITY DEFINER SET search_path = soundpub;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION soundpub.handle_new_user();

-- INDEXES
CREATE INDEX idx_soundpub_user_roles_user_id ON soundpub.user_roles(user_id);
CREATE INDEX idx_soundpub_profiles_parent_label ON soundpub.profiles(parent_label_id);
CREATE INDEX idx_soundpub_releases_label_id ON soundpub.releases(label_id);
CREATE INDEX idx_soundpub_releases_artist_name ON soundpub.releases(artist_name);
CREATE INDEX idx_soundpub_tracks_release_id ON soundpub.tracks(release_id);
CREATE INDEX idx_soundpub_tracks_artist_name ON soundpub.tracks(artist_name);
CREATE INDEX idx_soundpub_royalties_upload_id ON soundpub.royalties(upload_id);
CREATE INDEX idx_soundpub_royalties_artist_name ON soundpub.royalties(artist_name);
CREATE INDEX idx_soundpub_royalties_label_name ON soundpub.royalties(label_name);
CREATE INDEX idx_soundpub_payout_requests_user_id ON soundpub.payout_requests(user_id);
CREATE INDEX idx_soundpub_royalty_uploads_user_id ON soundpub.royalty_uploads(user_id);
