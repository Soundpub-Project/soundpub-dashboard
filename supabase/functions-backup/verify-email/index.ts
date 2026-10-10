import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const getDatabaseSchema = () => 
  Deno.env.get('DATABASE_SCHEMA') || 'Soundpub'

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
    const supabase = createSoundpubClient(supabaseUrl, supabaseServiceKey)
    
    const { token } = await req.json()
    
    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Get profile by token
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, verification_token_expires_at, email_verified')
      .eq('verification_token', token)
      .maybeSingle()
    
    if (error || !profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Check if already verified
    if (profile.email_verified) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Email already verified',
          redirectTo: '/dashboard'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Check expiry
    if (new Date(profile.verification_token_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token expired' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Set email as verified
    await supabase
      .from('profiles')
      .update({
        email_verified: true,
        verification_token: null,
        verification_token_expires_at: null
      })
      .eq('id', profile.id)
    
    // Update auth.users confirmed_at
    await supabase.auth.admin.updateUserById(profile.id, {
      email_confirm: true
    })
    
    // Log event
    await supabase.from('auth_events').insert({
      user_id: profile.id,
      event_type: 'email_verified',
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown',
      metadata: { email: profile.email }
    })
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email verified successfully',
        redirectTo: '/dashboard'
      }),
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
