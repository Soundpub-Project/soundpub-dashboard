-- Preserve statement dimensions needed for reporting and reconciliation. JSON
-- imports may leave these NULL; authoritative CSV imports populate all fields.
ALTER TABLE soundpub.royalty_import_entries
  ADD COLUMN source_row_number integer CHECK (source_row_number IS NULL OR source_row_number >= 2),
  ADD COLUMN country text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  ADD COLUMN sales_type text CHECK (sales_type IS NULL OR length(btrim(sales_type)) BETWEEN 1 AND 100),
  ADD COLUMN sales_unit integer CHECK (sales_unit IS NULL OR sales_unit >= 0);
CREATE INDEX royalty_import_entries_period_dimensions
  ON soundpub.royalty_import_entries(period,country,platform,artist_id,release_id,track_id);
