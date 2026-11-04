-- Soundpub live schema baseline, inspected 2026-10-27 (Asia/Bangkok).
-- PostgreSQL 17.6; schema-only, no data or comments exported.
-- Apply ONCE to empty soundpub schema using psql -X -v ON_ERROR_STOP=1 --single-transaction.
-- External prerequisites: roles anon, authenticated, service_role, authenticator,
-- supabase_auth_admin; auth.users(id uuid PRIMARY KEY), auth.uid(), auth.role().
-- These are Supabase contracts, not replacement auth implementations.
-- Privacy: two embedded identity UUID constants replaced with required settings:
-- soundpub.migration_signup_label_id and soundpub.migration_reporting_label_id.
-- Resolve privately; settings are required at function execution, not schema creation.
-- This deliberate source transformation prevents byte-identical function-body comparison.
-- External auth.users signup trigger is inventoried separately; not installed here.
-- Existing ACL/RLS weaknesses retained as evidence, not approved security defaults.

--
-- PostgreSQL database dump
--



-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: soundpub; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA soundpub;


ALTER SCHEMA soundpub OWNER TO postgres;

--
-- Name: app_role; Type: TYPE; Schema: soundpub; Owner: postgres
--

CREATE TYPE soundpub.app_role AS ENUM (
    'superadmin',
    'admin',
    'label',
    'artist',
    'user',
    'copyright',
    'whitelabel'
);


ALTER TYPE soundpub.app_role OWNER TO postgres;

--
-- Name: takedown_request_type; Type: TYPE; Schema: soundpub; Owner: postgres
--

CREATE TYPE soundpub.takedown_request_type AS ENUM (
    'standard',
    'partial',
    'urgent'
);


ALTER TYPE soundpub.takedown_request_type OWNER TO postgres;

--
-- Name: takedown_status; Type: TYPE; Schema: soundpub; Owner: postgres
--

CREATE TYPE soundpub.takedown_status AS ENUM (
    'SUBMITTED',
    'UNDER_REVIEW',
    'NEED_DOCUMENT',
    'APPROVED',
    'SENT_TO_DSP',
    'PROCESSING_DSP',
    'PARTIALLY_COMPLETED',
    'COMPLETED',
    'REJECTED',
    'CANCEL_REQUESTED',
    'CANCELLED'
);


ALTER TYPE soundpub.takedown_status OWNER TO postgres;

--
-- Name: takedown_target_status; Type: TYPE; Schema: soundpub; Owner: postgres
--

CREATE TYPE soundpub.takedown_target_status AS ENUM (
    'PENDING',
    'SUBMITTED',
    'PROCESSING',
    'COMPLETED',
    'REJECTED'
);


ALTER TYPE soundpub.takedown_target_status OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: copyright_registrations; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.copyright_registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    legal_name text NOT NULL,
    stage_name text,
    nik text,
    address_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    phone text,
    email text NOT NULL,
    npwp text,
    bank_name text,
    bank_account_number text,
    bank_account_name text,
    applicant_type text DEFAULT 'personal'::text NOT NULL,
    composer_code text,
    contract_number text,
    admin_notes text,
    revision_notes text,
    submitted_at timestamp with time zone,
    reviewed_at timestamp with time zone,
    approved_at timestamp with time zone,
    rejected_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT copyright_registrations_applicant_type_check CHECK ((applicant_type = ANY (ARRAY['personal'::text, 'band_representative'::text, 'company_label'::text]))),
    CONSTRAINT copyright_registrations_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'awaiting_payment'::text, 'paid_pending_review'::text, 'in_review'::text, 'revision_requested'::text, 'approved'::text, 'rejected'::text, 'contract_generated'::text, 'stamping_pending'::text, 'stamped'::text, 'contract_signed'::text, 'active'::text])))
);


ALTER TABLE soundpub.copyright_registrations OWNER TO postgres;

--
-- Name: admin_review_copyright_registration(uuid, text, text, text, text, text); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.admin_review_copyright_registration(_registration_id uuid, _status text, _admin_notes text DEFAULT NULL::text, _revision_notes text DEFAULT NULL::text, _composer_code text DEFAULT NULL::text, _contract_number text DEFAULT NULL::text) RETURNS soundpub.copyright_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub'
    AS $$
DECLARE
  _updated soundpub.copyright_registrations;
  _generated_contract_number text;
  _generated_contract_sequence integer;
  _generated_contract_month_roman text;
  _generated_contract_code text;
  _generated_contract_year integer;
BEGIN
  IF NOT soundpub.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can review copyright registrations';
  END IF;

  IF _status NOT IN (
    'in_review',
    'revision_requested',
    'approved',
    'rejected',
    'contract_generated',
    'stamping_pending',
    'stamped',
    'contract_signed',
    'active'
  ) THEN
    RAISE EXCEPTION 'Invalid copyright registration review status: %', _status;
  END IF;

  UPDATE soundpub.copyright_registrations
  SET
    status = _status,
    admin_notes = COALESCE(_admin_notes, admin_notes),
    revision_notes = CASE WHEN _status = 'revision_requested' THEN _revision_notes ELSE revision_notes END,
    composer_code = COALESCE(_composer_code, composer_code),
    contract_number = COALESCE(_contract_number, contract_number),
    reviewed_at = CASE WHEN reviewed_at IS NULL THEN now() ELSE reviewed_at END,
    approved_at = CASE WHEN _status IN ('approved', 'contract_generated', 'stamping_pending', 'stamped', 'contract_signed', 'active') THEN COALESCE(approved_at, now()) ELSE approved_at END,
    rejected_at = CASE WHEN _status = 'rejected' THEN now() ELSE rejected_at END,
    updated_at = now()
  WHERE id = _registration_id
  RETURNING * INTO _updated;

  IF _updated.id IS NULL THEN
    RAISE EXCEPTION 'Copyright registration not found: %', _registration_id;
  END IF;

  IF _status IN ('approved', 'contract_generated', 'stamping_pending', 'stamped', 'contract_signed', 'active')
     AND _updated.contract_number IS NULL THEN
    SELECT contract_sequence, contract_month_roman, contract_code, contract_year, contract_number
    INTO _generated_contract_sequence, _generated_contract_month_roman, _generated_contract_code, _generated_contract_year, _generated_contract_number
    FROM soundpub.generate_copyright_contract_number('Soundpub');

    UPDATE soundpub.copyright_registrations
    SET contract_number = _generated_contract_number,
        updated_at = now()
    WHERE id = _updated.id
    RETURNING * INTO _updated;
  END IF;

  IF _status IN ('approved', 'contract_generated', 'stamping_pending', 'stamped', 'contract_signed', 'active') THEN
    INSERT INTO soundpub.copyright_contracts (
      registration_id,
      contract_sequence,
      contract_month_roman,
      contract_code,
      contract_year,
      contract_number,
      status
    )
    VALUES (
      _updated.id,
      _generated_contract_sequence,
      _generated_contract_month_roman,
      _generated_contract_code,
      _generated_contract_year,
      _updated.contract_number,
      CASE
        WHEN _status = 'approved' THEN 'draft'
        WHEN _status = 'contract_generated' THEN 'generated'
        WHEN _status = 'stamping_pending' THEN 'stamping_pending'
        WHEN _status = 'stamped' THEN 'stamped'
        WHEN _status = 'contract_signed' THEN 'signed'
        WHEN _status = 'active' THEN 'active'
        ELSE 'draft'
      END
    )
    ON CONFLICT (registration_id) DO UPDATE
    SET contract_number = EXCLUDED.contract_number,
        contract_code = EXCLUDED.contract_code,
        contract_year = EXCLUDED.contract_year,
        status = EXCLUDED.status,
        updated_at = now();
  END IF;

  IF _updated.composer_code IS NOT NULL THEN
    UPDATE soundpub.profiles
    SET composer_code = _updated.composer_code,
        updated_at = now()
    WHERE id = _updated.user_id;
  END IF;

  IF _status = 'active' THEN
    UPDATE soundpub.user_roles
    SET role = 'copyright'::soundpub.app_role
    WHERE user_id = _updated.user_id
      AND role = 'user'::soundpub.app_role;

    IF NOT EXISTS (
      SELECT 1 FROM soundpub.user_roles
      WHERE user_id = _updated.user_id
        AND role = 'copyright'::soundpub.app_role
    ) THEN
      INSERT INTO soundpub.user_roles (user_id, role)
      VALUES (_updated.user_id, 'copyright'::soundpub.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;

  RETURN _updated;
END;
$$;


ALTER FUNCTION soundpub.admin_review_copyright_registration(_registration_id uuid, _status text, _admin_notes text, _revision_notes text, _composer_code text, _contract_number text) OWNER TO postgres;

--
-- Name: copyright_contracts; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.copyright_contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registration_id uuid NOT NULL,
    contract_number text,
    template_version text DEFAULT 'soundpub-publishing-v1'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    preview_html_url text,
    draft_pdf_url text,
    generated_doc_url text,
    generated_pdf_url text,
    signed_doc_url text,
    stamped_pdf_url text,
    stamp_provider text,
    stamp_transaction_id text,
    stamp_status text,
    stamp_cost numeric(18,2),
    meterai_serial_number text,
    stamped_at timestamp with time zone,
    signed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT copyright_contracts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'generated'::text, 'stamping_pending'::text, 'stamped'::text, 'signed'::text, 'active'::text, 'void'::text])))
);


ALTER TABLE soundpub.copyright_contracts OWNER TO postgres;

--
-- Name: admin_update_copyright_contract(uuid, text, text, text, text, text); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.admin_update_copyright_contract(_registration_id uuid, _status text, _preview_html_url text DEFAULT NULL::text, _draft_pdf_url text DEFAULT NULL::text, _generated_pdf_url text DEFAULT NULL::text, _stamped_pdf_url text DEFAULT NULL::text) RETURNS soundpub.copyright_contracts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub'
    AS $$
DECLARE
  _contract soundpub.copyright_contracts;
BEGIN
  IF NOT soundpub.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can update copyright contracts';
  END IF;

  IF _status NOT IN ('draft', 'generated', 'contract_generated', 'stamping_pending', 'stamped', 'signed', 'contract_signed', 'active', 'void') THEN
    RAISE EXCEPTION 'Invalid copyright contract status: %', _status;
  END IF;

  IF _status = 'contract_generated' THEN
    _status := 'generated';
  ELSIF _status = 'contract_signed' THEN
    _status := 'signed';
  END IF;

  INSERT INTO soundpub.copyright_contracts (
    registration_id,
    status,
    preview_html_url,
    draft_pdf_url,
    generated_pdf_url,
    stamped_pdf_url
  )
  VALUES (
    _registration_id,
    _status,
    _preview_html_url,
    _draft_pdf_url,
    _generated_pdf_url,
    _stamped_pdf_url
  )
  ON CONFLICT (registration_id) DO UPDATE
  SET status = EXCLUDED.status,
      preview_html_url = COALESCE(EXCLUDED.preview_html_url, soundpub.copyright_contracts.preview_html_url),
      draft_pdf_url = COALESCE(EXCLUDED.draft_pdf_url, soundpub.copyright_contracts.draft_pdf_url),
      generated_pdf_url = COALESCE(EXCLUDED.generated_pdf_url, soundpub.copyright_contracts.generated_pdf_url),
      stamped_pdf_url = COALESCE(EXCLUDED.stamped_pdf_url, soundpub.copyright_contracts.stamped_pdf_url),
      stamped_at = CASE WHEN EXCLUDED.status = 'stamped' THEN COALESCE(soundpub.copyright_contracts.stamped_at, now()) ELSE soundpub.copyright_contracts.stamped_at END,
      signed_at = CASE WHEN EXCLUDED.status IN ('signed', 'active') THEN COALESCE(soundpub.copyright_contracts.signed_at, now()) ELSE soundpub.copyright_contracts.signed_at END,
      updated_at = now()
  RETURNING * INTO _contract;

  UPDATE soundpub.copyright_registrations
  SET status = CASE
        WHEN _status = 'draft' THEN status
        WHEN _status = 'generated' THEN 'contract_generated'
        WHEN _status = 'stamping_pending' THEN 'stamping_pending'
        WHEN _status = 'stamped' THEN 'stamped'
        WHEN _status = 'signed' THEN 'contract_signed'
        WHEN _status = 'active' THEN 'active'
        ELSE status
      END,
      approved_at = CASE WHEN _status IN ('generated', 'stamping_pending', 'stamped', 'signed', 'active') THEN COALESCE(approved_at, now()) ELSE approved_at END,
      updated_at = now()
  WHERE id = _registration_id;

  RETURN _contract;
END;
$$;


ALTER FUNCTION soundpub.admin_update_copyright_contract(_registration_id uuid, _status text, _preview_html_url text, _draft_pdf_url text, _generated_pdf_url text, _stamped_pdf_url text) OWNER TO postgres;

