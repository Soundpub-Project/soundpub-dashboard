-- =============================================
-- PART 4: TRIGGERS
-- =============================================

-- TIMESTAMP UPDATE TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION soundpub.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

-- BALANCE UPDATE ON PAYOUT STATUS CHANGE
CREATE OR REPLACE FUNCTION soundpub.update_balance_on_payout_status_change()
RETURNS TRIGGER AS $$
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = soundpub;

CREATE TRIGGER update_balance_on_payout_status_change
BEFORE UPDATE ON soundpub.payout_requests
FOR EACH ROW EXECUTE FUNCTION soundpub.update_balance_on_payout_status_change();

-- AUTO-CREATE PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION soundpub.handle_new_user()
RETURNS TRIGGER AS $$
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = soundpub;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION soundpub.handle_new_user();

-- =============================================
-- PART 5: INDEXES
-- =============================================

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

-- =============================================
-- MIGRATION COMPLETE
-- =============================================
-- Schema soundpub is ready for use
-- All tables, functions, policies, triggers, and indexes are created