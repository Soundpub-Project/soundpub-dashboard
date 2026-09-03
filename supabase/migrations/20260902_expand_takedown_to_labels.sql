CREATE OR REPLACE FUNCTION Soundpub.can_create_takedown_request(_user_id uuid, _label_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = Soundpub, public
AS $$
  SELECT Soundpub.is_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM Soundpub.user_roles ur
      WHERE ur.user_id = _user_id AND ur.role = 'label' AND _label_id = _user_id
    )
    OR EXISTS (
      SELECT 1
      FROM Soundpub.user_roles ur
      JOIN Soundpub.profiles p ON p.id = ur.user_id
      WHERE ur.user_id = _user_id AND ur.role = 'artist' AND p.parent_label_id = _label_id
    )
$$;

CREATE OR REPLACE FUNCTION Soundpub.can_access_takedown_release(_user_id uuid, _release_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = Soundpub, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM Soundpub.releases r
    WHERE r.id = _release_id
      AND (
        Soundpub.is_admin(_user_id)
        OR (r.label_id = _user_id AND EXISTS (SELECT 1 FROM Soundpub.user_roles ur WHERE ur.user_id = _user_id AND ur.role = 'label'))
        OR (r.artist_user_id = _user_id AND EXISTS (SELECT 1 FROM Soundpub.user_roles ur WHERE ur.user_id = _user_id AND ur.role = 'artist'))
        OR (r.created_by = _user_id AND EXISTS (SELECT 1 FROM Soundpub.profiles p JOIN Soundpub.user_roles ur ON ur.user_id = p.id WHERE p.id = _user_id AND ur.role = 'artist' AND p.parent_label_id = r.label_id))
      )
  )
$$;

ALTER TABLE Soundpub.takedown_requests DROP CONSTRAINT IF EXISTS takedown_requests_soundpub_label;
REVOKE EXECUTE ON FUNCTION Soundpub.get_soundpub_label_id() FROM authenticated;
GRANT EXECUTE ON FUNCTION Soundpub.can_create_takedown_request(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Soundpub scoped users can create requests" ON Soundpub.takedown_requests;
CREATE POLICY "Eligible users can create takedown requests" ON Soundpub.takedown_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND Soundpub.can_create_takedown_request(auth.uid(), label_id)
  );