--
-- Name: audit_row_change(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.audit_row_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub', 'public'
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


ALTER FUNCTION soundpub.audit_row_change() OWNER TO postgres;

--
-- Name: audit_sanitize(jsonb); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.audit_sanitize(payload jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
  FROM jsonb_each(COALESCE(payload, '{}'::jsonb))
  WHERE lower(key) NOT IN ('password', 'password_hash', 'access_token', 'refresh_token', 'token', 'secret', 'client_secret', 'service_role_key');
$$;


ALTER FUNCTION soundpub.audit_sanitize(payload jsonb) OWNER TO postgres;

--
-- Name: auto_assign_artist_role(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.auto_assign_artist_role() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub', 'public'
    AS $$ DECLARE soundpub_label_id uuid := current_setting('soundpub.migration_signup_label_id')::uuid; BEGIN IF NEW.parent_label_id = soundpub_label_id THEN INSERT INTO soundpub.user_roles (user_id, role) VALUES (NEW.id, 'artist'::soundpub.app_role) ON CONFLICT (user_id, role) DO NOTHING; END IF; RETURN NEW; END; $$;


ALTER FUNCTION soundpub.auto_assign_artist_role() OWNER TO postgres;

--
-- Name: auto_assign_new_user_to_soundpub_label(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.auto_assign_new_user_to_soundpub_label() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub', 'public'
    AS $$ DECLARE soundpub_label_id uuid := current_setting('soundpub.migration_signup_label_id')::uuid; BEGIN IF TG_OP = 'INSERT' AND NEW.parent_label_id IS NULL THEN NEW.parent_label_id := soundpub_label_id; END IF; RETURN NEW; END; $$;


ALTER FUNCTION soundpub.auto_assign_new_user_to_soundpub_label() OWNER TO postgres;

--
-- Name: can_access_takedown_release(uuid, uuid); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.can_access_takedown_release(_user_id uuid, _release_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub', 'public'
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


ALTER FUNCTION soundpub.can_access_takedown_release(_user_id uuid, _release_id uuid) OWNER TO postgres;

--
-- Name: can_create_takedown_request(uuid, uuid); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.can_create_takedown_request(_user_id uuid, _label_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub', 'public'
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


ALTER FUNCTION soundpub.can_create_takedown_request(_user_id uuid, _label_id uuid) OWNER TO postgres;

--
-- Name: check_rate_limit(text, text, integer, integer); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.check_rate_limit(p_identifier text, p_action_type text, p_max_attempts integer, p_window_minutes integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub', 'public'
    AS $$
declare
  current_row soundpub.rate_limits%rowtype;
  v_blocked_until timestamptz;
  v_allowed boolean := true;
  v_retry_after_seconds integer := 0;
begin
  select *
  into current_row
  from soundpub.rate_limits
  where identifier = p_identifier
    and action_type = p_action_type;

  if found then
    if current_row.blocked_until is not null and current_row.blocked_until > now() then
      v_allowed := false;
      v_retry_after_seconds := ceil(extract(epoch from (current_row.blocked_until - now())));
      update soundpub.rate_limits
      set last_attempt_at = now()
      where id = current_row.id;
    elsif current_row.first_attempt_at < now() - make_interval(mins => p_window_minutes) then
      update soundpub.rate_limits
      set attempt_count = 1,
          first_attempt_at = now(),
          last_attempt_at = now(),
          blocked_until = null
      where id = current_row.id;
    elsif current_row.attempt_count >= p_max_attempts then
      v_blocked_until := now() + make_interval(mins => p_window_minutes);
      v_allowed := false;
      v_retry_after_seconds := ceil(extract(epoch from (v_blocked_until - now())));
      update soundpub.rate_limits
      set attempt_count = current_row.attempt_count + 1,
          last_attempt_at = now(),
          blocked_until = v_blocked_until
      where id = current_row.id;
    else
      update soundpub.rate_limits
      set attempt_count = current_row.attempt_count + 1,
          last_attempt_at = now(),
          blocked_until = null
      where id = current_row.id;
    end if;
  else
    insert into soundpub.rate_limits (
      identifier,
      action_type,
      attempt_count,
      first_attempt_at,
      last_attempt_at,
      blocked_until
    ) values (
      p_identifier,
      p_action_type,
      1,
      now(),
      now(),
      null
    );
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'retry_after_seconds', v_retry_after_seconds
  );
end;
$$;


ALTER FUNCTION soundpub.check_rate_limit(p_identifier text, p_action_type text, p_max_attempts integer, p_window_minutes integer) OWNER TO postgres;

--
-- Name: cleanup_expired_tokens(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.cleanup_expired_tokens() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE soundpub.profiles
  SET verification_token = NULL,
      verification_token_expires_at = NULL
  WHERE verification_token_expires_at < NOW();
  
  UPDATE soundpub.profiles
  SET password_reset_token = NULL,
      password_reset_token_expires_at = NULL
  WHERE password_reset_token_expires_at < NOW();
END;
$$;


ALTER FUNCTION soundpub.cleanup_expired_tokens() OWNER TO postgres;

--
-- Name: cleanup_rate_limits(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.cleanup_rate_limits() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM soundpub.rate_limits
  WHERE last_attempt_at < NOW() - INTERVAL '24 hours';
END;
$$;


ALTER FUNCTION soundpub.cleanup_rate_limits() OWNER TO postgres;

--
-- Name: commit_royalty_upload(jsonb, uuid, text, text, boolean, text, text); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.commit_royalty_upload(p_rows jsonb, p_actor_id uuid, p_filename text, p_original_filename text, p_replace_existing boolean DEFAULT false, p_replace_mode text DEFAULT 'filename_period'::text, p_idempotency_key text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub', 'public'
    AS $_$
DECLARE
  v_upload soundpub.royalty_uploads%ROWTYPE;
  v_existing soundpub.royalty_uploads%ROWTYPE;
  v_row_count integer;
  v_replaced_rows integer := 0;
  v_replaced_uploads integer := 0;
  v_existing_period_rows integer := 0;
  v_replacement_rows integer := 0;
  v_periods text[];
  v_period text;
  v_invalid_count integer;
  v_removed_profile_share numeric := 0;
  v_new_profile_share numeric := 0;
  v_expected_balance_delta numeric := 0;
  v_actual_balance_delta numeric := 0;
  v_balance_updates jsonb := '[]'::jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('soundpub_royalty_financial_mutation'));
  IF p_actor_id IS NULL OR NOT soundpub.is_admin(p_actor_id) THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN RAISE EXCEPTION 'No royalty rows supplied'; END IF;
  IF NULLIF(btrim(p_filename), '') IS NULL OR NULLIF(btrim(p_original_filename), '') IS NULL THEN RAISE EXCEPTION 'Filename is required'; END IF;
  IF p_idempotency_key IS NULL OR NULLIF(btrim(p_idempotency_key), '') IS NULL THEN RAISE EXCEPTION 'Upload idempotency key is required'; END IF;

  SELECT * INTO v_existing FROM soundpub.royalty_uploads
  WHERE idempotency_key = btrim(p_idempotency_key) FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'success' THEN
      RETURN jsonb_build_object(
        'success', true, 'insertedCount', v_existing.inserted_records,
        'uploadId', v_existing.id, 'idempotentReplay', true,
        'replacedUploads', COALESCE((v_existing.summary->>'replaced_uploads')::integer, 0),
        'replacedRows', COALESCE((v_existing.summary->>'replaced_rows')::integer, 0),
        'managedArtistsCreated', 0, 'managedArtistsReused', 0,
        'balanceErrors', jsonb_build_array(),
        'balanceUpdates', COALESCE(v_existing.summary->'balance_updates', '[]'::jsonb),
        'totalErrors', 0
      );
    END IF;
    RAISE EXCEPTION 'Upload with this idempotency key is already being processed';
  END IF;

  WITH input_rows AS (SELECT value row_data FROM jsonb_array_elements(p_rows))
  SELECT COUNT(*) INTO v_invalid_count FROM input_rows
  WHERE NULLIF(btrim(row_data->>'period'), '') IS NULL
     OR NULLIF(btrim(row_data->>'isrc'), '') IS NULL
     OR NULLIF(btrim(row_data->>'platform'), '') IS NULL
     OR NULLIF(btrim(row_data->>'country'), '') IS NULL
     OR NULLIF(row_data->>'artist_user_id', '') IS NULL
     OR NULLIF(row_data->>'label_user_id', '') IS NULL
     OR COALESCE(jsonb_typeof(row_data->'sales_unit'), '') <> 'number'
     OR COALESCE(jsonb_typeof(row_data->'net_revenue'), '') <> 'number';
  IF v_invalid_count > 0 THEN RAISE EXCEPTION 'Royalty payload contains % invalid rows', v_invalid_count; END IF;

  SELECT ARRAY_AGG(DISTINCT btrim(value->>'period')), COUNT(DISTINCT btrim(value->>'period'))
  INTO v_periods, v_invalid_count FROM jsonb_array_elements(p_rows);
  IF v_invalid_count <> 1 THEN RAISE EXCEPTION 'Each upload must contain exactly one royalty period'; END IF;
  v_period := v_periods[1];
  IF v_period !~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Royalty period must use YYYY-MM format';
  END IF;

  WITH input_rows AS (
    SELECT upper(replace(btrim(value->>'isrc'), '-', '')) isrc,
      (value->>'artist_user_id')::uuid artist_user_id,
      (value->>'label_user_id')::uuid label_user_id
    FROM jsonb_array_elements(p_rows)
  )
  SELECT COUNT(*) INTO v_invalid_count
  FROM input_rows input
  LEFT JOIN soundpub.profiles artist_profile ON artist_profile.id = input.artist_user_id
  LEFT JOIN soundpub.profiles label_profile ON label_profile.id = input.label_user_id
  WHERE artist_profile.id IS NULL OR artist_profile.status IS DISTINCT FROM 'active'
     OR label_profile.id IS NULL OR label_profile.status IS DISTINCT FROM 'active'
     OR NOT EXISTS (
       SELECT 1 FROM soundpub.user_roles role
       WHERE role.user_id = input.artist_user_id AND role.role::text = 'artist'
     )
     OR NOT EXISTS (
       SELECT 1 FROM soundpub.user_roles role
       WHERE role.user_id = input.label_user_id
         AND role.role::text IN ('label', 'whitelabel', 'admin', 'superadmin')
     )
     OR NOT (
       (
         SELECT COUNT(*) FROM (
           SELECT DISTINCT release.label_id,
             COALESCE(track.artist_user_id, release.artist_user_id) artist_user_id
           FROM soundpub.tracks track
           JOIN soundpub.releases release ON release.id = track.release_id
           WHERE upper(replace(btrim(track.isrc), '-', '')) = input.isrc
             AND release.label_id IS NOT NULL
             AND COALESCE(track.artist_user_id, release.artist_user_id) IS NOT NULL
         ) catalog_pairs
       ) = 1
       AND EXISTS (
         SELECT 1 FROM soundpub.tracks track
         JOIN soundpub.releases release ON release.id = track.release_id
         WHERE upper(replace(btrim(track.isrc), '-', '')) = input.isrc
           AND release.label_id = input.label_user_id
           AND COALESCE(track.artist_user_id, release.artist_user_id) = input.artist_user_id
       )
       OR (
         NOT EXISTS (
           SELECT 1 FROM soundpub.tracks track
           JOIN soundpub.releases release ON release.id = track.release_id
           WHERE upper(replace(btrim(track.isrc), '-', '')) = input.isrc
             AND release.label_id IS NOT NULL
             AND COALESCE(track.artist_user_id, release.artist_user_id) IS NOT NULL
         )
         AND artist_profile.parent_label_id = input.label_user_id
       )
     );
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Royalty payload contains inactive, ambiguous, or catalog-conflicting recipients';
  END IF;

  WITH input_rows AS (
    SELECT (value->>'net_revenue')::numeric revenue, (value->>'sales_unit')::numeric units
    FROM jsonb_array_elements(p_rows)
  )
  SELECT COUNT(*), COALESCE(SUM(revenue - round(revenue * 0.09, 2)), 0)
  INTO v_invalid_count, v_new_profile_share FROM input_rows
  WHERE revenue < 0 OR revenue <> round(revenue, 2) OR units <> trunc(units)
     OR abs(revenue) > 9999999999999999.99 OR units < 0 OR units > 2147483647;
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Royalty amounts require nonnegative values, two decimal places, and nonnegative integer units';
  END IF;
  SELECT COALESCE(SUM((value->>'net_revenue')::numeric - round((value->>'net_revenue')::numeric * 0.09, 2)), 0)
  INTO v_new_profile_share FROM jsonb_array_elements(p_rows);

  -- Hold catalog/royalty identity conflicts until ownership is reviewed.
  WITH input_rows AS (
    SELECT upper(replace(btrim(value->>'isrc'), '-', '')) isrc,
      (value->>'artist_user_id')::uuid artist_user_id
    FROM jsonb_array_elements(p_rows)
  )
  SELECT COUNT(*) INTO v_invalid_count
  FROM input_rows input
  WHERE EXISTS (
    SELECT 1 FROM soundpub.royalties historical
    WHERE upper(replace(btrim(historical.isrc), '-', '')) = input.isrc
      AND historical.artist_user_id IS DISTINCT FROM input.artist_user_id
  );
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Catalog artist conflicts with historical royalty recipient; review artist identity before import';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(artist_revenue + label_revenue), 0)
  INTO v_existing_period_rows, v_removed_profile_share
  FROM soundpub.royalties WHERE period = v_period;

  IF p_replace_existing THEN
    IF p_replace_mode <> 'filename_period' THEN
      RAISE EXCEPTION 'Only exact filename and period replacement is permitted';
    END IF;
    SELECT COUNT(*) INTO v_replacement_rows
    FROM soundpub.royalties royalty
    JOIN soundpub.royalty_uploads upload ON upload.id = royalty.upload_id
    WHERE royalty.period = v_period AND upload.original_filename = p_original_filename;
    IF v_existing_period_rows = 0 OR v_replacement_rows <> v_existing_period_rows THEN
      RAISE EXCEPTION 'Replacement requires one existing period entirely owned by the same original filename: %', p_original_filename;
    END IF;
  ELSIF v_existing_period_rows > 0 THEN
    RAISE EXCEPTION 'Royalty period % already contains % rows; upload full corrected period with the exact same filename and confirmed replacement', v_period, v_existing_period_rows;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS royalty_balance_before (
    id uuid PRIMARY KEY, balance numeric
  ) ON COMMIT DROP;
  TRUNCATE royalty_balance_before;
  INSERT INTO royalty_balance_before SELECT id, balance FROM soundpub.profiles;

  CREATE TEMP TABLE IF NOT EXISTS royalty_expected_profile_delta (
    profile_id uuid PRIMARY KEY, delta numeric NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE royalty_expected_profile_delta;
  INSERT INTO royalty_expected_profile_delta(profile_id, delta)
  SELECT profile_id, SUM(amount) FROM (
    SELECT (value->>'artist_user_id')::uuid profile_id,
      round((value->>'net_revenue')::numeric * 0.70, 2) amount
    FROM jsonb_array_elements(p_rows)
    UNION ALL
    SELECT (value->>'label_user_id')::uuid,
      (value->>'net_revenue')::numeric - round((value->>'net_revenue')::numeric * 0.09, 2) - round((value->>'net_revenue')::numeric * 0.70, 2)
    FROM jsonb_array_elements(p_rows)
  ) allocation GROUP BY profile_id
  ON CONFLICT (profile_id) DO UPDATE
    SET delta = royalty_expected_profile_delta.delta + EXCLUDED.delta;
  IF p_replace_existing THEN
    INSERT INTO royalty_expected_profile_delta(profile_id, delta)
    SELECT profile_id, -SUM(amount) FROM (
      SELECT royalty.artist_user_id profile_id, royalty.artist_revenue amount
      FROM soundpub.royalties royalty
      JOIN soundpub.royalty_uploads upload ON upload.id = royalty.upload_id
      WHERE royalty.period = v_period AND upload.original_filename = p_original_filename
      UNION ALL
      SELECT royalty.label_user_id, royalty.label_revenue
      FROM soundpub.royalties royalty
      JOIN soundpub.royalty_uploads upload ON upload.id = royalty.upload_id
      WHERE royalty.period = v_period AND upload.original_filename = p_original_filename
    ) removed WHERE profile_id IS NOT NULL GROUP BY profile_id
    ON CONFLICT (profile_id) DO UPDATE
      SET delta = royalty_expected_profile_delta.delta + EXCLUDED.delta;
  END IF;
  SELECT COALESCE(SUM(delta), 0) INTO v_expected_balance_delta
  FROM royalty_expected_profile_delta;

  IF p_replace_existing THEN
    CREATE TEMP TABLE IF NOT EXISTS royalty_affected_uploads(id uuid PRIMARY KEY) ON COMMIT DROP;
    TRUNCATE royalty_affected_uploads;
    INSERT INTO royalty_affected_uploads(id)
    SELECT DISTINCT royalty.upload_id FROM soundpub.royalties royalty
    JOIN soundpub.royalty_uploads upload ON upload.id = royalty.upload_id
    WHERE royalty.period = v_period AND upload.original_filename = p_original_filename ON CONFLICT DO NOTHING;
    INSERT INTO soundpub.archived_royalties(id, upload_id, row_data, archived_by, reason)
    SELECT royalty.id, royalty.upload_id, to_jsonb(royalty), p_actor_id, 'replace_filename_period'
    FROM soundpub.royalties royalty JOIN soundpub.royalty_uploads upload ON upload.id = royalty.upload_id
    WHERE royalty.period = v_period AND upload.original_filename = p_original_filename;
    WITH deleted AS (
      DELETE FROM soundpub.royalties royalty USING soundpub.royalty_uploads upload
      WHERE royalty.upload_id = upload.id AND royalty.period = v_period AND upload.original_filename = p_original_filename RETURNING royalty.id
    ) SELECT COUNT(*) INTO v_replaced_rows FROM deleted;
    SELECT COUNT(*) INTO v_replaced_uploads FROM royalty_affected_uploads;
    UPDATE soundpub.royalty_uploads upload SET status = 'replaced', updated_at = now()
    WHERE upload.id IN (SELECT id FROM royalty_affected_uploads)
      AND NOT EXISTS (SELECT 1 FROM soundpub.royalties royalty WHERE royalty.upload_id = upload.id);
  END IF;

  v_row_count := jsonb_array_length(p_rows);
  INSERT INTO soundpub.royalty_uploads (
    user_id, filename, original_filename, total_records, inserted_records, status, idempotency_key, summary
  ) VALUES (
    p_actor_id, p_filename, p_original_filename, v_row_count, v_row_count, 'success', btrim(p_idempotency_key),
    jsonb_build_object('replace_existing', p_replace_existing, 'replace_mode', p_replace_mode,
      'replace_periods', to_jsonb(v_periods), 'replaced_uploads', v_replaced_uploads, 'replaced_rows', v_replaced_rows)
  ) RETURNING * INTO v_upload;

  INSERT INTO soundpub.royalties (
    upload_id, source_row_number, period, isrc, upc, title, artist, artist_name, label_name,
    platform, country, sales_type, unit_penjualan, pendapatan_kotor_dsp,
    pendapatan_label_artis, pendapatan_bersih_soundpub, artist_revenue,
    label_revenue, soundpub_revenue, net_revenue, artist_user_id, label_user_id
  )
  SELECT v_upload.id, input.ordinality::integer, btrim(input.value->>'period'),
    upper(replace(btrim(input.value->>'isrc'), '-', '')), COALESCE(btrim(input.value->>'upc'), ''),
    NULLIF(btrim(input.value->>'title'), ''), NULLIF(btrim(input.value->>'artist'), ''),
    COALESCE(NULLIF(btrim(input.value->>'artist'), ''), ''), COALESCE(NULLIF(btrim(input.value->>'label_name'), ''), ''),
    btrim(input.value->>'platform'), upper(btrim(input.value->>'country')), COALESCE(btrim(input.value->>'sales_type'), ''),
    (input.value->>'sales_unit')::integer, (input.value->>'net_revenue')::numeric, (input.value->>'net_revenue')::numeric,
    round((input.value->>'net_revenue')::numeric * 0.09, 2), round((input.value->>'net_revenue')::numeric * 0.70, 2),
    (input.value->>'net_revenue')::numeric - round((input.value->>'net_revenue')::numeric * 0.09, 2)
      - round((input.value->>'net_revenue')::numeric * 0.70, 2),
    round((input.value->>'net_revenue')::numeric * 0.09, 2), (input.value->>'net_revenue')::numeric,
    (input.value->>'artist_user_id')::uuid, (input.value->>'label_user_id')::uuid
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS input(value, ordinality);

  PERFORM soundpub.rebuild_royalty_balances();
  IF EXISTS (SELECT 1 FROM soundpub.profiles WHERE balance < 0) THEN
    RAISE EXCEPTION 'Replacement would create negative available balance; reconcile payout obligations first';
  END IF;
  SELECT COALESCE(SUM(profile.balance - before.balance), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'profileId', profile.id,
      'beforeBalance', before.balance,
      'afterBalance', profile.balance,
      'delta', profile.balance - before.balance
    ) ORDER BY abs(profile.balance - before.balance) DESC) FILTER (
      WHERE profile.balance IS DISTINCT FROM before.balance
    ), '[]'::jsonb)
  INTO v_actual_balance_delta, v_balance_updates
  FROM soundpub.profiles profile JOIN royalty_balance_before before ON before.id = profile.id;
  WITH actual AS (
    SELECT profile.id profile_id, profile.balance - before.balance delta
    FROM soundpub.profiles profile
    JOIN royalty_balance_before before ON before.id = profile.id
  )
  SELECT COUNT(*) INTO v_invalid_count
  FROM royalty_expected_profile_delta expected
  FULL OUTER JOIN actual ON actual.profile_id = expected.profile_id
  WHERE abs(COALESCE(expected.delta, 0) - COALESCE(actual.delta, 0)) > 0.01;
  IF v_invalid_count > 0 OR abs(v_actual_balance_delta - v_expected_balance_delta) > 0.01 THEN
    RAISE EXCEPTION 'Royalty balance delta mismatch for % profiles: expected total %, actual total %',
      v_invalid_count, v_expected_balance_delta, v_actual_balance_delta;
  END IF;

  UPDATE soundpub.royalty_uploads
  SET summary = summary || jsonb_build_object(
    'balance_updates', v_balance_updates,
    'expected_balance_delta', v_expected_balance_delta,
    'actual_balance_delta', v_actual_balance_delta
  ) WHERE id = v_upload.id;

  INSERT INTO soundpub.audit_logs(action, actor_id, target_id, target_type, details)
  VALUES ('commit_royalty_upload', p_actor_id, v_upload.id, 'royalty_upload',
    jsonb_build_object('filename', p_original_filename, 'period', v_period,
      'inserted_records', v_row_count, 'replaced_uploads', v_replaced_uploads,
      'replaced_rows', v_replaced_rows, 'idempotency_key', btrim(p_idempotency_key),
      'expected_balance_delta', v_expected_balance_delta,
      'actual_balance_delta', v_actual_balance_delta));
  RETURN jsonb_build_object(
    'success', true, 'insertedCount', v_row_count, 'uploadId', v_upload.id,
    'idempotentReplay', false, 'replacedUploads', v_replaced_uploads,
    'replacedRows', v_replaced_rows, 'managedArtistsCreated', 0,
    'managedArtistsReused', 0, 'balanceErrors', jsonb_build_array(),
    'balanceUpdates', v_balance_updates, 'expectedBalanceDelta', v_expected_balance_delta,
    'actualBalanceDelta', v_actual_balance_delta, 'totalErrors', 0
  );
END;
$_$;


ALTER FUNCTION soundpub.commit_royalty_upload(p_rows jsonb, p_actor_id uuid, p_filename text, p_original_filename text, p_replace_existing boolean, p_replace_mode text, p_idempotency_key text) OWNER TO postgres;

--
-- Name: complete_payout(uuid); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.complete_payout(_payout_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub', 'auth'
    AS $$
DECLARE
  v_payout Soundpub.payout_requests%ROWTYPE;
  v_remaining numeric;
  v_take numeric;
  v_profile Soundpub.profiles%ROWTYPE;
BEGIN
  IF NOT Soundpub.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_payout FROM Soundpub.payout_requests WHERE id = _payout_id FOR UPDATE;
  IF v_payout IS NULL OR v_payout.status <> 'approved' THEN RAISE EXCEPTION 'Payout must be approved'; END IF;
  v_remaining := v_payout.amount;

  FOR v_profile IN
    SELECT * FROM Soundpub.profiles
    WHERE id = v_payout.user_id OR parent_label_id = v_payout.user_id
    ORDER BY CASE WHEN id = v_payout.user_id THEN 0 ELSE 1 END, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, GREATEST(COALESCE(v_profile.balance, 0), 0));
    IF v_take > 0 THEN
      UPDATE Soundpub.profiles SET balance = balance - v_take WHERE id = v_profile.id;
      v_remaining := v_remaining - v_take;
    END IF;
  END LOOP;
  IF v_remaining > 0 THEN RAISE EXCEPTION 'Saldo tidak mencukupi'; END IF;
  UPDATE Soundpub.payout_requests SET status = 'paid', processed_by = auth.uid(), processed_at = now() WHERE id = _payout_id;
END;
$$;


ALTER FUNCTION soundpub.complete_payout(_payout_id uuid) OWNER TO postgres;

--
-- Name: current_user_can_view_royalty(uuid, uuid); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.current_user_can_view_royalty(_artist_user_id uuid, _label_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub', 'auth'
    AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM soundpub.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('admin'::soundpub.app_role, 'superadmin'::soundpub.app_role)
      )
      OR _artist_user_id = auth.uid()
      OR _label_user_id = auth.uid()
    );
$$;


ALTER FUNCTION soundpub.current_user_can_view_royalty(_artist_user_id uuid, _label_user_id uuid) OWNER TO postgres;

--
-- Name: delete_release_with_refund(uuid); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.delete_release_with_refund(p_release_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub', 'auth', 'public'
    AS $$
DECLARE
  v_release soundpub.releases%ROWTYPE;
  v_payment soundpub.release_payments%ROWTYPE;
  v_refund numeric := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('soundpub_royalty_financial_mutation'));
  SELECT * INTO v_release FROM soundpub.releases WHERE id = p_release_id FOR UPDATE;
  IF v_release.id IS NULL THEN RAISE EXCEPTION 'Release not found'; END IF;
  IF NOT soundpub.is_admin(auth.uid()) AND (
    v_release.label_id IS DISTINCT FROM auth.uid()
    OR EXISTS (SELECT 1 FROM soundpub.release_payments WHERE release_id = p_release_id AND status = 'paid')
  ) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_payment FROM soundpub.release_payments
  WHERE release_id = p_release_id AND status = 'paid' FOR UPDATE;
  IF v_payment.id IS NOT NULL THEN
    INSERT INTO soundpub.balance_adjustments(profile_id, amount, source_type, source_id)
    VALUES (v_payment.user_id, v_payment.amount, 'release_refund', v_payment.id);
    v_refund := v_payment.amount;
  END IF;
  DELETE FROM soundpub.releases WHERE id = p_release_id;
  PERFORM soundpub.rebuild_royalty_balances();
  INSERT INTO soundpub.audit_logs(action, actor_id, target_id, target_type, details)
  VALUES ('delete_release_with_refund', auth.uid(), p_release_id, 'release',
    jsonb_build_object('payment_id', v_payment.id, 'refund_amount', v_refund));
  RETURN jsonb_build_object('deleted', true, 'refundAmount', v_refund);
END;
$$;


ALTER FUNCTION soundpub.delete_release_with_refund(p_release_id uuid) OWNER TO postgres;

--
-- Name: enforce_registered_label_release_artist(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.enforce_registered_label_release_artist() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub', 'auth', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM Soundpub.user_roles
    WHERE user_id = v_user_id AND role IN ('label', 'whitelabel')
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.label_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Label may only create releases for its own account';
  END IF;

  IF NEW.artist_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM Soundpub.profiles artist
    JOIN Soundpub.user_roles artist_role
      ON artist_role.user_id = artist.id AND artist_role.role = 'artist'
    WHERE artist.id = NEW.artist_user_id
      AND artist.parent_label_id = v_user_id
      AND COALESCE(lower(artist.status), 'active') NOT IN ('suspended', 'deleted')
  ) THEN
    RAISE EXCEPTION 'Release artist must be an active artist registered under this label';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION soundpub.enforce_registered_label_release_artist() OWNER TO postgres;

--
-- Name: enforce_registered_label_track_artist(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.enforce_registered_label_track_artist() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub', 'auth', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM Soundpub.user_roles
    WHERE user_id = v_user_id AND role IN ('label', 'whitelabel')
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.artist_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM Soundpub.releases release
    JOIN Soundpub.profiles artist ON artist.id = NEW.artist_user_id
    JOIN Soundpub.user_roles artist_role
      ON artist_role.user_id = artist.id AND artist_role.role = 'artist'
    WHERE release.id = NEW.release_id
      AND release.label_id = v_user_id
      AND artist.parent_label_id = v_user_id
      AND COALESCE(lower(artist.status), 'active') NOT IN ('suspended', 'deleted')
  ) THEN
    RAISE EXCEPTION 'Track artist must be an active artist registered under this label';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION soundpub.enforce_registered_label_track_artist() OWNER TO postgres;

--
-- Name: enforce_release_distribution_service(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.enforce_release_distribution_service() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub', 'auth', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF NEW.distribution_service = 'custom_label' THEN
    IF v_user_id IS NULL
      OR NEW.created_by IS DISTINCT FROM v_user_id
      OR NOT Soundpub.is_soundpub_artist_for_release(v_user_id, NEW.label_id)
      OR NULLIF(btrim(NEW.custom_label_name), '') IS NULL
      OR NULLIF(btrim(NEW.custom_record_name), '') IS NULL THEN
      RAISE EXCEPTION 'Custom Label hanya tersedia untuk artis aktif di bawah label Soundpub dengan metadata lengkap';
    END IF;
  ELSE
    NEW.custom_label_name := NULL;
    NEW.custom_record_name := NULL;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION soundpub.enforce_release_distribution_service() OWNER TO postgres;

--
-- Name: enforce_takedown_request_required_fields(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.enforce_takedown_request_required_fields() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub', 'pg_temp'
    AS $$
DECLARE
  v_other_reason_word_count integer;
BEGIN
  IF NULLIF(btrim(NEW.contact_name), '') IS NULL
    OR NULLIF(btrim(NEW.contact_position), '') IS NULL
    OR NULLIF(btrim(NEW.contact_phone), '') IS NULL
    OR NULLIF(btrim(NEW.contact_email), '') IS NULL
    OR NULLIF(btrim(NEW.contact_address), '') IS NULL THEN
    RAISE EXCEPTION 'Contact name, position, phone, email, and address are required';
  END IF;

  IF NEW.reason_category = 'Lainnya' THEN
    v_other_reason_word_count := cardinality(
      regexp_split_to_array(btrim(COALESCE(NEW.other_reason, '')), '\s+')
    );

    IF NULLIF(btrim(NEW.other_reason), '') IS NULL OR v_other_reason_word_count < 5 THEN
      RAISE EXCEPTION 'Other takedown reason must contain at least 5 words';
    END IF;
  ELSE
    NEW.other_reason := NULL;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION soundpub.enforce_takedown_request_required_fields() OWNER TO postgres;

--
-- Name: generate_composer_code(text); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.generate_composer_code(_prefix text DEFAULT 'SPC'::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub'
    AS $$
DECLARE
  _next_number integer;
  _code text;
BEGIN
  IF NOT soundpub.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can generate composer codes';
  END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(composer_code, '[^0-9]', '', 'g'), '')::integer), 0) + 1
  INTO _next_number
  FROM soundpub.profiles
  WHERE composer_code LIKE _prefix || '%';

  _code := _prefix || lpad(_next_number::text, 5, '0');
  RETURN _code;
END;
$$;


ALTER FUNCTION soundpub.generate_composer_code(_prefix text) OWNER TO postgres;

--
-- Name: generate_copyright_contract_number(text); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.generate_copyright_contract_number(_prefix text DEFAULT 'Soundpub'::text) RETURNS TABLE(contract_sequence integer, contract_month_roman text, contract_code text, contract_year integer, contract_number text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub'
    AS $$
DECLARE
  _next_number integer;
  _current_month integer := EXTRACT(MONTH FROM now())::integer;
  _roman_month text;
  _current_year integer := EXTRACT(YEAR FROM now())::integer;
BEGIN
  IF NOT soundpub.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can generate contract numbers';
  END IF;

  SELECT COUNT(*)::integer + 1 INTO _next_number
  FROM soundpub.copyright_contracts
  WHERE date_trunc('month', created_at) = date_trunc('month', now());

  _roman_month := CASE _current_month
    WHEN 1 THEN 'I'
    WHEN 2 THEN 'II'
    WHEN 3 THEN 'III'
    WHEN 4 THEN 'IV'
    WHEN 5 THEN 'V'
    WHEN 6 THEN 'VI'
    WHEN 7 THEN 'VII'
    WHEN 8 THEN 'VIII'
    WHEN 9 THEN 'IX'
    WHEN 10 THEN 'X'
    WHEN 11 THEN 'XI'
    WHEN 12 THEN 'XII'
  END;

  contract_sequence := _next_number;
  contract_month_roman := _roman_month;
  contract_code := 'PBLSR';
  contract_year := _current_year;
  contract_number := 'P' || lpad(_next_number::text, 5, '0') || '/' || _prefix || '/' || _roman_month || '/' || contract_code || '/' || _current_year::text;
  RETURN NEXT;
END;
$$;


ALTER FUNCTION soundpub.generate_copyright_contract_number(_prefix text) OWNER TO postgres;

--
-- Name: generate_managed_artist_email(text); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.generate_managed_artist_email(_artist_name text DEFAULT 'artist'::text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  slug text;
BEGIN
  slug := lower(regexp_replace(coalesce(_artist_name, 'artist'), '[^a-zA-Z0-9]+', '-', 'g'));
  slug := trim(both '-' from slug);
  IF slug IS NULL OR slug = '' THEN
    slug := 'artist';
  END IF;

  RETURN slug || '-' || replace(gen_random_uuid()::text, '-', '') || '@managed.soundpub.local';
END;
$$;


ALTER FUNCTION soundpub.generate_managed_artist_email(_artist_name text) OWNER TO postgres;

--
-- Name: get_artist_profile_summary(uuid); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.get_artist_profile_summary(_artist_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub', 'auth'
    AS $$
DECLARE
  can_view boolean;
  summary jsonb;
BEGIN
  SELECT
    auth.uid() = _artist_user_id
    OR soundpub.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM soundpub.profiles p
      WHERE p.id = _artist_user_id
        AND p.parent_label_id = auth.uid()
    )
  INTO can_view;

  IF NOT COALESCE(can_view, false) THEN
    RAISE EXCEPTION 'Not allowed to view artist profile summary';
  END IF;

  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      'totalRevenue', COALESCE((SELECT SUM(r.net_revenue) FROM soundpub.royalties r WHERE r.artist_user_id = _artist_user_id), 0),
      'artistBalance', COALESCE((SELECT SUM(r.artist_revenue) FROM soundpub.royalties r WHERE r.artist_user_id = _artist_user_id), 0),
      'totalStreams', COALESCE((SELECT SUM(r.unit_penjualan)::bigint FROM soundpub.royalties r WHERE r.artist_user_id = _artist_user_id), 0),
      'uniqueTracks', COALESCE((SELECT COUNT(DISTINCT r.isrc) FROM soundpub.royalties r WHERE r.artist_user_id = _artist_user_id), 0),
      'releaseCount', COALESCE((SELECT COUNT(*) FROM soundpub.releases rel WHERE rel.artist_user_id = _artist_user_id), 0),
      'trackCount', COALESCE((SELECT COUNT(*) FROM soundpub.tracks t WHERE t.artist_user_id = _artist_user_id), 0)
    ),
    'topTracks', COALESCE((
      SELECT jsonb_agg(row_to_json(track_row)::jsonb ORDER BY (track_row.artist_revenue) DESC)
      FROM (
        SELECT
          COALESCE(r.title, 'Untitled') AS title,
          r.isrc,
          COALESCE(SUM(r.net_revenue), 0) AS total_revenue,
          COALESCE(SUM(r.artist_revenue), 0) AS artist_revenue,
          COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams,
          COUNT(DISTINCT r.platform) AS platform_count
        FROM soundpub.royalties r
        WHERE r.artist_user_id = _artist_user_id
        GROUP BY COALESCE(r.title, 'Untitled'), r.isrc
        ORDER BY artist_revenue DESC
        LIMIT 10
      ) track_row
    ), '[]'::jsonb),
    'recentReleases', COALESCE((
      SELECT jsonb_agg(row_to_json(release_row)::jsonb ORDER BY release_row.created_at DESC)
      FROM (
        SELECT
          rel.id,
          rel.title,
          rel.status,
          rel.release_type,
          rel.cover_url,
          rel.upc,
          rel.created_at,
          rel.release_date
        FROM soundpub.releases rel
        WHERE rel.artist_user_id = _artist_user_id
        ORDER BY rel.created_at DESC
        LIMIT 8
      ) release_row
    ), '[]'::jsonb),
    'monthlyRevenue', COALESCE((
      SELECT jsonb_agg(row_to_json(month_row)::jsonb ORDER BY month_row.period)
      FROM (
        SELECT
          r.period,
          COALESCE(SUM(r.net_revenue), 0) AS total_revenue,
          COALESCE(SUM(r.artist_revenue), 0) AS artist_revenue,
          COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams
        FROM soundpub.royalties r
        WHERE r.artist_user_id = _artist_user_id
        GROUP BY r.period
        ORDER BY r.period
        LIMIT 12
      ) month_row
    ), '[]'::jsonb)
  ) INTO summary;

  RETURN summary;
END;
$$;


ALTER FUNCTION soundpub.get_artist_profile_summary(_artist_user_id uuid) OWNER TO postgres;

--
-- Name: get_dashboard_role_stats(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.get_dashboard_role_stats() RETURNS TABLE(total_revenue numeric, available_balance numeric, total_streams bigint, unique_tracks bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub', 'auth'
    AS $$
DECLARE
  v_role text;
BEGIN
  SELECT ur.role::text INTO v_role
  FROM Soundpub.user_roles ur
  WHERE ur.user_id = auth.uid()
  ORDER BY CASE ur.role::text WHEN 'superadmin' THEN 1 WHEN 'admin' THEN 2 WHEN 'label' THEN 3 WHEN 'whitelabel' THEN 4 WHEN 'artist' THEN 5 ELSE 9 END
  LIMIT 1;

  RETURN QUERY
  SELECT
    COALESCE(SUM(r.net_revenue), 0)::numeric,
    CASE
      WHEN v_role IN ('label', 'whitelabel') THEN
        COALESCE((SELECT SUM(p.balance) FROM Soundpub.profiles p WHERE p.parent_label_id = auth.uid()), 0)
        + COALESCE((SELECT p.balance FROM Soundpub.profiles p WHERE p.id = auth.uid()), 0)
      WHEN v_role IN ('superadmin', 'admin') THEN COALESCE(SUM(r.Soundpub_revenue), 0)
      WHEN v_role = 'artist' THEN COALESCE(SUM(r.artist_revenue), 0)
      ELSE 0
    END::numeric,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0),
    COUNT(DISTINCT r.isrc)::bigint
  FROM Soundpub.royalties r
  WHERE Soundpub.current_user_can_view_royalty(r.artist_user_id, r.label_user_id);
END;
$$;


ALTER FUNCTION soundpub.get_dashboard_role_stats() OWNER TO postgres;

--
-- Name: get_my_composer_royalties(text); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.get_my_composer_royalties(_period text DEFAULT NULL::text) RETURNS TABLE(id uuid, composer_code text, composer_name text, total_net_royalti numeric, period text, upload_id uuid, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _composer_code text;
BEGIN
  SELECT p.composer_code INTO _composer_code
  FROM soundpub.profiles p
  WHERE p.id = _uid;

  IF soundpub.is_admin(_uid) THEN
    RETURN QUERY
    SELECT cr.id, cr.composer_id, cr.composer_name, cr.total_net_royalti, cr.period, cr.upload_id, cr.created_at
    FROM soundpub.composer_royalties cr
    WHERE _period IS NULL OR cr.period = _period
    ORDER BY cr.period DESC NULLS LAST, cr.created_at DESC;
    RETURN;
  END IF;

  IF NOT soundpub.has_role(_uid, 'copyright'::soundpub.app_role) OR _composer_code IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT cr.id, cr.composer_id, cr.composer_name, cr.total_net_royalti, cr.period, cr.upload_id, cr.created_at
  FROM soundpub.composer_royalties cr
  WHERE cr.composer_id = _composer_code
    AND (_period IS NULL OR cr.period = _period)
  ORDER BY cr.period DESC NULLS LAST, cr.created_at DESC;
END;
$$;


ALTER FUNCTION soundpub.get_my_composer_royalties(_period text) OWNER TO postgres;

--
-- Name: get_royalty_artist_breakdown(text, integer); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.get_royalty_artist_breakdown(_period text DEFAULT NULL::text, _limit integer DEFAULT 20) RETURNS TABLE(artist_name text, revenue numeric, streams bigint, track_count bigint, is_soundpub boolean, artist_share numeric, label_share numeric, admin_share numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub'
    AS $$
  SELECT
    COALESCE(r.artist, r.artist_name, 'Unknown') AS artist_name,
    COALESCE(SUM(r.net_revenue), 0) AS revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams,
    COUNT(DISTINCT r.isrc) AS track_count,
    BOOL_OR(r.label_user_id = current_setting('soundpub.migration_reporting_label_id')::uuid) AS is_soundpub,
    COALESCE(SUM(r.artist_revenue), 0) AS artist_share,
    COALESCE(SUM(r.label_revenue), 0) AS label_share,
    COALESCE(SUM(r.soundpub_revenue), 0) AS admin_share
  FROM soundpub.royalties r
  WHERE (_period IS NULL OR r.period = _period)
    AND soundpub.current_user_can_view_royalty(r.artist_user_id, r.label_user_id)
  GROUP BY COALESCE(r.artist, r.artist_name, 'Unknown')
  ORDER BY revenue DESC
  LIMIT _limit;
$$;


ALTER FUNCTION soundpub.get_royalty_artist_breakdown(_period text, _limit integer) OWNER TO postgres;

--
-- Name: get_royalty_comparison(text[], text[]); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.get_royalty_comparison(_current_periods text[], _previous_periods text[]) RETURNS TABLE(data_type text, period text, revenue numeric, streams bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub'
    AS $$
  SELECT 'current'::text AS data_type, r.period,
    COALESCE(SUM(r.net_revenue), 0) AS revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams
  FROM soundpub.royalties r
  WHERE r.period = ANY(_current_periods)
    AND soundpub.current_user_can_view_royalty(r.artist_user_id, r.label_user_id)
  GROUP BY r.period
  UNION ALL
  SELECT 'previous'::text AS data_type, r.period,
    COALESCE(SUM(r.net_revenue), 0) AS revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams
  FROM soundpub.royalties r
  WHERE r.period = ANY(_previous_periods)
    AND soundpub.current_user_can_view_royalty(r.artist_user_id, r.label_user_id)
  GROUP BY r.period;
$$;


ALTER FUNCTION soundpub.get_royalty_comparison(_current_periods text[], _previous_periods text[]) OWNER TO postgres;

--
-- Name: get_royalty_country_summary(integer); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.get_royalty_country_summary(_limit integer DEFAULT 10) RETURNS TABLE(country text, revenue numeric, streams bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub'
    AS $$
  SELECT
    COALESCE(r.country, 'Unknown') AS country,
    COALESCE(SUM(r.net_revenue), 0) AS revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams
  FROM soundpub.royalties r
  WHERE soundpub.current_user_can_view_royalty(r.artist_user_id, r.label_user_id)
  GROUP BY COALESCE(r.country, 'Unknown')
  ORDER BY revenue DESC
  LIMIT _limit;
$$;


ALTER FUNCTION soundpub.get_royalty_country_summary(_limit integer) OWNER TO postgres;

--
-- Name: get_royalty_label_breakdown(text); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.get_royalty_label_breakdown(_period text DEFAULT NULL::text) RETURNS TABLE(label_name text, revenue numeric, streams bigint, artist_share numeric, label_share numeric, admin_share numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub'
    AS $$
  SELECT
    COALESCE(r.label_name, 'Unknown') AS label_name,
    COALESCE(SUM(r.net_revenue), 0) AS revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams,
    COALESCE(SUM(r.artist_revenue), 0) AS artist_share,
    COALESCE(SUM(r.label_revenue), 0) AS label_share,
    COALESCE(SUM(r.soundpub_revenue), 0) AS admin_share
  FROM soundpub.royalties r
  WHERE (_period IS NULL OR r.period = _period)
    AND soundpub.current_user_can_view_royalty(r.artist_user_id, r.label_user_id)
  GROUP BY COALESCE(r.label_name, 'Unknown')
  ORDER BY revenue DESC;
$$;


ALTER FUNCTION soundpub.get_royalty_label_breakdown(_period text) OWNER TO postgres;

--
-- Name: get_royalty_monthly_summary(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.get_royalty_monthly_summary() RETURNS TABLE(period text, revenue numeric, streams bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub'
    AS $$
  SELECT
    r.period,
    COALESCE(SUM(r.net_revenue), 0) AS revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams
  FROM soundpub.royalties r
  WHERE soundpub.current_user_can_view_royalty(r.artist_user_id, r.label_user_id)
  GROUP BY r.period
  ORDER BY r.period;
$$;


ALTER FUNCTION soundpub.get_royalty_monthly_summary() OWNER TO postgres;

--
-- Name: get_royalty_period_summary(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.get_royalty_period_summary() RETURNS TABLE(period text, revenue numeric, streams bigint, unique_tracks bigint, unique_artists bigint, unique_labels bigint, top_platform text, top_country text, growth numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub'
    AS $$
  WITH visible AS (
    SELECT *
    FROM soundpub.royalties r
    WHERE soundpub.current_user_can_view_royalty(r.artist_user_id, r.label_user_id)
  ), base AS (
    SELECT
      r.period,
      COALESCE(SUM(r.net_revenue), 0) AS revenue,
      COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams,
      COUNT(DISTINCT r.isrc) AS unique_tracks,
      COUNT(DISTINCT COALESCE(r.artist, r.artist_name)) AS unique_artists,
      COUNT(DISTINCT r.label_name) AS unique_labels
    FROM visible r
    GROUP BY r.period
  ), platform_rank AS (
    SELECT period, platform,
      ROW_NUMBER() OVER (PARTITION BY period ORDER BY SUM(net_revenue) DESC) AS rank
    FROM visible
    GROUP BY period, platform
  ), country_rank AS (
    SELECT period, country,
      ROW_NUMBER() OVER (PARTITION BY period ORDER BY SUM(net_revenue) DESC) AS rank
    FROM visible
    GROUP BY period, country
  )
  SELECT
    b.period,
    b.revenue,
    b.streams,
    b.unique_tracks,
    b.unique_artists,
    b.unique_labels,
    COALESCE(p.platform, '-') AS top_platform,
    COALESCE(c.country, '-') AS top_country,
    0::numeric AS growth
  FROM base b
  LEFT JOIN platform_rank p ON p.period = b.period AND p.rank = 1
  LEFT JOIN country_rank c ON c.period = b.period AND c.rank = 1
  ORDER BY b.period DESC;
$$;


ALTER FUNCTION soundpub.get_royalty_period_summary() OWNER TO postgres;

--
-- Name: get_royalty_periods(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.get_royalty_periods() RETURNS TABLE(period text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub'
    AS $$
  SELECT DISTINCT r.period
  FROM soundpub.royalties r
  WHERE r.period IS NOT NULL
    AND soundpub.current_user_can_view_royalty(r.artist_user_id, r.label_user_id)
  ORDER BY r.period DESC;
$$;


ALTER FUNCTION soundpub.get_royalty_periods() OWNER TO postgres;

--
-- Name: get_royalty_platform_summary(integer); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.get_royalty_platform_summary(_limit integer DEFAULT 10) RETURNS TABLE(platform text, revenue numeric, streams bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub'
    AS $$
  SELECT
    COALESCE(r.platform, 'Unknown') AS platform,
    COALESCE(SUM(r.net_revenue), 0) AS revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams
  FROM soundpub.royalties r
  WHERE soundpub.current_user_can_view_royalty(r.artist_user_id, r.label_user_id)
  GROUP BY COALESCE(r.platform, 'Unknown')
  ORDER BY revenue DESC
  LIMIT _limit;
$$;


ALTER FUNCTION soundpub.get_royalty_platform_summary(_limit integer) OWNER TO postgres;

--
-- Name: get_royalty_stats(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.get_royalty_stats() RETURNS TABLE(total_revenue numeric, total_streams bigint, unique_artists bigint, unique_labels bigint, unique_platforms bigint, unique_tracks bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub'
    AS $$
  SELECT
    COALESCE(SUM(r.net_revenue), 0) AS total_revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS total_streams,
    COUNT(DISTINCT COALESCE(r.artist, r.artist_name)) AS unique_artists,
    COUNT(DISTINCT r.label_name) AS unique_labels,
    COUNT(DISTINCT r.platform) AS unique_platforms,
    COUNT(DISTINCT r.isrc) AS unique_tracks
  FROM soundpub.royalties r
  WHERE soundpub.current_user_can_view_royalty(r.artist_user_id, r.label_user_id);
$$;


ALTER FUNCTION soundpub.get_royalty_stats() OWNER TO postgres;

--
-- Name: get_royalty_top_performers(text[], text[], text, integer); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.get_royalty_top_performers(_current_periods text[], _previous_periods text[], _group_by text DEFAULT 'title'::text, _limit integer DEFAULT 10) RETURNS TABLE(name text, revenue numeric, streams bigint, growth numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub'
    AS $$
BEGIN
  RETURN QUERY
  WITH current_data AS (
    SELECT
      CASE
        WHEN _group_by = 'platform' THEN COALESCE(r.platform, 'Unknown')
        WHEN _group_by = 'country' THEN COALESCE(r.country, 'Unknown')
        ELSE COALESCE(r.title, 'Unknown')
      END AS group_name,
      COALESCE(SUM(r.net_revenue), 0) AS current_revenue,
      COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS current_streams
    FROM soundpub.royalties r
    WHERE r.period = ANY(_current_periods)
      AND soundpub.current_user_can_view_royalty(r.artist_user_id, r.label_user_id)
    GROUP BY group_name
  ), previous_data AS (
    SELECT
      CASE
        WHEN _group_by = 'platform' THEN COALESCE(r.platform, 'Unknown')
        WHEN _group_by = 'country' THEN COALESCE(r.country, 'Unknown')
        ELSE COALESCE(r.title, 'Unknown')
      END AS group_name,
      COALESCE(SUM(r.net_revenue), 0) AS previous_revenue
    FROM soundpub.royalties r
    WHERE r.period = ANY(_previous_periods)
      AND soundpub.current_user_can_view_royalty(r.artist_user_id, r.label_user_id)
    GROUP BY group_name
  )
  SELECT
    c.group_name AS name,
    c.current_revenue AS revenue,
    c.current_streams AS streams,
    CASE
      WHEN COALESCE(p.previous_revenue, 0) = 0 THEN 0::numeric
      ELSE ROUND(((c.current_revenue - p.previous_revenue) / p.previous_revenue) * 100, 2)
    END AS growth
  FROM current_data c
  LEFT JOIN previous_data p ON p.group_name = c.group_name
  ORDER BY c.current_revenue DESC
  LIMIT _limit;
END;
$$;


ALTER FUNCTION soundpub.get_royalty_top_performers(_current_periods text[], _previous_periods text[], _group_by text, _limit integer) OWNER TO postgres;

--
-- Name: get_royalty_track_breakdown(text); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.get_royalty_track_breakdown(_period text DEFAULT NULL::text) RETURNS TABLE(isrc text, title text, artist_name text, label text, revenue numeric, streams bigint, platform_count bigint, country_count bigint, is_soundpub boolean, artist_share numeric, label_share numeric, admin_share numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub'
    AS $$
  SELECT
    r.isrc,
    COALESCE(MAX(r.title), 'Unknown') AS title,
    COALESCE(MAX(COALESCE(r.artist, r.artist_name)), 'Unknown') AS artist_name,
    COALESCE(MAX(r.label_name), '') AS label,
    COALESCE(SUM(r.net_revenue), 0) AS revenue,
    COALESCE(SUM(r.unit_penjualan)::bigint, 0) AS streams,
    COUNT(DISTINCT r.platform) AS platform_count,
    COUNT(DISTINCT r.country) AS country_count,
    BOOL_OR(r.label_user_id = current_setting('soundpub.migration_reporting_label_id')::uuid) AS is_soundpub,
    COALESCE(SUM(r.artist_revenue), 0) AS artist_share,
    COALESCE(SUM(r.label_revenue), 0) AS label_share,
    COALESCE(SUM(r.soundpub_revenue), 0) AS admin_share
  FROM soundpub.royalties r
  WHERE (_period IS NULL OR r.period = _period)
    AND r.isrc IS NOT NULL
    AND soundpub.current_user_can_view_royalty(r.artist_user_id, r.label_user_id)
  GROUP BY r.isrc
  ORDER BY revenue DESC;
$$;


ALTER FUNCTION soundpub.get_royalty_track_breakdown(_period text) OWNER TO postgres;

--
-- Name: get_soundpub_label_id(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.get_soundpub_label_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub', 'public'
    AS $$
  SELECT p.id FROM Soundpub.profiles p JOIN Soundpub.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'label'
    AND lower(regexp_replace(trim(p.full_name), '\s+', ' ', 'g')) IN ('soundpub', 'soundpub music', 'soundpub music ecosystem')
  ORDER BY CASE lower(regexp_replace(trim(p.full_name), '\s+', ' ', 'g')) WHEN 'soundpub music' THEN 1 ELSE 2 END
  LIMIT 1
$$;


ALTER FUNCTION soundpub.get_soundpub_label_id() OWNER TO postgres;

--
-- Name: get_user_full_name(uuid); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.get_user_full_name(user_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub'
    AS $_$
BEGIN
  RETURN (SELECT full_name FROM soundpub.profiles WHERE id = $1);
END;
$_$;


ALTER FUNCTION soundpub.get_user_full_name(user_id uuid) OWNER TO postgres;

--
-- Name: guard_profile_sensitive_update(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.guard_profile_sensitive_update() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'soundpub', 'auth', 'public'
    AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.balance, 0) <> 0 OR COALESCE(NEW.artist_revenue, 0) <> 0
       OR COALESCE(NEW.label_revenue, 0) <> 0 THEN
      RAISE EXCEPTION 'Financial profile fields cannot be set on direct insert';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.balance IS DISTINCT FROM OLD.balance
     OR NEW.artist_revenue IS DISTINCT FROM OLD.artist_revenue
     OR NEW.label_revenue IS DISTINCT FROM OLD.label_revenue THEN
    RAISE EXCEPTION 'Financial profile fields cannot be updated directly';
  END IF;
  IF OLD.id = auth.uid() AND (
    NEW.parent_label_id IS DISTINCT FROM OLD.parent_label_id
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.composer_code IS DISTINCT FROM OLD.composer_code
    OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
    OR NEW.subscription_upgraded_at IS DISTINCT FROM OLD.subscription_upgraded_at
    OR NEW.sso_provider IS DISTINCT FROM OLD.sso_provider
    OR NEW.sso_user_id IS DISTINCT FROM OLD.sso_user_id
    OR NEW.sso_user_type IS DISTINCT FROM OLD.sso_user_type
    OR NEW.is_managed_artist IS DISTINCT FROM OLD.is_managed_artist
    OR NEW.auth_user_status IS DISTINCT FROM OLD.auth_user_status
  ) THEN
    RAISE EXCEPTION 'Sensitive profile fields require an authorized server operation';
  END IF;
  IF OLD.parent_label_id = auth.uid() AND NEW.parent_label_id IS DISTINCT FROM OLD.parent_label_id THEN
    RAISE EXCEPTION 'Artist ownership transfer requires an authorized server operation';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION soundpub.guard_profile_sensitive_update() OWNER TO postgres;

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub', 'public', 'auth'
    AS $$
DECLARE
  v_full_name text;
  v_sso_provider text;
  v_source_app text;
  v_soundpub_label_id uuid;
BEGIN
  v_source_app := COALESCE(
    NEW.raw_user_meta_data->>'source_app',
    NEW.raw_user_meta_data->>'app',
    NEW.raw_app_meta_data->>'source_app',
    NEW.raw_app_meta_data->>'app'
  );

  IF v_source_app = 'utero_academy' THEN
    RETURN NEW;
  END IF;

  SELECT p.id
  INTO v_soundpub_label_id
  FROM Soundpub.profiles p
  JOIN Soundpub.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'label'::Soundpub.app_role
    AND lower(regexp_replace(trim(p.full_name), '\s+', ' ', 'g')) IN (
      'soundpub',
      'soundpub music',
      'soundpub music ecosystem'
    )
  ORDER BY CASE lower(regexp_replace(trim(p.full_name), '\s+', ' ', 'g'))
    WHEN 'soundpub music' THEN 1
    ELSE 2
  END
  LIMIT 1;

  IF v_soundpub_label_id IS NULL THEN
    RAISE EXCEPTION 'Soundpub MUSIC label profile not found';
  END IF;

  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  v_sso_provider := CASE
    WHEN NEW.raw_app_meta_data->>'provider' = 'google' THEN 'google'
    WHEN NEW.raw_user_meta_data->>'iss' LIKE '%keycloak%' THEN 'iccn'
    WHEN NEW.raw_user_meta_data->>'iss' LIKE '%iccn%' THEN 'iccn'
    ELSE NULL
  END;

  INSERT INTO Soundpub.profiles (
    id, email, full_name, parent_label_id, sso_provider, password_set,
    status, artist_profile_completed, created_at, updated_at
  )
  VALUES (
    NEW.id, NEW.email, v_full_name, v_soundpub_label_id, v_sso_provider,
    CASE WHEN v_sso_provider IS NULL THEN true ELSE false END,
    'active', false, now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(Soundpub.profiles.full_name, EXCLUDED.full_name),
    parent_label_id = COALESCE(Soundpub.profiles.parent_label_id, EXCLUDED.parent_label_id),
    sso_provider = COALESCE(Soundpub.profiles.sso_provider, EXCLUDED.sso_provider),
    updated_at = now();

  DELETE FROM Soundpub.user_roles WHERE user_id = NEW.id;
  INSERT INTO Soundpub.user_roles (user_id, role)
  VALUES (NEW.id, 'artist'::Soundpub.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION soundpub.handle_new_user() OWNER TO postgres;

--
-- Name: has_role(uuid, soundpub.app_role); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.has_role(user_id uuid, role soundpub.app_role) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub'
    AS $_$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM soundpub.user_roles
    WHERE user_roles.user_id = $1 AND user_roles.role = $2
  );
END;
$_$;


ALTER FUNCTION soundpub.has_role(user_id uuid, role soundpub.app_role) OWNER TO postgres;

--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.is_admin(user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub'
    AS $_$
BEGIN
  RETURN soundpub.has_role($1, 'superadmin'::soundpub.app_role) 
      OR soundpub.has_role($1, 'admin'::soundpub.app_role);
END;
$_$;


ALTER FUNCTION soundpub.is_admin(user_id uuid) OWNER TO postgres;

--
-- Name: is_managed_artist_email(text); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.is_managed_artist_email(_email text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT lower(coalesce(_email, '')) LIKE '%@managed.soundpub.local'
$$;


ALTER FUNCTION soundpub.is_managed_artist_email(_email text) OWNER TO postgres;

--
-- Name: is_soundpub_artist_for_release(uuid, uuid); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.is_soundpub_artist_for_release(_user_id uuid, _label_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM Soundpub.profiles artist
    JOIN Soundpub.user_roles artist_role
      ON artist_role.user_id = artist.id AND artist_role.role = 'artist'
    JOIN Soundpub.profiles label_profile
      ON label_profile.id = artist.parent_label_id
    JOIN Soundpub.user_roles label_role
      ON label_role.user_id = label_profile.id AND label_role.role = 'label'
    WHERE artist.id = _user_id
      AND artist.parent_label_id = _label_id
      AND COALESCE(lower(artist.status), 'active') NOT IN ('suspended', 'deleted')
      AND lower(regexp_replace(trim(label_profile.full_name), '\s+', ' ', 'g'))
        IN ('soundpub', 'soundpub music', 'soundpub music ecosystem')
  );
$$;


ALTER FUNCTION soundpub.is_soundpub_artist_for_release(_user_id uuid, _label_id uuid) OWNER TO postgres;

--
-- Name: is_soundpub_takedown_user(uuid); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.is_soundpub_takedown_user(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub', 'public'
    AS $$
  SELECT Soundpub.is_admin(_user_id) OR _user_id = Soundpub.get_soundpub_label_id()
    OR EXISTS (SELECT 1 FROM Soundpub.profiles p WHERE p.id = _user_id AND p.parent_label_id = Soundpub.get_soundpub_label_id())
$$;


ALTER FUNCTION soundpub.is_soundpub_takedown_user(_user_id uuid) OWNER TO postgres;

--
-- Name: is_superadmin(uuid); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.is_superadmin(user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'soundpub', 'pg_temp'
    AS $_$
  SELECT EXISTS (
    SELECT 1
    FROM soundpub.user_roles
    WHERE user_roles.user_id = $1
      AND user_roles.role = 'superadmin'::soundpub.app_role
  );
$_$;


ALTER FUNCTION soundpub.is_superadmin(user_id uuid) OWNER TO postgres;

--
-- Name: rebuild_royalty_balances(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.rebuild_royalty_balances() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub', 'public'
    AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('soundpub_royalty_financial_mutation'));
  IF EXISTS (
    SELECT 1 FROM soundpub.payout_requests payout
    WHERE payout.status = 'paid'
      AND NOT EXISTS (
        SELECT 1 FROM soundpub.payout_balance_reservations reservation
        WHERE reservation.payout_id = payout.id
      )
  ) THEN
    RAISE EXCEPTION 'Paid payouts without reservations require reconciliation before rebuilding balances';
  END IF;
  WITH allocations AS (
    SELECT artist_user_id profile_id, artist_revenue artist_amount, 0::numeric label_amount
    FROM soundpub.royalties WHERE artist_user_id IS NOT NULL
    UNION ALL
    SELECT label_user_id, 0::numeric, label_revenue
    FROM soundpub.royalties WHERE label_user_id IS NOT NULL
  ), gross AS (
    SELECT profile_id, SUM(artist_amount) artist_revenue, SUM(label_amount) label_revenue
    FROM allocations GROUP BY profile_id
  ), reserved AS (
    SELECT reservation.profile_id, SUM(reservation.amount) amount
    FROM soundpub.payout_balance_reservations reservation
    JOIN soundpub.payout_requests payout ON payout.id = reservation.payout_id
    WHERE payout.status IN ('pending', 'approved', 'paid')
    GROUP BY reservation.profile_id
  ), adjustments AS (
    SELECT profile_id, SUM(amount) amount
    FROM soundpub.balance_adjustments GROUP BY profile_id
  ), calculated AS (
    SELECT profile.id,
      COALESCE(gross.artist_revenue, 0) artist_revenue,
      COALESCE(gross.label_revenue, 0) label_revenue,
      COALESCE(gross.artist_revenue, 0) + COALESCE(gross.label_revenue, 0)
        + COALESCE(adjustments.amount, 0) - COALESCE(reserved.amount, 0) balance
    FROM soundpub.profiles profile
    LEFT JOIN gross ON gross.profile_id = profile.id
    LEFT JOIN reserved ON reserved.profile_id = profile.id
    LEFT JOIN adjustments ON adjustments.profile_id = profile.id
  )
  UPDATE soundpub.profiles profile
  SET artist_revenue = calculated.artist_revenue,
      label_revenue = calculated.label_revenue,
      balance = calculated.balance,
      updated_at = now()
  FROM calculated WHERE profile.id = calculated.id;
END;
$$;


ALTER FUNCTION soundpub.rebuild_royalty_balances() OWNER TO postgres;

--
-- Name: record_auth_audit(text, uuid); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.record_auth_audit(p_action text, p_target_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub', 'public'
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


ALTER FUNCTION soundpub.record_auth_audit(p_action text, p_target_id uuid) OWNER TO postgres;

--
-- Name: repair_orphan_artist_link(text, uuid, text, uuid); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.repair_orphan_artist_link(_issue_type text, _profile_id uuid DEFAULT NULL::uuid, _full_name text DEFAULT NULL::text, _related_label_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub', 'public'
    AS $$
DECLARE
  current_user_id uuid := auth.uid();
  is_admin boolean := false;
  matched_artist_id uuid;
  matched_artist_count integer := 0;
  updated_releases integer := 0;
  updated_tracks integer := 0;
  inserted_artist_helper boolean := false;
  artist_name text;
  label_name text;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM soundpub.user_roles ur
    WHERE ur.user_id = current_user_id
      AND ur.role::text IN ('admin', 'superadmin')
  ) INTO is_admin;

  IF NOT is_admin THEN
    RAISE EXCEPTION 'Only admin or superadmin can repair orphan artist links';
  END IF;

  IF _issue_type = 'RELEASE_WITHOUT_ARTIST_USER_ID' THEN
    IF NULLIF(trim(_full_name), '') IS NULL OR _related_label_id IS NULL THEN
      RAISE EXCEPTION 'full_name and related_label_id are required for RELEASE_WITHOUT_ARTIST_USER_ID repair';
    END IF;

    SELECT count(*), min(p.id)
    INTO matched_artist_count, matched_artist_id
    FROM soundpub.profiles p
    WHERE p.parent_label_id = _related_label_id
      AND lower(trim(p.full_name)) = lower(trim(_full_name))
      AND EXISTS (
        SELECT 1
        FROM soundpub.user_roles ur
        WHERE ur.user_id = p.id
          AND ur.role::text = 'artist'
      )
      AND lower(coalesce(p.status, '')) NOT IN ('suspended', 'deleted');

    IF matched_artist_count = 0 THEN
      RAISE EXCEPTION 'No matching artist profile found under this label for %', _full_name;
    END IF;

    IF matched_artist_count > 1 THEN
      RAISE EXCEPTION 'Multiple matching artist profiles found under this label for %. Repair manually.', _full_name;
    END IF;

    UPDATE soundpub.releases r
    SET artist_user_id = matched_artist_id
    WHERE r.artist_user_id IS NULL
      AND r.label_id = _related_label_id
      AND lower(trim(r.artist_name)) = lower(trim(_full_name));

    GET DIAGNOSTICS updated_releases = ROW_COUNT;

    UPDATE soundpub.tracks t
    SET artist_user_id = matched_artist_id
    FROM soundpub.releases r
    WHERE t.release_id = r.id
      AND t.artist_user_id IS NULL
      AND r.artist_user_id = matched_artist_id
      AND r.label_id = _related_label_id;

    GET DIAGNOSTICS updated_tracks = ROW_COUNT;

    SELECT p.full_name INTO artist_name FROM soundpub.profiles p WHERE p.id = matched_artist_id;
    SELECT p.full_name INTO label_name FROM soundpub.profiles p WHERE p.id = _related_label_id;

    INSERT INTO soundpub.audit_logs (action, actor_id, target_id, target_type, details)
    VALUES (
      'orphan_artist_link_repaired',
      current_user_id,
      matched_artist_id,
      'user',
      jsonb_build_object(
        'issue_type', _issue_type,
        'artist_name', artist_name,
        'label_id', _related_label_id,
        'label_name', label_name,
        'updated_releases', updated_releases,
        'updated_tracks', updated_tracks,
        'royalty_policy', 'historical royalties unchanged'
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'issue_type', _issue_type,
      'artist_user_id', matched_artist_id,
      'updated_releases', updated_releases,
      'updated_tracks', updated_tracks,
      'updated_royalties', 0,
      'message', 'Release artist_user_id repaired. Historical royalties unchanged.'
    );
  END IF;

  IF _issue_type = 'ARTIST_WITHOUT_PARENT_LABEL' THEN
    IF _profile_id IS NULL OR _related_label_id IS NULL THEN
      RAISE EXCEPTION 'profile_id and related_label_id are required for ARTIST_WITHOUT_PARENT_LABEL repair';
    END IF;

    SELECT p.full_name INTO artist_name
    FROM soundpub.profiles p
    WHERE p.id = _profile_id
      AND p.parent_label_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM soundpub.user_roles ur
        WHERE ur.user_id = p.id
          AND ur.role::text = 'artist'
      );

    IF artist_name IS NULL THEN
      RAISE EXCEPTION 'Artist profile not found, not artist role, or already has parent_label_id';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM soundpub.user_roles ur
      WHERE ur.user_id = _related_label_id
        AND ur.role::text IN ('label', 'whitelabel')
    ) THEN
      RAISE EXCEPTION 'related_label_id is not a label/whitelabel';
    END IF;

    UPDATE soundpub.profiles
    SET parent_label_id = _related_label_id
    WHERE id = _profile_id
      AND parent_label_id IS NULL;

    GET DIAGNOSTICS updated_releases = ROW_COUNT;

    INSERT INTO soundpub.artists (name, label_id)
    SELECT artist_name, _related_label_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM soundpub.artists a
      WHERE a.label_id = _related_label_id
        AND lower(trim(a.name)) = lower(trim(artist_name))
    );

    GET DIAGNOSTICS updated_tracks = ROW_COUNT;
    inserted_artist_helper := updated_tracks > 0;

    SELECT p.full_name INTO label_name FROM soundpub.profiles p WHERE p.id = _related_label_id;

    INSERT INTO soundpub.audit_logs (action, actor_id, target_id, target_type, details)
    VALUES (
      'orphan_artist_link_repaired',
      current_user_id,
      _profile_id,
      'user',
      jsonb_build_object(
        'issue_type', _issue_type,
        'artist_name', artist_name,
        'label_id', _related_label_id,
        'label_name', label_name,
        'parent_label_updated', true,
        'artist_helper_inserted', inserted_artist_helper,
        'royalty_policy', 'historical royalties unchanged'
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'issue_type', _issue_type,
      'artist_user_id', _profile_id,
      'updated_parent_label', true,
      'inserted_artist_helper', inserted_artist_helper,
      'updated_royalties', 0,
      'message', 'Artist parent_label_id repaired. Historical royalties unchanged.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', false,
    'issue_type', _issue_type,
    'updated_royalties', 0,
    'message', 'This issue type is audit-only under the current policy. Historical royalties stay with the old label.'
  );
END;
$$;


ALTER FUNCTION soundpub.repair_orphan_artist_link(_issue_type text, _profile_id uuid, _full_name text, _related_label_id uuid) OWNER TO postgres;

--
-- Name: request_payout(numeric, text, text, text); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.request_payout(_amount numeric, _bank_name text, _account_number text, _account_holder_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub', 'auth', 'public'
    AS $$
DECLARE
  v_user uuid := auth.uid(); v_remaining numeric := _amount; v_take numeric;
  v_profile soundpub.profiles%ROWTYPE; v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('soundpub_royalty_financial_mutation'));
  IF v_user IS NULL OR _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Invalid payout request'; END IF;
  IF NULLIF(btrim(_bank_name), '') IS NULL OR NULLIF(btrim(_account_number), '') IS NULL OR NULLIF(btrim(_account_holder_name), '') IS NULL THEN
    RAISE EXCEPTION 'Bank information is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM soundpub.user_roles WHERE user_id = v_user AND role IN ('label', 'whitelabel')) THEN
    RAISE EXCEPTION 'Only labels can request payouts';
  END IF;
  PERFORM soundpub.rebuild_royalty_balances();
  INSERT INTO soundpub.payout_requests (user_id, amount, bank_name, account_number, account_holder_name, status)
  VALUES (v_user, _amount, btrim(_bank_name), btrim(_account_number), btrim(_account_holder_name), 'pending')
  RETURNING id INTO v_id;
  FOR v_profile IN
    SELECT profile.* FROM soundpub.profiles profile
    WHERE profile.id = v_user OR profile.parent_label_id = v_user
    ORDER BY CASE WHEN profile.id = v_user THEN 0 ELSE 1 END, profile.id FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, GREATEST(COALESCE(v_profile.balance, 0), 0));
    IF v_take > 0 THEN
      UPDATE soundpub.profiles SET balance = balance - v_take WHERE id = v_profile.id;
      INSERT INTO soundpub.payout_balance_reservations (payout_id, profile_id, amount) VALUES (v_id, v_profile.id, v_take);
      v_remaining := v_remaining - v_take;
    END IF;
  END LOOP;
  IF v_remaining > 0 THEN RAISE EXCEPTION 'Saldo tidak mencukupi'; END IF;
  RETURN v_id;
END;
$$;


ALTER FUNCTION soundpub.request_payout(_amount numeric, _bank_name text, _account_number text, _account_holder_name text) OWNER TO postgres;

--
-- Name: reverse_royalty_upload(uuid, uuid, text); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.reverse_royalty_upload(p_upload_id uuid, p_actor_id uuid, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub', 'public'
    AS $$
DECLARE v_upload soundpub.royalty_uploads%ROWTYPE; v_deleted integer; v_negative_profiles integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('soundpub_royalty_financial_mutation'));
  IF p_actor_id IS NULL OR NOT soundpub.is_admin(p_actor_id) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO v_upload FROM soundpub.royalty_uploads WHERE id = p_upload_id FOR UPDATE;
  IF v_upload.id IS NULL THEN RAISE EXCEPTION 'Upload not found'; END IF;
  INSERT INTO soundpub.archived_royalties(id, upload_id, row_data, archived_by, reason)
  SELECT royalty.id, royalty.upload_id, to_jsonb(royalty), p_actor_id, 'delete_upload'
  FROM soundpub.royalties royalty WHERE royalty.upload_id = p_upload_id;
  WITH deleted AS (DELETE FROM soundpub.royalties WHERE upload_id = p_upload_id RETURNING id)
  SELECT COUNT(*) INTO v_deleted FROM deleted;
  DELETE FROM soundpub.royalty_uploads WHERE id = p_upload_id;
  PERFORM soundpub.rebuild_royalty_balances();
  SELECT COUNT(*) INTO v_negative_profiles FROM soundpub.profiles WHERE balance < 0;
  IF v_negative_profiles > 0 THEN
    RAISE EXCEPTION 'Reversal exceeds available funds for % profiles; reconcile payout obligations first', v_negative_profiles;
  END IF;
  INSERT INTO soundpub.audit_logs(action, actor_id, target_id, target_type, details)
  VALUES ('reverse_royalty_upload', p_actor_id, p_upload_id, 'royalty_upload',
    jsonb_build_object('filename', v_upload.original_filename, 'deleted_records', v_deleted,
      'reason', NULLIF(btrim(p_reason), ''), 'negative_profiles_after_rebuild', v_negative_profiles));
  RETURN jsonb_build_object('ok', true, 'deletedRecords', v_deleted, 'negativeProfiles', v_negative_profiles);
END;
$$;


ALTER FUNCTION soundpub.reverse_royalty_upload(p_upload_id uuid, p_actor_id uuid, p_reason text) OWNER TO postgres;

--
-- Name: scan_orphan_artist_links(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.scan_orphan_artist_links() RETURNS TABLE(issue_type text, profile_id uuid, full_name text, current_label_id uuid, current_label_name text, related_label_id uuid, related_label_name text, release_count bigint, track_count bigint, royalty_count bigint, reason text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'soundpub', 'public'
    AS $$
  WITH artist_profiles AS (
    SELECT
      p.id,
      p.full_name,
      p.parent_label_id,
      parent.full_name AS parent_label_name
    FROM soundpub.profiles p
    LEFT JOIN soundpub.profiles parent ON parent.id = p.parent_label_id
    WHERE EXISTS (
      SELECT 1
      FROM soundpub.user_roles ur
      WHERE ur.user_id = p.id
        AND ur.role::text = 'artist'
    )
  ),
  release_links AS (
    SELECT
      r.artist_user_id AS profile_id,
      r.label_id AS related_label_id,
      count(*)::bigint AS release_count,
      0::bigint AS track_count,
      0::bigint AS royalty_count
    FROM soundpub.releases r
    WHERE r.artist_user_id IS NOT NULL
    GROUP BY r.artist_user_id, r.label_id
  ),
  track_links AS (
    SELECT
      t.artist_user_id AS profile_id,
      r.label_id AS related_label_id,
      0::bigint AS release_count,
      count(*)::bigint AS track_count,
      0::bigint AS royalty_count
    FROM soundpub.tracks t
    LEFT JOIN soundpub.releases r ON r.id = t.release_id
    WHERE t.artist_user_id IS NOT NULL
    GROUP BY t.artist_user_id, r.label_id
  ),
  royalty_links AS (
    SELECT
      ro.artist_user_id AS profile_id,
      ro.label_user_id AS related_label_id,
      0::bigint AS release_count,
      0::bigint AS track_count,
      count(*)::bigint AS royalty_count
    FROM soundpub.royalties ro
    WHERE ro.artist_user_id IS NOT NULL
    GROUP BY ro.artist_user_id, ro.label_user_id
  ),
  combined_links AS (
    SELECT * FROM release_links
    UNION ALL
    SELECT * FROM track_links
    UNION ALL
    SELECT * FROM royalty_links
  ),
  summarized_links AS (
    SELECT
      cl.profile_id,
      cl.related_label_id,
      sum(cl.release_count)::bigint AS release_count,
      sum(cl.track_count)::bigint AS track_count,
      sum(cl.royalty_count)::bigint AS royalty_count
    FROM combined_links cl
    GROUP BY cl.profile_id, cl.related_label_id
  ),
  mismatch_links AS (
    SELECT
      'ARTIST_LABEL_MISMATCH'::text AS issue_type,
      ap.id AS profile_id,
      ap.full_name,
      ap.parent_label_id AS current_label_id,
      ap.parent_label_name AS current_label_name,
      sl.related_label_id,
      related.full_name AS related_label_name,
      sl.release_count,
      sl.track_count,
      sl.royalty_count,
      'Artist masih punya release/track/royalty pada label yang berbeda dari parent_label_id saat ini.'::text AS reason
    FROM summarized_links sl
    JOIN artist_profiles ap ON ap.id = sl.profile_id
    LEFT JOIN soundpub.profiles related ON related.id = sl.related_label_id
    WHERE sl.related_label_id IS NOT NULL
      AND ap.parent_label_id IS NOT NULL
      AND sl.related_label_id <> ap.parent_label_id
  ),
  no_parent_artists AS (
    SELECT
      'ARTIST_WITHOUT_PARENT_LABEL'::text AS issue_type,
      ap.id AS profile_id,
      ap.full_name,
      ap.parent_label_id AS current_label_id,
      ap.parent_label_name AS current_label_name,
      sl.related_label_id,
      related.full_name AS related_label_name,
      COALESCE(sl.release_count, 0)::bigint AS release_count,
      COALESCE(sl.track_count, 0)::bigint AS track_count,
      COALESCE(sl.royalty_count, 0)::bigint AS royalty_count,
      'Artist tidak punya parent_label_id, tapi masih muncul di release/track/royalty.'::text AS reason
    FROM artist_profiles ap
    JOIN summarized_links sl ON sl.profile_id = ap.id
    LEFT JOIN soundpub.profiles related ON related.id = sl.related_label_id
    WHERE ap.parent_label_id IS NULL
  ),
  missing_artist_profiles AS (
    SELECT
      'RELATED_ARTIST_PROFILE_MISSING'::text AS issue_type,
      sl.profile_id,
      NULL::text AS full_name,
      NULL::uuid AS current_label_id,
      NULL::text AS current_label_name,
      sl.related_label_id,
      related.full_name AS related_label_name,
      sl.release_count,
      sl.track_count,
      sl.royalty_count,
      'Release/track/royalty masih menunjuk artist_user_id yang tidak ada di soundpub.profiles.'::text AS reason
    FROM summarized_links sl
    LEFT JOIN soundpub.profiles artist ON artist.id = sl.profile_id
    LEFT JOIN soundpub.profiles related ON related.id = sl.related_label_id
    WHERE artist.id IS NULL
  ),
  release_label_without_profile AS (
    SELECT
      'RELATED_LABEL_PROFILE_MISSING'::text AS issue_type,
      r.artist_user_id AS profile_id,
      artist.full_name,
      artist.parent_label_id AS current_label_id,
      parent.full_name AS current_label_name,
      r.label_id AS related_label_id,
      NULL::text AS related_label_name,
      count(*)::bigint AS release_count,
      0::bigint AS track_count,
      0::bigint AS royalty_count,
      'Release masih menunjuk label_id yang tidak ada di soundpub.profiles.'::text AS reason
    FROM soundpub.releases r
    LEFT JOIN soundpub.profiles label_profile ON label_profile.id = r.label_id
    LEFT JOIN soundpub.profiles artist ON artist.id = r.artist_user_id
    LEFT JOIN soundpub.profiles parent ON parent.id = artist.parent_label_id
    WHERE label_profile.id IS NULL
    GROUP BY r.artist_user_id, artist.full_name, artist.parent_label_id, parent.full_name, r.label_id
  ),
  releases_without_artist_id AS (
    SELECT
      'RELEASE_WITHOUT_ARTIST_USER_ID'::text AS issue_type,
      NULL::uuid AS profile_id,
      r.artist_name AS full_name,
      NULL::uuid AS current_label_id,
      NULL::text AS current_label_name,
      r.label_id AS related_label_id,
      label_profile.full_name AS related_label_name,
      count(*)::bigint AS release_count,
      0::bigint AS track_count,
      0::bigint AS royalty_count,
      'Release belum punya artist_user_id; label artist list dan hitungan rilis bisa tidak akurat.'::text AS reason
    FROM soundpub.releases r
    LEFT JOIN soundpub.profiles label_profile ON label_profile.id = r.label_id
    WHERE r.artist_user_id IS NULL
    GROUP BY r.artist_name, r.label_id, label_profile.full_name
  )
  SELECT *
  FROM (
    SELECT * FROM mismatch_links
    UNION ALL SELECT * FROM no_parent_artists
    UNION ALL SELECT * FROM missing_artist_profiles
    UNION ALL SELECT * FROM release_label_without_profile
    UNION ALL SELECT * FROM releases_without_artist_id
  ) issues
  ORDER BY
    (issues.release_count + issues.track_count + issues.royalty_count) DESC,
    issues.issue_type,
    issues.full_name NULLS LAST;
$$;


ALTER FUNCTION soundpub.scan_orphan_artist_links() OWNER TO postgres;

--
-- Name: sync_managed_artist_markers(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.sync_managed_artist_markers() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub', 'public'
    AS $$
BEGIN
  IF NEW.email IS NOT NULL AND soundpub.is_managed_artist_email(NEW.email) THEN
    NEW.is_managed_artist := true;
    NEW.auth_user_status := 'managed_only';
    NEW.password_set := false;
  ELSE
    NEW.is_managed_artist := COALESCE(NEW.is_managed_artist, false);
    NEW.auth_user_status := COALESCE(NULLIF(NEW.auth_user_status, ''), 'linked');
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION soundpub.sync_managed_artist_markers() OWNER TO postgres;

--
-- Name: update_balance_on_payout_status_change(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.update_balance_on_payout_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub'
    AS $$
BEGIN
    IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
        UPDATE soundpub.profiles
        SET balance = balance - NEW.amount
        WHERE id = NEW.user_id;
    ELSIF OLD.status = 'paid' AND NEW.status != 'paid' THEN
        UPDATE soundpub.profiles
        SET balance = balance + NEW.amount
        WHERE id = NEW.user_id;
    END IF;

    IF NEW.status IN ('approved', 'rejected', 'paid') AND
       (OLD.status IS NULL OR OLD.status NOT IN ('approved', 'rejected', 'paid')) THEN
        NEW.processed_at = NOW();
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION soundpub.update_balance_on_payout_status_change() OWNER TO postgres;

--
-- Name: update_payout_status(uuid, text, text, text, text); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.update_payout_status(_payout_id uuid, _status text, _notes text DEFAULT NULL::text, _proof_path text DEFAULT NULL::text, _proof_name text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'soundpub', 'auth', 'public'
    AS $$
DECLARE v_payout soundpub.payout_requests%ROWTYPE; v_reserved numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('soundpub_royalty_financial_mutation'));
  IF NOT soundpub.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_payout FROM soundpub.payout_requests WHERE id = _payout_id FOR UPDATE;
  IF v_payout IS NULL THEN RAISE EXCEPTION 'Payout not found'; END IF;
  IF _status NOT IN ('approved', 'rejected', 'paid') THEN RAISE EXCEPTION 'Invalid payout status'; END IF;
  IF _status = 'approved' AND v_payout.status <> 'pending' THEN RAISE EXCEPTION 'Payout must be pending'; END IF;
  IF _status = 'rejected' AND v_payout.status NOT IN ('pending', 'approved') THEN RAISE EXCEPTION 'Payout cannot be rejected'; END IF;
  IF _status = 'paid' AND v_payout.status <> 'approved' THEN RAISE EXCEPTION 'Payout must be approved'; END IF;
  IF _status = 'paid' AND COALESCE(_proof_path, '') = '' THEN RAISE EXCEPTION 'Payment proof is required'; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_reserved FROM soundpub.payout_balance_reservations WHERE payout_id = _payout_id;
  IF _status IN ('approved', 'paid') AND v_reserved <> v_payout.amount THEN RAISE EXCEPTION 'Payout reservation mismatch'; END IF;
  UPDATE soundpub.payout_requests
  SET status = _status, notes = COALESCE(_notes, notes),
      payment_proof_path = COALESCE(_proof_path, payment_proof_path),
      payment_proof_name = COALESCE(_proof_name, payment_proof_name),
      processed_by = auth.uid(), processed_at = now()
  WHERE id = _payout_id;
  IF _status = 'rejected' THEN PERFORM soundpub.rebuild_royalty_balances(); END IF;
END;
$$;


ALTER FUNCTION soundpub.update_payout_status(_payout_id uuid, _status text, _notes text, _proof_path text, _proof_name text) OWNER TO postgres;

--
-- Name: update_timestamp(); Type: FUNCTION; Schema: soundpub; Owner: postgres
--

CREATE FUNCTION soundpub.update_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION soundpub.update_timestamp() OWNER TO postgres;

--
-- Name: app_settings; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.app_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE soundpub.app_settings OWNER TO postgres;

--
-- Name: archived_royalties; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.archived_royalties (
    id uuid NOT NULL,
    upload_id uuid NOT NULL,
    row_data jsonb NOT NULL,
    archived_by uuid NOT NULL,
    reason text NOT NULL,
    archived_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE soundpub.archived_royalties OWNER TO postgres;

--
-- Name: artist_deletion_requests; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.artist_deletion_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    artist_id uuid NOT NULL,
    label_id uuid NOT NULL,
    reason text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT artist_deletion_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


ALTER TABLE soundpub.artist_deletion_requests OWNER TO postgres;

--
-- Name: artist_profiles; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.artist_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    artist_name text NOT NULL,
    artist_type text DEFAULT 'solo'::text NOT NULL,
    bio text,
    genre text,
    social_links jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    profile_image_url text,
    legal_name text,
    country text,
    city text,
    language text,
    gender text,
    date_of_birth date,
    spotify_artist_id text,
    spotify_artist_url text,
    spotify_data jsonb DEFAULT '{}'::jsonb,
    spotify_synced_at timestamp with time zone,
    verified boolean DEFAULT false,
    verified_at timestamp with time zone
);


ALTER TABLE soundpub.artist_profiles OWNER TO postgres;

--
-- Name: artists; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.artists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE soundpub.artists OWNER TO postgres;

--
-- Name: audit_logs; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action text NOT NULL,
    actor_id uuid,
    target_id uuid,
    target_type text,
    details jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_role text,
    before_data jsonb,
    after_data jsonb,
    changed_fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    user_agent text,
    request_id text
);


ALTER TABLE soundpub.audit_logs OWNER TO postgres;

--
-- Name: auth_events; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.auth_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    event_type text NOT NULL,
    ip_address text,
    user_agent text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE soundpub.auth_events OWNER TO postgres;

--
-- Name: balance_adjustments; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.balance_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    amount numeric(18,2) NOT NULL,
    source_type text NOT NULL,
    source_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT balance_adjustments_amount_check CHECK ((amount <> (0)::numeric))
);


ALTER TABLE soundpub.balance_adjustments OWNER TO postgres;

--
-- Name: composer_royalties; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.composer_royalties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    composer_id text NOT NULL,
    composer_name text NOT NULL,
    total_net_royalti numeric(18,2) DEFAULT 0 NOT NULL,
    period text,
    upload_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE soundpub.composer_royalties OWNER TO postgres;

--
-- Name: copyright_registration_files; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.copyright_registration_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registration_id uuid NOT NULL,
    work_id uuid,
    file_type text NOT NULL,
    file_url text NOT NULL,
    file_name text,
    mime_type text,
    file_size bigint,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT copyright_registration_files_file_type_check CHECK ((file_type = ANY (ARRAY['ktp'::text, 'npwp'::text, 'power_of_attorney'::text, 'audio_demo'::text, 'lyrics_document'::text, 'work_evidence'::text, 'contract_draft'::text, 'contract_signed'::text, 'other'::text])))
);


ALTER TABLE soundpub.copyright_registration_files OWNER TO postgres;

--
-- Name: copyright_registration_payments; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.copyright_registration_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registration_id uuid NOT NULL,
    user_id uuid NOT NULL,
    amount numeric(18,2) DEFAULT 100000 NOT NULL,
    currency text DEFAULT 'IDR'::text NOT NULL,
    payment_provider text,
    payment_reference text,
    payment_status text DEFAULT 'pending'::text NOT NULL,
    includes_emeterai boolean DEFAULT true NOT NULL,
    emeterai_quantity integer DEFAULT 1 NOT NULL,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    xendit_invoice_id text,
    xendit_invoice_url text,
    CONSTRAINT copyright_registration_payments_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT copyright_registration_payments_emeterai_quantity_check CHECK ((emeterai_quantity >= 0)),
    CONSTRAINT copyright_registration_payments_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'expired'::text, 'refunded'::text, 'cancelled'::text])))
);


ALTER TABLE soundpub.copyright_registration_payments OWNER TO postgres;

--
-- Name: copyright_registration_works; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.copyright_registration_works (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registration_id uuid NOT NULL,
    title text NOT NULL,
    alternate_title text,
    composer_name text NOT NULL,
    lyricist_name text,
    ownership_percentage numeric(5,2) DEFAULT 100 NOT NULL,
    is_collaboration boolean DEFAULT false NOT NULL,
    cowriters_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    release_status text DEFAULT 'unreleased'::text NOT NULL,
    release_date date,
    isrc text,
    upc text,
    links_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    lyrics text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT copyright_registration_works_ownership_percentage_check CHECK (((ownership_percentage >= (0)::numeric) AND (ownership_percentage <= (100)::numeric))),
    CONSTRAINT copyright_registration_works_release_status_check CHECK ((release_status = ANY (ARRAY['unreleased'::text, 'released'::text, 'unknown'::text])))
);


ALTER TABLE soundpub.copyright_registration_works OWNER TO postgres;

--
-- Name: email_send_log; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.email_send_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_name text NOT NULL,
    recipient_email text NOT NULL,
    recipient_user_id uuid,
    status text NOT NULL,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    idempotency_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE soundpub.email_send_log OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    type text DEFAULT 'info'::text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    is_global boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE soundpub.notifications OWNER TO postgres;

--
-- Name: payout_balance_reservations; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.payout_balance_reservations (
    payout_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    amount numeric NOT NULL,
    CONSTRAINT payout_balance_reservations_amount_check CHECK ((amount > (0)::numeric))
);


ALTER TABLE soundpub.payout_balance_reservations OWNER TO postgres;

--
-- Name: payout_requests; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.payout_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    amount numeric(18,2) NOT NULL,
    bank_name text NOT NULL,
    account_number text NOT NULL,
    account_holder_name text NOT NULL,
    notes text,
    status text DEFAULT 'pending'::text NOT NULL,
    processed_by uuid,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    payment_proof_path text,
    payment_proof_name text,
    CONSTRAINT payout_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'paid'::text])))
);


ALTER TABLE soundpub.payout_requests OWNER TO postgres;

--
-- Name: profiles; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text NOT NULL,
    phone text,
    address text,
    parent_label_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    balance numeric(18,2) DEFAULT 0 NOT NULL,
    logo_url text,
    logo_url_light text,
    logo_url_dark text,
    label_revenue numeric(18,2) DEFAULT 0 NOT NULL,
    artist_revenue numeric(18,2) DEFAULT 0 NOT NULL,
    password_set boolean DEFAULT true,
    subscription_status text,
    subscription_upgraded_at timestamp with time zone,
    composer_code text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    avatar_url text,
    sso_provider text,
    artist_profile_completed boolean DEFAULT false,
    city text,
    province text,
    sso_user_id text,
    sso_user_type text,
    email_notif_payout boolean DEFAULT true,
    email_notif_release boolean DEFAULT true,
    email_notif_payment boolean DEFAULT true,
    email_notif_announcement boolean DEFAULT true,
    is_managed_artist boolean DEFAULT false NOT NULL,
    auth_user_status text DEFAULT 'linked'::text NOT NULL,
    email_verified boolean DEFAULT false,
    verification_token text,
    verification_token_expires_at timestamp with time zone,
    verification_sent_at timestamp with time zone,
    password_reset_token text,
    password_reset_token_expires_at timestamp with time zone,
    password_reset_sent_at timestamp with time zone,
    CONSTRAINT profiles_auth_user_status_check CHECK ((auth_user_status = ANY (ARRAY['linked'::text, 'managed_only'::text, 'missing_auth'::text, 'invited'::text]))),
    CONSTRAINT profiles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text])))
);


ALTER TABLE soundpub.profiles OWNER TO postgres;

--
-- Name: rate_limits; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identifier text NOT NULL,
    action_type text NOT NULL,
    attempt_count integer DEFAULT 1,
    first_attempt_at timestamp with time zone DEFAULT now(),
    last_attempt_at timestamp with time zone DEFAULT now(),
    blocked_until timestamp with time zone
);


ALTER TABLE soundpub.rate_limits OWNER TO postgres;

--
-- Name: release_payments; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.release_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid NOT NULL,
    user_id uuid NOT NULL,
    amount numeric(18,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'IDR'::text NOT NULL,
    track_count integer DEFAULT 1 NOT NULL,
    price_per_track numeric(18,2) DEFAULT 50000 NOT NULL,
    xendit_invoice_id text,
    xendit_invoice_url text,
    status text DEFAULT 'pending'::text NOT NULL,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    invoice_number text,
    invoice_pdf_path text,
    invoice_pdf_generated_at timestamp with time zone
);


ALTER TABLE soundpub.release_payments OWNER TO postgres;

--
-- Name: releases; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.releases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upc text,
    title text NOT NULL,
    artist_name text NOT NULL,
    label_id uuid NOT NULL,
    release_date date,
    cover_url text,
    genre text,
    release_type text DEFAULT 'single'::text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_by uuid,
    archived_at timestamp with time zone,
    artist_user_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    rejection_reason text,
    distribution_service text DEFAULT 'standard'::text NOT NULL,
    custom_label_name text,
    custom_record_name text,
    price_per_track_snapshot numeric,
    total_payment_snapshot numeric,
    CONSTRAINT releases_distribution_service_check CHECK ((distribution_service = ANY (ARRAY['standard'::text, 'custom_label'::text]))),
    CONSTRAINT releases_release_type_check CHECK ((release_type = ANY (ARRAY['single'::text, 'ep'::text, 'album'::text, 'compilation'::text]))),
    CONSTRAINT releases_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'pending_paid'::text, 'processing'::text, 'revision_submitted'::text, 'active'::text, 'rejected'::text, 'draft'::text, 'inactive'::text])))
);


ALTER TABLE soundpub.releases OWNER TO postgres;

--
-- Name: royalties; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.royalties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id uuid NOT NULL,
    period text NOT NULL,
    isrc text NOT NULL,
    upc text NOT NULL,
    artist_name text NOT NULL,
    label_name text NOT NULL,
    platform text NOT NULL,
    country text NOT NULL,
    sales_type text NOT NULL,
    unit_penjualan integer DEFAULT 0 NOT NULL,
    pendapatan_kotor_dsp numeric(18,2) DEFAULT 0 NOT NULL,
    pendapatan_label_artis numeric(18,2) DEFAULT 0 NOT NULL,
    pendapatan_bersih_soundpub numeric(18,2) DEFAULT 0 NOT NULL,
    artist_revenue numeric(18,2) DEFAULT 0 NOT NULL,
    soundpub_revenue numeric(18,2) DEFAULT 0 NOT NULL,
    title text,
    artist text,
    created_at timestamp with time zone DEFAULT now(),
    net_revenue numeric(18,2) DEFAULT 0,
    artist_user_id uuid,
    label_user_id uuid,
    label_revenue numeric(18,2) DEFAULT 0,
    source_row_number integer
);


ALTER TABLE soundpub.royalties OWNER TO postgres;

--
-- Name: royalty_uploads; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.royalty_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    filename text NOT NULL,
    original_filename text NOT NULL,
    total_records integer DEFAULT 0 NOT NULL,
    inserted_records integer DEFAULT 0 NOT NULL,
    status text NOT NULL,
    error_message text,
    summary jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    idempotency_key text,
    CONSTRAINT royalty_uploads_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'success'::text, 'partial'::text, 'failed'::text, 'replaced'::text])))
);


ALTER TABLE soundpub.royalty_uploads OWNER TO postgres;

--
-- Name: storage_backup_log; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.storage_backup_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket text NOT NULL,
    path text NOT NULL,
    size_bytes bigint,
    drive_file_id text,
    drive_folder_id text,
    content_hash text,
    source_updated_at timestamp with time zone,
    last_backed_up_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE soundpub.storage_backup_log OWNER TO postgres;

--
-- Name: storage_backup_runs; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.storage_backup_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    status text DEFAULT 'running'::text NOT NULL,
    files_uploaded integer DEFAULT 0 NOT NULL,
    files_skipped integer DEFAULT 0 NOT NULL,
    errors_count integer DEFAULT 0 NOT NULL,
    error_message text,
    triggered_by text DEFAULT 'cron'::text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb
);


ALTER TABLE soundpub.storage_backup_runs OWNER TO postgres;

--
-- Name: takedown_request_documents; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.takedown_request_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    uploaded_by uuid NOT NULL,
    file_name text NOT NULL,
    storage_path text NOT NULL,
    file_type text,
    file_size bigint,
    document_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE soundpub.takedown_request_documents OWNER TO postgres;

--
-- Name: takedown_request_items; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.takedown_request_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    release_id uuid NOT NULL,
    track_id uuid,
    title_snapshot text NOT NULL,
    artist_name_snapshot text NOT NULL,
    upc_snapshot text,
    isrc_snapshot text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE soundpub.takedown_request_items OWNER TO postgres;

--
-- Name: takedown_request_targets; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.takedown_request_targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    dsp_name text NOT NULL,
    status soundpub.takedown_target_status DEFAULT 'PENDING'::soundpub.takedown_target_status NOT NULL,
    external_reference text,
    submitted_at timestamp with time zone,
    completed_at timestamp with time zone,
    failure_reason text,
    admin_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE soundpub.takedown_request_targets OWNER TO postgres;

--
-- Name: takedown_requests; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.takedown_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requester_id uuid NOT NULL,
    label_id uuid NOT NULL,
    request_type soundpub.takedown_request_type DEFAULT 'standard'::soundpub.takedown_request_type NOT NULL,
    reason_category text NOT NULL,
    reason_detail text NOT NULL,
    status soundpub.takedown_status DEFAULT 'SUBMITTED'::soundpub.takedown_status NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    declaration_accepted boolean DEFAULT false NOT NULL,
    declaration_accepted_at timestamp with time zone,
    reviewer_id uuid,
    review_note text,
    rejection_reason text,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    sent_to_dsp_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    other_reason text,
    contact_name text,
    contact_position text,
    contact_phone text,
    contact_email text,
    contact_address text,
    CONSTRAINT takedown_requests_declaration CHECK ((declaration_accepted = true)),
    CONSTRAINT takedown_requests_priority_check CHECK ((priority = ANY (ARRAY['normal'::text, 'urgent'::text])))
);


ALTER TABLE soundpub.takedown_requests OWNER TO postgres;

--
-- Name: takedown_status_history; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.takedown_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    old_status soundpub.takedown_status,
    new_status soundpub.takedown_status NOT NULL,
    changed_by uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE soundpub.takedown_status_history OWNER TO postgres;

--
-- Name: tracks; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.tracks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid NOT NULL,
    isrc text,
    title text NOT NULL,
    artist_name text NOT NULL,
    audio_url text,
    composer text,
    lyricist text,
    lyrics text,
    genre text,
    artists jsonb DEFAULT '[]'::jsonb,
    explicit_lyrics boolean DEFAULT false,
    contributors jsonb DEFAULT '[]'::jsonb,
    video_url text,
    clip_url text,
    duration integer,
    artist_user_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE soundpub.tracks OWNER TO postgres;

--
-- Name: user_roles; Type: TABLE; Schema: soundpub; Owner: postgres
--

CREATE TABLE soundpub.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role soundpub.app_role DEFAULT 'user'::soundpub.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE soundpub.user_roles OWNER TO postgres;

--
-- Name: app_settings app_settings_key_key; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.app_settings
    ADD CONSTRAINT app_settings_key_key UNIQUE (key);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);


