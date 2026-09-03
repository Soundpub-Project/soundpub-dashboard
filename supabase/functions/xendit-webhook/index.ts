import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
const getDatabaseSchema = () => Deno.env.get('DATABASE_SCHEMA') || Deno.env.get('SUPABASE_DB_SCHEMA') || 'Soundpub'

const createSoundpubClient = (supabaseUrl: string, supabaseKey: string, options: any = {}) => {
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

const amountsMatch = (expected: unknown, received: unknown) =>
  received === undefined || received === null || Number(expected) === Number(received)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

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

    const body = await req.json()
    console.log('Xendit webhook received:', JSON.stringify(body))

    const { id: invoiceId, status, amount, currency } = body

    if (!invoiceId || !status) {
      return jsonResponse({ error: 'Missing required fields' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: 'Supabase function environment is incomplete' }, 500)
    }

    const supabase = createSoundpubClient(supabaseUrl, supabaseServiceKey)

    const { data: payment, error: paymentError } = await supabase
      .from('release_payments')
      .select('*, releases:release_id(id, title, artist_name, label_id)')
      .eq('xendit_invoice_id', invoiceId)
      .single()

    if (paymentError || !payment) {
      console.error('Payment not found for invoice:', invoiceId)
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

    if (payment.status === 'paid') {
      return jsonResponse({ success: true, duplicate: true })
    }

    if ((mappedStatus === 'expired' || mappedStatus === 'failed') && payment.status !== 'pending') {
      return jsonResponse({ success: true, ignored: true, reason: 'terminal_payment_status' })
    }

    const updateData: Record<string, any> = { status: mappedStatus }
    if (mappedStatus === 'paid') {
      updateData.paid_at = new Date().toISOString()
    }

    const { data: updatedPayment, error: paymentUpdateError } = await supabase
      .from('release_payments')
      .update(updateData)
      .eq('id', payment.id)
      .eq('status', payment.status)
      .select('id')
      .maybeSingle()

    if (paymentUpdateError) {
      console.error('Payment update error:', paymentUpdateError)
      return jsonResponse({ error: 'Failed to update payment record', details: paymentUpdateError.message }, 500)
    }

    if (!updatedPayment) {
      return jsonResponse({ success: true, duplicate: true })
    }

    if (mappedStatus === 'paid') {
      const { error: releaseUpdateError } = await supabase
        .from('releases')
        .update({ status: 'pending_paid' })
        .eq('id', payment.release_id)
        .neq('status', 'active')

      if (releaseUpdateError) {
        console.error('Release update error:', releaseUpdateError)
        return jsonResponse({ error: 'Failed to update release status', details: releaseUpdateError.message }, 500)
      }

      const releaseInfo = payment.releases as any

      // Notification for the user (NOT global)
      await supabase.from('notifications').insert({
        user_id: payment.user_id,
        type: 'success',
        title: 'Pembayaran Berhasil',
        message: `Pembayaran untuk release "${releaseInfo?.title || 'Unknown'}" berhasil. Admin akan segera mengonfirmasi.`,
        metadata: { release_id: payment.release_id, amount: payment.amount },
      })

      // Notify each admin/superadmin individually (NOT global)
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['superadmin', 'admin'])

      if (adminRoles && adminRoles.length > 0) {
        const adminNotifs = adminRoles.map((ar: any) => ({
          user_id: ar.user_id,
          type: 'release',
          title: 'Release Baru Dibayar',
          message: `Release "${releaseInfo?.title || 'Unknown'}" oleh ${releaseInfo?.artist_name || 'Unknown'} telah dibayar. Menunggu konfirmasi.`,
          metadata: { release_id: payment.release_id, amount: payment.amount },
        }))
        await supabase.from('notifications').insert(adminNotifs)
      }

      // Email ke user pembayar (opt-in via send-app-email + Gmail)
      try {
        await supabase.functions.invoke('send-app-email', {
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
      } catch (e) {
        console.error('send-app-email payment-success failed:', e)
      }

      // Existing admin notification via Resend (legacy, dipertahankan)
      try {
        await sendEmailNotification(payment, supabase)
      } catch (emailError) {
        console.error('Email notification failed:', emailError)
      }
    } else if (mappedStatus === 'expired' || mappedStatus === 'failed') {
      const releaseInfo = payment.releases as any
      await supabase.from('notifications').insert({
        user_id: payment.user_id,
        type: mappedStatus === 'expired' ? 'warning' : 'error',
        title: mappedStatus === 'expired' ? 'Pembayaran Expired' : 'Pembayaran Gagal',
        message: `Pembayaran untuk release "${releaseInfo?.title || 'Unknown'}" ${mappedStatus === 'expired' ? 'telah kedaluwarsa' : 'gagal'}. Silakan coba lagi.`,
        metadata: { release_id: payment.release_id },
      })
    }

    return jsonResponse({ success: true })

  } catch (error) {
    console.error('Webhook error:', error)
    return jsonResponse({ error: error?.message || 'Internal server error' }, 500)
  }
})

async function sendEmailNotification(payment: any, supabase: any) {
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
    },
    body: JSON.stringify({
      from: 'Soundpub <noreply@Soundpub.xyz>',
      to: [notificationEmail],
      subject: `[Soundpub] Release Baru Dibayar: ${release.title}`,
      html: emailHtml,
    }),
  })

  const resendBody = await resendResponse.text()
  console.log('Resend notification result:', resendResponse.status, resendBody)
}
