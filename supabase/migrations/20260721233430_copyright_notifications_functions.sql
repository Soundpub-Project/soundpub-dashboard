-- Add notification triggers to copyright registration workflow
-- This extends the existing copyright_publishing_registration.sql

-- =====================================================
-- Update admin_review_copyright_registration to include notifications
-- =====================================================

CREATE OR REPLACE FUNCTION soundpub.admin_review_copyright_registration(
  _registration_id uuid,
  _action text,
  _admin_notes text DEFAULT NULL,
  _revision_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = soundpub
AS \$\$
DECLARE
  _reg record;
  _user_id uuid;
  _new_status text;
  _result jsonb;
BEGIN
  -- Verify admin
  IF NOT soundpub.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can review registrations';
  END IF;

  -- Get registration
  SELECT * INTO _reg
  FROM soundpub.copyright_registrations
  WHERE id = _registration_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration not found';
  END IF;

  _user_id := _reg.user_id;

  -- Process action
  CASE _action
    WHEN 'in_review' THEN
      _new_status := 'in_review';
      UPDATE soundpub.copyright_registrations
      SET status = _new_status, admin_notes = _admin_notes, reviewed_at = now()
      WHERE id = _registration_id;

    WHEN 'revision' THEN
      _new_status := 'revision_requested';
      UPDATE soundpub.copyright_registrations
      SET status = _new_status, revision_notes = _revision_notes, admin_notes = _admin_notes
      WHERE id = _registration_id;
      
      -- Send revision notification
      PERFORM soundpub.notify_copyright_event(
        _user_id,
        'revision_requested',
        jsonb_build_object(
          'legal_name', _reg.legal_name,
          'email', _reg.email,
          'revision_notes', _revision_notes
        )
      );

    WHEN 'approve' THEN
      _new_status := 'approved';
      
      -- Generate composer code if not exists
      IF _reg.composer_code IS NULL THEN
        UPDATE soundpub.copyright_registrations
        SET 
          composer_code = soundpub.generate_composer_code(),
          status = _new_status,
          approved_at = now(),
          admin_notes = _admin_notes
        WHERE id = _registration_id
        RETURNING composer_code INTO _reg.composer_code;
      ELSE
        UPDATE soundpub.copyright_registrations
        SET 
          status = _new_status,
          approved_at = now(),
          admin_notes = _admin_notes
        WHERE id = _registration_id;
      END IF;

      -- Update profile with composer_code and copyright role
      UPDATE soundpub.profiles
      SET composer_code = _reg.composer_code
      WHERE id = _user_id;

      -- Add copyright role if not exists
      INSERT INTO soundpub.user_roles (user_id, role)
      VALUES (_user_id, 'copyright')
      ON CONFLICT DO NOTHING;

      -- Generate contract
      INSERT INTO soundpub.copyright_contracts (
        registration_id,
        status,
        created_at,
        updated_at
      ) VALUES (
        _registration_id,
        'generated',
        now(),
        now()
      );

      -- Send approval notification with composer code
      PERFORM soundpub.notify_copyright_event(
        _user_id,
        'approved',
        jsonb_build_object(
          'legal_name', _reg.legal_name,
          'email', _reg.email,
          'composer_code', _reg.composer_code,
          'contract_number', (SELECT contract_number FROM soundpub.copyright_contracts WHERE registration_id = _registration_id),
          'approved_at', now()
        )
      );

    WHEN 'reject' THEN
      _new_status := 'rejected';
      UPDATE soundpub.copyright_registrations
      SET status = _new_status, admin_notes = _admin_notes, rejected_at = now()
      WHERE id = _registration_id;

      -- Send rejection notification
      PERFORM soundpub.notify_copyright_event(
        _user_id,
        'rejected',
        jsonb_build_object(
          'legal_name', _reg.legal_name,
          'email', _reg.email,
          'rejection_reason', _admin_notes
        )
      );

    ELSE
      RAISE EXCEPTION 'Invalid action: %', _action;
  END CASE;

  _result := jsonb_build_object(
    'success', true,
    'registration_id', _registration_id,
    'new_status', _new_status,
    'message', 'Action completed and notification sent'
  );

  RETURN _result;
END;
\$\$;

-- =====================================================
-- New RPC: Update contract status and notify
-- =====================================================

CREATE OR REPLACE FUNCTION soundpub.update_copyright_contract_with_notification(
  _contract_id uuid,
  _new_status text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = soundpub
AS \$\$
DECLARE
  _contract record;
  _reg record;
  _user_id uuid;
  _result jsonb;
BEGIN
  -- Verify admin
  IF NOT soundpub.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can update contracts';
  END IF;

  -- Get contract and registration
  SELECT c.*, r.id as reg_id, r.user_id, r.legal_name, r.email, r.composer_code
  INTO _contract
  FROM soundpub.copyright_contracts c
  JOIN soundpub.copyright_registrations r ON c.registration_id = r.id
  WHERE c.id = _contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  _user_id := _contract.user_id;
  _reg := _contract;

  -- Update contract status
  UPDATE soundpub.copyright_contracts
  SET 
    status = _new_status,
    updated_at = now()
  WHERE id = _contract_id;

  -- Update registration status based on contract status
  CASE _new_status
    WHEN 'stamped' THEN
      UPDATE soundpub.copyright_registrations
      SET status = 'stamped'
      WHERE id = _contract.reg_id;

      -- Send contract ready notification
      PERFORM soundpub.notify_copyright_event(
        _user_id,
        'contract_ready',
        jsonb_build_object(
          'legal_name', _contract.legal_name,
          'email', _contract.email,
          'contract_number', _contract.contract_number
        )
      );

    WHEN 'signed' THEN
      UPDATE soundpub.copyright_registrations
      SET status = 'contract_signed'
      WHERE id = _contract.reg_id;

    WHEN 'active' THEN
      UPDATE soundpub.copyright_registrations
      SET status = 'active'
      WHERE id = _contract.reg_id;

      -- Send contract active notification
      PERFORM soundpub.notify_copyright_event(
        _user_id,
        'contract_active',
        jsonb_build_object(
          'legal_name', _contract.legal_name,
          'email', _contract.email,
          'composer_code', _contract.composer_code,
          'contract_number', _contract.contract_number,
          'signed_at', now()
        )
      );
  END CASE;

  _result := jsonb_build_object(
    'success', true,
    'contract_id', _contract_id,
    'new_status', _new_status,
    'message', 'Contract updated and notification sent'
  );

  RETURN _result;
END;
\$\$;

GRANT EXECUTE ON FUNCTION soundpub.admin_review_copyright_registration TO authenticated;
GRANT EXECUTE ON FUNCTION soundpub.update_copyright_contract_with_notification TO authenticated;

COMMENT ON FUNCTION soundpub.admin_review_copyright_registration IS 'Admin review action with automatic notifications';
COMMENT ON FUNCTION soundpub.update_copyright_contract_with_notification IS 'Update contract status and send notifications to user';
