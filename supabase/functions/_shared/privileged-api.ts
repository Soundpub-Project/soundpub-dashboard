import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

export class HttpError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) {
    super(message)
  }
}

export const privilegedCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function errorResponse(error: unknown): Response {
  const failure = error instanceof HttpError ? error : new HttpError(503, 'Service unavailable')
  return new Response(JSON.stringify({ error: failure.message }), {
    status: failure.status,
    headers: {
      ...privilegedCorsHeaders,
      'Content-Type': 'application/json',
      ...(failure.retryAfter ? { 'Retry-After': String(failure.retryAfter) } : {}),
    },
  })
}

export async function authenticatePrivilegedRequest(req: Request, allowUser: boolean) {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
  const match = /^Bearer ([^\s,]{1,8192})$/i.exec(req.headers.get('authorization') || '')
  if (!match) throw new HttpError(401, 'Unauthorized')
  const token = match[1]
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  if (!serviceKey || !url) throw new HttpError(503, 'Service unavailable')
  const digest = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  const [supplied, expected] = await Promise.all([digest(token), digest(serviceKey)])
  const expectedBytes = new Uint8Array(expected)
  const difference = new Uint8Array(supplied).reduce((result, byte, index) => result | (byte ^ expectedBytes[index]), 0)
  const supabase = createClient(url, serviceKey, {
    db: { schema: Deno.env.get('DATABASE_SCHEMA') || Deno.env.get('SUPABASE_DB_SCHEMA') || 'soundpub' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  if (difference === 0) {
    try {
      const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      const now = Date.now() / 1000
      if (claims.role !== 'service_role' || !Number.isFinite(claims.exp) || claims.exp <= now ||
        (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now))) {
        throw new Error('Invalid credential')
      }
    } catch {
      throw new HttpError(401, 'Unauthorized')
    }
    return { supabase, actor: { id: 'internal', role: 'service_role', internal: true, name: '' } }
  }
  if (!allowUser) throw new HttpError(401, 'Unauthorized')
  const { data: auth, error: authError } = await supabase.auth.getUser(token)
  if (authError || !auth.user) throw new HttpError(401, 'Unauthorized')
  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('status, full_name').eq('id', auth.user.id).maybeSingle()
  if (profileError) throw new HttpError(503, 'Service unavailable')
  if (!profile || profile.status !== 'active') throw new HttpError(403, 'Forbidden')
  const { data: role, error: roleError } = await supabase.from('user_roles')
    .select('role').eq('user_id', auth.user.id).maybeSingle()
  if (roleError) throw new HttpError(503, 'Service unavailable')
  if (!role) throw new HttpError(403, 'Forbidden')
  return { supabase, actor: { id: auth.user.id, role: String(role.role), internal: false, name: String(profile.full_name || 'User') } }
}

export async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type') || '')) {
    throw new HttpError(415, 'Expected application/json')
  }
  const reader = req.body?.getReader()
  if (!reader) throw new HttpError(400, 'Invalid JSON object')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 65536) {
        await reader.cancel()
        throw new HttpError(413, 'Request too large')
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid object')
    return input as Record<string, unknown>
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(400, 'Invalid JSON object')
  } finally {
    reader.releaseLock()
  }
}

export async function consumeRateLimit(
  supabase: Awaited<ReturnType<typeof authenticatePrivilegedRequest>>['supabase'],
  identifier: string,
  action: string,
  maximum: number,
  windowMinutes: number,
) {
  const windowMs = windowMinutes * 60000
  const window = Math.floor(Date.now() / windowMs)
  for (let slot = 0; slot < maximum; slot++) {
    const { error } = await supabase.from('rate_limits').insert({
      identifier: `privileged:${identifier}:${window}`,
      action_type: `${action}:${slot}`,
    })
    if (!error) return
    if (error.code !== '23505') throw new HttpError(503, 'Service unavailable')
  }
  throw new HttpError(429, 'Rate limit exceeded', Math.max(1, Math.ceil(((window + 1) * windowMs - Date.now()) / 1000)))
}
