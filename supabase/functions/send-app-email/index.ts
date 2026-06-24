import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GMAIL_GATEWAY = 'https://connector-gateway.lovable.dev/google_mail/gmail/v1'
const FROM_NAME = 'Soundpub'
const FROM_EMAIL = 'publishersoundpub@gmail.com'
const APP_URL = 'https://dashboard.soundpub.xyz'

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
  })
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${await res.text()}`)
  return await res.json()
}

const fmtIDR = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n) || 0)

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

type TemplateOutput = { subject: string; html: string; scope: 'payout' | 'release' | 'payment' | 'announcement' }

const TEMPLATES: Record<string, (data: any, recipientName: string) => TemplateOutput> = {
  'payout-requested': (d, _name) => ({
    scope: 'payout',
    subject: `🔔 Payout request baru — ${fmtIDR(d.amount)}`,
    html: layout('Pengajuan Payout Baru', 'linear-gradient(135deg,#f59e0b 0%,#ea580c 100%)', `
      <p>Ada pengajuan penarikan saldo baru menunggu review:</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6b7280;">User</td><td style="padding:8px 0;text-align:right;font-weight:600;">${d.userName}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Jumlah</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#d97706;">${fmtIDR(d.amount)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Bank</td><td style="padding:8px 0;text-align:right;">${d.bankName} — ${d.accountNumber}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Atas Nama</td><td style="padding:8px 0;text-align:right;">${d.accountHolderName}</td></tr>
      </table>`, 'Review di Dashboard', `${APP_URL}/admin/payouts`),
  }),
  'payout-approved': (d, name) => ({
    scope: 'payout',
    subject: `✅ Payout disetujui — ${fmtIDR(d.amount)}`,
    html: layout('Payout Disetujui', 'linear-gradient(135deg,#10b981 0%,#059669 100%)', `
      <p>Halo ${name},</p>
      <p>Pengajuan penarikan saldo sebesar <strong>${fmtIDR(d.amount)}</strong> telah <strong>disetujui</strong>. Dana akan segera ditransfer ke rekening Anda.</p>
      ${d.notes ? `<p style="background:#f3f4f6;padding:12px;border-radius:8px;"><strong>Catatan admin:</strong> ${d.notes}</p>` : ''}`,
      'Lihat Status', `${APP_URL}/payouts`),
  }),
  'payout-rejected': (d, name) => ({
    scope: 'payout',
    subject: `❌ Payout ditolak — ${fmtIDR(d.amount)}`,
    html: layout('Payout Ditolak', 'linear-gradient(135deg,#ef4444 0%,#dc2626 100%)', `
      <p>Halo ${name},</p>
      <p>Pengajuan penarikan saldo sebesar <strong>${fmtIDR(d.amount)}</strong> <strong>tidak disetujui</strong>.</p>
      ${d.notes ? `<p style="background:#fef2f2;padding:12px;border-radius:8px;border:1px solid #fecaca;"><strong>Alasan:</strong> ${d.notes}</p>` : ''}
      <p>Saldo Anda tidak terpotong. Anda dapat mengajukan ulang kapan saja.</p>`,
      'Buka Halaman Payout', `${APP_URL}/payouts`),
  }),
  'payout-paid': (d, name) => ({
    scope: 'payout',
    subject: `💸 Dana telah ditransfer — ${fmtIDR(d.amount)}`,
    html: layout('Dana Telah Ditransfer', 'linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%)', `
      <p>Halo ${name},</p>
      <p>Dana sebesar <strong>${fmtIDR(d.amount)}</strong> telah ditransfer ke rekening <strong>${d.bankName}</strong> (${d.accountNumber}).</p>
      <p>Mohon cek mutasi rekening Anda. Saldo akun Soundpub telah dipotong sesuai jumlah penarikan.</p>`,
      'Lihat Riwayat', `${APP_URL}/payouts`),
  }),
  'release-submitted': (d, _name) => ({
    scope: 'release',
    subject: `🎵 Release baru menunggu review: ${d.title}`,
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
    subject: `✅ Release disetujui: ${d.title}`,
    html: layout('Release Disetujui', 'linear-gradient(135deg,#10b981 0%,#059669 100%)', `
      <p>Halo ${name},</p>
      <p>Release <strong>${d.title}</strong> telah <strong>disetujui</strong> dan akan segera dirilis ke platform.</p>`,
      'Lihat Release', `${APP_URL}/releases`),
  }),
  'release-rejected': (d, name) => ({
    scope: 'release',
    subject: `❌ Release perlu revisi: ${d.title}`,
    html: layout('Release Perlu Revisi', 'linear-gradient(135deg,#ef4444 0%,#dc2626 100%)', `
      <p>Halo ${name},</p>
      <p>Release <strong>${d.title}</strong> belum dapat disetujui.</p>
      ${d.notes ? `<p style="background:#fef2f2;padding:12px;border-radius:8px;border:1px solid #fecaca;"><strong>Catatan:</strong> ${d.notes}</p>` : ''}`,
      'Edit Release', `${APP_URL}/releases`),
  }),
  'payment-success': (d, name) => ({
    scope: 'payment',
    subject: `✅ Pembayaran berhasil — ${d.title}`,
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
  'announcement': (d, name) => ({
    scope: 'announcement',
    subject: `📢 ${d.title}`,
    html: layout(d.title, 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)', `
      <p>Halo ${name},</p>
      <div style="white-space:pre-wrap;background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0;">${d.message}</div>`,
      'Buka Dashboard', APP_URL),
  }),
}

const SCOPE_TO_OPTIN: Record<TemplateOutput['scope'], string> = {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const input: SendInput = await req.json()
    const tpl = TEMPLATES[input.templateName]
    if (!tpl) {
      return new Response(JSON.stringify({ error: `Unknown template: ${input.templateName}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
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
    const optinCol = SCOPE_TO_OPTIN[scope]

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
        .select(`id, email, full_name, ${optinCol}`)
        .in('id', userIds)
      recipients = (profs || [])
        .filter((p: any) => !!p.email)
        .map((p: any) => ({ user_id: p.id, email: p.email, full_name: p.full_name || 'User', optin: p[optinCol] !== false }))
    } else if (input.recipientUserId) {
      const { data: p } = await supabase
        .from('profiles')
        .select(`id, email, full_name, ${optinCol}`)
        .eq('id', input.recipientUserId)
        .maybeSingle()
      if (p && (p as any).email) {
        recipients = [{ user_id: (p as any).id, email: (p as any).email, full_name: (p as any).full_name || 'User', optin: (p as any)[optinCol] !== false }]
      }
    } else if (input.recipientEmail) {
      // Direct send (no opt-in check — only used for admin notifications by user_id lookup)
      const { data: p } = await supabase
        .from('profiles')
        .select(`id, full_name, ${optinCol}`)
        .eq('email', input.recipientEmail)
        .maybeSingle()
      recipients = [{
        user_id: p ? (p as any).id : null,
        email: input.recipientEmail,
        full_name: p ? ((p as any).full_name || 'User') : 'User',
        optin: p ? ((p as any)[optinCol] !== false) : true,
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