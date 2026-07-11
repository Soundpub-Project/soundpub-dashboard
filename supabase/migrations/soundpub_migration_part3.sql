-- =============================================
-- PART 3: RLS POLICIES
-- =============================================

-- USER ROLES POLICIES
CREATE POLICY "Users can view own roles"
ON soundpub.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
ON soundpub.user_roles FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

-- PROFILES POLICIES
CREATE POLICY "Users can view own profile"
ON soundpub.profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
ON soundpub.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Admins can manage all profiles"
ON soundpub.profiles FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

CREATE POLICY "Labels can view their artists"
ON soundpub.profiles FOR SELECT
TO authenticated
USING (parent_label_id = auth.uid());

-- RELEASES POLICIES
CREATE POLICY "Admins can manage all releases"
ON soundpub.releases FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

CREATE POLICY "Labels can manage own releases"
ON soundpub.releases FOR ALL
TO authenticated
USING (label_id = auth.uid() OR created_by = auth.uid());

CREATE POLICY "Artists can view own releases"
ON soundpub.releases FOR SELECT
TO authenticated
USING (artist_name = soundpub.get_user_full_name(auth.uid()));

-- TRACKS POLICIES
CREATE POLICY "Admins can manage all tracks"
ON soundpub.tracks FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

CREATE POLICY "Labels can manage tracks from own releases"
ON soundpub.tracks FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM soundpub.releases
    WHERE releases.id = tracks.release_id
    AND (releases.label_id = auth.uid() OR releases.created_by = auth.uid())
  )
);

CREATE POLICY "Artists can view own tracks"
ON soundpub.tracks FOR SELECT
TO authenticated
USING (artist_name = soundpub.get_user_full_name(auth.uid()));

-- ROYALTIES POLICIES
CREATE POLICY "Admins can manage all royalties"
ON soundpub.royalties FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

CREATE POLICY "Labels can view their royalties"
ON soundpub.royalties FOR SELECT
TO authenticated
USING (
  soundpub.has_role(auth.uid(), 'label'::soundpub.app_role)
  AND label_name = soundpub.get_user_full_name(auth.uid())
);

CREATE POLICY "Artists can view their royalties"
ON soundpub.royalties FOR SELECT
TO authenticated
USING (
  soundpub.has_role(auth.uid(), 'artist'::soundpub.app_role)
  AND (
    artist_name = soundpub.get_user_full_name(auth.uid())
    OR artist = soundpub.get_user_full_name(auth.uid())
  )
);

-- PAYOUT REQUESTS POLICIES
CREATE POLICY "Admins can manage all payouts"
ON soundpub.payout_requests FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

CREATE POLICY "Users can manage own payouts"
ON soundpub.payout_requests FOR ALL
TO authenticated
USING (user_id = auth.uid());

-- ROYALTY UPLOADS POLICIES
CREATE POLICY "Admins can manage all uploads"
ON soundpub.royalty_uploads FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));

CREATE POLICY "Users can view own uploads"
ON soundpub.royalty_uploads FOR SELECT
TO authenticated
USING (user_id = auth.uid());