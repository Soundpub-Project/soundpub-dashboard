ALTER TABLE soundpub.audit_logs
  ALTER COLUMN actor_id DROP NOT NULL;

ALTER TABLE soundpub.audit_logs
  ADD COLUMN IF NOT EXISTS actor_role text,
  ADD COLUMN IF NOT EXISTS before_data jsonb,
  ADD COLUMN IF NOT EXISTS after_data jsonb,
  ADD COLUMN IF NOT EXISTS changed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS request_id text;

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON soundpub.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON soundpub.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_type ON soundpub.audit_logs(target_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON soundpub.audit_logs(ip_address);

CREATE OR REPLACE FUNCTION soundpub.audit_sanitize(payload jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
  FROM jsonb_each(COALESCE(payload, '{}'::jsonb))
  WHERE lower(key) NOT IN ('password', 'password_hash', 'access_token', 'refresh_token', 'token', 'secret', 'client_secret', 'service_role_key');
$$;

CREATE OR REPLACE FUNCTION soundpub.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = soundpub, public
AS $$
DECLARE
  old_data jsonb;
  new_data jsonb;
  snapshot jsonb;
  actor uuid;
  target uuid;
  target_name text;
  actor_role_value text;
  actor_name text;
  actor_email text;
  changed jsonb := '[]'::jsonb;
  ip text;
  headers text;
  header_json jsonb := '{}'::jsonb;
  field_name text;
BEGIN
  actor := auth.uid();
  old_data := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN soundpub.audit_sanitize(to_jsonb(OLD)) ELSE NULL END;
  new_data := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN soundpub.audit_sanitize(to_jsonb(NEW)) ELSE NULL END;
  snapshot := COALESCE(new_data, old_data, '{}'::jsonb);
  target := NULLIF(snapshot->>'id', '')::uuid;
  target_name := COALESCE(snapshot->>'title', snapshot->>'name', snapshot->>'full_name', snapshot->>'artist_name', snapshot->>'filename', snapshot->>'key', target::text);

  IF actor IS NOT NULL THEN
    SELECT role::text INTO actor_role_value FROM soundpub.user_roles WHERE user_id = actor ORDER BY created_at DESC NULLS LAST LIMIT 1;
    SELECT full_name, email INTO actor_name, actor_email FROM soundpub.profiles WHERE id = actor;
  END IF;

  headers := current_setting('request.headers', true);
  IF headers IS NOT NULL AND headers ~ '^\s*\{' THEN
    header_json := headers::jsonb;
    ip := (header_json ->> 'x-forwarded-for');
    IF ip IS NULL THEN ip := (header_json ->> 'x-real-ip'); END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    FOR field_name IN SELECT entry.key FROM jsonb_each(COALESCE(new_data, '{}'::jsonb)) AS entry LOOP
      IF (old_data -> field_name) IS DISTINCT FROM (new_data -> field_name) THEN
        changed := changed || to_jsonb(field_name);
      END IF;
    END LOOP;
  END IF;

  INSERT INTO soundpub.audit_logs(action, actor_id, actor_role, target_id, target_type, details, ip_address, user_agent, request_id, before_data, after_data, changed_fields)
  VALUES (
    lower(TG_TABLE_NAME || '.' || TG_OP), actor, actor_role_value, target, TG_TABLE_NAME,
    jsonb_build_object('target_name', target_name, 'table', TG_TABLE_NAME, 'actor_name', actor_name, 'actor_email', actor_email, 'actor_role', actor_role_value), ip,
    NULLIF(header_json ->> 'user-agent', ''), NULLIF(header_json ->> 'x-request-id', ''),
    old_data, new_data, changed
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE table_record record;
BEGIN
  FOR table_record IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'soundpub'
      AND tablename NOT IN ('audit_logs', 'auth_events', 'email_send_log', 'rate_limits', 'storage_backup_log', 'storage_backup_runs')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_row_change ON soundpub.%I', table_record.tablename);
    EXECUTE format('CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON soundpub.%I FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change()', table_record.tablename);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION soundpub.record_auth_audit(p_action text, p_target_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = soundpub, public
AS $$
DECLARE actor uuid := auth.uid(); headers text := current_setting('request.headers', true); header_json jsonb := '{}'::jsonb; ip text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF headers IS NOT NULL AND headers ~ '^\s*\{' THEN
    header_json := headers::jsonb;
    ip := COALESCE(header_json ->> 'x-forwarded-for', header_json ->> 'x-real-ip');
  END IF;
  INSERT INTO soundpub.audit_logs(action, actor_id, target_id, target_type, details, ip_address, user_agent, request_id)
  VALUES (p_action, actor, COALESCE(p_target_id, actor), 'user', '{}'::jsonb, ip, header_json ->> 'user-agent', header_json ->> 'x-request-id');
END;
$$;

GRANT EXECUTE ON FUNCTION soundpub.record_auth_audit(text, uuid) TO authenticated;
