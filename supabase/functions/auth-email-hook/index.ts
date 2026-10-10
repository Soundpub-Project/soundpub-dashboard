import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'
import nodemailer from 'npm:nodemailer@6.10.1'

interface Payload {
  user: { email: string; new_email?: string; user_metadata?: { full_name?: string } }
  email_data: {
    token: string; token_hash: string; token_new?: string; token_hash_new?: string
    redirect_to?: string; email_action_type: string
  }
}

const subjects: Record<string, string> = {
  signup: 'Konfirmasi alamat email Anda', invite: 'Undangan akun Anda',
  magiclink: 'Tautan masuk akun Anda', recovery: 'Atur ulang kata sandi Anda',
  email_change: 'Konfirmasi perubahan email Anda', reauthentication: 'Kode keamanan akun Anda',
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export function renderEmail(payload: Payload, authUrl: string, senderEmail: string, senderName: string, newAddress = false) {
  const { user, email_data: data } = payload
  let redirect: URL | undefined
  try {
    if (data.redirect_to) {
      const candidate = new URL(data.redirect_to)
      if (candidate.protocol === 'https:' && !candidate.username && !candidate.password) redirect = candidate
    }
  } catch { redirect = undefined }
  const soundpub = data.email_action_type === 'signup' && redirect?.origin === 'https://dashboard.soundpub.xyz'
    && redirect.pathname === '/verify-email'
  const name = soundpub ? 'Soundpub Music' : senderName
  const subject = soundpub ? 'Konfirmasi email akun Soundpub Music' : subjects[data.email_action_type]
  const heading = soundpub ? 'Satu langkah lagi menuju Soundpub' : subject
  const description = soundpub
    ? 'Terima kasih telah mendaftar. Verifikasi email untuk mengaktifkan akun Soundpub Music Anda.'
    : 'Gunakan tombol berikut untuk melanjutkan permintaan akun Anda. Jika Anda tidak memintanya, abaikan email ini.'
  const link = new URL('/auth/v1/verify', authUrl)
  link.searchParams.set('token', data.email_action_type === 'email_change' && !newAddress ? data.token_hash_new || data.token_hash : data.token_hash)
  link.searchParams.set('type', data.email_action_type)
  if (redirect) link.searchParams.set('redirect_to', redirect.toString())
  const code = data.email_action_type === 'email_change' && newAddress ? data.token_new || data.token : data.token
  const button = data.email_action_type === 'recovery' ? 'Atur Ulang Kata Sandi' : 'Verifikasi Email'
  const greeting = soundpub && typeof user.user_metadata?.full_name === 'string'
    ? `Halo ${escapeHtml(user.user_metadata.full_name.slice(0, 100))},` : 'Halo,'
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f5fa;font-family:Arial,Helvetica,sans-serif;color:#182238"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5fa;padding:36px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e5e9f2;border-radius:18px;overflow:hidden"><tr><td style="background:#161f36;padding:27px 36px;color:#fff;font-size:22px;font-weight:700">${escapeHtml(name)}</td></tr><tr><td style="padding:36px"><h1 style="font-size:25px;line-height:1.3;margin:0 0 22px">${escapeHtml(heading)}</h1><p style="font-size:15px;line-height:1.7">${greeting}</p><p style="font-size:15px;line-height:1.7;margin:0 0 28px">${escapeHtml(description)}</p><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:#4f46e5;border-radius:9px"><a href="${escapeHtml(link.toString())}" style="display:inline-block;padding:15px 24px;color:#fff;text-decoration:none;font-size:15px;font-weight:bold">${button}</a></td></tr></table>${code ? `<p style="font-size:14px;margin:28px 0 8px">Atau gunakan kode berikut:</p><p style="font-size:24px;letter-spacing:5px;font-weight:bold;margin:0 0 24px">${escapeHtml(code)}</p>` : ''}<p style="font-size:12px;line-height:1.6;color:#667085;overflow-wrap:anywhere">Tombol tidak berfungsi? Salin tautan ini:<br><a href="${escapeHtml(link.toString())}" style="color:#4f46e5">${escapeHtml(link.toString())}</a></p><p style="font-size:12px;line-height:1.6;color:#667085;margin-top:26px">Jangan bagikan tautan atau kode ini. Abaikan email ini jika Anda tidak membuat permintaan.</p></td></tr></table><p style="font-size:12px;color:#667085;margin:20px 0">${escapeHtml(name)} · ${escapeHtml(senderEmail)}</p></td></tr></table></body></html>`
  const text = `${heading}\n\n${description}\n\n${button}: ${link}\nKode: ${code}\n\nAbaikan email ini jika Anda tidak membuat permintaan.`
  return { from: `"${name}" <${senderEmail}>`, subject, html, text }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const secret = Deno.env.get('SEND_EMAIL_HOOK_SECRET')
  if (!secret?.startsWith('v1,whsec_')) return new Response('Email hook unavailable', { status: 503 })
  let payload: Payload
  try {
    payload = new Webhook(secret.slice('v1,whsec_'.length)).verify(await request.text(), Object.fromEntries(request.headers)) as Payload
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }
  const data = payload?.email_data
  if (!payload?.user?.email || !data?.token_hash || !(data.email_action_type in subjects)) {
    return new Response('Invalid email payload', { status: 400 })
  }
  const delivery = async () => {
    const port = Number(Deno.env.get('SMTP_PORT'))
    const transport = nodemailer.createTransport({
      host: Deno.env.get('SMTP_HOST'), port, secure: port === 465,
      auth: { user: Deno.env.get('SMTP_USER'), pass: Deno.env.get('SMTP_PASS') },
    })
    const authUrl = Deno.env.get('AUTH_EXTERNAL_URL') || ''
    const senderEmail = Deno.env.get('SMTP_ADMIN_EMAIL') || ''
    const senderName = Deno.env.get('SMTP_SENDER_NAME') || 'Carubra AI'
    if (data.email_action_type === 'email_change' && payload.user.new_email) {
      if (data.token_hash_new && data.token) {
        await transport.sendMail({ ...renderEmail(payload, authUrl, senderEmail, senderName), to: payload.user.email })
      }
      await transport.sendMail({ ...renderEmail(payload, authUrl, senderEmail, senderName, true), to: payload.user.new_email })
    } else {
      await transport.sendMail({ ...renderEmail(payload, authUrl, senderEmail, senderName), to: payload.user.email })
    }
  }

  EdgeRuntime.waitUntil(delivery().catch(() => console.error('Auth email delivery failed')))
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
})
