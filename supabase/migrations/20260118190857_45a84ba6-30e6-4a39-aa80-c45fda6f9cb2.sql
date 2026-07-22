-- Drop the problematic policies that cause infinite recursion
DROP POLICY IF EXISTS "Artists can view their parent label profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view label profiles for their releases" ON public.profiles;

-- Recreate the policies using security definer functions to avoid recursion

-- Create a function to get user's parent_label_id without triggering RLS
CREATE OR REPLACE FUNCTION public.get_user_parent_label_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT parent_label_id FROM public.profiles
  WHERE id = _user_id
$$;

-- Create policy for artists to view their parent label profile using function
CREATE POLICY "Artists can view their parent label profile" 
ON public.profiles 
FOR SELECT 
USING (
  has_role(auth.uid(), 'artist'::app_role) 
  AND id = get_user_parent_label_id(auth.uid())
);

-- Create a function to get label IDs from releases for a user
CREATE OR REPLACE FUNCTION public.get_user_release_label_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT label_id FROM public.releases
  WHERE label_id = _user_id 
     OR artist_name = (SELECT full_name FROM public.profiles WHERE id = _user_id)
$$;

-- Recreate the policy using the security definer function  
CREATE POLICY "Users can view label profiles for their releases" 
ON public.profiles 
FOR SELECT 
USING (
  id IN (SELECT * FROM get_user_release_label_ids(auth.uid()))
);