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
        JSON.stringify({ valid: false, error: 'Token required', code: 'TOKEN_REQUIRED' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Get profile by token
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, password_reset_token_expires_at')
      .eq('password_reset_token', token)
      .maybeSingle()
    
    if (error || !profile) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Invalid token', code: 'TOKEN_INVALID' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Check expiry
    const expiresAt = new Date(profile.password_reset_token_expires_at)
    const now = new Date()
    
    if (expiresAt < now) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Token expired', code: 'TOKEN_EXPIRED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    return new Response(
      JSON.stringify({
        valid: true,
        userId: profile.id,
        email: profile.email,
        expiresAt: profile.password_reset_token_expires_at
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (err: any) {
    console.error('Error:', err)
    return new Response(
      JSON.stringify({ valid: false, error: 'Internal error', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
