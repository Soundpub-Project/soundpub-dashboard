ALTER TABLE Soundpub.releases
  DROP CONSTRAINT IF EXISTS releases_release_type_check;

ALTER TABLE Soundpub.releases
  ADD CONSTRAINT releases_release_type_check
  CHECK (release_type IN ('single', 'ep', 'album', 'compilation'));
