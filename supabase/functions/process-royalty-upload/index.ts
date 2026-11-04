import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAGE_SIZE = 500
const normalizeISRC = (value: string) => value.trim().replace(/-/g, '').toUpperCase()
const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()
const labelNameKey = (value: string) => {
  const name = normalizeName(value)
  return ['soundpub', 'soundpub music', 'soundpub music ecosystem'].includes(name) ? 'soundpub music' : name
}
const sha256 = async (value: string) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

class InputError extends Error {}

function object(value: unknown, fields: readonly string[], context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError(context + ' must be an object')
  const result = value as Record<string, unknown>
  if (Object.keys(result).some(key => !fields.includes(key))) throw new InputError(context + ' contains unsupported fields')
  return result
}

function text(value: unknown, field: string, max = 500, optional = false): string {
  if (optional && value === undefined) return ''
  if (typeof value !== 'string' || value.length > max || [...value].some(char => {
    const code = char.charCodeAt(0)
    return code <= 31 || code === 127
  })) {
    throw new InputError(field + ' must be text of at most ' + max + ' characters without control characters')
  }
  const result = value.trim()
  if (!optional && !result) throw new InputError(field + ' is required')
  return result
}

function optionalId(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !UUID.test(value)) throw new InputError(field + ' must be a UUID')
  return value.toLowerCase()
}

async function readBody(req: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type') || '')) throw new InputError('Content-Type must be application/json')
  const reader = req.body?.getReader()
  if (!reader) throw new InputError('JSON body is required')
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let body = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 20 * 1024 * 1024) {
        await reader.cancel()
        throw new InputError('Request exceeds 20 MiB')
      }
      body += decoder.decode(value, { stream: true })
    }
    return JSON.parse(body + decoder.decode())
  } catch (error) {
    if (error instanceof InputError) throw error
    throw new InputError('Invalid JSON body')
  } finally {
    reader.releaseLock()
  }
}

function validateRow(value: unknown, index: number) {
  const context = 'Row ' + (index + 1)
  const row = object(value, ['period', 'isrc', 'upc', 'title', 'artist', 'label_name', 'platform', 'country', 'sales_type', 'sales_unit', 'net_revenue', 'artist_user_id', 'label_user_id'], context)
  const period = text(row.period, context + ': period', 7)
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(period)) throw new InputError(context + ': period must be YYYY-MM')
  const rawISRC = text(row.isrc, context + ': isrc', 15)
  if (!/^(?:[a-z]{2}[a-z0-9]{3}\d{7}|[a-z]{2}-[a-z0-9]{3}-\d{2}-\d{5})$/i.test(rawISRC)) throw new InputError(context + ': invalid ISRC')
  const upc = text(row.upc, context + ': upc', 13, true)
  if (upc && !/^\d{12,13}$/.test(upc)) throw new InputError(context + ': UPC must contain 12 or 13 digits')
  const country = text(row.country, context + ': country', 2).toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) throw new InputError(context + ': country must be a two-letter code')
  if (typeof row.sales_unit !== 'number' || !Number.isSafeInteger(row.sales_unit)) throw new InputError(context + ': sales_unit must be a safe integer')
  if (row.sales_unit < 0 || row.sales_unit > 2147483647) throw new InputError(context + ': sales_unit must be between 0 and 2147483647')
  if (typeof row.net_revenue !== 'number' || !Number.isFinite(row.net_revenue) || Math.abs(row.net_revenue) > Number.MAX_SAFE_INTEGER / 100) {
    throw new InputError(context + ': net_revenue must be a finite number within the supported monetary range')
  }
  if (row.net_revenue < 0) throw new InputError(context + ': net_revenue must not be negative')
  if (Math.abs(row.net_revenue * 100 - Math.round(row.net_revenue * 100)) > 1e-8) throw new InputError(context + ': net_revenue supports at most two decimal places')
  return {
    period, isrc: normalizeISRC(rawISRC), rawISRC, upc, country,
    title: text(row.title, context + ': title', 1000, true),
    artist: text(row.artist, context + ': artist', 500, true),
    label_name: text(row.label_name, context + ': label_name', 500, true),
    platform: text(row.platform, context + ': platform', 200),
    sales_type: text(row.sales_type, context + ': sales_type', 100, true),
    sales_unit: row.sales_unit, net_revenue: row.net_revenue,
    artist_user_id: optionalId(row.artist_user_id, context + ': artist_user_id'),
    label_user_id: optionalId(row.label_user_id, context + ': label_user_id'),
  }
}