--
-- Name: archived_royalties archived_royalties_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.archived_royalties
    ADD CONSTRAINT archived_royalties_pkey PRIMARY KEY (id);


--
-- Name: artist_deletion_requests artist_deletion_requests_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.artist_deletion_requests
    ADD CONSTRAINT artist_deletion_requests_pkey PRIMARY KEY (id);


--
-- Name: artist_profiles artist_profiles_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.artist_profiles
    ADD CONSTRAINT artist_profiles_pkey PRIMARY KEY (id);


--
-- Name: artist_profiles artist_profiles_user_id_key; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.artist_profiles
    ADD CONSTRAINT artist_profiles_user_id_key UNIQUE (user_id);


--
-- Name: artists artists_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.artists
    ADD CONSTRAINT artists_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: auth_events auth_events_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.auth_events
    ADD CONSTRAINT auth_events_pkey PRIMARY KEY (id);


--
-- Name: balance_adjustments balance_adjustments_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.balance_adjustments
    ADD CONSTRAINT balance_adjustments_pkey PRIMARY KEY (id);


--
-- Name: balance_adjustments balance_adjustments_source_type_source_id_key; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.balance_adjustments
    ADD CONSTRAINT balance_adjustments_source_type_source_id_key UNIQUE (source_type, source_id);


