-- Add new columns to royalties
ALTER TABLE public.royalties 
ADD COLUMN IF NOT EXISTS sales_type text,
ADD COLUMN IF NOT EXISTS net_revenue numeric NOT NULL DEFAULT 0;

-- Rename unit_penjualan to sales_unit (only if it exists and new name doesn't)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'royalties' AND column_name = 'unit_penjualan') 
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'royalties' AND column_name = 'sales_unit') THEN
    ALTER TABLE public.royalties RENAME COLUMN unit_penjualan TO sales_unit;
  END IF;
END $$;

-- Drop dependent policy first
DROP POLICY IF EXISTS "Artists can view their royalties" ON public.royalties;

-- Drop old columns
ALTER TABLE public.royalties 
DROP COLUMN IF EXISTS pendapatan_label_artis,
DROP COLUMN IF EXISTS pendapatan_bersih_soundpub,
DROP COLUMN IF EXISTS artist_name;

-- Recreate policy using 'artist' column
CREATE POLICY "Artists can view their royalties" 
ON public.royalties 
FOR SELECT 
USING (
  has_role(auth.uid(), 'artist'::app_role) 
  AND (artist = get_user_full_name(auth.uid()))
);

-- Add comments
COMMENT ON COLUMN public.royalties.net_revenue IS 'Net revenue from the royalty record';
COMMENT ON COLUMN public.royalties.sales_type IS 'Type of sale (streaming, download, etc.)';