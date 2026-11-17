CREATE INDEX royalty_import_entries_report_page_idx
  ON soundpub.royalty_import_entries (period DESC, source_row_number ASC NULLS LAST, id ASC);