--
-- Name: composer_royalties composer_royalties_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.composer_royalties
    ADD CONSTRAINT composer_royalties_pkey PRIMARY KEY (id);


--
-- Name: copyright_contracts copyright_contracts_contract_number_key; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.copyright_contracts
    ADD CONSTRAINT copyright_contracts_contract_number_key UNIQUE (contract_number);


--
-- Name: copyright_contracts copyright_contracts_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.copyright_contracts
    ADD CONSTRAINT copyright_contracts_pkey PRIMARY KEY (id);


--
-- Name: copyright_contracts copyright_contracts_registration_id_key; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.copyright_contracts
    ADD CONSTRAINT copyright_contracts_registration_id_key UNIQUE (registration_id);


--
-- Name: copyright_registration_files copyright_registration_files_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.copyright_registration_files
    ADD CONSTRAINT copyright_registration_files_pkey PRIMARY KEY (id);


--
-- Name: copyright_registration_payments copyright_registration_payments_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.copyright_registration_payments
    ADD CONSTRAINT copyright_registration_payments_pkey PRIMARY KEY (id);


--
-- Name: copyright_registration_works copyright_registration_works_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.copyright_registration_works
    ADD CONSTRAINT copyright_registration_works_pkey PRIMARY KEY (id);


--
-- Name: copyright_registrations copyright_registrations_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.copyright_registrations
    ADD CONSTRAINT copyright_registrations_pkey PRIMARY KEY (id);


