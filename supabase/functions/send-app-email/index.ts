import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { buildCorsHeaders } from '../_shared/cors.ts'
import { AuthError, escapeHtml, requireUser, verifyServiceRole, type AppRole } from '../_shared/auth.ts'
const getDatabaseSchema = () => Deno.env.get('DATABASE_SCHEMA') || Deno.env.get('SUPABASE_DB_SCHEMA') || 'Soundpub'

const createSoundpubClient = (supabaseUrl: string, supabaseKey: string, options: any = {}) => {
  const existingDb = options.db || {}
  return createClient(supabaseUrl, supabaseKey, {
    ...options,
    db: { ...existingDb, schema: getDatabaseSchema() },
  })
}


const GMAIL_GATEWAY = 'https://connector-gateway.lovable.dev/google_mail/gmail/v1'
const FROM_NAME = 'Soundpub'
const FROM_EMAIL = 'publisherSoundpub@gmail.com'
const APP_URL = 'https://dashboard.Soundpub.xyz'

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
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
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${await res.text()}`)
  return await res.json()
}

const fmtIDR = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n) || 0)

/**
 * Only absolute http(s) links may reach an `href`. Anything else (javascript:,
 * data:, a relative value an attacker controls) is dropped so the CTA cannot be
 * turned into script execution or a credential-phishing target.
 */
function safeHref(href: string | undefined): string | null {
  if (!href) return null
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  return url.toString()
}

function layout(title: string, accent: string, bodyHtml: string, ctaText?: string, ctaHref?: string) {
  const href = safeHref(ctaHref)
  const cta = ctaText && href ? `
    <div style="text-align:center;margin:28px 0;">
      <a href="${escapeHtml(href)}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;">${escapeHtml(ctaText)}</a>
    </div>` : ''
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#374151;margin:0;padding:0;background:#f3f4f6;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:${accent};border-radius:12px 12px 0 0;padding:30px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:22px;">${escapeHtml(title)}</h1>
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

/**
 * Every interpolated value below comes from a caller-supplied `templateData`
 * object, so it is escaped. `e` is the short alias used throughout the registry.
 */
const e = escapeHtml

const TEMPLATES: Record<string, (data: any, recipientName: string) => TemplateOutput> = {
  'payout-requested': (d, _name) => ({
    scope: 'payout',
    subject: `ðŸ”” Payout request baru â€” ${fmtIDR(d.amount)}`,
    html: layout('Pengajuan Payout Baru', 'linear-gradient(135deg,#f59e0b 0%,#ea580c 100%)', `
      <p>Ada pengajuan penarikan saldo baru menunggu review:</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6b7280;">User</td><td style="padding:8px 0;text-align:right;font-weight:600;">${e(d.userName)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Jumlah</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#d97706;">${fmtIDR(d.amount)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Bank</td><td style="padding:8px 0;text-align:right;">${e(d.bankName)} â€” ${e(d.accountNumber)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Atas Nama</td><td style="padding:8px 0;text-align:right;">${e(d.accountHolderName)}</td></tr>
      </table>`, 'Review di Dashboard', `${APP_URL}/admin/payouts`),
  }),
  'payout-approved': (d, name) => ({
    scope: 'payout',
    subject: `âœ… Payout disetujui â€” ${fmtIDR(d.amount)}`,
    html: layout('Payout Disetujui', 'linear-gradient(135deg,#10b981 0%,#059669 100%)', `
      <p>Halo ${e(name)},</p>
      <p>Pengajuan penarikan saldo sebesar <strong>${fmtIDR(d.amount)}</strong> telah <strong>disetujui</strong>. Dana akan segera ditransfer ke rekening Anda.</p>
      ${d.notes ? `<p style="background:#f3f4f6;padding:12px;border-radius:8px;"><strong>Catatan admin:</strong> ${e(d.notes)}</p>` : ''}`,
      'Lihat Status', `${APP_URL}/payouts`),
  }),
  'payout-rejected': (d, name) => ({
    scope: 'payout',
    subject: `âŒ Payout ditolak â€” ${fmtIDR(d.amount)}`,
    html: layout('Payout Ditolak', 'linear-gradient(135deg,#ef4444 0%,#dc2626 100%)', `
      <p>Halo ${e(name)},</p>
      <p>Pengajuan penarikan saldo sebesar <strong>${fmtIDR(d.amount)}</strong> <strong>tidak disetujui</strong>.</p>
      ${d.notes ? `<p style="background:#fef2f2;padding:12px;border-radius:8px;border:1px solid #fecaca;"><strong>Alasan:</strong> ${e(d.notes)}</p>` : ''}
      <p>Saldo Anda tidak terpotong. Anda dapat mengajukan ulang kapan saja.</p>`,
      'Buka Halaman Payout', `${APP_URL}/payouts`),
  }),
  'payout-paid': (d, name) => ({
    scope: 'payout',
    subject: `ðŸ’¸ Dana telah ditransfer â€” ${fmtIDR(d.amount)}`,
    html: layout('Dana Telah Ditransfer', 'linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%)', `
      <p>Halo ${e(name)},</p>
      <p>Dana sebesar <strong>${fmtIDR(d.amount)}</strong> telah ditransfer ke rekening <strong>${e(d.bankName)}</strong> (${e(d.accountNumber)}).</p>
      <p>Mohon cek mutasi rekening Anda. Saldo akun Soundpub telah dipotong sesuai jumlah penarikan.</p>`,
      'Lihat Riwayat', `${APP_URL}/payouts`),
  }),
  'release-submitted': (d, _name) => ({
    scope: 'release',
    subject: `ðŸŽµ Release baru menunggu review: ${d.title}`,
    html: layout('Release Baru Disubmit', 'linear-gradient(135deg,#3b82f6 0%,#1d4ed8 100%)', `
      <p>Ada release baru menunggu review admin:</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6b7280;">Judul</td><td style="padding:8px 0;text-align:right;font-weight:600;">${e(d.title)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Artist</td><td style="padding:8px 0;text-align:right;">${e(d.artistName)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Disubmit oleh</td><td style="padding:8px 0;text-align:right;">${e(d.submittedBy)}</td></tr>
      </table>`, 'Review Release', `${APP_URL}/releases`),
  }),
  'release-approved': (d, name) => ({
    scope: 'release',
    subject: `âœ… Release disetujui: ${d.title}`,
    html: layout('Release Disetujui', 'linear-gradient(135deg,#10b981 0%,#059669 100%)', `
      <p>Halo ${e(name)},</p>
      <p>Release <strong>${e(d.title)}</strong> telah <strong>disetujui</strong> dan akan segera dirilis ke platform.</p>`,
      'Lihat Release', `${APP_URL}/releases`),
  }),
  'release-rejected': (d, name) => ({
    scope: 'release',
    subject: `âŒ Release perlu revisi: ${d.title}`,
    html: layout('Release Perlu Revisi', 'linear-gradient(135deg,#ef4444 0%,#dc2626 100%)', `
      <p>Halo ${e(name)},</p>
      <p>Release <strong>${e(d.title)}</strong> belum dapat disetujui.</p>
      ${d.notes ? `<p style="background:#fef2f2;padding:12px;border-radius:8px;border:1px solid #fecaca;"><strong>Catatan:</strong> ${e(d.notes)}</p>` : ''}`,
      'Edit Release', `${APP_URL}/releases`),
  }),
  'payment-success': (d, name) => ({
    scope: 'payment',
    subject: `âœ… Pembayaran berhasil â€” ${d.title}`,
    html: layout('Pembayaran Berhasil', 'linear-gradient(135deg,#10b981 0%,#059669 100%)', `
      <p>Halo ${e(name)},</p>
      <p>Pembayaran untuk release <strong>${e(d.title)}</strong> telah berhasil diterima.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:12px;">
        <tr><td style="padding:8px 0;color:#6b7280;">Jumlah Track</td><td style="padding:8px 0;text-align:right;">${e(d.trackCount)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Total Dibayar</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#059669;">${fmtIDR(d.amount)}</td></tr>
      </table>
      <p style="margin-top:14px;">Admin akan segera mengonfirmasi dan mengaktifkan release Anda.</p>`,
      'Lihat Release', `${APP_URL}/releases`),
  }),
  'password-reset': (d, name) => ({
    scope: 'transactional',
    subject: 'Reset password Soundpub',
    html: layout('Reset Password', 'linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%)',       `<p>Halo ${e(name)},</p>
      <p>Kami menerima permintaan untuk mengatur ulang password akun Anda.</p>
      <p>Link ini berlaku selama 24 jam. Jika Anda tidak meminta reset password, abaikan email ini.</p>`,
      'Reset Password', d.resetUrl),
  }),
  'password-reset-confirmation': (d, name) => ({
    scope: 'transactional',
    subject: 'Password Soundpub berhasil diubah',
    html: layout('Password Berhasil Diubah', 'linear-gradient(135deg,#059669 0%,#047857 100%)',       `<p>Halo ${e(name)},</p>
      <p>Password akun Anda telah berhasil diubah.</p>
      <p>Jika Anda tidak melakukan perubahan ini, segera amankan akun Anda.</p>`,
      'Masuk ke Soundpub', d.loginUrl || `${APP_URL}/login`),
  }),
  'email-verification': (d, name) => ({
    scope: 'transactional',
    subject: 'Verifikasi email Soundpub',
    html: layout('Verifikasi Email', 'linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%)',       `<p>Halo ${e(name)},</p>
      <p>Verifikasi alamat email Anda untuk mengaktifkan fitur akun Soundpub.</p>
      <p>Link ini berlaku selama 7 hari.</p>`,
      'Verifikasi Email', d.verifyUrl),
  }),
  'announcement': (d, name) => ({
    scope: 'announcement',
    subject: `ðŸ“¢ ${d.title}`,
    html: layout(String(d.title ?? ''), 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)', `
      <p>Halo ${e(name)},</p>
      <div style="white-space:pre-wrap;background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0;">${e(d.message)}</div>`,
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
  templateData: Record<string, any>
  idempotencyKey?: string
  // For broadcast (announcement): if true, fan out to all opt-in users with the given role filter
  broadcastRoles?: string[] | null
}

// ---------------- Authorization ----------------

/**
 * This function holds the service role and can mail anyone, so who may ask for
 * what is pinned down per template:
 *
 *   internal  — only another Edge Function (service-role key). These carry
 *               secrets (reset links, verification links) or assert a payment
 *               happened, so no browser may ever trigger them.
 *   admin     — `admin` / `superadmin` session. Covers fan-outs and any send
 *               that states an admin decision.
 *   selfBroadcastToAdmins — any signed-in user, but only to notify admins, and
 *               the recipient set is fixed server-side (the caller cannot pick
 *               it) because a regular user legitimately files payout requests.
 */
type Policy = 'internal' | 'admin' | 'selfBroadcastToAdmins'

const TEMPLATE_POLICY: Record<string, Policy> = {
  'password-reset': 'internal',
  'password-reset-confirmation': 'internal',
  'email-verification': 'internal',
  'payment-success': 'internal',
  'payout-requested': 'selfBroadcastToAdmins',
  'payout-approved': 'admin',
  'payout-rejected': 'admin',
  'payout-paid': 'admin',
  'release-submitted': 'admin',
  'release-approved': 'admin',
  'release-rejected': 'admin',
  'announcement': 'admin',
}

const ADMIN_ROLES: AppRole[] = ['superadmin', 'admin']

async function resolveCallerName(supabase: any, userId: string, fallback: string | null): Promise<string> {
  const { data } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle()
  return data?.full_name || fallback || 'User'
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createSoundpubClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const input: SendInput = await req.json()
    const tpl = TEMPLATES[input.templateName]
    const policy = TEMPLATE_POLICY[input.templateName]
    if (!tpl || !policy) {
      return new Response(JSON.stringify({ error: `Unknown template: ${input.templateName}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const isInternal = verifyServiceRole(req)
    if (!isInternal) {
      if (policy === 'internal') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      try {
        const caller = await requireUser(req)
        if (policy === 'admin') {
          if (!caller.role || !ADMIN_ROLES.includes(caller.role)) {
            throw new AuthError('Forbidden', 403)
          }
        } else {
          // selfBroadcastToAdmins: ignore whatever routing the client sent and
          // pin the send to the admins, so this cannot be used as a mailer.
          input.recipientEmail = undefined
          input.recipientUserId = undefined
          input.broadcastRoles = ['superadmin', 'admin']
          // The caller's own identity is authoritative; a client-supplied
          // `userName` would let anyone spoof who filed the request.
          input.templateData = {
            ...(input.templateData || {}),
            userName: await resolveCallerName(supabase, caller.id, caller.email),
          }
        }
      } catch (error) {
        const status = error instanceof AuthError ? error.status : 401
        return new Response(JSON.stringify({ error: status === 403 ? 'Forbidden' : 'Unauthorized' }), {
          status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Idempotency short-circuit
    if (input.idempotencyKey) {
      const { data: existing } = await supabase
        .from('email_send_log')
        .select('id')
        .eq('idempotency_key', input.idempotencyKey)
        .eq('status', 'sent')
        .limit(1)
      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({ skipped: true, reason: 'idempotent_duplicate' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
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
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', input.broadcastRoles)
      const userIds = [...new Set((roles || []).map((r: any) => r.user_id))]
      if (userIds.length === 0) {
        return new Response(JSON.stringify({ sent: 0, suppressed: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data: profs } = await supabase
        .from('profiles')
        .select(profileFields)
        .in('id', userIds)
      recipients = (profs || [])
        .filter((p: any) => !!p.email)
        .map((p: any) => ({ user_id: p.id, email: p.email, full_name: p.full_name || 'User', optin: !optinCol || p[optinCol] !== false }))
    } else if (input.recipientUserId) {
      const { data: p } = await supabase
        .from('profiles')
        .select(`id, email, full_name, ${optinCol}`)
        .eq('id', input.recipientUserId)
        .maybeSingle()
      if (p && (p as any).email) {
        recipients = [{ user_id: (p as any).id, email: (p as any).email, full_name: (p as any).full_name || 'User', optin: !optinCol || (p as any)[optinCol] !== false }]
      }
    } else if (input.recipientEmail) {
      // Direct send (no opt-in check â€” only used for admin notifications by user_id lookup)
      const { data: p } = await supabase
        .from('profiles')
        .select(['id', 'full_name', optinCol].filter(Boolean).join(', '))
        .eq('email', input.recipientEmail)
        .maybeSingle()
      recipients = [{
        user_id: p ? (p as any).id : null,
        email: input.recipientEmail,
        full_name: p ? ((p as any).full_name || 'User') : 'User',
        optin: !optinCol || !p || (p as any)[optinCol] !== false,
      }]
    }

    let sent = 0, suppressed = 0, failed = 0
    for (const r of recipients) {
      if (!r.optin) {
        suppressed++
        await supabase.from('email_send_log').insert({
          template_name: input.templateName,
          recipient_email: r.email,
          recipient_user_id: r.user_id,
          status: 'suppressed',
          metadata: { reason: 'opt_out' },
          idempotency_key: input.idempotencyKey || null,
        })
        continue
      }
      const rendered = tpl(input.templateData || {}, r.full_name)
      try {
        await sendGmail({ to: r.email, subject: rendered.subject, html: rendered.html })
        sent++
        await supabase.from('email_send_log').insert({
          template_name: input.templateName,
          recipient_email: r.email,
          recipient_user_id: r.user_id,
          status: 'sent',
          idempotency_key: input.idempotencyKey || null,
          metadata: input.templateData || {},
        })
        // Throttle: 300ms between sends to be polite with Gmail quota
        if (recipients.length > 1) await new Promise((res) => setTimeout(res, 300))
      } catch (err: any) {
        failed++
        console.error('Send failed:', err?.message || err)
        await supabase.from('email_send_log').insert({
          template_name: input.templateName,
          recipient_email: r.email,
          recipient_user_id: r.user_id,
          status: 'failed',
          error_message: String(err?.message || err).slice(0, 500),
          idempotency_key: input.idempotencyKey || null,
        })
      }
    }

    return new Response(JSON.stringify({ sent, suppressed, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('send-app-email error:', err)
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})