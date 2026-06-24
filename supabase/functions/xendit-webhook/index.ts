import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-callback-token',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const webhookToken = Deno.env.get('XENDIT_WEBHOOK_TOKEN')
    const callbackToken = req.headers.get('x-callback-token')

    if (webhookToken && callbackToken !== webhookToken) {
      console.error('Invalid webhook token')
      return new Response(JSON.stringify({ error: 'Invalid callback token' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const body = await req.json()
    console.log('Xendit webhook received:', JSON.stringify(body))

    const { id: invoiceId, status } = body

    if (!invoiceId || !status) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: payment, error: paymentError } = await supabase
      .from('release_payments')
      .select('*, releases:release_id(id, title, artist_name, label_id)')
      .eq('xendit_invoice_id', invoiceId)
      .single()

    if (paymentError || !payment) {
      console.error('Payment not found for invoice:', invoiceId)
      return new Response(JSON.stringify({ error: 'Payment record not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const statusMap: Record<string, string> = {
      'PAID': 'paid',
      'SETTLED': 'paid',
      'EXPIRED': 'expired',
      'FAILED': 'failed',
    }

    const mappedStatus = statusMap[status.toUpperCase()] || 'pending'

    const updateData: Record<string, any> = { status: mappedStatus }
    if (mappedStatus === 'paid') {
      updateData.paid_at = new Date().toISOString()
    }

    await supabase
      .from('release_payments')
      .update(updateData)
      .eq('id', payment.id)

    if (mappedStatus === 'paid') {
      await supabase
        .from('releases')
        .update({ status: 'pending_paid' })
        .eq('id', payment.release_id)

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
      await supabase
        .from('releases')
        .update({ status: 'draft' })
        .eq('id', payment.release_id)

      const releaseInfo = payment.releases as any
      await supabase.from('notifications').insert({
        user_id: payment.user_id,
        type: mappedStatus === 'expired' ? 'warning' : 'error',
        title: mappedStatus === 'expired' ? 'Pembayaran Expired' : 'Pembayaran Gagal',
        message: `Pembayaran untuk release "${releaseInfo?.title || 'Unknown'}" ${mappedStatus === 'expired' ? 'telah kedaluwarsa' : 'gagal'}. Silakan coba lagi.`,
        metadata: { release_id: payment.release_id },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

async function sendEmailNotification(payment: any, supabase: any) {
  const notificationEmail = Deno.env.get('NOTIFICATION_EMAIL') || 'publisher@soundpub.xyz'
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
    <h2>🎵 Release Baru - Pembayaran Diterima</h2>
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
      from: 'SoundPub <noreply@soundpub.xyz>',
      to: [notificationEmail],
      subject: `[SoundPub] Release Baru Dibayar: ${release.title}`,
      html: emailHtml,
    }),
  })

  const resendBody = await resendResponse.text()
  console.log('Resend notification result:', resendResponse.status, resendBody)
}
