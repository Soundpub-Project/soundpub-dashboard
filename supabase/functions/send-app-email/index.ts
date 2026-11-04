import { authenticatePrivilegedRequest, consumeRateLimit, errorResponse, HttpError, privilegedCorsHeaders as corsHeaders, readJsonObject } from '../_shared/privileged-api.ts'

const GMAIL_GATEWAY = 'https://connector-gateway.lovable.dev/google_mail/gmail/v1'
const FROM_NAME = 'Soundpub'
const FROM_EMAIL = 'publisherSoundpub@gmail.com'
const APP_URL = 'https://dashboard.Soundpub.xyz'

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sendGmail(opts: { to: string; subject: string; html: string }) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
  const GOOGLE_MAIL_API_KEY = Deno.env.get('GOOGLE_MAIL_API_KEY')
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured')
  if (!GOOGLE_MAIL_API_KEY) throw new Error('Gmail connector not linked')

  const message = [
    `From: ${FROM_NAME} <${FROM_EMAIL}>`,
    `To: ${opts.to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    opts.html,
  ].join('\r\n')

  const raw = base64UrlEncode(message)
  const res = await fetch(`${GMAIL_GATEWAY}/users/me/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': GOOGLE_MAIL_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Gmail API ${res.status}`)
  return await res.json()
}

const fmtIDR = (amount: unknown) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(amount) || 0)

