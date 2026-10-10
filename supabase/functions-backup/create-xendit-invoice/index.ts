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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const parseJsonSafe = async (response: Response) => {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

const xenditMessage = (body: any) => {
  if (body?.message) return body.message
  if (body?.error_code) return body.error_code
  if (body?.error) return body.error
  if (body?.raw) return body.raw
  return 'Xendit menolak pembuatan invoice'
}

const parseCsvEnv = (value: string | undefined) =>
  value?.split(',').map((item) => item.trim()).filter(Boolean)

const isForbiddenXenditError = (status: number, body: any) =>
  status === 403 || body?.error_code === 'REQUEST_FORBIDDEN_ERROR'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const xenditSecretKey = Deno.env.get('XENDIT_SECRET_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return jsonResponse({ error: 'Supabase function environment is incomplete' }, 500)
    }

    if (!xenditSecretKey) {
      return jsonResponse({ error: 'Payment gateway not configured', details: 'XENDIT_SECRET_KEY belum diset di Edge Function secrets' }, 503)
    }

    const supabaseUser = createSoundpubClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    let payload: any
    try {
      payload = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const releaseId = payload?.release_id
    if (!releaseId) {
      return jsonResponse({ error: 'release_id is required' }, 400)
    }

    const supabase = createSoundpubClient(supabaseUrl, supabaseServiceKey)
    const xenditAuth = btoa(`${xenditSecretKey}:`)

    const { data: existingPayment, error: existingPaymentError } = await supabase
      .from('release_payments')
      .select('*')
      .eq('release_id', releaseId)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingPaymentError) {
      console.error('Existing payment lookup error:', existingPaymentError)
      return jsonResponse({ error: 'Gagal membaca data pembayaran', details: existingPaymentError.message }, 500)
    }

    if (existingPayment?.xendit_invoice_url && existingPayment?.xendit_invoice_id) {
      try {
        const checkResponse = await fetch(`https://api.xendit.co/v2/invoices/${existingPayment.xendit_invoice_id}`, {
          headers: { Authorization: `Basic ${xenditAuth}` },
        })
        const checkBody = await parseJsonSafe(checkResponse)

        if (checkResponse.ok && checkBody.status === 'PENDING') {
          return jsonResponse({
            invoice_url: existingPayment.xendit_invoice_url,
            invoice_id: existingPayment.xendit_invoice_id,
            amount: Number(existingPayment.amount),
            track_count: existingPayment.track_count,
            price_per_track: Number(existingPayment.price_per_track),
            reused: true,
          })
        }

        if (checkResponse.ok && ['PAID', 'SETTLED'].includes(checkBody.status)) {
          const { error: updatePaidError } = await supabase
            .from('release_payments')
            .update({ status: 'paid', paid_at: checkBody.paid_at || new Date().toISOString() })
            .eq('id', existingPayment.id)

          if (updatePaidError) {
            console.error('Existing paid payment update error:', updatePaidError)
          }

          await supabase
            .from('releases')
            .update({ status: 'pending_paid' })
            .eq('id', existingPayment.release_id)
            .neq('status', 'active')

          return jsonResponse({ error: 'Invoice ini sudah dibayar', invoice_id: existingPayment.xendit_invoice_id }, 409)
        }

        if (!checkResponse.ok || !['EXPIRED', 'FAILED'].includes(checkBody.status)) {
          console.warn('Existing invoice status is not reusable:', checkResponse.status, JSON.stringify(checkBody))
          return jsonResponse({ error: 'Invoice lama belum bisa diganti. Coba refresh atau hubungi admin.', invoice_id: existingPayment.xendit_invoice_id }, 409)
        }

        const expiredStatus = checkBody.status === 'FAILED' ? 'failed' : 'expired'
        const { error: updateExistingError } = await supabase
          .from('release_payments')
          .update({ status: expiredStatus })
          .eq('id', existingPayment.id)

        if (updateExistingError) {
          console.error('Existing payment update error:', updateExistingError)
        }
      } catch (error) {
        console.warn('Could not verify existing invoice, creating new one:', error)
      }
    }

    const { data: release, error: releaseError } = await supabase
      .from('releases')
      .select('id, title, artist_name, label_id, created_by, status, release_type, distribution_service, custom_label_name, custom_record_name')
      .eq('id', releaseId)
      .single()

    if (releaseError || !release) {
      return jsonResponse({ error: 'Release not found', details: releaseError?.message }, 404)
    }

    if (release.status === 'pending_paid' || release.status === 'active') {
      return jsonResponse({ error: 'Release sudah dibayar atau aktif' }, 409)
    }

    const { data: roleRows, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)

    if (roleError) {
      console.error('User role lookup error:', roleError)
      return jsonResponse({ error: 'Gagal memverifikasi izin user', details: roleError.message }, 500)
    }

    const isAdmin = roleRows?.some((row: { role: string }) => row.role === 'admin' || row.role === 'superadmin')
    const canCreateInvoice = isAdmin || release.created_by === user.id || release.label_id === user.id
    if (!canCreateInvoice) {
      return jsonResponse({ error: 'User tidak berhak membuat invoice untuk release ini' }, 403)
    }

    const isArtist = roleRows?.some((row: { role: string }) => row.role === 'artist')
    const isCustomLabelService = release.distribution_service === 'custom_label'
    let isSoundpubArtist = false
    if (isArtist) {
      const { data: artistProfile } = await supabase
        .from('profiles')
        .select('parent_label_id, status')
        .eq('id', user.id)
        .maybeSingle()

      if (artistProfile?.parent_label_id === release.label_id && !['suspended', 'deleted'].includes(String(artistProfile.status || '').toLowerCase())) {
        const { data: parentRole } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('user_id', artistProfile.parent_label_id)
          .eq('role', 'label')
          .maybeSingle()

        if (parentRole) {
          const { data: parentProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', artistProfile.parent_label_id)
            .maybeSingle()

          const normalizedLabelName = String(parentProfile?.full_name || '').trim().toLowerCase().replace(/\s+/g, ' ')
          isSoundpubArtist = ['soundpub', 'soundpub music', 'soundpub music ecosystem'].includes(normalizedLabelName)
        }
      }
    }

    if (isCustomLabelService && (
      !isSoundpubArtist ||
      release.created_by !== user.id ||
      !release.custom_label_name?.trim() ||
      !release.custom_record_name?.trim()
    )) {
      return jsonResponse({ error: 'Custom Label hanya dapat dibayar oleh artis aktif di bawah label Soundpub dengan metadata lengkap' }, 403)
    }

    const { count: trackCount, error: trackError } = await supabase
      .from('tracks')
      .select('id', { count: 'exact', head: true })
      .eq('release_id', releaseId)

    if (trackError) {
      return jsonResponse({ error: 'Gagal membaca track release', details: trackError.message }, 500)
    }

    const totalTracks = Math.max(trackCount || 0, 1)

    const { data: settingsData, error: settingsError } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['release_pricing_mode', 'release_price_per_track', 'release_price_single', 'release_price_ep', 'release_price_album', 'release_price_custom_label'])

    if (settingsError) {
      return jsonResponse({ error: 'Gagal membaca pengaturan harga', details: settingsError.message }, 500)
    }

    const settings: Record<string, string> = {}
    settingsData?.forEach((setting: { key: string; value: string | null }) => {
      if (setting.value) settings[setting.key] = setting.value
    })

    const pricingMode = settings.release_pricing_mode || 'per_track'
    let totalAmount: number
    let pricePerTrack: number
    let description: string

    const customLabelPrice = Number.parseInt(settings.release_price_custom_label || '0', 10)
    if (isCustomLabelService && Number.isFinite(customLabelPrice) && customLabelPrice > 0) {
      pricePerTrack = customLabelPrice
      totalAmount = pricePerTrack * totalTracks
      description = `Pembayaran Release Custom Label Soundpub: ${release.title} (${totalTracks} track)`
    } else if (pricingMode === 'per_category') {
      const releaseType = (release.release_type || 'single').toLowerCase()
      const priceMap: Record<string, number> = {
        single: Number.parseInt(settings.release_price_single || '50000', 10),
        ep: Number.parseInt(settings.release_price_ep || '150000', 10),
        album: Number.parseInt(settings.release_price_album || '300000', 10),
      }
      totalAmount = priceMap[releaseType] || priceMap.single
      pricePerTrack = Math.ceil(totalAmount / totalTracks)
      description = `Pembayaran Release (${releaseType.toUpperCase()}): ${release.title}`
    } else {
      pricePerTrack = Number.parseInt(settings.release_price_per_track || '50000', 10)
      totalAmount = pricePerTrack * totalTracks
      description = `Pembayaran Release: ${release.title} (${totalTracks} track)`
    }

    if (!Number.isFinite(totalAmount) || totalAmount <= 0 || !Number.isInteger(totalAmount)) {
      return jsonResponse({ error: 'Harga release tidak valid', details: `Amount: ${totalAmount}` }, 400)
    }

    const { error: snapshotError } = await supabase
      .from('releases')
      .update({
        price_per_track_snapshot: pricePerTrack,
        total_payment_snapshot: totalAmount,
      })
      .eq('id', releaseId)

    if (snapshotError) {
      return jsonResponse({ error: 'Gagal menyimpan snapshot harga release', details: snapshotError.message }, 500)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', user.id)
      .maybeSingle()

    const payerEmail = profile?.email || user.email
    if (!payerEmail) {
      return jsonResponse({ error: 'Email pembayar tidak ditemukan' }, 400)
    }

    const origin = req.headers.get('origin') || Deno.env.get('PUBLIC_SITE_URL') || 'https://Soundpub-dashboard.lovable.app'
    const externalId = `release-${releaseId}-${Date.now()}`
    const configuredPaymentMethods = parseCsvEnv(Deno.env.get('XENDIT_PAYMENT_METHODS'))
    const invoicePayload: Record<string, unknown> = {
      external_id: externalId,
      amount: totalAmount,
      currency: 'IDR',
      description,
      payer_email: payerEmail,
      customer: {
        given_names: profile?.full_name || user.email || 'User',
        email: payerEmail,
      },
      success_redirect_url: `${origin}/payment/callback?status=success&release_id=${releaseId}`,
      failure_redirect_url: `${origin}/payment/callback?status=failed&release_id=${releaseId}`,
      items: [{
        name: `Release: ${release.title}`.slice(0, 255),
        quantity: totalTracks,
        price: pricePerTrack,
        category: 'MUSIC_RELEASE',
      }],
    }

    if (configuredPaymentMethods?.length) {
      invoicePayload.payment_methods = configuredPaymentMethods
    }

    const xenditResponse = await fetch('https://api.xendit.co/v2/invoices', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${xenditAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(invoicePayload),
    })

    const xenditBody = await parseJsonSafe(xenditResponse)

    if (!xenditResponse.ok) {
      console.error('Xendit create invoice error:', xenditResponse.status, JSON.stringify(xenditBody))
      if (isForbiddenXenditError(xenditResponse.status, xenditBody)) {
        return jsonResponse({
          error: 'Xendit API key tidak punya izin membuat invoice',
          details: 'Aktifkan permission Invoice/Create Invoice di Xendit Dashboard atau ganti XENDIT_SECRET_KEY dengan secret key yang punya akses invoice.',
          xendit_status: xenditResponse.status,
          xendit_error_code: xenditBody?.error_code,
        }, 422)
      }
      return jsonResponse({
        error: 'Failed to create payment invoice',
        details: xenditMessage(xenditBody),
        xendit_status: xenditResponse.status,
        xendit_error_code: xenditBody?.error_code,
      }, xenditResponse.status === 401 ? 422 : 400)
    }

    if (!xenditBody?.id || !xenditBody?.invoice_url) {
      console.error('Unexpected Xendit invoice response:', JSON.stringify(xenditBody))
      return jsonResponse({ error: 'Invalid invoice response from Xendit' }, 422)
    }

    const { error: paymentError } = await supabase
      .from('release_payments')
      .insert({
        release_id: releaseId,
        user_id: user.id,
        amount: totalAmount,
        currency: 'IDR',
        track_count: totalTracks,
        price_per_track: pricePerTrack,
        xendit_invoice_id: xenditBody.id,
        xendit_invoice_url: xenditBody.invoice_url,
        status: 'pending',
      })

    if (paymentError) {
      console.error('Payment record error:', paymentError)
      return jsonResponse({ error: 'Invoice dibuat, tetapi gagal menyimpan data pembayaran', details: paymentError.message }, 500)
    }

    const { error: notificationError } = await supabase.from('notifications').insert({
      user_id: user.id,
      type: 'info',
      title: 'Invoice Pembayaran Dibuat',
      message: `Invoice untuk release "${release.title}" telah dibuat. Total: Rp ${totalAmount.toLocaleString('id-ID')}`,
      metadata: { release_id: releaseId, amount: totalAmount },
    })

    if (notificationError) {
      console.error('Payment notification error:', notificationError)
    }

    return jsonResponse({
      invoice_url: xenditBody.invoice_url,
      invoice_id: xenditBody.id,
      amount: totalAmount,
      track_count: totalTracks,
      price_per_track: pricePerTrack,
    })
  } catch (error) {
    console.error('create-xendit-invoice error:', error)
    return jsonResponse({ error: error?.message || 'Internal server error' }, 500)
  }
})
