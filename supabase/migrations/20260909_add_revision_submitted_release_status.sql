ALTER TABLE Soundpub.releases DROP CONSTRAINT IF EXISTS releases_status_check;

ALTER TABLE Soundpub.releases
  ADD CONSTRAINT releases_status_check
  CHECK (status IN ('pending', 'pending_paid', 'processing', 'revision_submitted', 'active', 'rejected', 'draft', 'inactive'));

NOTIFY pgrst, 'reload schema';
