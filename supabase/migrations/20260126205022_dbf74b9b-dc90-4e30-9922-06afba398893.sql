-- Hapus RLS policies yang menyebabkan masalah akses data
DROP POLICY IF EXISTS "Public can view active releases" ON public.releases;
DROP POLICY IF EXISTS "Public can view tracks in active releases" ON public.tracks;