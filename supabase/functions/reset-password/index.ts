import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { buildCorsHeaders } from '../_shared/cors.ts'
import { sha256Hex } from '../_shared/auth.ts'

const getDatabaseSchema = () =>
  Deno.env.get('DATABASE_SCHEMA') || 'Soundpub'

const createSoundpubClient = (url: string, key: string) => {
  return createClient(url, key, {
    db: { schema: getDatabaseSchema() },
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 200 })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const appUrl = Deno.env.get('APP_URL') || 'https://dashboard.Soundpub.xyz'
    const supabase = createSoundpubClient(supabaseUrl, supabaseServiceKey)
    
    const { token, newPassword } = await req.json()
    
    // Validate inputs
    if (!token || !newPassword) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token and password required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Validate password strength
    if (newPassword.length < 8) {
      return new Response(
        JSON.stringify({ success: false, error: 'Password must be at least 8 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Rate limit by source IP: without it the token space can be ground
    // through this endpoint, which both verifies and consumes a token.
    const clientIp = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
    const { data: rateLimitData, error: rateLimitError } = await supabase.rpc('check_rate_limit', {
      p_identifier: `ip:${clientIp}`,
      p_action_type: 'password_reset_submit',
      p_max_attempts: 10,
      p_window_minutes: 60,
    })

    // Fail closed — a broken limiter must not mean unlimited guesses.
    if (rateLimitError || (rateLimitData && !rateLimitData.allowed)) {
      if (rateLimitError) console.error('check_rate_limit error:', rateLimitError)
      return new Response(
        JSON.stringify({ success: false, error: 'Too many attempts. Try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Tokens are stored hashed, so look up by the digest.
    const tokenHash = await sha256Hex(token)

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, password_reset_token_expires_at')
      .eq('password_reset_token', tokenHash)
      .maybeSingle()
    
    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Check expiry
    if (new Date(profile.password_reset_token_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token expired' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Update password using Admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      profile.id,
      { password: newPassword }
    )
    
    if (updateError) {
      console.error('Password update error:', updateError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update password' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Clear reset token
    await supabase
      .from('profiles')
      .update({
        password_reset_token: null,
        password_reset_token_expires_at: null
      })
      .eq('id', profile.id)
    
    // Log event
    await supabase.from('auth_events').insert({
      user_id: profile.id,
      event_type: 'password_reset_completed',
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown',
      metadata: { email: profile.email }
    })
    
    // Send confirmation email asynchronously (fire-and-forget to avoid timeout)
    EdgeRuntime.waitUntil(supabase.functions.invoke('send-app-email', {
      body: {
        templateName: 'password-reset-confirmation',
        recipientUserId: profile.id,
        templateData: {
          userName: profile.full_name || 'User',
          ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
          loginUrl: `${appUrl}/login`
        }
      }
    }).catch((err) => {
      console.error('Email send failed (non-blocking):', err)
    }))
    
    return new Response(
      JSON.stringify({ success: true, message: 'Password reset successful' }),
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