--
-- Name: email_send_log email_send_log_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.email_send_log
    ADD CONSTRAINT email_send_log_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: payout_balance_reservations payout_balance_reservations_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.payout_balance_reservations
    ADD CONSTRAINT payout_balance_reservations_pkey PRIMARY KEY (payout_id, profile_id);


--
-- Name: payout_requests payout_requests_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.payout_requests
    ADD CONSTRAINT payout_requests_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_identifier_action_type_key; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.rate_limits
    ADD CONSTRAINT rate_limits_identifier_action_type_key UNIQUE (identifier, action_type);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (id);


--
-- Name: release_payments release_payments_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.release_payments
    ADD CONSTRAINT release_payments_pkey PRIMARY KEY (id);


--
-- Name: releases releases_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.releases
    ADD CONSTRAINT releases_pkey PRIMARY KEY (id);


--
-- Name: releases releases_upc_key; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.releases
    ADD CONSTRAINT releases_upc_key UNIQUE (upc);


--
-- Name: royalties royalties_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.royalties
    ADD CONSTRAINT royalties_pkey PRIMARY KEY (id);


--
-- Name: royalty_uploads royalty_uploads_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.royalty_uploads
    ADD CONSTRAINT royalty_uploads_pkey PRIMARY KEY (id);


--
-- Name: storage_backup_log storage_backup_log_bucket_path_key; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.storage_backup_log
    ADD CONSTRAINT storage_backup_log_bucket_path_key UNIQUE (bucket, path);


