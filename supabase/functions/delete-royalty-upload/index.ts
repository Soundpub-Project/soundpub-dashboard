import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function respond(ok: boolean, body: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok, ...body }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type') || '')) throw new Error('Content-Type must be application/json')
  const reader = req.body?.getReader()
  if (!reader) throw new Error('JSON body is required')
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 16 * 1024) {
        await reader.cancel()
        throw new Error('Request exceeds 16 KiB')
      }
      text += decoder.decode(value, { stream: true })
    }
    let body: unknown
    try {
      body = JSON.parse(text + decoder.decode())
    } catch {
      throw new Error('Invalid JSON body')
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Request must be an object')
    if (Object.keys(body).some(key => !['upload_id', 'reason'].includes(key))) throw new Error('Request contains unsupported fields')
    return body as Record<string, unknown>
  } finally {
    reader.releaseLock()
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return respond(false, { error: 'Method not allowed' })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !/^Bearer [^\s]+$/i.test(authHeader)) return respond(false, { error: 'Missing or invalid Authorization header' })
    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !anonKey || !serviceKey) throw new Error('Supabase configuration is missing')
    const options = { db: { schema: 'soundpub' }, auth: { persistSession: false, autoRefreshToken: false } }
    const userClient = createClient(url, anonKey, { ...options, global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return respond(false, { error: 'Unauthorized' })
    const service = createClient(url, serviceKey, options)
    const { data: isAdmin, error: adminError } = await service.rpc('is_admin', { user_id: user.id })
    if (adminError) throw new Error('Admin check failed')
    if (isAdmin !== true) return respond(false, { error: 'Only admins can delete uploads' })

    const body = await readBody(req)
    if (typeof body.upload_id !== 'string' || !UUID.test(body.upload_id)) throw new Error('upload_id must be a UUID')
    const reason = body.reason === undefined ? 'Deleted by administrator' : body.reason
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000 || /[\u0000-\u001f\u007f]/.test(reason)) throw new Error('reason must contain 1 to 1000 characters without control characters')

    const { data, error } = await service.rpc('reverse_royalty_upload', {
      p_upload_id: body.upload_id.toLowerCase(), p_actor_id: user.id, p_reason: reason.trim(),
    })
    if (error) throw new Error(error.message)
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.ok !== true || !Number.isSafeInteger(data.deletedRecords) || data.deletedRecords < 0) {
      throw new Error(typeof data?.error === 'string' ? data.error : 'Invalid reversal response')
    }
    return respond(true, { deletedRecords: data.deletedRecords, balanceRebuilt: true, rebuildErrors: [] })
  } catch (error) {
    return respond(false, { error: error instanceof Error ? error.message : 'Internal server error' })
  }
})
