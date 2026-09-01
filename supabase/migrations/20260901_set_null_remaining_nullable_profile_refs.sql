ALTER TABLE Soundpub.tracks
  DROP CONSTRAINT IF EXISTS tracks_artist_user_id_fkey;

ALTER TABLE Soundpub.tracks
  ADD CONSTRAINT tracks_artist_user_id_fkey
  FOREIGN KEY (artist_user_id)
  REFERENCES Soundpub.profiles(id)
  ON DELETE SET NULL;

ALTER TABLE Soundpub.payout_requests
  DROP CONSTRAINT IF EXISTS payout_requests_processed_by_fkey;

ALTER TABLE Soundpub.payout_requests
  ADD CONSTRAINT payout_requests_processed_by_fkey
  FOREIGN KEY (processed_by)
  REFERENCES Soundpub.profiles(id)
  ON DELETE SET NULL;

ALTER TABLE Soundpub.profiles
  DROP CONSTRAINT IF EXISTS profiles_parent_label_id_fkey;

ALTER TABLE Soundpub.profiles
  ADD CONSTRAINT profiles_parent_label_id_fkey
  FOREIGN KEY (parent_label_id)
  REFERENCES Soundpub.profiles(id)
  ON DELETE SET NULL;
