// ============================================================
// NEW EMAIL TEMPLATES FOR AUTH VERIFICATION SYSTEM
// ============================================================
// Add these templates to your send-app-email/index.ts file
// Location: supabase/functions/send-app-email/index.ts

// 1. Add 'security' to SCOPE_TO_OPTIN mapping
const SCOPE_TO_OPTIN = {
  payout: 'email_notif_payout',
  release: 'email_notif_release',
  payment: 'email_notif_payment',
  announcement: 'email_notif_announcement',
  security: 'email_notif_announcement', // Use announcement opt-in for security emails
}

// 2. Add these three templates to your TEMPLATES object:

TEMPLATES['password-reset'] = (data, recipientName) => ({
  scope: 'security',
  subject: '🔐 Reset Password Anda - SoundPub',
  html: layout(
    'Reset Password',
    'linear-gradient(135deg,#ef4444 0%,#dc2626 100%)',
    `
      <p>Hai <strong>${recipientName}</strong>,</p>
      <p>Kami menerima permintaan untuk reset password akun SoundPub Anda.</p>
      <p>Klik tombol di bawah untuk membuat password baru:</p>
    `,
    'Reset Password',
    data.resetUrl
  ) + `
      <p style="color:#6b7280;font-size:14px;margin-top:20px;">
        Link ini berlaku selama <strong>24 jam</strong>.<br>
        Jika Anda tidak meminta reset password, abaikan email ini.
      </p>
      <p style="color:#6b7280;font-size:12px;margin-top:20px;">
        Atau copy link berikut:<br>
        <code style="background:#f3f4f6;padding:4px 8px;border-radius:4px;word-break:break-all;">
          ${data.resetUrl}
        </code>
      </p>
    </div></div></body></html>
  `
});

TEMPLATES['email-verification'] = (data, recipientName) => ({
  scope: 'security',
  subject: '✅ Verifikasi Email Anda - SoundPub',
  html: layout(
    'Verifikasi Email',
    'linear-gradient(135deg,#10b981 0%,#059669 100%)',
    `
      <p>Hai <strong>${recipientName}</strong>,</p>
      <p>Terima kasih telah mendaftar di SoundPub! 🎵</p>
      <p>Klik tombol di bawah untuk verifikasi email Anda:</p>
    `,
    'Verifikasi Email',
    data.verifyUrl
  ) + `
      <p style="color:#6b7280;font-size:14px;margin-top:20px;">
        Link ini berlaku selama <strong>7 hari</strong>.<br>
        Jika Anda tidak mendaftar, abaikan email ini.
      </p>
      <p style="color:#6b7280;font-size:12px;margin-top:20px;">
        Atau copy link berikut:<br>
        <code style="background:#f3f4f6;padding:4px 8px;border-radius:4px;word-break:break-all;">
          ${data.verifyUrl}
        </code>
      </p>
    </div></div></body></html>
  `
});

TEMPLATES['password-reset-confirmation'] = (data, recipientName) => ({
  scope: 'security',
  subject: '✅ Password Berhasil Direset - SoundPub',
  html: layout(
    'Password Berhasil Direset',
    'linear-gradient(135deg,#10b981 0%,#059669 100%)',
    `
      <p>Hai <strong>${recipientName}</strong>,</p>
      <p>Password akun SoundPub Anda telah berhasil direset.</p>
      <p style="color:#6b7280;font-size:14px;margin-top:16px;">
        <strong>Waktu:</strong> ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}<br>
        <strong>IP Address:</strong> ${data.ipAddress || 'N/A'}
      </p>
      <p style="color:#ef4444;font-size:14px;margin-top:20px;">
        ⚠️ <strong>Jika Anda tidak melakukan perubahan ini</strong>, segera hubungi tim kami dan ganti password Anda.
      </p>
    `,
    'Login Sekarang',
    data.loginUrl
  ) + `
    </div></div></body></html>
  `
});

// ============================================================
// INTEGRATION INSTRUCTIONS
// ============================================================
/*
1. Open: supabase/functions/send-app-email/index.ts

2. Find the SCOPE_TO_OPTIN object and add:
   security: 'email_notif_announcement'

3. Find the TEMPLATES object and add all three templates above

4. Save the file

5. Test locally:
   supabase functions serve send-app-email

6. Deploy:
   supabase functions deploy send-app-email
*/
