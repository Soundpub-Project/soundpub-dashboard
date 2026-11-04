ALTER TABLE soundpub.royalty_import_sessions
  ADD CONSTRAINT royalty_import_sessions_row_capacity_check CHECK (
    processed_rows <= 100000 AND (total_rows IS NULL OR total_rows <= 100000)
  ),
  ADD CONSTRAINT royalty_import_sessions_finished_progress_check CHECK (
    status NOT IN ('PREVIEW_READY','COMMITTING','COMMITTED')
    OR (total_rows IS NOT NULL AND processed_rows=total_rows)
  ),
  ADD CONSTRAINT royalty_import_sessions_lease_status_check CHECK (
    lease_owner IS NULL OR status IN ('PARSING','CLEANING')
  ),
  ADD CONSTRAINT royalty_import_sessions_retry_status_check CHECK (
    next_attempt_at IS NULL OR status IN ('QUEUED','CLEANING')
  ),
  ADD CONSTRAINT royalty_import_sessions_preview_shape_check CHECK (
    preview_result IS NULL OR (
      jsonb_typeof(preview_result)='object'
      AND jsonb_typeof(COALESCE(preview_result->'issues','[]'::jsonb))='array'
      AND jsonb_array_length(COALESCE(preview_result->'issues','[]'::jsonb)) <= 500
    )
  );

CREATE INDEX tracks_normalized_isrc
  ON soundpub.tracks ((upper(replace(btrim(isrc),'-',''))))
  WHERE isrc IS NOT NULL;

CREATE INDEX royalty_import_entries_batch_isrc_snapshot
  ON soundpub.royalty_import_entries(batch_id,source_isrc)
  INCLUDE (artist_id,financial_owner_user_id,label_owner_user_id,source_row_number);

CREATE INDEX royalty_import_sessions_queue_due
  ON soundpub.royalty_import_sessions(next_attempt_at,created_at,id)
  WHERE status IN ('UPLOADED','QUEUED');
CREATE INDEX royalty_import_sessions_expired_parse_lease
  ON soundpub.royalty_import_sessions(lease_expires_at,created_at,id)
  WHERE status='PARSING';