--
-- Name: storage_backup_log storage_backup_log_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.storage_backup_log
    ADD CONSTRAINT storage_backup_log_pkey PRIMARY KEY (id);


--
-- Name: storage_backup_runs storage_backup_runs_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.storage_backup_runs
    ADD CONSTRAINT storage_backup_runs_pkey PRIMARY KEY (id);


--
-- Name: takedown_request_documents takedown_request_documents_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.takedown_request_documents
    ADD CONSTRAINT takedown_request_documents_pkey PRIMARY KEY (id);


--
-- Name: takedown_request_documents takedown_request_documents_storage_path_key; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.takedown_request_documents
    ADD CONSTRAINT takedown_request_documents_storage_path_key UNIQUE (storage_path);


--
-- Name: takedown_request_items takedown_request_items_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.takedown_request_items
    ADD CONSTRAINT takedown_request_items_pkey PRIMARY KEY (id);


--
-- Name: takedown_request_targets takedown_request_targets_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.takedown_request_targets
    ADD CONSTRAINT takedown_request_targets_pkey PRIMARY KEY (id);


--
-- Name: takedown_requests takedown_requests_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.takedown_requests
    ADD CONSTRAINT takedown_requests_pkey PRIMARY KEY (id);


--
-- Name: takedown_status_history takedown_status_history_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.takedown_status_history
    ADD CONSTRAINT takedown_status_history_pkey PRIMARY KEY (id);


--
-- Name: tracks tracks_isrc_key; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.tracks
    ADD CONSTRAINT tracks_isrc_key UNIQUE (isrc);


--
-- Name: tracks tracks_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.tracks
    ADD CONSTRAINT tracks_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: artist_profiles_user_id_unique; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE UNIQUE INDEX artist_profiles_user_id_unique ON soundpub.artist_profiles USING btree (user_id);


--
-- Name: copyright_registration_payments_xendit_invoice_id_idx; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE UNIQUE INDEX copyright_registration_payments_xendit_invoice_id_idx ON soundpub.copyright_registration_payments USING btree (xendit_invoice_id) WHERE (xendit_invoice_id IS NOT NULL);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_audit_logs_action ON soundpub.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_audit_logs_created_at ON soundpub.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_ip_address; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_audit_logs_ip_address ON soundpub.audit_logs USING btree (ip_address);


--
-- Name: idx_audit_logs_target_type; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_audit_logs_target_type ON soundpub.audit_logs USING btree (target_type);


--
-- Name: idx_auth_events_created_at; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_auth_events_created_at ON soundpub.auth_events USING btree (created_at DESC);


--
-- Name: idx_auth_events_type; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_auth_events_type ON soundpub.auth_events USING btree (event_type);


--
-- Name: idx_auth_events_user_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_auth_events_user_id ON soundpub.auth_events USING btree (user_id);


--
-- Name: idx_composer_royalties_composer_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_composer_royalties_composer_id ON soundpub.composer_royalties USING btree (composer_id);


--
-- Name: idx_composer_royalties_period; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_composer_royalties_period ON soundpub.composer_royalties USING btree (period);


--
-- Name: idx_copyright_contracts_registration_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_copyright_contracts_registration_id ON soundpub.copyright_contracts USING btree (registration_id);


--
-- Name: idx_copyright_registration_files_registration_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_copyright_registration_files_registration_id ON soundpub.copyright_registration_files USING btree (registration_id);


--
-- Name: idx_copyright_registration_payments_registration_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_copyright_registration_payments_registration_id ON soundpub.copyright_registration_payments USING btree (registration_id);


--
-- Name: idx_copyright_registration_works_registration_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_copyright_registration_works_registration_id ON soundpub.copyright_registration_works USING btree (registration_id);


--
-- Name: idx_copyright_registrations_active_composer_code; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE UNIQUE INDEX idx_copyright_registrations_active_composer_code ON soundpub.copyright_registrations USING btree (composer_code) WHERE ((composer_code IS NOT NULL) AND (status = ANY (ARRAY['approved'::text, 'contract_generated'::text, 'stamping_pending'::text, 'stamped'::text, 'contract_signed'::text, 'active'::text])));


--
-- Name: idx_copyright_registrations_status; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_copyright_registrations_status ON soundpub.copyright_registrations USING btree (status);


--
-- Name: idx_copyright_registrations_user_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_copyright_registrations_user_id ON soundpub.copyright_registrations USING btree (user_id);


--
-- Name: idx_profiles_composer_code; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_profiles_composer_code ON soundpub.profiles USING btree (composer_code);


--
-- Name: idx_profiles_email_verified; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_profiles_email_verified ON soundpub.profiles USING btree (email_verified);


--
-- Name: idx_profiles_password_reset_token; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_profiles_password_reset_token ON soundpub.profiles USING btree (password_reset_token) WHERE (password_reset_token IS NOT NULL);


--
-- Name: idx_profiles_verification_token; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_profiles_verification_token ON soundpub.profiles USING btree (verification_token) WHERE (verification_token IS NOT NULL);


--
-- Name: idx_rate_limits_blocked; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_rate_limits_blocked ON soundpub.rate_limits USING btree (blocked_until) WHERE (blocked_until IS NOT NULL);


--
-- Name: idx_rate_limits_identifier; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_rate_limits_identifier ON soundpub.rate_limits USING btree (identifier, action_type);


--
-- Name: idx_soundpub_artist_profiles_user_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_artist_profiles_user_id ON soundpub.artist_profiles USING btree (user_id);


--
-- Name: idx_soundpub_artists_label_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_artists_label_id ON soundpub.artists USING btree (label_id);


--
-- Name: idx_soundpub_audit_logs_actor_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_audit_logs_actor_id ON soundpub.audit_logs USING btree (actor_id);


--
-- Name: idx_soundpub_audit_logs_target_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_audit_logs_target_id ON soundpub.audit_logs USING btree (target_id);


--
-- Name: idx_soundpub_composer_royalties_upload_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_composer_royalties_upload_id ON soundpub.composer_royalties USING btree (upload_id);


--
-- Name: idx_soundpub_email_send_log_recipient_user_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_email_send_log_recipient_user_id ON soundpub.email_send_log USING btree (recipient_user_id);


--
-- Name: idx_soundpub_notifications_user_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_notifications_user_id ON soundpub.notifications USING btree (user_id);


--
-- Name: idx_soundpub_payout_requests_user_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_payout_requests_user_id ON soundpub.payout_requests USING btree (user_id);


--
-- Name: idx_soundpub_profiles_parent_label; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_profiles_parent_label ON soundpub.profiles USING btree (parent_label_id);


--
-- Name: idx_soundpub_release_payments_release_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_release_payments_release_id ON soundpub.release_payments USING btree (release_id);


--
-- Name: idx_soundpub_release_payments_user_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_release_payments_user_id ON soundpub.release_payments USING btree (user_id);


--
-- Name: idx_soundpub_releases_artist_name; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_releases_artist_name ON soundpub.releases USING btree (artist_name);


--
-- Name: idx_soundpub_releases_label_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_releases_label_id ON soundpub.releases USING btree (label_id);


--
-- Name: idx_soundpub_royalties_artist_name; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_royalties_artist_name ON soundpub.royalties USING btree (artist_name);


--
-- Name: idx_soundpub_royalties_artist_user_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_royalties_artist_user_id ON soundpub.royalties USING btree (artist_user_id);


--
-- Name: idx_soundpub_royalties_label_name; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_royalties_label_name ON soundpub.royalties USING btree (label_name);


--
-- Name: idx_soundpub_royalties_label_user_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_royalties_label_user_id ON soundpub.royalties USING btree (label_user_id);


--
-- Name: idx_soundpub_royalties_net_revenue; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_royalties_net_revenue ON soundpub.royalties USING btree (net_revenue);


--
-- Name: idx_soundpub_royalties_upload_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_royalties_upload_id ON soundpub.royalties USING btree (upload_id);


--
-- Name: idx_soundpub_royalty_uploads_user_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_royalty_uploads_user_id ON soundpub.royalty_uploads USING btree (user_id);


--
-- Name: idx_soundpub_tracks_artist_name; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_tracks_artist_name ON soundpub.tracks USING btree (artist_name);


--
-- Name: idx_soundpub_tracks_release_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_tracks_release_id ON soundpub.tracks USING btree (release_id);


--
-- Name: idx_soundpub_user_roles_user_id; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_soundpub_user_roles_user_id ON soundpub.user_roles USING btree (user_id);


--
-- Name: idx_takedown_documents_request; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_takedown_documents_request ON soundpub.takedown_request_documents USING btree (request_id);


--
-- Name: idx_takedown_items_release; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_takedown_items_release ON soundpub.takedown_request_items USING btree (release_id);


--
-- Name: idx_takedown_requests_label_status; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_takedown_requests_label_status ON soundpub.takedown_requests USING btree (label_id, status);


--
-- Name: idx_takedown_requests_requester; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_takedown_requests_requester ON soundpub.takedown_requests USING btree (requester_id);


--
-- Name: idx_takedown_targets_request; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX idx_takedown_targets_request ON soundpub.takedown_request_targets USING btree (request_id);


--
-- Name: release_payments_invoice_number_key; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE UNIQUE INDEX release_payments_invoice_number_key ON soundpub.release_payments USING btree (invoice_number) WHERE (invoice_number IS NOT NULL);


--
-- Name: royalties_upload_source_row_unique; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE UNIQUE INDEX royalties_upload_source_row_unique ON soundpub.royalties USING btree (upload_id, source_row_number) WHERE (source_row_number IS NOT NULL);


--
-- Name: royalty_uploads_idempotency_key_unique; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE UNIQUE INDEX royalty_uploads_idempotency_key_unique ON soundpub.royalty_uploads USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: tracks_normalized_isrc_idx; Type: INDEX; Schema: soundpub; Owner: postgres
--

CREATE INDEX tracks_normalized_isrc_idx ON soundpub.tracks USING btree (upper(replace(btrim(isrc), '-'::text, ''::text)));


--
-- Name: app_settings audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.app_settings FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: artist_deletion_requests audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.artist_deletion_requests FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: artist_profiles audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.artist_profiles FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: artists audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.artists FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: composer_royalties audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.composer_royalties FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: copyright_contracts audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.copyright_contracts FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: copyright_registration_files audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.copyright_registration_files FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: copyright_registration_payments audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.copyright_registration_payments FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: copyright_registration_works audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.copyright_registration_works FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: copyright_registrations audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.copyright_registrations FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: notifications audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.notifications FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: payout_balance_reservations audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.payout_balance_reservations FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: payout_requests audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.payout_requests FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: profiles audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.profiles FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: release_payments audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.release_payments FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: releases audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.releases FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: royalties audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.royalties FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: royalty_uploads audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.royalty_uploads FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: takedown_request_documents audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.takedown_request_documents FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: takedown_request_items audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.takedown_request_items FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: takedown_request_targets audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.takedown_request_targets FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: takedown_requests audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.takedown_requests FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: takedown_status_history audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.takedown_status_history FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: tracks audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.tracks FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: user_roles audit_row_change; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON soundpub.user_roles FOR EACH ROW EXECUTE FUNCTION soundpub.audit_row_change();


--
-- Name: releases enforce_registered_label_release_artist; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER enforce_registered_label_release_artist BEFORE INSERT OR UPDATE OF label_id, artist_user_id ON soundpub.releases FOR EACH ROW EXECUTE FUNCTION soundpub.enforce_registered_label_release_artist();


--
-- Name: tracks enforce_registered_label_track_artist; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER enforce_registered_label_track_artist BEFORE INSERT OR UPDATE OF release_id, artist_user_id ON soundpub.tracks FOR EACH ROW EXECUTE FUNCTION soundpub.enforce_registered_label_track_artist();


--
-- Name: releases enforce_release_distribution_service; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER enforce_release_distribution_service BEFORE INSERT OR UPDATE OF distribution_service, custom_label_name, custom_record_name, label_id, created_by ON soundpub.releases FOR EACH ROW EXECUTE FUNCTION soundpub.enforce_release_distribution_service();


--
-- Name: takedown_requests enforce_takedown_request_required_fields; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER enforce_takedown_request_required_fields BEFORE INSERT OR UPDATE OF reason_category, other_reason, contact_name, contact_position, contact_phone, contact_email, contact_address ON soundpub.takedown_requests FOR EACH ROW EXECUTE FUNCTION soundpub.enforce_takedown_request_required_fields();


--
-- Name: profiles guard_profile_sensitive_update; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER guard_profile_sensitive_update BEFORE INSERT OR UPDATE ON soundpub.profiles FOR EACH ROW EXECUTE FUNCTION soundpub.guard_profile_sensitive_update();


--
-- Name: profiles sync_managed_artist_markers_on_profiles; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER sync_managed_artist_markers_on_profiles BEFORE INSERT OR UPDATE OF email, is_managed_artist, auth_user_status, password_set ON soundpub.profiles FOR EACH ROW EXECUTE FUNCTION soundpub.sync_managed_artist_markers();


--
-- Name: profiles trigger_auto_assign_artist_role; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER trigger_auto_assign_artist_role AFTER INSERT ON soundpub.profiles FOR EACH ROW EXECUTE FUNCTION soundpub.auto_assign_artist_role();


--
-- Name: profiles trigger_auto_assign_soundpub_label; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER trigger_auto_assign_soundpub_label BEFORE INSERT ON soundpub.profiles FOR EACH ROW EXECUTE FUNCTION soundpub.auto_assign_new_user_to_soundpub_label();


--
-- Name: app_settings update_app_settings_timestamp; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER update_app_settings_timestamp BEFORE UPDATE ON soundpub.app_settings FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();


--
-- Name: artist_profiles update_artist_profiles_timestamp; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER update_artist_profiles_timestamp BEFORE UPDATE ON soundpub.artist_profiles FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();


--
-- Name: artists update_artists_timestamp; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER update_artists_timestamp BEFORE UPDATE ON soundpub.artists FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();


--
-- Name: composer_royalties update_composer_royalties_timestamp; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER update_composer_royalties_timestamp BEFORE UPDATE ON soundpub.composer_royalties FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();


--
-- Name: copyright_contracts update_copyright_contracts_timestamp; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER update_copyright_contracts_timestamp BEFORE UPDATE ON soundpub.copyright_contracts FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();


--
-- Name: copyright_registration_payments update_copyright_registration_payments_timestamp; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER update_copyright_registration_payments_timestamp BEFORE UPDATE ON soundpub.copyright_registration_payments FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();


--
-- Name: copyright_registration_works update_copyright_registration_works_timestamp; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER update_copyright_registration_works_timestamp BEFORE UPDATE ON soundpub.copyright_registration_works FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();


--
-- Name: copyright_registrations update_copyright_registrations_timestamp; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER update_copyright_registrations_timestamp BEFORE UPDATE ON soundpub.copyright_registrations FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();


--
-- Name: payout_requests update_payout_requests_timestamp; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER update_payout_requests_timestamp BEFORE UPDATE ON soundpub.payout_requests FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();


--
-- Name: profiles update_profiles_timestamp; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER update_profiles_timestamp BEFORE UPDATE ON soundpub.profiles FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();


--
-- Name: release_payments update_release_payments_timestamp; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER update_release_payments_timestamp BEFORE UPDATE ON soundpub.release_payments FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();


--
-- Name: releases update_releases_timestamp; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER update_releases_timestamp BEFORE UPDATE ON soundpub.releases FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();


--
-- Name: royalty_uploads update_royalty_uploads_timestamp; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER update_royalty_uploads_timestamp BEFORE UPDATE ON soundpub.royalty_uploads FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();


--
-- Name: tracks update_tracks_timestamp; Type: TRIGGER; Schema: soundpub; Owner: postgres
--

CREATE TRIGGER update_tracks_timestamp BEFORE UPDATE ON soundpub.tracks FOR EACH ROW EXECUTE FUNCTION soundpub.update_timestamp();


--
-- Name: artist_deletion_requests artist_deletion_requests_artist_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.artist_deletion_requests
    ADD CONSTRAINT artist_deletion_requests_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES soundpub.profiles(id) ON DELETE CASCADE;


--
-- Name: artist_deletion_requests artist_deletion_requests_label_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.artist_deletion_requests
    ADD CONSTRAINT artist_deletion_requests_label_id_fkey FOREIGN KEY (label_id) REFERENCES soundpub.profiles(id) ON DELETE CASCADE;


--
-- Name: artist_profiles artist_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.artist_profiles
    ADD CONSTRAINT artist_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: artists artists_label_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.artists
    ADD CONSTRAINT artists_label_id_fkey FOREIGN KEY (label_id) REFERENCES soundpub.profiles(id) ON DELETE CASCADE;


--
-- Name: auth_events auth_events_user_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.auth_events
    ADD CONSTRAINT auth_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: balance_adjustments balance_adjustments_profile_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.balance_adjustments
    ADD CONSTRAINT balance_adjustments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES soundpub.profiles(id);


--
-- Name: copyright_contracts copyright_contracts_registration_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.copyright_contracts
    ADD CONSTRAINT copyright_contracts_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES soundpub.copyright_registrations(id) ON DELETE CASCADE;


--
-- Name: copyright_registration_files copyright_registration_files_registration_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.copyright_registration_files
    ADD CONSTRAINT copyright_registration_files_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES soundpub.copyright_registrations(id) ON DELETE CASCADE;


--
-- Name: copyright_registration_files copyright_registration_files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.copyright_registration_files
    ADD CONSTRAINT copyright_registration_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: copyright_registration_files copyright_registration_files_work_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.copyright_registration_files
    ADD CONSTRAINT copyright_registration_files_work_id_fkey FOREIGN KEY (work_id) REFERENCES soundpub.copyright_registration_works(id) ON DELETE CASCADE;


--
-- Name: copyright_registration_payments copyright_registration_payments_registration_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.copyright_registration_payments
    ADD CONSTRAINT copyright_registration_payments_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES soundpub.copyright_registrations(id) ON DELETE CASCADE;


--
-- Name: copyright_registration_payments copyright_registration_payments_user_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.copyright_registration_payments
    ADD CONSTRAINT copyright_registration_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: copyright_registration_works copyright_registration_works_registration_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.copyright_registration_works
    ADD CONSTRAINT copyright_registration_works_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES soundpub.copyright_registrations(id) ON DELETE CASCADE;


--
-- Name: copyright_registrations copyright_registrations_user_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.copyright_registrations
    ADD CONSTRAINT copyright_registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: payout_balance_reservations payout_balance_reservations_payout_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.payout_balance_reservations
    ADD CONSTRAINT payout_balance_reservations_payout_id_fkey FOREIGN KEY (payout_id) REFERENCES soundpub.payout_requests(id) ON DELETE CASCADE;


--
-- Name: payout_balance_reservations payout_balance_reservations_profile_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.payout_balance_reservations
    ADD CONSTRAINT payout_balance_reservations_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES soundpub.profiles(id);


--
-- Name: payout_requests payout_requests_processed_by_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.payout_requests
    ADD CONSTRAINT payout_requests_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES soundpub.profiles(id) ON DELETE SET NULL;


--
-- Name: payout_requests payout_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.payout_requests
    ADD CONSTRAINT payout_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES soundpub.profiles(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_parent_label_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.profiles
    ADD CONSTRAINT profiles_parent_label_id_fkey FOREIGN KEY (parent_label_id) REFERENCES soundpub.profiles(id) ON DELETE SET NULL;


--
-- Name: release_payments release_payments_release_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.release_payments
    ADD CONSTRAINT release_payments_release_id_fkey FOREIGN KEY (release_id) REFERENCES soundpub.releases(id) ON DELETE CASCADE;


--
-- Name: releases releases_artist_user_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.releases
    ADD CONSTRAINT releases_artist_user_id_fkey FOREIGN KEY (artist_user_id) REFERENCES soundpub.profiles(id) ON DELETE SET NULL;


--
-- Name: releases releases_created_by_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.releases
    ADD CONSTRAINT releases_created_by_fkey FOREIGN KEY (created_by) REFERENCES soundpub.profiles(id) ON DELETE SET NULL;


--
-- Name: releases releases_label_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.releases
    ADD CONSTRAINT releases_label_id_fkey FOREIGN KEY (label_id) REFERENCES soundpub.profiles(id) ON DELETE SET NULL;


--
-- Name: royalties royalties_artist_user_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.royalties
    ADD CONSTRAINT royalties_artist_user_id_fkey FOREIGN KEY (artist_user_id) REFERENCES soundpub.profiles(id) ON DELETE SET NULL;


--
-- Name: royalties royalties_label_user_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.royalties
    ADD CONSTRAINT royalties_label_user_id_fkey FOREIGN KEY (label_user_id) REFERENCES soundpub.profiles(id) ON DELETE SET NULL;


--
-- Name: royalties royalties_upload_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.royalties
    ADD CONSTRAINT royalties_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES soundpub.royalty_uploads(id);


--
-- Name: royalty_uploads royalty_uploads_user_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.royalty_uploads
    ADD CONSTRAINT royalty_uploads_user_id_fkey FOREIGN KEY (user_id) REFERENCES soundpub.profiles(id);


--
-- Name: takedown_request_documents takedown_request_documents_request_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.takedown_request_documents
    ADD CONSTRAINT takedown_request_documents_request_id_fkey FOREIGN KEY (request_id) REFERENCES soundpub.takedown_requests(id) ON DELETE CASCADE;


--
-- Name: takedown_request_documents takedown_request_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.takedown_request_documents
    ADD CONSTRAINT takedown_request_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES soundpub.profiles(id) ON DELETE CASCADE;


--
-- Name: takedown_request_items takedown_request_items_release_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.takedown_request_items
    ADD CONSTRAINT takedown_request_items_release_id_fkey FOREIGN KEY (release_id) REFERENCES soundpub.releases(id) ON DELETE RESTRICT;


--
-- Name: takedown_request_items takedown_request_items_request_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.takedown_request_items
    ADD CONSTRAINT takedown_request_items_request_id_fkey FOREIGN KEY (request_id) REFERENCES soundpub.takedown_requests(id) ON DELETE CASCADE;


--
-- Name: takedown_request_items takedown_request_items_track_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.takedown_request_items
    ADD CONSTRAINT takedown_request_items_track_id_fkey FOREIGN KEY (track_id) REFERENCES soundpub.tracks(id) ON DELETE RESTRICT;


--
-- Name: takedown_request_targets takedown_request_targets_request_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.takedown_request_targets
    ADD CONSTRAINT takedown_request_targets_request_id_fkey FOREIGN KEY (request_id) REFERENCES soundpub.takedown_requests(id) ON DELETE CASCADE;


--
-- Name: takedown_requests takedown_requests_label_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.takedown_requests
    ADD CONSTRAINT takedown_requests_label_id_fkey FOREIGN KEY (label_id) REFERENCES soundpub.profiles(id) ON DELETE RESTRICT;


--
-- Name: takedown_requests takedown_requests_requester_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.takedown_requests
    ADD CONSTRAINT takedown_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES soundpub.profiles(id) ON DELETE CASCADE;


--
-- Name: takedown_requests takedown_requests_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.takedown_requests
    ADD CONSTRAINT takedown_requests_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES soundpub.profiles(id) ON DELETE SET NULL;


--
-- Name: takedown_status_history takedown_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.takedown_status_history
    ADD CONSTRAINT takedown_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES soundpub.profiles(id) ON DELETE SET NULL;


--
-- Name: takedown_status_history takedown_status_history_request_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.takedown_status_history
    ADD CONSTRAINT takedown_status_history_request_id_fkey FOREIGN KEY (request_id) REFERENCES soundpub.takedown_requests(id) ON DELETE CASCADE;


--
-- Name: tracks tracks_artist_user_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.tracks
    ADD CONSTRAINT tracks_artist_user_id_fkey FOREIGN KEY (artist_user_id) REFERENCES soundpub.profiles(id) ON DELETE SET NULL;


--
-- Name: tracks tracks_release_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.tracks
    ADD CONSTRAINT tracks_release_id_fkey FOREIGN KEY (release_id) REFERENCES soundpub.releases(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: soundpub; Owner: postgres
--

ALTER TABLE ONLY soundpub.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: artist_deletion_requests Admin can update requests; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admin can update requests" ON soundpub.artist_deletion_requests FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM soundpub.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::soundpub.app_role, 'superadmin'::soundpub.app_role]))))));


--
-- Name: artist_deletion_requests Admin can view all requests; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admin can view all requests" ON soundpub.artist_deletion_requests FOR SELECT USING ((EXISTS ( SELECT 1
   FROM soundpub.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::soundpub.app_role, 'superadmin'::soundpub.app_role]))))));


