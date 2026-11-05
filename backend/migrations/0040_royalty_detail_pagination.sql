BEGIN;

CREATE INDEX royalty_import_entries_batch_detail_order
  ON soundpub.royalty_import_entries
  (batch_id,(source_row_number IS NULL),source_row_number,source_row_id,id);

COMMIT;
