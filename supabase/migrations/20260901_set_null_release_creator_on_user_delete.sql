ALTER TABLE Soundpub.releases
  DROP CONSTRAINT IF EXISTS releases_created_by_fkey;

ALTER TABLE Soundpub.releases
  ADD CONSTRAINT releases_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES Soundpub.profiles(id)
  ON DELETE SET NULL;