--
-- Name: artist_profiles Admins can manage all artist profiles; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can manage all artist profiles" ON soundpub.artist_profiles TO authenticated USING (soundpub.is_admin(auth.uid()));


--
-- Name: artists Admins can manage all artists; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can manage all artists" ON soundpub.artists TO authenticated USING (soundpub.is_admin(auth.uid()));


--
-- Name: notifications Admins can manage all notifications; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can manage all notifications" ON soundpub.notifications TO authenticated USING (soundpub.is_admin(auth.uid()));


--
-- Name: release_payments Admins can manage all payments; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can manage all payments" ON soundpub.release_payments TO authenticated USING (soundpub.is_admin(auth.uid()));


--
-- Name: payout_requests Admins can manage all payouts; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can manage all payouts" ON soundpub.payout_requests TO authenticated USING (soundpub.is_admin(auth.uid()));


--
-- Name: profiles Admins can manage all profiles; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can manage all profiles" ON soundpub.profiles TO authenticated USING (soundpub.is_admin(auth.uid()));


--
-- Name: releases Admins can manage all releases; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can manage all releases" ON soundpub.releases TO authenticated USING (soundpub.is_admin(auth.uid()));


--
-- Name: tracks Admins can manage all tracks; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can manage all tracks" ON soundpub.tracks TO authenticated USING (soundpub.is_admin(auth.uid()));


--
-- Name: storage_backup_log Admins can manage backup logs; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can manage backup logs" ON soundpub.storage_backup_log TO authenticated USING (soundpub.is_admin(auth.uid()));


--
-- Name: storage_backup_runs Admins can manage backup runs; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can manage backup runs" ON soundpub.storage_backup_runs TO authenticated USING (soundpub.is_admin(auth.uid()));


--
-- Name: composer_royalties Admins can manage composer royalties; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can manage composer royalties" ON soundpub.composer_royalties TO authenticated USING (soundpub.is_admin(auth.uid()));


--
-- Name: copyright_contracts Admins can manage copyright contracts; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can manage copyright contracts" ON soundpub.copyright_contracts TO authenticated USING (soundpub.is_admin(auth.uid())) WITH CHECK (soundpub.is_admin(auth.uid()));


--
-- Name: copyright_registration_files Admins can manage copyright files; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can manage copyright files" ON soundpub.copyright_registration_files TO authenticated USING (soundpub.is_admin(auth.uid())) WITH CHECK (soundpub.is_admin(auth.uid()));


--
-- Name: copyright_registration_payments Admins can manage copyright payments; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can manage copyright payments" ON soundpub.copyright_registration_payments TO authenticated USING (soundpub.is_admin(auth.uid())) WITH CHECK (soundpub.is_admin(auth.uid()));


--
-- Name: copyright_registrations Admins can manage copyright registrations; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can manage copyright registrations" ON soundpub.copyright_registrations TO authenticated USING (soundpub.is_admin(auth.uid())) WITH CHECK (soundpub.is_admin(auth.uid()));


--
-- Name: user_roles Admins can manage permitted roles; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can manage permitted roles" ON soundpub.user_roles TO authenticated USING ((soundpub.is_admin(auth.uid()) AND (user_id <> auth.uid()) AND (soundpub.is_superadmin(auth.uid()) OR ((role <> 'superadmin'::soundpub.app_role) AND (NOT soundpub.has_role(user_id, 'superadmin'::soundpub.app_role)))))) WITH CHECK ((soundpub.is_admin(auth.uid()) AND (user_id <> auth.uid()) AND (soundpub.is_superadmin(auth.uid()) OR ((role <> 'superadmin'::soundpub.app_role) AND (NOT soundpub.has_role(user_id, 'superadmin'::soundpub.app_role))))));


--
-- Name: profiles Admins can view all profiles; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can view all profiles" ON soundpub.profiles FOR SELECT TO authenticated USING (soundpub.is_admin(auth.uid()));


--
-- Name: user_roles Admins can view all roles; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can view all roles" ON soundpub.user_roles FOR SELECT TO authenticated USING (soundpub.is_admin(auth.uid()));


--
-- Name: royalties Admins can view all royalties; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can view all royalties" ON soundpub.royalties FOR SELECT TO authenticated USING (soundpub.is_admin(auth.uid()));


--
-- Name: royalty_uploads Admins can view all uploads; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can view all uploads" ON soundpub.royalty_uploads FOR SELECT TO authenticated USING (soundpub.is_admin(auth.uid()));


--
-- Name: audit_logs Admins can view audit logs; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can view audit logs" ON soundpub.audit_logs FOR SELECT TO authenticated USING (soundpub.is_admin(auth.uid()));


--
-- Name: auth_events Admins can view auth events; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can view auth events" ON soundpub.auth_events FOR SELECT TO authenticated USING (soundpub.is_admin(auth.uid()));


--
-- Name: email_send_log Admins can view email logs; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins can view email logs" ON soundpub.email_send_log FOR SELECT TO authenticated USING (soundpub.is_admin(auth.uid()));


--
-- Name: takedown_requests Admins manage takedown requests; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins manage takedown requests" ON soundpub.takedown_requests FOR UPDATE TO authenticated USING (soundpub.is_admin(auth.uid())) WITH CHECK (soundpub.is_admin(auth.uid()));


--
-- Name: takedown_request_targets Admins update takedown targets; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Admins update takedown targets" ON soundpub.takedown_request_targets FOR UPDATE TO authenticated USING (soundpub.is_admin(auth.uid())) WITH CHECK (soundpub.is_admin(auth.uid()));


--
-- Name: app_settings Anyone can view app settings; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Anyone can view app settings" ON soundpub.app_settings FOR SELECT TO authenticated, anon USING (true);


--
-- Name: releases Artists can view own releases; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Artists can view own releases" ON soundpub.releases FOR SELECT TO authenticated USING ((artist_name = soundpub.get_user_full_name(auth.uid())));


--
-- Name: tracks Artists can view own tracks; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Artists can view own tracks" ON soundpub.tracks FOR SELECT TO authenticated USING ((artist_name = soundpub.get_user_full_name(auth.uid())));


--
-- Name: royalties Artists can view their royalties; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Artists can view their royalties" ON soundpub.royalties FOR SELECT TO authenticated USING ((artist_user_id = auth.uid()));


--
-- Name: composer_royalties Copyright users can view royalties by composer code; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Copyright users can view royalties by composer code" ON soundpub.composer_royalties FOR SELECT TO authenticated USING ((soundpub.has_role(auth.uid(), 'copyright'::soundpub.app_role) AND (EXISTS ( SELECT 1
   FROM soundpub.profiles p
  WHERE ((p.id = auth.uid()) AND (p.composer_code IS NOT NULL) AND (p.composer_code = composer_royalties.composer_id))))));


--
-- Name: takedown_request_items Create takedown items; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Create takedown items" ON soundpub.takedown_request_items FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM soundpub.takedown_requests tr
  WHERE ((tr.id = takedown_request_items.request_id) AND (tr.requester_id = auth.uid())))) AND soundpub.can_access_takedown_release(auth.uid(), release_id)));


--
-- Name: takedown_request_targets Create takedown targets; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Create takedown targets" ON soundpub.takedown_request_targets FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM soundpub.takedown_requests tr
  WHERE ((tr.id = takedown_request_targets.request_id) AND (tr.requester_id = auth.uid())))));


--
-- Name: takedown_requests Eligible users can create takedown requests; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Eligible users can create takedown requests" ON soundpub.takedown_requests FOR INSERT TO authenticated WITH CHECK (((requester_id = auth.uid()) AND soundpub.can_create_takedown_request(auth.uid(), label_id)));


--
-- Name: takedown_status_history Insert takedown history; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Insert takedown history" ON soundpub.takedown_status_history FOR INSERT TO authenticated WITH CHECK (((changed_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM soundpub.takedown_requests tr
  WHERE ((tr.id = takedown_status_history.request_id) AND (soundpub.is_admin(auth.uid()) OR (tr.requester_id = auth.uid())))))));


--
-- Name: artist_deletion_requests Label can insert their own requests; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Label can insert their own requests" ON soundpub.artist_deletion_requests FOR INSERT WITH CHECK ((label_id = auth.uid()));


--
-- Name: artist_deletion_requests Label can view their own requests; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Label can view their own requests" ON soundpub.artist_deletion_requests FOR SELECT USING ((label_id = auth.uid()));


--
-- Name: artist_profiles Labels can delete artist profiles for their artists; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Labels can delete artist profiles for their artists" ON soundpub.artist_profiles FOR DELETE TO authenticated USING ((auth.uid() = ( SELECT profiles.parent_label_id
   FROM soundpub.profiles
  WHERE (profiles.id = artist_profiles.user_id))));


--
-- Name: artist_profiles Labels can insert artist profiles for their artists; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Labels can insert artist profiles for their artists" ON soundpub.artist_profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = ( SELECT profiles.parent_label_id
   FROM soundpub.profiles
  WHERE (profiles.id = artist_profiles.user_id))));


--
-- Name: releases Labels can manage own releases; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Labels can manage own releases" ON soundpub.releases TO authenticated USING (((label_id = auth.uid()) OR (created_by = auth.uid())));


--
-- Name: artists Labels can manage their artists; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Labels can manage their artists" ON soundpub.artists TO authenticated USING ((label_id = auth.uid()));


--
-- Name: tracks Labels can manage tracks from own releases; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Labels can manage tracks from own releases" ON soundpub.tracks TO authenticated USING ((EXISTS ( SELECT 1
   FROM soundpub.releases
  WHERE ((releases.id = tracks.release_id) AND ((releases.label_id = auth.uid()) OR (releases.created_by = auth.uid()))))));


--
-- Name: artist_profiles Labels can update artist profiles for their artists; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Labels can update artist profiles for their artists" ON soundpub.artist_profiles FOR UPDATE TO authenticated USING ((auth.uid() = ( SELECT profiles.parent_label_id
   FROM soundpub.profiles
  WHERE (profiles.id = artist_profiles.user_id))));


--
-- Name: profiles Labels can update their artists; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Labels can update their artists" ON soundpub.profiles FOR UPDATE TO authenticated USING ((parent_label_id = auth.uid()));


--
-- Name: artist_profiles Labels can view artist profiles for their artists; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Labels can view artist profiles for their artists" ON soundpub.artist_profiles FOR SELECT TO authenticated USING ((auth.uid() = ( SELECT profiles.parent_label_id
   FROM soundpub.profiles
  WHERE (profiles.id = artist_profiles.user_id))));


--
-- Name: profiles Labels can view their artists; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Labels can view their artists" ON soundpub.profiles FOR SELECT TO authenticated USING ((parent_label_id = auth.uid()));


--
-- Name: royalties Labels can view their royalties; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Labels can view their royalties" ON soundpub.royalties FOR SELECT TO authenticated USING (((label_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM soundpub.profiles artist_profile
  WHERE ((artist_profile.id = royalties.artist_user_id) AND (artist_profile.parent_label_id = auth.uid()))))));


--
-- Name: app_settings Superadmins can manage app settings; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Superadmins can manage app settings" ON soundpub.app_settings USING (soundpub.has_role(auth.uid(), 'superadmin'::soundpub.app_role));


--
-- Name: takedown_requests Takedown users can view scoped requests; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Takedown users can view scoped requests" ON soundpub.takedown_requests FOR SELECT TO authenticated USING ((soundpub.is_admin(auth.uid()) OR (requester_id = auth.uid()) OR (label_id = auth.uid())));


--
-- Name: takedown_request_documents Upload takedown documents; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Upload takedown documents" ON soundpub.takedown_request_documents FOR INSERT TO authenticated WITH CHECK (((uploaded_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM soundpub.takedown_requests tr
  WHERE ((tr.id = takedown_request_documents.request_id) AND ((tr.requester_id = auth.uid()) OR soundpub.is_admin(auth.uid())))))));


--
-- Name: takedown_requests Users can cancel own unsent takedown requests; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can cancel own unsent takedown requests" ON soundpub.takedown_requests FOR UPDATE TO authenticated USING (((requester_id = auth.uid()) AND (status = ANY (ARRAY['SUBMITTED'::soundpub.takedown_status, 'UNDER_REVIEW'::soundpub.takedown_status, 'NEED_DOCUMENT'::soundpub.takedown_status, 'APPROVED'::soundpub.takedown_status])))) WITH CHECK (((requester_id = auth.uid()) AND (status = ANY (ARRAY['CANCEL_REQUESTED'::soundpub.takedown_status, 'CANCELLED'::soundpub.takedown_status]))));


--
-- Name: copyright_registration_payments Users can create their copyright payments; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can create their copyright payments" ON soundpub.copyright_registration_payments FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (amount = (100000)::numeric) AND (includes_emeterai = true) AND (emeterai_quantity = 1) AND (EXISTS ( SELECT 1
   FROM soundpub.copyright_registrations cr
  WHERE ((cr.id = copyright_registration_payments.registration_id) AND (cr.user_id = auth.uid()))))));


--
-- Name: copyright_registrations Users can create their copyright registrations; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can create their copyright registrations" ON soundpub.copyright_registrations FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: artist_profiles Users can insert own artist profile; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can insert own artist profile" ON soundpub.artist_profiles FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: release_payments Users can insert their own payments; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can insert their own payments" ON soundpub.release_payments FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: copyright_registration_works Users can manage draft copyright works; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can manage draft copyright works" ON soundpub.copyright_registration_works TO authenticated USING (((EXISTS ( SELECT 1
   FROM soundpub.copyright_registrations cr
  WHERE ((cr.id = copyright_registration_works.registration_id) AND (cr.user_id = auth.uid()) AND (cr.status = ANY (ARRAY['draft'::text, 'revision_requested'::text]))))) OR soundpub.is_admin(auth.uid()))) WITH CHECK (((EXISTS ( SELECT 1
   FROM soundpub.copyright_registrations cr
  WHERE ((cr.id = copyright_registration_works.registration_id) AND (cr.user_id = auth.uid()) AND (cr.status = ANY (ARRAY['draft'::text, 'revision_requested'::text]))))) OR soundpub.is_admin(auth.uid())));


--
-- Name: copyright_registrations Users can update draft copyright registrations; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can update draft copyright registrations" ON soundpub.copyright_registrations FOR UPDATE TO authenticated USING (((user_id = auth.uid()) AND (status = ANY (ARRAY['draft'::text, 'revision_requested'::text, 'awaiting_payment'::text])))) WITH CHECK (((user_id = auth.uid()) AND (status = ANY (ARRAY['draft'::text, 'awaiting_payment'::text, 'revision_requested'::text])) AND (composer_code IS NULL) AND (contract_number IS NULL)));


--
-- Name: artist_profiles Users can update own artist profile; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can update own artist profile" ON soundpub.artist_profiles FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: notifications Users can update own notifications; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can update own notifications" ON soundpub.notifications FOR UPDATE TO authenticated USING (((user_id = auth.uid()) OR (is_global = true)));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can update own profile" ON soundpub.profiles FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: copyright_registration_files Users can upload copyright files; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can upload copyright files" ON soundpub.copyright_registration_files FOR INSERT TO authenticated WITH CHECK (((uploaded_by = auth.uid()) AND (soundpub.is_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM soundpub.copyright_registrations cr
  WHERE ((cr.id = copyright_registration_files.registration_id) AND (cr.user_id = auth.uid()) AND (cr.status = ANY (ARRAY['draft'::text, 'revision_requested'::text]))))))));


--
-- Name: notifications Users can view own and global notifications; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can view own and global notifications" ON soundpub.notifications FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (is_global = true)));


--
-- Name: artist_profiles Users can view own artist profile; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can view own artist profile" ON soundpub.artist_profiles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: payout_requests Users can view own payouts; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can view own payouts" ON soundpub.payout_requests FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can view own profile" ON soundpub.profiles FOR SELECT TO authenticated USING ((id = auth.uid()));


--
-- Name: user_roles Users can view own roles; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can view own roles" ON soundpub.user_roles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: royalty_uploads Users can view own uploads; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can view own uploads" ON soundpub.royalty_uploads FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: copyright_contracts Users can view their copyright contracts; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can view their copyright contracts" ON soundpub.copyright_contracts FOR SELECT TO authenticated USING ((soundpub.is_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM soundpub.copyright_registrations cr
  WHERE ((cr.id = copyright_contracts.registration_id) AND (cr.user_id = auth.uid()))))));


--
-- Name: copyright_registration_files Users can view their copyright files; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can view their copyright files" ON soundpub.copyright_registration_files FOR SELECT TO authenticated USING ((soundpub.is_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM soundpub.copyright_registrations cr
  WHERE ((cr.id = copyright_registration_files.registration_id) AND (cr.user_id = auth.uid()))))));


--
-- Name: copyright_registration_payments Users can view their copyright payments; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can view their copyright payments" ON soundpub.copyright_registration_payments FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR soundpub.is_admin(auth.uid())));


--
-- Name: copyright_registrations Users can view their copyright registrations; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can view their copyright registrations" ON soundpub.copyright_registrations FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR soundpub.is_admin(auth.uid())));


--
-- Name: copyright_registration_works Users can view their copyright works; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can view their copyright works" ON soundpub.copyright_registration_works FOR SELECT TO authenticated USING ((soundpub.is_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM soundpub.copyright_registrations cr
  WHERE ((cr.id = copyright_registration_works.registration_id) AND (cr.user_id = auth.uid()))))));


--
-- Name: release_payments Users can view their own payments; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "Users can view their own payments" ON soundpub.release_payments FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: takedown_request_documents View takedown documents; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "View takedown documents" ON soundpub.takedown_request_documents FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM soundpub.takedown_requests tr
  WHERE ((tr.id = takedown_request_documents.request_id) AND (soundpub.is_admin(auth.uid()) OR (tr.requester_id = auth.uid()) OR (tr.label_id = auth.uid()))))));


--
-- Name: takedown_status_history View takedown history; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "View takedown history" ON soundpub.takedown_status_history FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM soundpub.takedown_requests tr
  WHERE ((tr.id = takedown_status_history.request_id) AND (soundpub.is_admin(auth.uid()) OR (tr.requester_id = auth.uid()) OR (tr.label_id = auth.uid()))))));


--
-- Name: takedown_request_items View takedown items; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "View takedown items" ON soundpub.takedown_request_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM soundpub.takedown_requests tr
  WHERE ((tr.id = takedown_request_items.request_id) AND (soundpub.is_admin(auth.uid()) OR (tr.requester_id = auth.uid()) OR (tr.label_id = auth.uid()))))));


--
-- Name: takedown_request_targets View takedown targets; Type: POLICY; Schema: soundpub; Owner: postgres
--

CREATE POLICY "View takedown targets" ON soundpub.takedown_request_targets FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM soundpub.takedown_requests tr
  WHERE ((tr.id = takedown_request_targets.request_id) AND (soundpub.is_admin(auth.uid()) OR (tr.requester_id = auth.uid()) OR (tr.label_id = auth.uid()))))));


--
-- Name: app_settings; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: archived_royalties; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.archived_royalties ENABLE ROW LEVEL SECURITY;

--
-- Name: artist_deletion_requests; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.artist_deletion_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: artist_profiles; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.artist_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: artists; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.artists ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_events; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.auth_events ENABLE ROW LEVEL SECURITY;

--
-- Name: balance_adjustments; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.balance_adjustments ENABLE ROW LEVEL SECURITY;

--
-- Name: composer_royalties; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.composer_royalties ENABLE ROW LEVEL SECURITY;

--
-- Name: copyright_contracts; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.copyright_contracts ENABLE ROW LEVEL SECURITY;

--
-- Name: copyright_registration_files; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.copyright_registration_files ENABLE ROW LEVEL SECURITY;

--
-- Name: copyright_registration_payments; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.copyright_registration_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: copyright_registration_works; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.copyright_registration_works ENABLE ROW LEVEL SECURITY;

--
-- Name: copyright_registrations; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.copyright_registrations ENABLE ROW LEVEL SECURITY;

--
-- Name: email_send_log; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.email_send_log ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: payout_balance_reservations; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.payout_balance_reservations ENABLE ROW LEVEL SECURITY;

--
-- Name: payout_requests; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.payout_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.profiles ENABLE ROW LEVEL SECURITY;


--
-- Name: rate_limits; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: release_payments; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.release_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: releases; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.releases ENABLE ROW LEVEL SECURITY;

--
-- Name: royalties; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.royalties ENABLE ROW LEVEL SECURITY;

--
-- Name: royalty_uploads; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.royalty_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: storage_backup_log; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.storage_backup_log ENABLE ROW LEVEL SECURITY;

--
-- Name: storage_backup_runs; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.storage_backup_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: takedown_request_documents; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.takedown_request_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: takedown_request_items; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.takedown_request_items ENABLE ROW LEVEL SECURITY;

--
-- Name: takedown_request_targets; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.takedown_request_targets ENABLE ROW LEVEL SECURITY;

--
-- Name: takedown_requests; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.takedown_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: takedown_status_history; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.takedown_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: tracks; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.tracks ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: soundpub; Owner: postgres
--

ALTER TABLE soundpub.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA soundpub; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA soundpub TO anon;
GRANT USAGE ON SCHEMA soundpub TO authenticated;
GRANT USAGE ON SCHEMA soundpub TO service_role;
GRANT USAGE ON SCHEMA soundpub TO authenticator;
GRANT USAGE ON SCHEMA soundpub TO supabase_auth_admin;


--
-- Name: TABLE copyright_registrations; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT SELECT ON TABLE soundpub.copyright_registrations TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE soundpub.copyright_registrations TO authenticated;
GRANT ALL ON TABLE soundpub.copyright_registrations TO service_role;


--
-- Name: FUNCTION admin_review_copyright_registration(_registration_id uuid, _status text, _admin_notes text, _revision_notes text, _composer_code text, _contract_number text); Type: ACL; Schema: soundpub; Owner: postgres
--

REVOKE ALL ON FUNCTION soundpub.admin_review_copyright_registration(_registration_id uuid, _status text, _admin_notes text, _revision_notes text, _composer_code text, _contract_number text) FROM PUBLIC;
GRANT ALL ON FUNCTION soundpub.admin_review_copyright_registration(_registration_id uuid, _status text, _admin_notes text, _revision_notes text, _composer_code text, _contract_number text) TO authenticated;
GRANT ALL ON FUNCTION soundpub.admin_review_copyright_registration(_registration_id uuid, _status text, _admin_notes text, _revision_notes text, _composer_code text, _contract_number text) TO service_role;


--
-- Name: TABLE copyright_contracts; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT SELECT ON TABLE soundpub.copyright_contracts TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE soundpub.copyright_contracts TO authenticated;
GRANT ALL ON TABLE soundpub.copyright_contracts TO service_role;


