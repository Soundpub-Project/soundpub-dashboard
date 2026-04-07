import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const xenditSecretKey = Deno.env.get('XENDIT_SECRET_KEY')

    if (!xenditSecretKey) {
      return new Response(JSON.stringify({ error: 'Payment gateway not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Get user from token
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { release_id } = await req.json()
    if (!release_id) {
      return new Response(JSON.stringify({ error: 'release_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Use service role for all DB operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get release info
    const { data: release, error: releaseError } = await supabase
      .from('releases')
      .select('id, title, artist_name, label_id, status, release_type')
      .eq('id', release_id)
      .single()

    if (releaseError || !release) {
      return new Response(JSON.stringify({ error: 'Release not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Count tracks
    const { count: trackCount } = await supabase
      .from('tracks')
      .select('id', { count: 'exact', head: true })
      .eq('release_id', release_id)

    const totalTracks = trackCount || 1

    // Get pricing settings
    const { data: settingsData } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['release_pricing_mode', 'release_price_per_track', 'release_price_single', 'release_price_ep', 'release_price_album'])

    const settings: Record<string, string> = {}
    settingsData?.forEach((s: { key: string; value: string | null }) => {
      if (s.value) settings[s.key] = s.value
    })

    const pricingMode = settings.release_pricing_mode || 'per_track'
    let totalAmount: number
    let pricePerTrack: number
    let description: string

    if (pricingMode === 'per_category') {
      // Price by release type
      const releaseType = (release.release_type || 'single').toLowerCase()
      const priceMap: Record<string, number> = {
        single: parseInt(settings.release_price_single || '50000', 10),
        ep: parseInt(settings.release_price_ep || '150000', 10),
        album: parseInt(settings.release_price_album || '300000', 10),
      }
      totalAmount = priceMap[releaseType] || priceMap.single
      pricePerTrack = Math.ceil(totalAmount / totalTracks)
      description = `Pembayaran Release (${releaseType.toUpperCase()}): ${release.title}`
    } else {
      // Price per track (default)
      pricePerTrack = parseInt(settings.release_price_per_track || '50000', 10)
      totalAmount = pricePerTrack * totalTracks
      description = `Pembayaran Release: ${release.title} (${totalTracks} track)`
    }

    // Get user profile for email
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', user.id)
      .single()

    // Create Xendit Invoice
    const xenditAuth = btoa(xenditSecretKey + ':')
    const externalId = `release-${release_id}-${Date.now()}`

    const invoicePayload = {
      external_id: externalId,
      amount: totalAmount,
      currency: 'IDR',
      description,
      payer_email: profile?.email || user.email,
      customer: {
        given_names: profile?.full_name || 'User',
        email: profile?.email || user.email,
      },
      success_redirect_url: `${req.headers.get('origin') || 'https://soundpub-dashboard.lovable.app'}/payment/callback?status=success&release_id=${release_id}`,
      failure_redirect_url: `${req.headers.get('origin') || 'https://soundpub-dashboard.lovable.app'}/payment/callback?status=failed&release_id=${release_id}`,
      items: [{
        name: `Release: ${release.title}`,
        quantity: totalTracks,
        price: pricePerTrack,
        category: 'MUSIC_RELEASE',
      }],
    }

    const xenditResponse = await fetch('https://api.xendit.co/v2/invoices', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${xenditAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(invoicePayload),
    })

    const xenditBody = await xenditResponse.json()

    if (!xenditResponse.ok) {
      console.error('Xendit error:', xenditBody)
      return new Response(JSON.stringify({ error: 'Failed to create payment invoice', details: xenditBody.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Save payment record
    const { error: paymentError } = await supabase
      .from('release_payments')
      .insert({
        release_id,
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
    }

    // Update release status to pending (awaiting payment)
    await supabase
      .from('releases')
      .update({ status: 'pending' })
      .eq('id', release_id)

    // Create notification for the user
    await supabase.from('notifications').insert({
      user_id: user.id,
      type: 'info',
      title: 'Invoice Pembayaran Dibuat',
      message: `Invoice untuk release "${release.title}" telah dibuat. Total: Rp ${totalAmount.toLocaleString('id-ID')}`,
      metadata: { release_id, amount: totalAmount },
    })

    return new Response(JSON.stringify({
      invoice_url: xenditBody.invoice_url,
      invoice_id: xenditBody.id,
      amount: totalAmount,
      track_count: totalTracks,
      price_per_track: pricePerTrack,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
