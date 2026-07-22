-- Migration: Copyright Notifications and Email Support
-- Created: 2026-07-21
-- Purpose: Add notification triggers and email templates for copyright registration workflow

-- =====================================================
-- PART 1: Email Templates Table
-- =====================================================

CREATE TABLE IF NOT EXISTS soundpub.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text UNIQUE NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert copyright email templates
INSERT INTO soundpub.email_templates (template_key, subject, body_html, body_text, variables, description) VALUES
(
  'copyright_registration_submitted',
  'Pendaftaran Hak Cipta Diterima - {{legal_name}}',
  '<h2>Pendaftaran Hak Cipta Diterima</h2>
  <p>Halo <strong>{{legal_name}}</strong>,</p>
  <p>Terima kasih telah mendaftarkan karya Anda untuk perlindungan hak cipta di Soundpub.</p>
  <p><strong>Detail Pendaftaran:</strong></p>
  <ul>
    <li>Nama: {{legal_name}}</li>
    <li>Email: {{email}}</li>
    <li>Tanggal Submit: {{submitted_at}}</li>
  </ul>
  <p>Pendaftaran Anda sedang dalam antrian review. Tim kami akan menghubungi Anda segera.</p>
  <p>Terima kasih,<br>Tim Soundpub</p>',
  'Halo {{legal_name}}, Terima kasih telah mendaftarkan karya Anda untuk perlindungan hak cipta di Soundpub.',
  '["legal_name", "email", "submitted_at"]'::jsonb,
  'Email konfirmasi setelah user submit pendaftaran'
),
(
  'copyright_payment_required',
  'Pembayaran Diperlukan - Pendaftaran Hak Cipta',
  '<h2>Pembayaran Diperlukan</h2>
  <p>Halo <strong>{{legal_name}}</strong>,</p>
  <p>Untuk melanjutkan proses pendaftaran hak cipta, silakan lakukan pembayaran sebesar <strong>{{amount}}</strong>.</p>
  <p><strong>Detail Pembayaran:</strong></p>
  <ul>
    <li>Jumlah: {{amount}}</li>
    <li>Bank: {{bank_name}}</li>
    <li>No. Rekening: {{bank_account}}</li>
  </ul>
  <p>Setelah pembayaran, mohon upload bukti transfer di dashboard Anda.</p>
  <p>Terima kasih,<br>Tim Soundpub</p>',
  'Halo {{legal_name}}, Untuk melanjutkan proses pendaftaran hak cipta, silakan lakukan pembayaran sebesar {{amount}}.',
  '["legal_name", "amount", "bank_name", "bank_account"]'::jsonb,
  'Email reminder pembayaran'
),
(
  'copyright_revision_requested',
  'Revisi Diperlukan - Pendaftaran Hak Cipta',
  '<h2>Revisi Diperlukan</h2>
  <p>Halo <strong>{{legal_name}}</strong>,</p>
  <p>Tim kami telah mereview pendaftaran Anda dan memerlukan beberapa revisi.</p>
  <p><strong>Catatan Revisi:</strong></p>
  <p>{{revision_notes}}</p>
  <p>Silakan login ke dashboard Anda untuk melakukan revisi yang diperlukan.</p>
  <p>Terima kasih,<br>Tim Soundpub</p>',
  'Halo {{legal_name}}, Tim kami telah mereview pendaftaran Anda dan memerlukan beberapa revisi. Catatan: {{revision_notes}}',
  '["legal_name", "revision_notes"]'::jsonb,
  'Email notifikasi saat admin request revision'
),
(
  'copyright_approved',
  'Pendaftaran Disetujui - {{composer_code}}',
  '<h2>Pendaftaran Hak Cipta Disetujui! 🎉</h2>
  <p>Halo <strong>{{legal_name}}</strong>,</p>
  <p>Selamat! Pendaftaran hak cipta Anda telah disetujui.</p>
  <p><strong>Detail:</strong></p>
  <ul>
    <li>Composer Code: <strong>{{composer_code}}</strong></li>
    <li>Nomor Kontrak: <strong>{{contract_number}}</strong></li>
    <li>Tanggal Disetujui: {{approved_at}}</li>
  </ul>
  <p>Kontrak Anda sedang diproses dan akan segera tersedia untuk diunduh di dashboard.</p>
  <p>Terima kasih,<br>Tim Soundpub</p>',
  'Halo {{legal_name}}, Selamat! Pendaftaran hak cipta Anda telah disetujui. Composer Code: {{composer_code}}, Nomor Kontrak: {{contract_number}}',
  '["legal_name", "composer_code", "contract_number", "approved_at"]'::jsonb,
  'Email notifikasi saat pendaftaran disetujui'
),
(
  'copyright_rejected',
  'Pendaftaran Ditolak - Pendaftaran Hak Cipta',
  '<h2>Pendaftaran Ditolak</h2>
  <p>Halo <strong>{{legal_name}}</strong>,</p>
  <p>Kami mohon maaf, pendaftaran hak cipta Anda tidak dapat disetujui.</p>
  <p><strong>Alasan:</strong></p>
  <p>{{rejection_reason}}</p>
  <p>Jika Anda memiliki pertanyaan, silakan hubungi tim support kami.</p>
  <p>Terima kasih,<br>Tim Soundpub</p>',
  'Halo {{legal_name}}, Kami mohon maaf, pendaftaran hak cipta Anda tidak dapat disetujui. Alasan: {{rejection_reason}}',
  '["legal_name", "rejection_reason"]'::jsonb,
  'Email notifikasi saat pendaftaran ditolak'
),
(
  'copyright_contract_ready',
  'Kontrak Siap Download - {{contract_number}}',
  '<h2>Kontrak Hak Cipta Siap! 📄</h2>
  <p>Halo <strong>{{legal_name}}</strong>,</p>
  <p>Kontrak hak cipta Anda sudah tersedia dan siap untuk diunduh.</p>
  <p><strong>Detail Kontrak:</strong></p>
  <ul>
    <li>Nomor Kontrak: <strong>{{contract_number}}</strong></li>
    <li>Status: Bermeterai</li>
  </ul>
  <p>Silakan login ke dashboard Anda untuk mengunduh kontrak.</p>
  <p>Terima kasih,<br>Tim Soundpub</p>',
  'Halo {{legal_name}}, Kontrak hak cipta Anda sudah tersedia dan siap untuk diunduh. Nomor Kontrak: {{contract_number}}',
  '["legal_name", "contract_number"]'::jsonb,
  'Email notifikasi saat kontrak sudah bermeterai dan siap download'
),
(
  'copyright_contract_active',
  'Kontrak Aktif - Selamat Datang di Soundpub Publishing',
  '<h2>Kontrak Hak Cipta Aktif! 🎊</h2>
  <p>Halo <strong>{{legal_name}}</strong>,</p>
  <p>Kontrak hak cipta Anda telah ditandatangani dan sekarang aktif!</p>
  <p><strong>Detail:</strong></p>
  <ul>
    <li>Composer Code: <strong>{{composer_code}}</strong></li>
    <li>Nomor Kontrak: <strong>{{contract_number}}</strong></li>
    <li>Tanggal Aktif: {{signed_at}}</li>
  </ul>
  <p>Karya Anda kini terlindungi. Dashboard royalti hak cipta Anda sudah aktif dan dapat diakses.</p>
  <p>Terima kasih telah mempercayai Soundpub!</p>
  <p>Tim Soundpub</p>',
  'Halo {{legal_name}}, Kontrak hak cipta Anda telah ditandatangani dan sekarang aktif! Composer Code: {{composer_code}}, Nomor Kontrak: {{contract_number}}',
  '["legal_name", "composer_code", "contract_number", "signed_at"]'::jsonb,
  'Email notifikasi saat kontrak ditandatangani dan aktif'
);

