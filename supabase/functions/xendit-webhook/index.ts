import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
const getDatabaseSchema = () => Deno.env.get('DATABASE_SCHEMA') || Deno.env.get('SUPABASE_DB_SCHEMA') || 'soundpub'

const createSoundpubClient = (supabaseUrl: string, supabaseKey: string, options: NonNullable<Parameters<typeof createClient>[2]> = {}) => {
  const existingDb = options.db || {}
  return createClient(supabaseUrl, supabaseKey, {
    ...options,
    db: { ...existingDb, schema: getDatabaseSchema() },
  })
}


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-callback-token',
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const statusMap: Record<string, 'paid' | 'expired' | 'failed'> = {
  PAID: 'paid',
  SETTLED: 'paid',
  EXPIRED: 'expired',
  FAILED: 'failed',
}

const decimal = (value: unknown) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value))
  return match ? `${match[1].replace(/^0+(?=\d)/, '')}.${(match[2] || '').replace(/0+$/, '')}` : null
}
const amountsMatch = (expected: unknown, received: unknown) =>
  decimal(expected) !== null && decimal(expected) === decimal(received)

const notificationId = async (paymentId: string, recipient: string, status: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`xendit:${paymentId}:${recipient}:${status}`))
  const hex = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const webhookToken = Deno.env.get('XENDIT_WEBHOOK_TOKEN')
    const callbackToken = req.headers.get('x-callback-token')

    if (!webhookToken) {
      console.error('XENDIT_WEBHOOK_TOKEN is not configured')
      return jsonResponse({ error: 'Webhook authentication is not configured' }, 503)
    }

    if (callbackToken !== webhookToken) {
      console.error('Invalid webhook token')
      return jsonResponse({ error: 'Invalid callback token' }, 403)
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return jsonResponse({ error: 'Invalid payload' }, 400)

    const { id: invoiceId, status, amount, currency } = body

    if (typeof invoiceId !== 'string' || !invoiceId || typeof status !== 'string' || !status || decimal(amount) === null || typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
      return jsonResponse({ error: 'Missing required fields' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: 'Supabase function environment is incomplete' }, 500)
    }

    const supabase = createSoundpubClient(supabaseUrl, supabaseServiceKey)

    const { data: copyrightPayment, error: copyrightPaymentError } = await supabase
      .from('copyright_registration_payments')
      .select('id, registration_id, amount, currency, payment_status')
      .eq('xendit_invoice_id', invoiceId)
      .maybeSingle()
    if (copyrightPaymentError) return jsonResponse({ error: 'Failed to read copyright payment' }, 500)
    if (copyrightPayment) {
      const mappedStatus = statusMap[String(status).toUpperCase()]
      if (!mappedStatus) return jsonResponse({ success: true, ignored: true, reason: 'unsupported_status' })
      if (!amountsMatch(copyrightPayment.amount, amount) || (currency && String(currency).toUpperCase() !== copyrightPayment.currency.toUpperCase())) return jsonResponse({ error: 'Webhook payment data does not match invoice' }, 409)
      if (copyrightPayment.payment_status === 'paid' && mappedStatus !== 'paid') return jsonResponse({ success: true, ignored: true })
      if (!['pending', 'paid'].includes(copyrightPayment.payment_status)) return jsonResponse({ success: true, ignored: true, reason: 'terminal_payment_status' })
      const update: Record<string, unknown> = { payment_status: mappedStatus, updated_at: new Date().toISOString() }
      if (mappedStatus === 'paid') update.paid_at = new Date().toISOString()
      const { data: updated, error: updateError } = copyrightPayment.payment_status === 'paid'
        ? { data: copyrightPayment, error: null }
        : await supabase.from('copyright_registration_payments').update(update).eq('id', copyrightPayment.id).eq('payment_status', 'pending').select('id').maybeSingle()
      if (updateError) return jsonResponse({ error: 'Failed to update copyright payment' }, 500)
      if (!updated) return jsonResponse({ error: 'Payment changed; retry callback' }, 503)
      if (mappedStatus === 'paid') {
        const { error: registrationUpdateError } = await supabase.from('copyright_registrations').update({ status: 'paid_pending_review' }).eq('id', copyrightPayment.registration_id).eq('status', 'awaiting_payment')
        if (registrationUpdateError) return jsonResponse({ error: 'Failed to update copyright registration' }, 500)
      }
      return jsonResponse({ success: true })
    }

    const { data: payment, error: paymentError } = await supabase
      .from('release_payments')
      .select('*, releases:release_id(id, title, artist_name, label_id)')
      .eq('xendit_invoice_id', invoiceId)
      .single()

    if (paymentError || !payment) {
      return jsonResponse({ error: 'Payment record not found' }, 404)
    }

    const mappedStatus = statusMap[String(status).toUpperCase()]
    if (!mappedStatus) {
      console.warn('Ignoring unsupported Xendit invoice status:', status)
      return jsonResponse({ success: true, ignored: true, reason: 'unsupported_status' })
    }

    if (!amountsMatch(payment.amount, amount) || (currency && String(currency).toUpperCase() !== payment.currency.toUpperCase())) {
      console.error('Webhook payment amount or currency mismatch:', invoiceId)
      return jsonResponse({ error: 'Webhook payment data does not match invoice' }, 409)
    }

    if (payment.status !== 'pending' && payment.status !== mappedStatus) {
      return jsonResponse({ success: true, ignored: true, reason: 'terminal_payment_status' })
    }

    const updateData: Record<string, unknown> = { status: mappedStatus }
    if (mappedStatus === 'paid') {
      updateData.paid_at = new Date().toISOString()
    }

    const { data: updatedPayment, error: paymentUpdateError } = payment.status === mappedStatus
      ? { data: payment, error: null }
      : await supabase
      .from('release_payments')
      .update(updateData)
      .eq('id', payment.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (paymentUpdateError) {
      console.error('Payment update error:', paymentUpdateError)
      return jsonResponse({ error: 'Failed to update payment record', details: paymentUpdateError.message }, 500)
    }

    if (!updatedPayment) {
      return jsonResponse({ error: 'Payment changed; retry callback' }, 503)
    }

    if (mappedStatus === 'paid') {
      const { error: releaseUpdateError } = await supabase
        .from('releases')
        .update({ status: 'pending_paid' })
        .eq('id', payment.release_id)
        .eq('status', 'awaiting_payment')

      if (releaseUpdateError) {
        console.error('Release update error:', releaseUpdateError)
        return jsonResponse({ error: 'Failed to update release status', details: releaseUpdateError.message }, 500)
      }

      const releaseInfo = payment.releases

      const { error: notificationError } = await supabase.from('notifications').upsert({
        id: await notificationId(payment.id, payment.user_id, mappedStatus),
        user_id: payment.user_id,
        type: 'success',
        title: 'Pembayaran Berhasil',
        message: `Pembayaran untuk release "${releaseInfo?.title || 'Unknown'}" berhasil. Admin akan segera mengonfirmasi.`,
        metadata: { release_id: payment.release_id, amount: payment.amount },
      }, { onConflict: 'id', ignoreDuplicates: true })
      if (notificationError) return jsonResponse({ error: 'Failed to save payment notification' }, 500)

      // Notify each admin/superadmin individually (NOT global)
      const { data: adminRoles, error: adminRolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['superadmin', 'admin'])
      if (adminRolesError) return jsonResponse({ error: 'Failed to read notification recipients' }, 500)

      if (adminRoles && adminRoles.length > 0) {
        const adminNotifs = await Promise.all([...new Set(adminRoles.map(ar => ar.user_id))].filter(userId => userId !== payment.user_id).map(async (userId) => ({
          id: await notificationId(payment.id, String(userId), mappedStatus),
          user_id: userId,
          type: 'release',
          title: 'Release Baru Dibayar',
          message: `Release "${releaseInfo?.title || 'Unknown'}" oleh ${releaseInfo?.artist_name || 'Unknown'} telah dibayar. Menunggu konfirmasi.`,
          metadata: { release_id: payment.release_id, amount: payment.amount },
        })))
        if (adminNotifs.length) {
          const { error } = await supabase.from('notifications').upsert(adminNotifs, { onConflict: 'id', ignoreDuplicates: true })
          if (error) return jsonResponse({ error: 'Failed to save admin notifications' }, 500)
        }
      }

      // Email ke user pembayar (opt-in via send-app-email + Gmail)
      try {
        const { error } = await supabase.functions.invoke('send-app-email', {
          body: {
            templateName: 'payment-success',
            recipientUserId: payment.user_id,
            templateData: {
              title: releaseInfo?.title || 'Release',
              trackCount: payment.track_count,
              amount: payment.amount,
            },
            idempotencyKey: `payment-${payment.id}-paid`,
          },
        })
        if (error) return jsonResponse({ error: 'Payment email delivery pending' }, 500)
      } catch (e) {
        return jsonResponse({ error: 'Payment email delivery pending' }, 500)
      }

      // Existing admin notification via Resend (legacy, dipertahankan)
      try {
        await sendEmailNotification(payment, supabase)
      } catch (emailError) {
        return jsonResponse({ error: 'Admin email delivery pending' }, 500)
      }
    } else if (mappedStatus === 'expired' || mappedStatus === 'failed') {
      const releaseInfo = payment.releases
      const { error } = await supabase.from('notifications').upsert({
        id: await notificationId(payment.id, payment.user_id, mappedStatus),
        user_id: payment.user_id,
        type: mappedStatus === 'expired' ? 'warning' : 'error',
        title: mappedStatus === 'expired' ? 'Pembayaran Expired' : 'Pembayaran Gagal',
        message: `Pembayaran untuk release "${releaseInfo?.title || 'Unknown'}" ${mappedStatus === 'expired' ? 'telah kedaluwarsa' : 'gagal'}. Silakan coba lagi.`,
        metadata: { release_id: payment.release_id },
      }, { onConflict: 'id', ignoreDuplicates: true })
      if (error) return jsonResponse({ error: 'Failed to save payment notification' }, 500)
    }

    return jsonResponse({ success: true })

  } catch (error) {
    console.error('Webhook processing failed')
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

async function sendEmailNotification(payment: {
  id: string
  user_id: string
  amount: number
  track_count: number
  releases?: { title?: string; artist_name?: string } | null
}, supabase: ReturnType<typeof createSoundpubClient>) {
  const notificationEmail = Deno.env.get('NOTIFICATION_EMAIL') || 'publisher@Soundpub.xyz'
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY not configured, skipping email notification')
    return
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', payment.user_id)
    .single()

  const release = payment.releases || {}
  const amount = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(payment.amount)

  const emailHtml = `
    <h2>ðŸŽµ Release Baru - Pembayaran Diterima</h2>
    <table style="border-collapse: collapse; width: 100%;">
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Release</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${release.title || 'N/A'}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Artist</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${release.artist_name || 'N/A'}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Jumlah Track</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${payment.track_count}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Total Pembayaran</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${amount}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Dibayar Oleh</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${profile?.full_name || 'N/A'} (${profile?.email || 'N/A'})</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Waktu Bayar</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${new Date().toLocaleString('id-ID')}</td></tr>
    </table>
    <p style="margin-top: 16px;">Silakan login ke dashboard untuk mengonfirmasi dan mengaktifkan release ini.</p>
  `

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `xendit-${payment.id}-paid`,
    },
    body: JSON.stringify({
      from: 'Soundpub <noreply@Soundpub.xyz>',
      to: [notificationEmail],
      subject: `[Soundpub] Release Baru Dibayar: ${release.title}`,
      html: emailHtml,
    }),
  })

  if (!resendResponse.ok) throw new Error('Admin email delivery failed')
}
