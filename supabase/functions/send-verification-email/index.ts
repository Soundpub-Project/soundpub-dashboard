import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const getDatabaseSchema = () => 
  Deno.env.get('DATABASE_SCHEMA') || 'soundpub'

const createSoundpubClient = (url: string, key: string) => {
  return createClient(url, key, {
    db: { schema: getDatabaseSchema() }
  })
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 200 })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const appUrl = Deno.env.get('APP_URL') || 'https://dashboard.soundpub.xyz'
    const supabase = createSoundpubClient(supabaseUrl, supabaseServiceKey)
    
    const { userId, email, isResend } = await req.json()
    
    if (!userId || !email) {
      return new Response(
        JSON.stringify({ success: false, error: 'userId and email required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Check rate limit for resend (5 attempts/hour)
    if (isResend) {
      const { data: rateLimitData } = await supabase.rpc('check_rate_limit', {
        p_identifier: email,
        p_action_type: 'email_verification',
        p_max_attempts: 5,
        p_window_minutes: 60
      })
      
      if (rateLimitData && !rateLimitData.allowed) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Too many verification emails sent. Try again later.',
            retry_after_seconds: rateLimitData.retry_after_seconds || 3600
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }
    
    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, full_name, email_verified')
      .eq('id', userId)
      .single()
    
    if (!profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Generate verification token
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    
    // Update profile
    await supabase
      .from('profiles')
      .update({
        verification_token: token,
        verification_token_expires_at: expiresAt.toISOString(),
        verification_sent_at: new Date().toISOString()
      })
      .eq('id', userId)
    
    // Send email asynchronously (fire-and-forget to avoid timeout)
    const verifyUrl = `${appUrl}/verify-email?token=${token}`
    EdgeRuntime.waitUntil(supabase.functions.invoke('send-app-email', {
      body: {
        templateName: 'email-verification',
        recipientUserId: userId,
        templateData: {
          verifyUrl,
          userName: profile.full_name || 'User'
        }
      }
    }).catch((err) => {
      console.error('Email send failed (non-blocking):', err)
    }))
    
    // Log event
    await supabase.from('auth_events').insert({
      user_id: userId,
      event_type: 'email_verification_sent',
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown',
      metadata: { email, isResend: isResend || false }
    })
    
    return new Response(
      JSON.stringify({ success: true, message: 'Verification email sent' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (err: any) {
    console.error('Error:', err)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