-- =====================================================
-- PART 2: Notification Helper Function
-- =====================================================

CREATE OR REPLACE FUNCTION soundpub.create_copyright_notification(
  _user_id uuid,
  _type text,
  _title text,
  _message text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = soundpub
AS \$\$
DECLARE
  _notification_id uuid;
BEGIN
  INSERT INTO soundpub.notifications (
    user_id,
    type,
    title,
    message,
    metadata,
    created_at
  ) VALUES (
    _user_id,
    _type,
    _title,
    _message,
    _metadata,
    now()
  )
  RETURNING id INTO _notification_id;

  RETURN _notification_id;
END;
\$\$;

-- =====================================================
-- PART 3: Email Queue Function
-- =====================================================

CREATE OR REPLACE FUNCTION soundpub.queue_copyright_email(
  _template_key text,
  _recipient_email text,
  _recipient_user_id uuid,
  _variables jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = soundpub
AS \$\$
DECLARE
  _log_id uuid;
  _idempotency_key text;
BEGIN
  -- Generate idempotency key to prevent duplicate emails
  _idempotency_key := md5(_template_key || _recipient_email || _recipient_user_id::text || extract(epoch from now())::text);

  INSERT INTO soundpub.email_send_log (
    template_name,
    recipient_email,
    recipient_user_id,
    status,
    metadata,
    idempotency_key,
    created_at
  ) VALUES (
    _template_key,
    _recipient_email,
    _recipient_user_id,
    'pending',
    _variables,
    _idempotency_key,
    now()
  )
  RETURNING id INTO _log_id;

  RETURN _log_id;
END;
\$\$;

-- =====================================================
-- PART 4: Combined Notification + Email Function
-- =====================================================

CREATE OR REPLACE FUNCTION soundpub.notify_copyright_event(
  _user_id uuid,
  _event_type text,
  _registration_data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = soundpub
AS \$\$
DECLARE
  _title text;
  _message text;
  _notif_type text;
  _email_template text;
  _recipient_email text;
BEGIN
  -- Extract email
  _recipient_email := _registration_data->>'email';

  -- Map event to notification and email
  CASE _event_type
    WHEN 'submitted' THEN
      _title := 'Pendaftaran Diterima';
      _message := 'Pendaftaran hak cipta Anda telah diterima dan sedang dalam antrian review.';
      _notif_type := 'info';
      _email_template := 'copyright_registration_submitted';

    WHEN 'payment_required' THEN
      _title := 'Pembayaran Diperlukan';
      _message := 'Silakan selesaikan pembayaran untuk melanjutkan proses pendaftaran hak cipta.';
      _notif_type := 'warning';
      _email_template := 'copyright_payment_required';

    WHEN 'revision_requested' THEN
      _title := 'Revisi Diperlukan';
      _message := 'Admin meminta revisi pada pendaftaran Anda. Silakan cek catatan revisi di dashboard.';
      _notif_type := 'warning';
      _email_template := 'copyright_revision_requested';

    WHEN 'approved' THEN
      _title := 'Pendaftaran Disetujui! 🎉';
      _message := 'Selamat! Pendaftaran hak cipta Anda telah disetujui. Composer code: ' || (_registration_data->>'composer_code');
      _notif_type := 'success';
      _email_template := 'copyright_approved';

    WHEN 'rejected' THEN
      _title := 'Pendaftaran Ditolak';
      _message := 'Mohon maaf, pendaftaran Anda tidak dapat disetujui.';
      _notif_type := 'error';
      _email_template := 'copyright_rejected';

    WHEN 'contract_ready' THEN
      _title := 'Kontrak Siap Download';
      _message := 'Kontrak hak cipta Anda sudah bermeterai dan siap diunduh.';
      _notif_type := 'success';
      _email_template := 'copyright_contract_ready';

    WHEN 'contract_active' THEN
      _title := 'Kontrak Aktif! 🎊';
      _message := 'Kontrak hak cipta Anda telah ditandatangani dan sekarang aktif!';
      _notif_type := 'success';
      _email_template := 'copyright_contract_active';

    ELSE
      RETURN; -- Unknown event type, do nothing
  END CASE;

  -- Create in-app notification
  PERFORM soundpub.create_copyright_notification(
    _user_id,
    _notif_type,
    _title,
    _message,
    _registration_data
  );

  -- Queue email if recipient email exists
  IF _recipient_email IS NOT NULL AND _recipient_email != '' THEN
    PERFORM soundpub.queue_copyright_email(
      _email_template,
      _recipient_email,
      _user_id,
      _registration_data
    );
  END IF;
END;
\$\$;

-- =====================================================
-- PART 5: Permissions
-- =====================================================

GRANT EXECUTE ON FUNCTION soundpub.create_copyright_notification TO authenticated;
GRANT EXECUTE ON FUNCTION soundpub.queue_copyright_email TO authenticated;
GRANT EXECUTE ON FUNCTION soundpub.notify_copyright_event TO authenticated;

-- =====================================================
-- PART 6: Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_email_templates_key ON soundpub.email_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON soundpub.email_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_email_send_log_status ON soundpub.email_send_log(status);
CREATE INDEX IF NOT EXISTS idx_email_send_log_template ON soundpub.email_send_log(template_name);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON soundpub.email_send_log(recipient_user_id);

-- =====================================================
-- PART 7: RLS Policies for email_templates
-- =====================================================

ALTER TABLE soundpub.email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage email templates" ON soundpub.email_templates;
CREATE POLICY "Admin can manage email templates"
  ON soundpub.email_templates FOR ALL TO authenticated
  USING (soundpub.is_admin(auth.uid()))
  WITH CHECK (soundpub.is_admin(auth.uid()));

-- =====================================================
-- PART 8: Update trigger for email_templates
-- =====================================================

CREATE OR REPLACE FUNCTION soundpub.update_email_template_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS \$\$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
\$\$;

DROP TRIGGER IF EXISTS trg_email_templates_updated_at ON soundpub.email_templates;
CREATE TRIGGER trg_email_templates_updated_at
  BEFORE UPDATE ON soundpub.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION soundpub.update_email_template_timestamp();

COMMENT ON TABLE soundpub.email_templates IS 'Email templates for automated notifications';
COMMENT ON TABLE soundpub.email_send_log IS 'Log of all email send attempts';
COMMENT ON FUNCTION soundpub.notify_copyright_event IS 'Send both in-app notification and email for copyright events';
