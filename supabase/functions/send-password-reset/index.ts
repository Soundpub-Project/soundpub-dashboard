import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { buildCorsHeaders } from '../_shared/cors.ts'
import { sha256Hex } from '../_shared/auth.ts'

const getDatabaseSchema = () =>
  Deno.env.get('DATABASE_SCHEMA') || Deno.env.get('SUPABASE_DB_SCHEMA') || 'Soundpub'

const createSoundpubClient = (supabaseUrl: string, supabaseKey: string, options: any = {}) => {
  const existingDb = options.db || {}
  return createClient(supabaseUrl, supabaseKey, {
    ...options,
    db: { ...existingDb, schema: getDatabaseSchema() },
  })
}

async function measureStep<T>(requestId: string, name: string, action: () => Promise<T>): Promise<T> {
  const startedAt = performance.now()
  console.log(`[send-password-reset:${requestId}] ${name}:start`)
  try {
    const result = await action()
    console.log(`[send-password-reset:${requestId}] ${name}:ok ${Math.round(performance.now() - startedAt)}ms`)
    return result
  } catch (err) {
    console.error(`[send-password-reset:${requestId}] ${name}:error ${Math.round(performance.now() - startedAt)}ms`, err)
    throw err
  }
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 200 })
  }

  const requestId = crypto.randomUUID().slice(0, 8)
  const startedAt = performance.now()
  console.log(`[send-password-reset:${requestId}] request:start`)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const appUrl = Deno.env.get('APP_URL') || 'https://dashboard.Soundpub.xyz'
    const supabase = createSoundpubClient(supabaseUrl, supabaseServiceKey)

    const { email } = await measureStep(requestId, 'parse_json', () => req.json())

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email || !emailRegex.test(email)) {
      console.log(`[send-password-reset:${requestId}] request:end invalid_email ${Math.round(performance.now() - startedAt)}ms`)
      return new Response(
        JSON.stringify({ error: 'Invalid email format', code: 'INVALID_EMAIL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Rate limit on the email *and* the source IP. Email alone lets one host
    // walk a list of addresses; IP alone lets a distributed caller grind a
    // single mailbox.
    const clientIp = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
    const limits: Array<{ identifier: string; maxAttempts: number }> = [
      { identifier: `email:${email}`, maxAttempts: 3 },
      { identifier: `ip:${clientIp}`, maxAttempts: 10 },
    ]

    for (const limit of limits) {
      const { data: rateLimitData, error: rateLimitError } = await measureStep(requestId, 'rpc_check_rate_limit', () =>
        supabase.rpc('check_rate_limit', {
          p_identifier: limit.identifier,
          p_action_type: 'password_reset',
          p_max_attempts: limit.maxAttempts,
          p_window_minutes: 60,
        })
      )

      // Fail closed: if the limiter itself is broken we must not fall back to
      // unlimited password-reset mail.
      if (rateLimitError) {
        console.error(`[send-password-reset:${requestId}] rpc_check_rate_limit:supabase_error`, rateLimitError)
        return new Response(
          JSON.stringify({ error: 'Too many attempts. Try again later.', code: 'RATE_LIMIT_EXCEEDED', retry_after_seconds: 3600 }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (rateLimitData && !rateLimitData.allowed) {
        console.log(`[send-password-reset:${requestId}] request:end rate_limited ${Math.round(performance.now() - startedAt)}ms`)
        return new Response(
          JSON.stringify({
            error: 'Too many attempts. Try again later.',
            code: 'RATE_LIMIT_EXCEEDED',
            retry_after_seconds: rateLimitData.retry_after_seconds || 3600,
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    const { data: profile, error: profileError } = await measureStep(requestId, 'profiles_select', () =>
      supabase
        .from('profiles')
        .select('id, email, full_name')
        .eq('email', email)
        .maybeSingle()
    )

    if (profileError) {
      console.error(`[send-password-reset:${requestId}] profiles_select:supabase_error`, profileError)
    }

    if (!profile) {
      console.log(`[send-password-reset:${requestId}] request:end no_profile ${Math.round(performance.now() - startedAt)}ms`)
      return new Response(
        JSON.stringify({ success: true, message: 'If email exists, reset link sent.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 256 bits of entropy, and only its hash is persisted — a leaked `profiles`
    // row can no longer be turned into a working reset link.
    const tokenBytes = new Uint8Array(32)
    crypto.getRandomValues(tokenBytes)
    const token = Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, '0')).join('')
    const tokenHash = await sha256Hex(token)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    const { error: updateError } = await measureStep(requestId, 'profiles_update_token', () =>
      supabase.from('profiles').update({
        password_reset_token: tokenHash,
        password_reset_token_expires_at: expiresAt.toISOString(),
        password_reset_sent_at: new Date().toISOString(),
      }).eq('id', profile.id)
    )

    // Without a stored token the link cannot work, so stop rather than mail a
    // dead one.
    if (updateError) {
      console.error(`[send-password-reset:${requestId}] profiles_update_token:supabase_error`, updateError)
      return new Response(
        JSON.stringify({ error: 'Internal error', code: 'INTERNAL_ERROR' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const resetUrl = `${appUrl}/reset-password?token=${token}`
    console.log(`[send-password-reset:${requestId}] reset_url_created host=${new URL(resetUrl).host}`)

    const { error: authEventError } = await measureStep(requestId, 'auth_events_insert', () =>
      supabase.from('auth_events').insert({
        user_id: profile.id,
        event_type: 'password_reset_requested',
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
        user_agent: req.headers.get('user-agent') || 'unknown',
        metadata: { email: profile.email },
      })
    )

    if (authEventError) {
      console.error(`[send-password-reset:${requestId}] auth_events_insert:supabase_error`, authEventError)
    }


    const { error: emailError } = await measureStep(requestId, 'send_app_email', () =>
      supabase.functions.invoke('send-app-email', {
        body: {
          templateName: 'password-reset',
          recipientUserId: profile.id,
          templateData: { resetUrl },
          idempotencyKey: `password-reset-${tokenHash}`,
        },
      })
    )

    if (emailError) {
      console.error(`[send-password-reset:${requestId}] email_send:supabase_error`, emailError)
    }

    console.log(`[send-password-reset:${requestId}] request:end success ${Math.round(performance.now() - startedAt)}ms`)
    return new Response(
      JSON.stringify({ success: true, message: 'If email exists, reset link sent.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error(`[send-password-reset:${requestId}] request:error ${Math.round(performance.now() - startedAt)}ms`, err)
    return new Response(
      JSON.stringify({ error: 'Internal error', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
