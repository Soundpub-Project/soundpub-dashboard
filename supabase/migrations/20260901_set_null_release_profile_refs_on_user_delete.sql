ALTER TABLE Soundpub.releases
  DROP CONSTRAINT IF EXISTS releases_created_by_fkey;

ALTER TABLE Soundpub.releases
  ADD CONSTRAINT releases_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES Soundpub.profiles(id)
  ON DELETE SET NULL;

ALTER TABLE Soundpub.releases
  DROP CONSTRAINT IF EXISTS releases_artist_user_id_fkey;

ALTER TABLE Soundpub.releases
  ADD CONSTRAINT releases_artist_user_id_fkey
  FOREIGN KEY (artist_user_id)
  REFERENCES Soundpub.profiles(id)
  ON DELETE SET NULL;

ALTER TABLE Soundpub.releases
  DROP CONSTRAINT IF EXISTS releases_label_id_fkey;

ALTER TABLE Soundpub.releases
  ADD CONSTRAINT releases_label_id_fkey
  FOREIGN KEY (label_id)
  REFERENCES Soundpub.profiles(id)
  ON DELETE SET NULL;