--
-- Name: FUNCTION admin_update_copyright_contract(_registration_id uuid, _status text, _preview_html_url text, _draft_pdf_url text, _generated_pdf_url text, _stamped_pdf_url text); Type: ACL; Schema: soundpub; Owner: postgres
--

REVOKE ALL ON FUNCTION soundpub.admin_update_copyright_contract(_registration_id uuid, _status text, _preview_html_url text, _draft_pdf_url text, _generated_pdf_url text, _stamped_pdf_url text) FROM PUBLIC;
GRANT ALL ON FUNCTION soundpub.admin_update_copyright_contract(_registration_id uuid, _status text, _preview_html_url text, _draft_pdf_url text, _generated_pdf_url text, _stamped_pdf_url text) TO authenticated;
GRANT ALL ON FUNCTION soundpub.admin_update_copyright_contract(_registration_id uuid, _status text, _preview_html_url text, _draft_pdf_url text, _generated_pdf_url text, _stamped_pdf_url text) TO service_role;


--
-- Name: FUNCTION audit_row_change(); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.audit_row_change() TO anon;
GRANT ALL ON FUNCTION soundpub.audit_row_change() TO authenticated;
GRANT ALL ON FUNCTION soundpub.audit_row_change() TO service_role;


--
-- Name: FUNCTION audit_sanitize(payload jsonb); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.audit_sanitize(payload jsonb) TO anon;
GRANT ALL ON FUNCTION soundpub.audit_sanitize(payload jsonb) TO authenticated;
GRANT ALL ON FUNCTION soundpub.audit_sanitize(payload jsonb) TO service_role;


--
-- Name: FUNCTION can_access_takedown_release(_user_id uuid, _release_id uuid); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.can_access_takedown_release(_user_id uuid, _release_id uuid) TO authenticated;
GRANT ALL ON FUNCTION soundpub.can_access_takedown_release(_user_id uuid, _release_id uuid) TO service_role;


--
-- Name: FUNCTION can_create_takedown_request(_user_id uuid, _label_id uuid); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.can_create_takedown_request(_user_id uuid, _label_id uuid) TO authenticated;
GRANT ALL ON FUNCTION soundpub.can_create_takedown_request(_user_id uuid, _label_id uuid) TO service_role;


--
-- Name: FUNCTION check_rate_limit(p_identifier text, p_action_type text, p_max_attempts integer, p_window_minutes integer); Type: ACL; Schema: soundpub; Owner: postgres
--

REVOKE ALL ON FUNCTION soundpub.check_rate_limit(p_identifier text, p_action_type text, p_max_attempts integer, p_window_minutes integer) FROM PUBLIC;
GRANT ALL ON FUNCTION soundpub.check_rate_limit(p_identifier text, p_action_type text, p_max_attempts integer, p_window_minutes integer) TO service_role;


--
-- Name: FUNCTION cleanup_expired_tokens(); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.cleanup_expired_tokens() TO anon;
GRANT ALL ON FUNCTION soundpub.cleanup_expired_tokens() TO authenticated;
GRANT ALL ON FUNCTION soundpub.cleanup_expired_tokens() TO service_role;


--
-- Name: FUNCTION cleanup_rate_limits(); Type: ACL; Schema: soundpub; Owner: postgres
--

REVOKE ALL ON FUNCTION soundpub.cleanup_rate_limits() FROM PUBLIC;
GRANT ALL ON FUNCTION soundpub.cleanup_rate_limits() TO service_role;


--
-- Name: FUNCTION commit_royalty_upload(p_rows jsonb, p_actor_id uuid, p_filename text, p_original_filename text, p_replace_existing boolean, p_replace_mode text, p_idempotency_key text); Type: ACL; Schema: soundpub; Owner: postgres
--

REVOKE ALL ON FUNCTION soundpub.commit_royalty_upload(p_rows jsonb, p_actor_id uuid, p_filename text, p_original_filename text, p_replace_existing boolean, p_replace_mode text, p_idempotency_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION soundpub.commit_royalty_upload(p_rows jsonb, p_actor_id uuid, p_filename text, p_original_filename text, p_replace_existing boolean, p_replace_mode text, p_idempotency_key text) TO service_role;


--
-- Name: FUNCTION complete_payout(_payout_id uuid); Type: ACL; Schema: soundpub; Owner: postgres
--

REVOKE ALL ON FUNCTION soundpub.complete_payout(_payout_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION current_user_can_view_royalty(_artist_user_id uuid, _label_user_id uuid); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.current_user_can_view_royalty(_artist_user_id uuid, _label_user_id uuid) TO anon;
GRANT ALL ON FUNCTION soundpub.current_user_can_view_royalty(_artist_user_id uuid, _label_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION soundpub.current_user_can_view_royalty(_artist_user_id uuid, _label_user_id uuid) TO service_role;


--
-- Name: FUNCTION delete_release_with_refund(p_release_id uuid); Type: ACL; Schema: soundpub; Owner: postgres
--

REVOKE ALL ON FUNCTION soundpub.delete_release_with_refund(p_release_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION soundpub.delete_release_with_refund(p_release_id uuid) TO authenticated;


--
-- Name: FUNCTION enforce_release_distribution_service(); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.enforce_release_distribution_service() TO anon;
GRANT ALL ON FUNCTION soundpub.enforce_release_distribution_service() TO authenticated;
GRANT ALL ON FUNCTION soundpub.enforce_release_distribution_service() TO service_role;


--
-- Name: FUNCTION generate_composer_code(_prefix text); Type: ACL; Schema: soundpub; Owner: postgres
--

REVOKE ALL ON FUNCTION soundpub.generate_composer_code(_prefix text) FROM PUBLIC;
GRANT ALL ON FUNCTION soundpub.generate_composer_code(_prefix text) TO authenticated;
GRANT ALL ON FUNCTION soundpub.generate_composer_code(_prefix text) TO service_role;


--
-- Name: FUNCTION generate_copyright_contract_number(_prefix text); Type: ACL; Schema: soundpub; Owner: postgres
--

REVOKE ALL ON FUNCTION soundpub.generate_copyright_contract_number(_prefix text) FROM PUBLIC;
GRANT ALL ON FUNCTION soundpub.generate_copyright_contract_number(_prefix text) TO authenticated;
GRANT ALL ON FUNCTION soundpub.generate_copyright_contract_number(_prefix text) TO service_role;


--
-- Name: FUNCTION generate_managed_artist_email(_artist_name text); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.generate_managed_artist_email(_artist_name text) TO anon;
GRANT ALL ON FUNCTION soundpub.generate_managed_artist_email(_artist_name text) TO authenticated;
GRANT ALL ON FUNCTION soundpub.generate_managed_artist_email(_artist_name text) TO service_role;


--
-- Name: FUNCTION get_artist_profile_summary(_artist_user_id uuid); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.get_artist_profile_summary(_artist_user_id uuid) TO anon;
GRANT ALL ON FUNCTION soundpub.get_artist_profile_summary(_artist_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION soundpub.get_artist_profile_summary(_artist_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_dashboard_role_stats(); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.get_dashboard_role_stats() TO anon;
GRANT ALL ON FUNCTION soundpub.get_dashboard_role_stats() TO authenticated;
GRANT ALL ON FUNCTION soundpub.get_dashboard_role_stats() TO service_role;


--
-- Name: FUNCTION get_my_composer_royalties(_period text); Type: ACL; Schema: soundpub; Owner: postgres
--

REVOKE ALL ON FUNCTION soundpub.get_my_composer_royalties(_period text) FROM PUBLIC;
GRANT ALL ON FUNCTION soundpub.get_my_composer_royalties(_period text) TO authenticated;
GRANT ALL ON FUNCTION soundpub.get_my_composer_royalties(_period text) TO service_role;


--
-- Name: FUNCTION get_royalty_artist_breakdown(_period text, _limit integer); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.get_royalty_artist_breakdown(_period text, _limit integer) TO anon;
GRANT ALL ON FUNCTION soundpub.get_royalty_artist_breakdown(_period text, _limit integer) TO authenticated;
GRANT ALL ON FUNCTION soundpub.get_royalty_artist_breakdown(_period text, _limit integer) TO service_role;


--
-- Name: FUNCTION get_royalty_comparison(_current_periods text[], _previous_periods text[]); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.get_royalty_comparison(_current_periods text[], _previous_periods text[]) TO anon;
GRANT ALL ON FUNCTION soundpub.get_royalty_comparison(_current_periods text[], _previous_periods text[]) TO authenticated;
GRANT ALL ON FUNCTION soundpub.get_royalty_comparison(_current_periods text[], _previous_periods text[]) TO service_role;


--
-- Name: FUNCTION get_royalty_country_summary(_limit integer); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.get_royalty_country_summary(_limit integer) TO anon;
GRANT ALL ON FUNCTION soundpub.get_royalty_country_summary(_limit integer) TO authenticated;
GRANT ALL ON FUNCTION soundpub.get_royalty_country_summary(_limit integer) TO service_role;


--
-- Name: FUNCTION get_royalty_label_breakdown(_period text); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.get_royalty_label_breakdown(_period text) TO anon;
GRANT ALL ON FUNCTION soundpub.get_royalty_label_breakdown(_period text) TO authenticated;
GRANT ALL ON FUNCTION soundpub.get_royalty_label_breakdown(_period text) TO service_role;


--
-- Name: FUNCTION get_royalty_monthly_summary(); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.get_royalty_monthly_summary() TO anon;
GRANT ALL ON FUNCTION soundpub.get_royalty_monthly_summary() TO authenticated;
GRANT ALL ON FUNCTION soundpub.get_royalty_monthly_summary() TO service_role;


--
-- Name: FUNCTION get_royalty_period_summary(); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.get_royalty_period_summary() TO anon;
GRANT ALL ON FUNCTION soundpub.get_royalty_period_summary() TO authenticated;
GRANT ALL ON FUNCTION soundpub.get_royalty_period_summary() TO service_role;


--
-- Name: FUNCTION get_royalty_periods(); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.get_royalty_periods() TO anon;
GRANT ALL ON FUNCTION soundpub.get_royalty_periods() TO authenticated;
GRANT ALL ON FUNCTION soundpub.get_royalty_periods() TO service_role;


--
-- Name: FUNCTION get_royalty_platform_summary(_limit integer); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.get_royalty_platform_summary(_limit integer) TO anon;
GRANT ALL ON FUNCTION soundpub.get_royalty_platform_summary(_limit integer) TO authenticated;
GRANT ALL ON FUNCTION soundpub.get_royalty_platform_summary(_limit integer) TO service_role;


--
-- Name: FUNCTION get_royalty_stats(); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.get_royalty_stats() TO anon;
GRANT ALL ON FUNCTION soundpub.get_royalty_stats() TO authenticated;
GRANT ALL ON FUNCTION soundpub.get_royalty_stats() TO service_role;


--
-- Name: FUNCTION get_royalty_top_performers(_current_periods text[], _previous_periods text[], _group_by text, _limit integer); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.get_royalty_top_performers(_current_periods text[], _previous_periods text[], _group_by text, _limit integer) TO anon;
GRANT ALL ON FUNCTION soundpub.get_royalty_top_performers(_current_periods text[], _previous_periods text[], _group_by text, _limit integer) TO authenticated;
GRANT ALL ON FUNCTION soundpub.get_royalty_top_performers(_current_periods text[], _previous_periods text[], _group_by text, _limit integer) TO service_role;


--
-- Name: FUNCTION get_royalty_track_breakdown(_period text); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.get_royalty_track_breakdown(_period text) TO anon;
GRANT ALL ON FUNCTION soundpub.get_royalty_track_breakdown(_period text) TO authenticated;
GRANT ALL ON FUNCTION soundpub.get_royalty_track_breakdown(_period text) TO service_role;


--
-- Name: FUNCTION get_soundpub_label_id(); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.get_soundpub_label_id() TO service_role;


--
-- Name: FUNCTION get_user_full_name(user_id uuid); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.get_user_full_name(user_id uuid) TO service_role;
GRANT ALL ON FUNCTION soundpub.get_user_full_name(user_id uuid) TO anon;
GRANT ALL ON FUNCTION soundpub.get_user_full_name(user_id uuid) TO authenticated;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: soundpub; Owner: postgres
--

REVOKE ALL ON FUNCTION soundpub.handle_new_user() FROM PUBLIC;
GRANT ALL ON FUNCTION soundpub.handle_new_user() TO service_role;
GRANT ALL ON FUNCTION soundpub.handle_new_user() TO supabase_auth_admin;


--
-- Name: FUNCTION has_role(user_id uuid, role soundpub.app_role); Type: ACL; Schema: soundpub; Owner: postgres
--

REVOKE ALL ON FUNCTION soundpub.has_role(user_id uuid, role soundpub.app_role) FROM PUBLIC;
GRANT ALL ON FUNCTION soundpub.has_role(user_id uuid, role soundpub.app_role) TO service_role;
GRANT ALL ON FUNCTION soundpub.has_role(user_id uuid, role soundpub.app_role) TO authenticated;


--
-- Name: FUNCTION is_admin(user_id uuid); Type: ACL; Schema: soundpub; Owner: postgres
--

REVOKE ALL ON FUNCTION soundpub.is_admin(user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION soundpub.is_admin(user_id uuid) TO service_role;
GRANT ALL ON FUNCTION soundpub.is_admin(user_id uuid) TO authenticated;


--
-- Name: FUNCTION is_managed_artist_email(_email text); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.is_managed_artist_email(_email text) TO anon;
GRANT ALL ON FUNCTION soundpub.is_managed_artist_email(_email text) TO authenticated;
GRANT ALL ON FUNCTION soundpub.is_managed_artist_email(_email text) TO service_role;


--
-- Name: FUNCTION is_soundpub_artist_for_release(_user_id uuid, _label_id uuid); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.is_soundpub_artist_for_release(_user_id uuid, _label_id uuid) TO anon;
GRANT ALL ON FUNCTION soundpub.is_soundpub_artist_for_release(_user_id uuid, _label_id uuid) TO authenticated;
GRANT ALL ON FUNCTION soundpub.is_soundpub_artist_for_release(_user_id uuid, _label_id uuid) TO service_role;


--
-- Name: FUNCTION is_soundpub_takedown_user(_user_id uuid); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.is_soundpub_takedown_user(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION soundpub.is_soundpub_takedown_user(_user_id uuid) TO service_role;


--
-- Name: FUNCTION rebuild_royalty_balances(); Type: ACL; Schema: soundpub; Owner: postgres
--

REVOKE ALL ON FUNCTION soundpub.rebuild_royalty_balances() FROM PUBLIC;
GRANT ALL ON FUNCTION soundpub.rebuild_royalty_balances() TO service_role;


--
-- Name: FUNCTION record_auth_audit(p_action text, p_target_id uuid); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.record_auth_audit(p_action text, p_target_id uuid) TO anon;
GRANT ALL ON FUNCTION soundpub.record_auth_audit(p_action text, p_target_id uuid) TO authenticated;
GRANT ALL ON FUNCTION soundpub.record_auth_audit(p_action text, p_target_id uuid) TO service_role;


--
-- Name: FUNCTION repair_orphan_artist_link(_issue_type text, _profile_id uuid, _full_name text, _related_label_id uuid); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.repair_orphan_artist_link(_issue_type text, _profile_id uuid, _full_name text, _related_label_id uuid) TO anon;
GRANT ALL ON FUNCTION soundpub.repair_orphan_artist_link(_issue_type text, _profile_id uuid, _full_name text, _related_label_id uuid) TO authenticated;
GRANT ALL ON FUNCTION soundpub.repair_orphan_artist_link(_issue_type text, _profile_id uuid, _full_name text, _related_label_id uuid) TO service_role;


--
-- Name: FUNCTION request_payout(_amount numeric, _bank_name text, _account_number text, _account_holder_name text); Type: ACL; Schema: soundpub; Owner: postgres
--

REVOKE ALL ON FUNCTION soundpub.request_payout(_amount numeric, _bank_name text, _account_number text, _account_holder_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION soundpub.request_payout(_amount numeric, _bank_name text, _account_number text, _account_holder_name text) TO authenticated;
GRANT ALL ON FUNCTION soundpub.request_payout(_amount numeric, _bank_name text, _account_number text, _account_holder_name text) TO service_role;


--
-- Name: FUNCTION reverse_royalty_upload(p_upload_id uuid, p_actor_id uuid, p_reason text); Type: ACL; Schema: soundpub; Owner: postgres
--

REVOKE ALL ON FUNCTION soundpub.reverse_royalty_upload(p_upload_id uuid, p_actor_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION soundpub.reverse_royalty_upload(p_upload_id uuid, p_actor_id uuid, p_reason text) TO service_role;


--
-- Name: FUNCTION scan_orphan_artist_links(); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.scan_orphan_artist_links() TO anon;
GRANT ALL ON FUNCTION soundpub.scan_orphan_artist_links() TO authenticated;
GRANT ALL ON FUNCTION soundpub.scan_orphan_artist_links() TO service_role;


--
-- Name: FUNCTION sync_managed_artist_markers(); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.sync_managed_artist_markers() TO anon;
GRANT ALL ON FUNCTION soundpub.sync_managed_artist_markers() TO authenticated;
GRANT ALL ON FUNCTION soundpub.sync_managed_artist_markers() TO service_role;


--
-- Name: FUNCTION update_balance_on_payout_status_change(); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.update_balance_on_payout_status_change() TO service_role;
GRANT ALL ON FUNCTION soundpub.update_balance_on_payout_status_change() TO anon;
GRANT ALL ON FUNCTION soundpub.update_balance_on_payout_status_change() TO authenticated;


--
-- Name: FUNCTION update_payout_status(_payout_id uuid, _status text, _notes text, _proof_path text, _proof_name text); Type: ACL; Schema: soundpub; Owner: postgres
--

REVOKE ALL ON FUNCTION soundpub.update_payout_status(_payout_id uuid, _status text, _notes text, _proof_path text, _proof_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION soundpub.update_payout_status(_payout_id uuid, _status text, _notes text, _proof_path text, _proof_name text) TO authenticated;
GRANT ALL ON FUNCTION soundpub.update_payout_status(_payout_id uuid, _status text, _notes text, _proof_path text, _proof_name text) TO service_role;


--
-- Name: FUNCTION update_timestamp(); Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON FUNCTION soundpub.update_timestamp() TO service_role;
GRANT ALL ON FUNCTION soundpub.update_timestamp() TO anon;
GRANT ALL ON FUNCTION soundpub.update_timestamp() TO authenticated;


--
-- Name: TABLE app_settings; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.app_settings TO service_role;
GRANT SELECT ON TABLE soundpub.app_settings TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE soundpub.app_settings TO authenticated;


--
-- Name: TABLE archived_royalties; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.archived_royalties TO service_role;


--
-- Name: TABLE artist_deletion_requests; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT SELECT ON TABLE soundpub.artist_deletion_requests TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE soundpub.artist_deletion_requests TO authenticated;
GRANT ALL ON TABLE soundpub.artist_deletion_requests TO service_role;


--
-- Name: TABLE artist_profiles; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.artist_profiles TO service_role;
GRANT SELECT ON TABLE soundpub.artist_profiles TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE soundpub.artist_profiles TO authenticated;


--
-- Name: TABLE artists; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.artists TO service_role;
GRANT SELECT ON TABLE soundpub.artists TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE soundpub.artists TO authenticated;


--
-- Name: TABLE audit_logs; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.audit_logs TO service_role;
GRANT SELECT ON TABLE soundpub.audit_logs TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE soundpub.audit_logs TO authenticated;


--
-- Name: TABLE auth_events; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.auth_events TO service_role;
GRANT SELECT ON TABLE soundpub.auth_events TO authenticated;


--
-- Name: TABLE balance_adjustments; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.balance_adjustments TO service_role;


--
-- Name: TABLE composer_royalties; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.composer_royalties TO service_role;
GRANT SELECT ON TABLE soundpub.composer_royalties TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE soundpub.composer_royalties TO authenticated;


--
-- Name: TABLE copyright_registration_files; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT SELECT ON TABLE soundpub.copyright_registration_files TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE soundpub.copyright_registration_files TO authenticated;
GRANT ALL ON TABLE soundpub.copyright_registration_files TO service_role;


--
-- Name: TABLE copyright_registration_payments; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT SELECT ON TABLE soundpub.copyright_registration_payments TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE soundpub.copyright_registration_payments TO authenticated;
GRANT ALL ON TABLE soundpub.copyright_registration_payments TO service_role;


--
-- Name: TABLE copyright_registration_works; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT SELECT ON TABLE soundpub.copyright_registration_works TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE soundpub.copyright_registration_works TO authenticated;
GRANT ALL ON TABLE soundpub.copyright_registration_works TO service_role;


--
-- Name: TABLE email_send_log; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.email_send_log TO service_role;
GRANT SELECT ON TABLE soundpub.email_send_log TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE soundpub.email_send_log TO authenticated;


--
-- Name: TABLE notifications; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.notifications TO service_role;
GRANT SELECT ON TABLE soundpub.notifications TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE soundpub.notifications TO authenticated;


--
-- Name: TABLE payout_balance_reservations; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.payout_balance_reservations TO service_role;


--
-- Name: TABLE payout_requests; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.payout_requests TO service_role;
GRANT SELECT ON TABLE soundpub.payout_requests TO anon;
GRANT SELECT ON TABLE soundpub.payout_requests TO authenticated;


--
-- Name: TABLE profiles; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.profiles TO service_role;
GRANT SELECT ON TABLE soundpub.profiles TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE soundpub.profiles TO authenticated;


--
-- Name: TABLE rate_limits; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.rate_limits TO service_role;


--
-- Name: TABLE release_payments; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.release_payments TO service_role;
GRANT SELECT ON TABLE soundpub.release_payments TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE soundpub.release_payments TO authenticated;


--
-- Name: TABLE releases; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.releases TO service_role;
GRANT SELECT ON TABLE soundpub.releases TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE soundpub.releases TO authenticated;


--
-- Name: TABLE royalties; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.royalties TO service_role;
GRANT SELECT ON TABLE soundpub.royalties TO anon;
GRANT SELECT ON TABLE soundpub.royalties TO authenticated;


--
-- Name: TABLE royalty_uploads; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.royalty_uploads TO service_role;
GRANT SELECT ON TABLE soundpub.royalty_uploads TO anon;
GRANT SELECT ON TABLE soundpub.royalty_uploads TO authenticated;


--
-- Name: TABLE storage_backup_log; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.storage_backup_log TO service_role;
GRANT SELECT ON TABLE soundpub.storage_backup_log TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE soundpub.storage_backup_log TO authenticated;


--
-- Name: TABLE storage_backup_runs; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.storage_backup_runs TO service_role;
GRANT SELECT ON TABLE soundpub.storage_backup_runs TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE soundpub.storage_backup_runs TO authenticated;


--
-- Name: TABLE takedown_request_documents; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE soundpub.takedown_request_documents TO authenticated;


--
-- Name: TABLE takedown_request_items; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE soundpub.takedown_request_items TO authenticated;


--
-- Name: TABLE takedown_request_targets; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE soundpub.takedown_request_targets TO authenticated;


--
-- Name: TABLE takedown_requests; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE soundpub.takedown_requests TO authenticated;


--
-- Name: TABLE takedown_status_history; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT SELECT,INSERT ON TABLE soundpub.takedown_status_history TO authenticated;


--
-- Name: TABLE tracks; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.tracks TO service_role;
GRANT SELECT ON TABLE soundpub.tracks TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE soundpub.tracks TO authenticated;


--
-- Name: TABLE user_roles; Type: ACL; Schema: soundpub; Owner: postgres
--

GRANT ALL ON TABLE soundpub.user_roles TO service_role;
GRANT SELECT ON TABLE soundpub.user_roles TO anon;
GRANT SELECT ON TABLE soundpub.user_roles TO authenticated;


--
-- PostgreSQL database dump complete
--




