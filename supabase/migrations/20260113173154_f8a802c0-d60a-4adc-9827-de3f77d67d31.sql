-- Clean up duplicate artists policy (the old one still exists)
DROP POLICY IF EXISTS "Users can view artists" ON public.artists;