type Profile = { id: string; full_name: string | null; parent_label_id: string | null; status: string | null }
type Track = { id: string; isrc: string; title: string | null; artist_name: string | null; release_id: string | null; artist_user_id: string | null }
type Release = { id: string; label_id: string | null; upc: string | null; artist_name: string | null; artist_user_id: string | null }
const createSoundpubClient = (url: string, key: string, authorization?: string) => createClient(url, key, {
  db: { schema: 'soundpub' },
  auth: { persistSession: false, autoRefreshToken: false },
  ...(authorization ? { global: { headers: { Authorization: authorization } } } : {}),
})
type Client = ReturnType<typeof createSoundpubClient>

// Paginate every lookup so API row limits cannot hide an ambiguous recipient.
async function lookup<T>(client: Client, table: string, columns: string, field: string, values: string[], order = 'id'): Promise<T[]> {
  const result: T[] = []
  const unique = [...new Set(values)]
  for (let i = 0; i < unique.length; i += 100) {
    for (let offset = 0; ; ) {
      const query = client.from(table).select(columns).in(field, unique.slice(i, i + 100)).order(order)
      if (order !== 'id') query.order('id')
      const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1)
      if (error || !data) throw new Error('Failed to resolve ' + table)
      if (!data.length) break
      result.push(...data as unknown as T[])
      offset += data.length
    }
  }
  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return respond({ success: false, error: 'Method not allowed' }, 405)

  const createdArtistIds: string[] = []
  let service: Client | undefined
  let commitAttempted = false
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !/^Bearer [^\s]+$/i.test(authHeader)) return respond({ success: false, error: 'Auth required' }, 401)
    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !anonKey || !serviceKey) throw new Error('Supabase configuration is missing')
    const userClient = createSoundpubClient(url, anonKey, authHeader)
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return respond({ success: false, error: 'Unauthorized' }, 401)
    service = createSoundpubClient(url, serviceKey)
    const { data: isAdmin, error: adminError } = await service.rpc('is_admin', { user_id: user.id })
    if (adminError) throw new Error('Admin check failed')
    if (isAdmin !== true) return respond({ success: false, error: 'Admin only' }, 403)

    const body = object(await readBody(req), ['rows', 'filename', 'originalFilename', 'replaceExisting', 'replaceMode', 'idempotencyKey'], 'Request')
    const filename = text(body.filename, 'filename', 255)
    const originalFilename = body.originalFilename === undefined ? filename : text(body.originalFilename, 'originalFilename', 255)
    if (/[\\/]/.test(filename) || /[\\/]/.test(originalFilename) || [filename, originalFilename].some(name => name === '.' || name === '..')) throw new InputError('Filenames must not contain paths')
    const replaceExisting = body.replaceExisting === undefined ? false : body.replaceExisting
    if (typeof replaceExisting !== 'boolean') throw new InputError('replaceExisting must be boolean')
    const replaceMode = body.replaceMode === undefined ? 'filename_period' : body.replaceMode
    if (replaceMode !== 'filename_period') throw new InputError('Only exact filename and period replacement is permitted')
    const idempotencyKey = body.idempotencyKey === undefined ? null : text(body.idempotencyKey, 'idempotencyKey', 200)
    if (idempotencyKey !== null && !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) throw new InputError('Invalid idempotencyKey')
    if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > 50000) throw new InputError('rows must contain 1 to 50000 records')
    const rows = body.rows.map(validateRow)
    const periods = [...new Set(rows.map(row => row.period))]
    if (periods.length !== 1) throw new InputError('Each upload must contain exactly one royalty period')
    const isrcVariants = rows.flatMap(row => {
      const dashed = row.isrc.slice(0, 2) + '-' + row.isrc.slice(2, 5) + '-' + row.isrc.slice(5, 7) + '-' + row.isrc.slice(7)
      return [row.rawISRC, row.isrc, row.isrc.toLowerCase(), dashed, dashed.toLowerCase()]
    })
    const tracks = await lookup<Track>(service, 'tracks', 'id,isrc,title,artist_name,release_id,artist_user_id', 'isrc', isrcVariants)
    const releases = await lookup<Release>(service, 'releases', 'id,label_id,upc,artist_name,artist_user_id', 'id', tracks.flatMap(track => track.release_id ? [track.release_id] : []))
    const releaseById = new Map(releases.map(release => [release.id, release]))
    const tracksByISRC = new Map<string, Track[]>()
    for (const track of tracks) {
      const key = normalizeISRC(track.isrc)
      const matches = tracksByISRC.get(key) || []
      if (!matches.some(match => match.id === track.id)) matches.push(track)
      tracksByISRC.set(key, matches)
    }
    const labelRoles = await lookup<{ user_id: string }>(service, 'user_roles', 'user_id', 'role', ['label', 'whitelabel'], 'user_id')
    const labels = (await lookup<Profile>(service, 'profiles', 'id,full_name,parent_label_id,status', 'id', labelRoles.map(role => role.user_id))).filter(label => label.status === 'active')
    const labelById = new Map(labels.map(label => [label.id, label]))

    const scopedRows = rows.map((row, index) => {
      const fail = (message: string): never => { throw new InputError('Row ' + (index + 1) + ': ' + message) }
      const matches = tracksByISRC.get(row.isrc) || []
      if (matches.some(track => !track.release_id || !releaseById.get(track.release_id)?.label_id)) fail('Track label is unresolved')
      const catalogLabels = [...new Set(matches.map(track => releaseById.get(track.release_id!)!.label_id!))]
      let labelId = row.label_user_id
      if (labelId && !labelById.has(labelId)) fail('label_user_id is not an active label')
      if (matches.length) {
        if (catalogLabels.length !== 1) fail('ISRC maps to more than one catalog label')
        if (labelId && labelId !== catalogLabels[0]) fail('label_user_id conflicts with the catalog')
        labelId = catalogLabels[0]
      } else if (row.label_name) {
        const candidates = labels.filter(label => label.full_name && labelNameKey(label.full_name) === labelNameKey(row.label_name))
        if (labelId ? !candidates.some(label => label.id === labelId) : candidates.length !== 1) fail('Label name is unresolved, ambiguous, or conflicts with label_user_id')
        labelId ||= candidates[0].id
      }
      if (!labelId || !labelById.has(labelId)) fail('Label is unresolved or inactive')
      return { row, label: labelById.get(labelId)!, matches, fail }
    })

    const fallbackArtists = await lookup<Profile>(service, 'profiles', 'id,full_name,parent_label_id,status', 'parent_label_id', scopedRows.map(item => item.label.id))
    const catalogArtistIds = [...new Set(scopedRows.flatMap(item => item.matches.flatMap(track => {
      const release = releaseById.get(track.release_id!)
      return track.artist_user_id ? [track.artist_user_id] : release?.artist_user_id ? [release.artist_user_id] : []
    })))]
    const catalogArtists = await lookup<Profile>(service, 'profiles', 'id,full_name,parent_label_id,status', 'id', catalogArtistIds)
    const artists = [...new Map([...fallbackArtists, ...catalogArtists].map(artist => [artist.id, artist])).values()].filter(artist => artist.status === 'active')
    const artistRoles = await lookup<{ user_id: string; role: string }>(service, 'user_roles', 'user_id,role', 'user_id', artists.map(artist => artist.id))
    const artistIds = new Set(artistRoles.filter(role => role.role === 'artist').map(role => role.user_id))
    const artistById = new Map(artists.filter(artist => artistIds.has(artist.id)).map(artist => [artist.id, artist]))
    const missingArtists = new Map<string, { name: string; labelId: string }>()
    const resolvedRows = scopedRows.map(({ row, label, matches, fail }) => {
      const resolveName = (name: string): string => {
        if (!name) fail('Artist name is missing')
        const matches = artists.filter(artist => artist.parent_label_id === label.id && artist.full_name && normalizeName(artist.full_name) === normalizeName(name))
        if (matches.length > 1 || (matches.length === 1 && !artistIds.has(matches[0].id))) fail('Artist is ambiguous or inactive under the resolved label')
        if (matches.length === 1) return matches[0].id
        const key = label.id + '|' + normalizeName(name)
        if (!missingArtists.has(key)) missingArtists.set(key, { name, labelId: label.id })
        return key
      }
      const candidates = matches.map(track => {
        const release = releaseById.get(track.release_id!)!
        const artistId = track.artist_user_id || release.artist_user_id || resolveName(track.artist_name || release.artist_name || row.artist)
        if (!artistById.has(artistId) && !missingArtists.has(artistId)) fail('Catalog artist is missing, inactive, or not assigned the artist role')
        return { track, release, artistId }
      })
      let artistId = row.artist_user_id
      if (artistId && !artistById.has(artistId)) fail('artist_user_id is missing, inactive, or not assigned the artist role')
      const catalogIds = [...new Set(candidates.flatMap(candidate => candidate.artistId ? [candidate.artistId] : []))]
      if (artistId && catalogIds.length && !catalogIds.includes(artistId)) fail('artist_user_id conflicts with the catalog')
      if (!artistId && catalogIds.length === 1) artistId = catalogIds[0]
      if (!artistId && catalogIds.length > 1) fail('ISRC artist is ambiguous; provide artist_user_id')
      if (!artistId) artistId = resolveName(row.artist)
      const artist = artistById.get(artistId) || { full_name: missingArtists.get(artistId)?.name }
      const selected = candidates.filter(candidate => !candidate.artistId || candidate.artistId === artistId)
      if (row.artist && ![artist.full_name, ...selected.flatMap(candidate => [candidate.track.artist_name, candidate.release.artist_name])].some(name => name && normalizeName(name) === normalizeName(row.artist))) fail('Artist name conflicts with the resolved artist')
      const upcs = [...new Set(selected.flatMap(candidate => candidate.release.upc ? [candidate.release.upc] : []))]
      if (row.upc && upcs.length && !upcs.includes(row.upc)) fail('UPC conflicts with the resolved catalog')
      const titles = [...new Set(selected.flatMap(candidate => candidate.track.title ? [candidate.track.title] : []))]
      return {
        period: row.period, isrc: row.isrc,
        upc: row.upc || (upcs.length === 1 ? upcs[0] : ''),
        title: row.title || (titles.length === 1 ? titles[0] : null),
        artist: row.artist || artist.full_name || fail('Artist name is missing'),
        label_name: label.full_name || fail('Label name is missing'),
        platform: row.platform, country: row.country, sales_type: row.sales_type,
        sales_unit: row.sales_unit, net_revenue: row.net_revenue,
        artist_user_id: artistId, label_user_id: label.id,
      }
    })

    const managedArtistIds = new Map<string, string>()
    for (const [key, { name, labelId }] of missingArtists) {
      const email = `${normalizeName(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'artist'}-${crypto.randomUUID()}@managed.soundpub.local`
      const { data: created, error: createError } = await service.auth.admin.createUser({
        email, password: crypto.randomUUID() + crypto.randomUUID(), email_confirm: true,
        user_metadata: { full_name: name, managed_artist: true, auth_user_status: 'managed_only', password_set: false, created_from_royalty_upload: true },
      })
      if (createError || !created.user) throw new Error('Failed to create managed artist: ' + (createError?.message || name))
      const artistId = created.user.id
      createdArtistIds.push(artistId)
      const { data: profile, error: profileError } = await service.from('profiles').update({
        full_name: name, parent_label_id: labelId, is_managed_artist: true,
        auth_user_status: 'managed_only', password_set: false,
      }).eq('id', artistId).select('id').single()
      if (profileError || !profile) throw new Error('Failed to link managed artist profile')
      const { error: roleError } = await service.from('user_roles').upsert({ user_id: artistId, role: 'artist' }, { onConflict: 'user_id' })
      if (roleError) throw new Error('Failed to set managed artist role')
      managedArtistIds.set(key, artistId)
    }
    for (const row of resolvedRows) row.artist_user_id = managedArtistIds.get(row.artist_user_id) || row.artist_user_id

    const canonicalRows = [...resolvedRows].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    const effectiveIdempotencyKey = idempotencyKey || await sha256(JSON.stringify({
      replaceExisting,
      replaceMode,
      rows: canonicalRows,
    }))
    commitAttempted = true
    const { data, error } = await service.rpc('commit_royalty_upload', {
      p_rows: resolvedRows, p_actor_id: user.id, p_filename: filename,
      p_original_filename: originalFilename, p_replace_existing: replaceExisting,
      p_replace_mode: replaceMode, p_idempotency_key: effectiveIdempotencyKey,
    })
    if (error) throw new Error(error.message)
    if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.success !== 'boolean') throw new Error('Invalid commit response')
    const managedArtistsCreated = createdArtistIds.length
    createdArtistIds.length = 0
    return respond({ ...data, managedArtistsCreated })
  } catch (error) {
    if (service) for (const artistId of createdArtistIds.reverse()) {
      if (commitAttempted) {
        const { data: linked, error: lookupError } = await service.from('royalties').select('id').eq('artist_user_id', artistId).limit(1)
        if (lookupError || linked?.length) {
          console.error('[process-royalty-upload] managed artist retained after uncertain commit', { artistId, message: lookupError?.message })
          continue
        }
      }
      const { error: cleanupError } = await service.auth.admin.deleteUser(artistId)
      if (cleanupError) console.error('[process-royalty-upload] managed artist cleanup failed', { artistId, message: cleanupError.message })
    }
    const message = error instanceof Error ? error.message : 'Failed to process royalty upload'
    const status = error instanceof InputError ? 400 : 500
    console.error('[process-royalty-upload]', { status, message })
    return respond({ success: false, error: message }, status)
  }
})
