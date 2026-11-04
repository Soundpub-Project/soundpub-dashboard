ALTER TABLE soundpub.royalty_import_sessions
  DROP CONSTRAINT royalty_import_sessions_status_check;
ALTER TABLE soundpub.royalty_import_sessions
  ADD CONSTRAINT royalty_import_sessions_status_check CHECK (status IN
    ('UPLOAD_PENDING','UPLOADED','QUEUED','PARSING','PREVIEW_READY','FAILED','COMMITTING','COMMITTED','CLEANING','DELETED'));
DROP INDEX soundpub.royalty_import_sessions_cleanup;
CREATE INDEX royalty_import_sessions_cleanup ON soundpub.royalty_import_sessions(status,next_attempt_at,cleanup_after,created_at)
  WHERE status IN ('UPLOAD_PENDING','FAILED','CLEANING');