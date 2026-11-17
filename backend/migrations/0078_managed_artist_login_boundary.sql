ALTER TABLE soundpub.backend_users
  ADD COLUMN account_kind text NOT NULL DEFAULT 'STANDARD'
    CHECK (account_kind IN ('STANDARD','MANAGED_ARTIST'));
GRANT INSERT (account_kind) ON soundpub.backend_users TO soundpub_app;

CREATE FUNCTION soundpub.managed_artist_login_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE kind text;
BEGIN
  SELECT account_kind INTO kind FROM soundpub.backend_users
  WHERE id=COALESCE((to_jsonb(NEW)->>'application_user_id')::uuid,(to_jsonb(NEW)->>'user_id')::uuid) FOR SHARE;
  IF kind='MANAGED_ARTIST' THEN
    RAISE EXCEPTION 'MANAGED_ARTIST_LOGIN_DISABLED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.managed_artist_login_guard() FROM PUBLIC,soundpub_app;
CREATE TRIGGER managed_artist_credentials_guard BEFORE INSERT OR UPDATE OF user_id
  ON soundpub.local_auth_credentials FOR EACH ROW EXECUTE FUNCTION soundpub.managed_artist_login_guard();
CREATE TRIGGER managed_artist_sessions_guard BEFORE INSERT OR UPDATE OF user_id
  ON soundpub.auth_sessions FOR EACH ROW EXECUTE FUNCTION soundpub.managed_artist_login_guard();
CREATE TRIGGER managed_artist_tokens_guard BEFORE INSERT OR UPDATE OF user_id
  ON soundpub.auth_one_time_tokens FOR EACH ROW EXECUTE FUNCTION soundpub.managed_artist_login_guard();
CREATE TRIGGER managed_artist_external_identity_guard BEFORE INSERT OR UPDATE OF application_user_id
  ON soundpub.external_identities FOR EACH ROW EXECUTE FUNCTION soundpub.managed_artist_login_guard();

CREATE FUNCTION soundpub.managed_artist_role_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE target_user uuid; target_role text; kind text; user_status text;
BEGIN
  target_user := COALESCE((to_jsonb(NEW)->>'user_id')::uuid,(to_jsonb(OLD)->>'user_id')::uuid);
  target_role := COALESCE(to_jsonb(NEW)->>'role',to_jsonb(OLD)->>'role');
  SELECT account_kind,status INTO kind,user_status FROM soundpub.backend_users WHERE id=target_user FOR SHARE;
  IF kind='MANAGED_ARTIST' AND target_role<>'artist' THEN
    RAISE EXCEPTION 'MANAGED_ARTIST_ROLE_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF kind='MANAGED_ARTIST' AND TG_OP='DELETE' AND user_status<>'inactive' THEN
    RAISE EXCEPTION 'MANAGED_ARTIST_ROLE_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.managed_artist_role_guard() FROM PUBLIC,soundpub_app;
CREATE TRIGGER managed_artist_roles_guard BEFORE INSERT OR UPDATE OF user_id,role OR DELETE
  ON soundpub.user_roles FOR EACH ROW EXECUTE FUNCTION soundpub.managed_artist_role_guard();

CREATE FUNCTION soundpub.managed_artist_kind_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.account_kind='MANAGED_ARTIST' AND NEW.account_kind<>'MANAGED_ARTIST' THEN
    RAISE EXCEPTION 'MANAGED_ARTIST_CLAIM_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF NEW.account_kind='MANAGED_ARTIST' AND (
    EXISTS (SELECT 1 FROM soundpub.local_auth_credentials WHERE user_id=NEW.id)
    OR EXISTS (SELECT 1 FROM soundpub.auth_sessions WHERE user_id=NEW.id)
    OR EXISTS (SELECT 1 FROM soundpub.auth_one_time_tokens
      WHERE user_id=NEW.id AND consumed_at IS NULL AND expires_at>now())
    OR EXISTS (SELECT 1 FROM soundpub.external_identities WHERE application_user_id=NEW.id)
    OR EXISTS (SELECT 1 FROM soundpub.user_roles WHERE user_id=NEW.id AND role<>'artist')
  ) THEN
    RAISE EXCEPTION 'MANAGED_ARTIST_IDENTITY_CONFLICT' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.managed_artist_kind_guard() FROM PUBLIC,soundpub_app;
CREATE TRIGGER managed_artist_kind_guard BEFORE INSERT OR UPDATE OF account_kind
  ON soundpub.backend_users FOR EACH ROW EXECUTE FUNCTION soundpub.managed_artist_kind_guard();
