-- Remove unnecessary columns from royalties table
ALTER TABLE public.royalties 
  DROP COLUMN IF EXISTS sales_type,
  DROP COLUMN IF EXISTS pendapatan_kotor_dsp,
  DROP COLUMN IF EXISTS artist_revenue,
  DROP COLUMN IF EXISTS soundpub_revenue;

-- Rename columns for clarity
-- pendapatan_label_artis stays as is (revenue for label/artist)
-- pendapatan_bersih_soundpub stays as is (net revenue for soundpub)