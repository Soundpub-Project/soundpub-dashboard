-- Preview stays write-free for new identities; nullable artist/owner fields are
-- resolved only inside the approved commit transaction.
ALTER TABLE soundpub.royalty_import_session_rows
  DROP CONSTRAINT royalty_import_session_rows_shape_check,
  ADD CONSTRAINT royalty_import_session_rows_shape_check CHECK (
    (row_status='INVALID' AND issue IS NOT NULL AND row_checksum IS NULL
      AND period IS NULL AND source_isrc IS NULL AND track_id IS NULL AND release_id IS NULL
      AND artist_id IS NULL AND financial_owner_user_id IS NULL AND label_owner_user_id IS NULL
      AND net_amount IS NULL AND artist_amount IS NULL AND label_amount IS NULL AND soundpub_amount IS NULL
      AND calculation_policy_code IS NULL)
    OR
    (row_status='MATCHED' AND issue IS NULL AND row_checksum IS NOT NULL
      AND period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      AND source_isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'
      AND platform IS NOT NULL AND length(btrim(platform)) BETWEEN 1 AND 200
      AND country ~ '^[A-Z]{2}$' AND sales_unit >= 0 AND net_amount >= 0
      AND label_owner_user_id IS NOT NULL
      AND ((track_id IS NOT NULL AND release_id IS NOT NULL AND artist_id IS NOT NULL
        AND financial_owner_user_id IS NOT NULL)
        OR (track_id IS NULL AND release_id IS NULL
          AND artist_name IS NOT NULL AND length(btrim(artist_name)) BETWEEN 1 AND 200
          AND label_name IS NOT NULL AND length(btrim(label_name)) BETWEEN 1 AND 200
          AND ((artist_id IS NULL AND financial_owner_user_id IS NULL)
            OR (artist_id IS NOT NULL AND financial_owner_user_id IS NOT NULL))))
      AND artist_amount >= 0 AND label_amount >= 0 AND soundpub_amount >= 0
      AND artist_amount+label_amount+soundpub_amount=net_amount
      AND length(btrim(calculation_policy_code)) BETWEEN 1 AND 100)
  );