function layout(title: string, accent: string, bodyHtml: string, ctaText?: string, ctaHref?: string) {
  const cta = ctaText && ctaHref ? `
    <div style="text-align:center;margin:28px 0;">
      <a href="${ctaHref}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;">${ctaText}</a>
    </div>` : ''
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#374151;margin:0;padding:0;background:#f3f4f6;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:${accent};border-radius:12px 12px 0 0;padding:30px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:22px;">${title}</h1>
      </div>
      <div style="background:#fff;border-radius:0 0 12px 12px;padding:30px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
        ${bodyHtml}
        ${cta}
        <div style="margin-top:24px;padding-top:18px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="color:#6b7280;font-size:12px;margin:0;">Email otomatis dari Soundpub. Atur preferensi email di Settings.</p>
        </div>
      </div>
    </div></body></html>`
}

// ---------------- Template registry ----------------

type TemplateOutput = { subject: string; html: string; scope: 'payout' | 'release' | 'payment' | 'announcement' | 'transactional' }

type TemplateData = Record<string, string | number | boolean | null>

const TEMPLATES: Record<string, (data: TemplateData, recipientName: string) => TemplateOutput> = {
  'payout-requested': (d, _name) => ({
    scope: 'payout',
    subject: `ðŸ”” Payout request baru â€” ${fmtIDR(d.amount)}`,
    html: layout('Pengajuan Payout Baru', 'linear-gradient(135deg,#f59e0b 0%,#ea580c 100%)', `
      <p>Ada pengajuan penarikan saldo baru menunggu review:</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6b7280;">User</td><td style="padding:8px 0;text-align:right;font-weight:600;">${d.userName}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Jumlah</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#d97706;">${fmtIDR(d.amount)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Bank</td><td style="padding:8px 0;text-align:right;">${d.bankName} â€” ${d.accountNumber}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Atas Nama</td><td style="padding:8px 0;text-align:right;">${d.accountHolderName}</td></tr>
      </table>`, 'Review di Dashboard', `${APP_URL}/admin/payouts`),
  }),
  'payout-approved': (d, name) => ({
    scope: 'payout',
    subject: `âœ… Payout disetujui â€” ${fmtIDR(d.amount)}`,
    html: layout('Payout Disetujui', 'linear-gradient(135deg,#10b981 0%,#059669 100%)', `
      <p>Halo ${name},</p>
      <p>Pengajuan penarikan saldo sebesar <strong>${fmtIDR(d.amount)}</strong> telah <strong>disetujui</strong>. Dana akan segera ditransfer ke rekening Anda.</p>
      ${d.notes ? `<p style="background:#f3f4f6;padding:12px;border-radius:8px;"><strong>Catatan admin:</strong> ${d.notes}</p>` : ''}`,
      'Lihat Status', `${APP_URL}/payouts`),
  }),
  'payout-rejected': (d, name) => ({
    scope: 'payout',
    subject: `âŒ Payout ditolak â€” ${fmtIDR(d.amount)}`,
    html: layout('Payout Ditolak', 'linear-gradient(135deg,#ef4444 0%,#dc2626 100%)', `
      <p>Halo ${name},</p>
      <p>Pengajuan penarikan saldo sebesar <strong>${fmtIDR(d.amount)}</strong> <strong>tidak disetujui</strong>.</p>
      ${d.notes ? `<p style="background:#fef2f2;padding:12px;border-radius:8px;border:1px solid #fecaca;"><strong>Alasan:</strong> ${d.notes}</p>` : ''}
      <p>Saldo Anda tidak terpotong. Anda dapat mengajukan ulang kapan saja.</p>`,
      'Buka Halaman Payout', `${APP_URL}/payouts`),
  }),
  'payout-paid': (d, name) => ({
    scope: 'payout',
    subject: `ðŸ’¸ Dana telah ditransfer â€” ${fmtIDR(d.amount)}`,
    html: layout('Dana Telah Ditransfer', 'linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%)', `
      <p>Halo ${name},</p>
      <p>Dana sebesar <strong>${fmtIDR(d.amount)}</strong> telah ditransfer ke rekening <strong>${d.bankName}</strong> (${d.accountNumber}).</p>
      <p>Mohon cek mutasi rekening Anda. Saldo akun Soundpub telah dipotong sesuai jumlah penarikan.</p>`,
      'Lihat Riwayat', `${APP_URL}/payouts`),
  }),
  'release-submitted': (d, _name) => ({
    scope: 'release',
    subject: `ðŸŽµ Release baru menunggu review: ${d.title}`,
    html: layout('Release Baru Disubmit', 'linear-gradient(135deg,#3b82f6 0%,#1d4ed8 100%)', `
      <p>Ada release baru menunggu review admin:</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6b7280;">Judul</td><td style="padding:8px 0;text-align:right;font-weight:600;">${d.title}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Artist</td><td style="padding:8px 0;text-align:right;">${d.artistName}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Disubmit oleh</td><td style="padding:8px 0;text-align:right;">${d.submittedBy}</td></tr>
      </table>`, 'Review Release', `${APP_URL}/releases`),
  }),
  'release-approved': (d, name) => ({
    scope: 'release',
    subject: `âœ… Release disetujui: ${d.title}`,
    html: layout('Release Disetujui', 'linear-gradient(135deg,#10b981 0%,#059669 100%)', `
      <p>Halo ${name},</p>
      <p>Release <strong>${d.title}</strong> telah <strong>disetujui</strong> dan akan segera dirilis ke platform.</p>`,
      'Lihat Release', `${APP_URL}/releases`),
  }),
  'release-rejected': (d, name) => ({
    scope: 'release',
    subject: `âŒ Release perlu revisi: ${d.title}`,
    html: layout('Release Perlu Revisi', 'linear-gradient(135deg,#ef4444 0%,#dc2626 100%)', `
      <p>Halo ${name},</p>
      <p>Release <strong>${d.title}</strong> belum dapat disetujui.</p>
      ${d.notes ? `<p style="background:#fef2f2;padding:12px;border-radius:8px;border:1px solid #fecaca;"><strong>Catatan:</strong> ${d.notes}</p>` : ''}`,
      'Edit Release', `${APP_URL}/releases`),
  }),
  'payment-success': (d, name) => ({
    scope: 'payment',
    subject: `âœ… Pembayaran berhasil â€” ${d.title}`,
    html: layout('Pembayaran Berhasil', 'linear-gradient(135deg,#10b981 0%,#059669 100%)', `
      <p>Halo ${name},</p>
      <p>Pembayaran untuk release <strong>${d.title}</strong> telah berhasil diterima.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:12px;">
        <tr><td style="padding:8px 0;color:#6b7280;">Jumlah Track</td><td style="padding:8px 0;text-align:right;">${d.trackCount}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Total Dibayar</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#059669;">${fmtIDR(d.amount)}</td></tr>
      </table>
      <p style="margin-top:14px;">Admin akan segera mengonfirmasi dan mengaktifkan release Anda.</p>`,
      'Lihat Release', `${APP_URL}/releases`),
  }),
  'password-reset': (d, name) => ({
    scope: 'transactional',
    subject: 'Reset password Soundpub',
    html: layout('Reset Password', 'linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%)',       `<p>Halo ${name},</p>
      <p>Kami menerima permintaan untuk mengatur ulang password akun Anda.</p>
      <p>Link ini berlaku selama 24 jam. Jika Anda tidak meminta reset password, abaikan email ini.</p>`,
      'Reset Password', String(d.resetUrl)),
  }),
  'password-reset-confirmation': (d, name) => ({
    scope: 'transactional',
    subject: 'Password Soundpub berhasil diubah',
    html: layout('Password Berhasil Diubah', 'linear-gradient(135deg,#059669 0%,#047857 100%)',       `<p>Halo ${name},</p>
      <p>Password akun Anda telah berhasil diubah.</p>
      <p>Jika Anda tidak melakukan perubahan ini, segera amankan akun Anda.</p>`,
      'Masuk ke Soundpub', String(d.loginUrl || `${APP_URL}/login`)),
  }),
  'email-verification': (d, name) => ({
    scope: 'transactional',
    subject: 'Verifikasi email Soundpub',
    html: layout('Verifikasi Email', 'linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%)',       `<p>Halo ${name},</p>
      <p>Verifikasi alamat email Anda untuk mengaktifkan fitur akun Soundpub.</p>
      <p>Link ini berlaku selama 7 hari.</p>`,
      'Verifikasi Email', String(d.verifyUrl)),
  }),
  'announcement': (d, name) => ({
    scope: 'announcement',
    subject: `ðŸ“¢ ${d.title}`,
    html: layout(String(d.title), 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)', `
      <p>Halo ${name},</p>
      <div style="white-space:pre-wrap;background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0;">${d.message}</div>`,
      'Buka Dashboard', APP_URL),
  }),
}

const SCOPE_TO_OPTIN: Record<Exclude<TemplateOutput['scope'], 'transactional'>, string> = {
  payout: 'email_notif_payout',
  release: 'email_notif_release',
  payment: 'email_notif_payment',
  announcement: 'email_notif_announcement',
}

interface SendInput {
  templateName: string
  recipientUserId?: string
  recipientEmail?: string
  templateData: TemplateData
  idempotencyKey?: string
  // For broadcast (announcement): if true, fan out to all opt-in users with the given role filter
  broadcastRoles?: string[] | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ROLES = ['superadmin', 'admin', 'label', 'whitelabel', 'artist', 'copyright']
const INTERNAL_TEMPLATES = ['password-reset', 'password-reset-confirmation', 'email-verification', 'payment-success']
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)

function validateInput(value: Record<string, unknown>): SendInput {
  if (typeof value.templateName !== 'string' || !Object.hasOwn(TEMPLATES, value.templateName) ||
    !value.templateData || typeof value.templateData !== 'object' || Array.isArray(value.templateData)) {
    throw new HttpError(400, 'Invalid email request')
  }
  for (const item of Object.values(value.templateData)) {
    if (item !== null && typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') throw new HttpError(400, 'Invalid template data')
    if ((typeof item === 'string' && item.length > 8000) || (typeof item === 'number' && !Number.isFinite(item))) throw new HttpError(400, 'Invalid template data')
  }
  if (value.recipientUserId !== undefined && (typeof value.recipientUserId !== 'string' || !UUID.test(value.recipientUserId))) throw new HttpError(400, 'Invalid recipient')
  if (value.recipientEmail !== undefined && (typeof value.recipientEmail !== 'string' || !/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(value.recipientEmail))) throw new HttpError(400, 'Invalid recipient')
  if (value.broadcastRoles != null && (!Array.isArray(value.broadcastRoles) || value.broadcastRoles.length === 0 || value.broadcastRoles.length > ROLES.length || value.broadcastRoles.some(role => !ROLES.includes(role)))) throw new HttpError(400, 'Invalid roles')
  if ([value.recipientUserId !== undefined, value.recipientEmail !== undefined, value.broadcastRoles != null].filter(Boolean).length !== 1) throw new HttpError(400, 'Choose one recipient selector')
  if (value.idempotencyKey !== undefined && (typeof value.idempotencyKey !== 'string' || !/^[\w:.-]{1,200}$/.test(value.idempotencyKey))) throw new HttpError(400, 'Invalid idempotency key')
  const input = value as unknown as SendInput
  if (input.broadcastRoles) input.broadcastRoles = [...new Set(input.broadcastRoles)].sort()
  const requiredStrings: Record<string, string[]> = {
    'payout-requested': ['bankName', 'accountNumber', 'accountHolderName'],
    'announcement': ['title', 'message'],
    'payment-success': ['title'],
  }
  if ((requiredStrings[input.templateName] || []).some(field => typeof input.templateData[field] !== 'string' || !String(input.templateData[field]).trim())) throw new HttpError(400, 'Missing template data')
  if (['payout-requested', 'payment-success'].includes(input.templateName) &&
    (!['number', 'string'].includes(typeof input.templateData.amount) || !String(input.templateData.amount).trim() || !Number.isFinite(Number(input.templateData.amount)) || Number(input.templateData.amount) <= 0)) throw new HttpError(400, 'Invalid amount')
  if (input.templateName === 'payment-success' && (!Number.isInteger(input.templateData.trackCount) || Number(input.templateData.trackCount) < 1)) throw new HttpError(400, 'Invalid track count')
  for (const field of ['resetUrl', 'verifyUrl', 'loginUrl']) {
    if (input.templateData[field] === undefined) continue
    try {
      const target = new URL(String(input.templateData[field]))
      const paths: Record<string, string> = { resetUrl: '/reset-password', verifyUrl: '/verify-email', loginUrl: '/login' }
      if (typeof input.templateData[field] !== 'string' || target.protocol !== 'https:' || target.username || target.password ||
        target.origin !== new URL(Deno.env.get('APP_URL') || APP_URL).origin || target.pathname !== paths[field]) throw new Error('Invalid URL')
    } catch {
      throw new HttpError(400, 'Invalid action URL')
    }
  }
  if ((input.templateName === 'password-reset' && !input.templateData.resetUrl) ||
    (input.templateName === 'email-verification' && !input.templateData.verifyUrl) ||
    (input.templateName === 'announcement' && (!input.templateData.title || !input.templateData.message))) throw new HttpError(400, 'Missing template data')
  return input
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { supabase, actor } = await authenticatePrivilegedRequest(req, true)
    const input = validateInput(await readJsonObject(req))
    if (actor.internal) {
      if (!INTERNAL_TEMPLATES.includes(input.templateName) || !input.recipientUserId) throw new HttpError(403, 'Forbidden')
    } else if (input.templateName === 'announcement') {
      if (!['admin', 'superadmin'].includes(actor.role) || !input.broadcastRoles) throw new HttpError(403, 'Forbidden')
    } else if (input.templateName === 'payout-requested' && ROLES.includes(actor.role)) {
      if (input.recipientEmail || input.recipientUserId || !input.broadcastRoles || input.broadcastRoles.length !== 2 ||
        !['superadmin', 'admin'].every(role => input.broadcastRoles!.includes(role))) throw new HttpError(403, 'Forbidden')
      const { data: payout, error } = await supabase.from('payout_requests')
        .select('id, amount, bank_name, account_number, account_holder_name')
        .eq('user_id', actor.id).eq('status', 'pending')
        .eq('amount', input.templateData.amount).eq('bank_name', input.templateData.bankName)
        .eq('account_number', input.templateData.accountNumber).eq('account_holder_name', input.templateData.accountHolderName)
        .gte('created_at', new Date(Date.now() - 15 * 60000).toISOString())
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (error) throw new HttpError(503, 'Service unavailable')
      if (!payout) throw new HttpError(403, 'Forbidden')
      input.templateData = { userName: actor.name, amount: payout.amount, bankName: payout.bank_name, accountNumber: payout.account_number, accountHolderName: payout.account_holder_name }
      input.idempotencyKey = `payout-requested-${payout.id}`
    } else {
      throw new HttpError(403, 'Forbidden')
    }
    if (!Deno.env.get('LOVABLE_API_KEY') || !Deno.env.get('GOOGLE_MAIL_API_KEY')) throw new HttpError(503, 'Email provider unavailable')
    await consumeRateLimit(supabase, actor.id, 'send-app-email', actor.internal ? 60 : 10, 1)
    const tpl = TEMPLATES[input.templateName]

    // Idempotency short-circuit
    if (input.idempotencyKey) {
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([actor.id, input.templateName, input.recipientUserId, input.broadcastRoles, input.idempotencyKey])))
      const identifier = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
      input.idempotencyKey = identifier
      let duplicateQuery = supabase
        .from('email_send_log')
        .select('id')
        .eq('idempotency_key', input.idempotencyKey)
        .eq('template_name', input.templateName)
        .eq('status', 'sent')
        .limit(1)
      if (input.recipientUserId) duplicateQuery = duplicateQuery.eq('recipient_user_id', input.recipientUserId)
      const { data: existing, error } = await duplicateQuery
      if (error) throw new HttpError(503, 'Service unavailable')
      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({ skipped: true, reason: 'idempotent_duplicate' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      try {
        await consumeRateLimit(supabase, identifier, 'email-idempotency', 1, 24 * 60)
      } catch (error) {
        if (error instanceof HttpError && error.status === 429) throw new HttpError(409, 'Duplicate request')
        throw error
      }
    }

    // Resolve recipient list
    type Recipient = { user_id: string | null; email: string; full_name: string; optin: boolean }
    let recipients: Recipient[] = []
    const scope = tpl({}, '').scope
    const optinCol = scope === 'transactional' ? null : SCOPE_TO_OPTIN[scope]
    const profileFields = ['id', 'email', 'full_name', optinCol].filter(Boolean).join(', ')

    if (input.broadcastRoles && input.broadcastRoles.length > 0) {
      // Fan out
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', input.broadcastRoles)
      if (rolesError) throw new HttpError(503, 'Service unavailable')
      const userIds = [...new Set((roles || []).map(role => role.user_id))]
      if (userIds.length === 0) {
        return new Response(JSON.stringify({ sent: 0, suppressed: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data: profs, error: profilesError } = await supabase
        .from('profiles')
        .select(profileFields)
        .in('id', userIds)
      if (profilesError) throw new HttpError(503, 'Service unavailable')
      recipients = ((profs || []) as unknown as Array<Record<string, unknown>>)
        .filter(profile => !!profile.email)
        .map(profile => ({ user_id: String(profile.id), email: String(profile.email), full_name: String(profile.full_name || 'User'), optin: !optinCol || profile[optinCol] !== false }))
    } else if (input.recipientUserId) {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select(profileFields)
        .eq('id', input.recipientUserId)
        .maybeSingle()
      if (profileError) throw new HttpError(503, 'Service unavailable')
      const profile = profileData as unknown as Record<string, unknown> | null
      if (profile?.email) {
        recipients = [{ user_id: String(profile.id), email: String(profile.email), full_name: String(profile.full_name || 'User'), optin: !optinCol || profile[optinCol] !== false }]
      }
    } else if (input.recipientEmail) {
      // Direct send (no opt-in check â€” only used for admin notifications by user_id lookup)
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select(['id', 'full_name', optinCol].filter(Boolean).join(', '))
        .eq('email', input.recipientEmail)
        .maybeSingle()
      if (profileError) throw new HttpError(503, 'Service unavailable')
      const profile = profileData as unknown as Record<string, unknown> | null
      recipients = [{
        user_id: profile ? String(profile.id) : null,
        email: input.recipientEmail,
        full_name: String(profile?.full_name || 'User'),
        optin: !optinCol || !profile || profile[optinCol] !== false,
      }]
    }

    let sent = 0, suppressed = 0, failed = 0
    const templateData = Object.fromEntries(Object.entries(input.templateData).map(([key, value]) => [key, typeof value === 'string' ? escapeHtml(value) : value]))
    for (const recipient of recipients) {
      if (!/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(recipient.email)) throw new HttpError(400, 'Invalid recipient')
      if (!recipient.optin) {
        suppressed++
        await supabase.from('email_send_log').insert({
          template_name: input.templateName,
          recipient_email: recipient.email,
          recipient_user_id: recipient.user_id,
          status: 'suppressed',
          metadata: { reason: 'opt_out' },
          idempotency_key: input.idempotencyKey || null,
        })
        continue
      }
      const rendered = tpl(templateData, escapeHtml(recipient.full_name))
      try {
        await sendGmail({ to: recipient.email, subject: rendered.subject, html: rendered.html })
        sent++
        await supabase.from('email_send_log').insert({
          template_name: input.templateName,
          recipient_email: recipient.email,
          recipient_user_id: recipient.user_id,
          status: 'sent',
          idempotency_key: input.idempotencyKey || null,
          metadata: scope === 'transactional' ? {} : input.templateData,
        })
        // Throttle: 300ms between sends to be polite with Gmail quota
        if (recipients.length > 1) await new Promise((res) => setTimeout(res, 300))
      } catch {
        failed++
        await supabase.from('email_send_log').insert({
          template_name: input.templateName,
          recipient_email: recipient.email,
          recipient_user_id: recipient.user_id,
          status: 'failed',
          error_message: 'Email delivery failed',
          idempotency_key: input.idempotencyKey || null,
        })
      }
    }

    return new Response(JSON.stringify({ sent, suppressed, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return errorResponse(error)
  }
})
