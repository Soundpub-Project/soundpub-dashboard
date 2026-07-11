import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
const getDatabaseSchema = () => Deno.env.get('DATABASE_SCHEMA') || Deno.env.get('SUPABASE_DB_SCHEMA') || 'soundpub'

const createSoundpubClient = (supabaseUrl: string, supabaseKey: string, options: any = {}) => {
  const existingDb = options.db || {}
  return createClient(supabaseUrl, supabaseKey, {
    ...options,
    db: { ...existingDb, schema: getDatabaseSchema() },
  })
}


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const normalizeISRC = (isrc: string) => isrc.replace(/-/g, '').toUpperCase()

const SOUNDPUB_LABEL_ID = '423ecca4-2cd0-429d-b9f8-f9a8e8135289'
const SOUNDPUB_LABEL_NAME = 'SOUNDPUB MUSIC'
const SOUNDPUB_LABEL_ALIASES = new Set(['soundpub', 'soundpub music', 'soundpub music ecosystem'])
const normalizeName = (value: string | null | undefined) => (value || '').trim().toLowerCase()
const isSoundpubLabel = (labelUserId: string | null | undefined, labelName: string | null | undefined) => {
  return labelUserId === SOUNDPUB_LABEL_ID || SOUNDPUB_LABEL_ALIASES.has(normalizeName(labelName))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ success: false, error: 'Auth required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const supabaseAdmin = createSoundpubClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const supabaseUser = createSoundpubClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })

    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { data: isAdmin, error: adminError } = await supabaseAdmin.rpc('is_admin', { user_id: user.id })
    if (adminError) console.error('Admin check failed:', adminError)
    if (!isAdmin) return new Response(JSON.stringify({ success: false, error: 'Admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { rows, filename, originalFilename } = await req.json()
    if (!rows?.length) return new Response(JSON.stringify({ success: false, error: 'No data' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Validate - ISRC is primary key
    const validRows = rows.filter((r: any) => r.isrc?.trim() && r.period?.trim() && r.platform?.trim() && r.country?.trim()).map((r: any) => ({
      period: r.period.trim(),
      isrc: normalizeISRC(r.isrc.trim()),
      upc: r.upc?.trim() || '',
      title: r.title?.trim() || null,
      artist: r.artist?.trim() || null,
      label_name: r.label_name?.trim() || null,
      platform: r.platform.trim(),
      country: r.country.trim().toUpperCase(),
      sales_type: r.sales_type?.trim() || null,
      sales_unit: Number(r.sales_unit) || 0,
      net_revenue: Number(r.net_revenue) || 0,
    }))

    if (!validRows.length) return new Response(JSON.stringify({ success: false, error: 'No valid rows' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Create upload record
    const { data: upload } = await supabaseAdmin.from('royalty_uploads').insert({ user_id: user.id, filename, original_filename: originalFilename, total_records: rows.length, status: 'processing' }).select().single()
    if (!upload) throw new Error('Failed to create upload record')

    // Match ISRC to tracks for auto-fill (prioritize artist_user_id from tracks, fallback to releases)
    const { data: tracks } = await supabaseAdmin.from('tracks').select('isrc, artist_user_id, artist_name, title, release_id')
    const isrcMap: Record<string, any> = {}
    tracks?.forEach(t => { if (t.isrc) isrcMap[normalizeISRC(t.isrc)] = t })

    const releaseIds = [...new Set(Object.values(isrcMap).map((t: any) => t.release_id).filter(Boolean))]
    const { data: releases } = await supabaseAdmin.from('releases').select('id, label_id, upc, artist_user_id, artist_name').in('id', releaseIds.length ? releaseIds : ['_'])
    const relMap: Record<string, any> = {}
    releases?.forEach(r => relMap[r.id] = r)

    const labelIds = [...new Set(releases?.map(r => r.label_id).filter(Boolean) || [])]
    const { data: labels } = await supabaseAdmin.from('profiles').select('id, full_name').in('id', labelIds.length ? labelIds : ['_'])
    const labelMap: Record<string, string> = {}
    labels?.forEach(l => labelMap[l.id] = l.full_name)

    // Build a stable name -> user_id map for label/whitelabel profiles so we can persist label_user_id
    // on royalty rows (RLS now depends on this stable identifier instead of the mutable full_name).
    const { data: labelRoleRows } = await supabaseAdmin
      .from('user_roles')
      .select('user_id, role')
      .in('role', ['label', 'whitelabel'])
    const labelUserIds = [...new Set((labelRoleRows || []).map((r: any) => r.user_id))]
    const { data: labelProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .in('id', labelUserIds.length ? labelUserIds : ['_'])
    const nameToLabelId: Record<string, string | null> = {}
    const nameCounts: Record<string, number> = {}
    ;(labelProfiles || []).forEach((p: any) => {
      const key = (p.full_name || '').trim().toLowerCase()
      if (!key) return
      nameCounts[key] = (nameCounts[key] || 0) + 1
      nameToLabelId[key] = p.id
    })
    // Mark ambiguous names as null so we don't grant cross-tenant access
    Object.keys(nameCounts).forEach(k => { if (nameCounts[k] > 1) nameToLabelId[k] = null })

    // Insert royalties
    const labelRev: Record<string, number> = {}
    const artistRev: Record<string, number> = {}
    const labelRevById: Record<string, number> = {}
    let inserted = 0

    for (let i = 0; i < validRows.length; i += 100) {
      const batch = validRows.slice(i, i + 100).map((r: any) => {
        const track = isrcMap[r.isrc]
        const rel = track ? relMap[track.release_id] : null
        const sourceLabelName = r.label_name || (rel ? labelMap[rel.label_id] : '') || ''
        const matchedLabelId = (rel?.label_id) || nameToLabelId[normalizeName(sourceLabelName)] || null
        const soundpubLabel = isSoundpubLabel(matchedLabelId, sourceLabelName)
        const labelName = soundpubLabel ? SOUNDPUB_LABEL_NAME : sourceLabelName
        // Stable label identifier: prefer release.label_id (authoritative), fallback to unique name match.
        const labelUserId = soundpubLabel ? SOUNDPUB_LABEL_ID : matchedLabelId
        const artistName = r.artist || track?.artist_name || rel?.artist_name || ''
        
        // Priority: track.artist_user_id > release.artist_user_id (ISRC-based matching)
        const artistUserId = track?.artist_user_id || rel?.artist_user_id || null

        // Revenue split:
        // SOUNDPUB MUSIC: 70% artist, 30% Soundpub label.
        // Other label/whitelabel: 49% artist, 21% label, 30% admin.
        // If no artist account is linked, the whole non-admin pool goes to the label.
        const adminShare = soundpubLabel ? 0 : r.net_revenue * 0.30
        const labelShare = soundpubLabel ? r.net_revenue * 0.30 : (artistUserId ? r.net_revenue * 0.21 : r.net_revenue * 0.70)
        const artistShare = artistUserId ? (soundpubLabel ? r.net_revenue * 0.70 : r.net_revenue * 0.49) : 0

        if (labelUserId) labelRevById[labelUserId] = (labelRevById[labelUserId] || 0) + labelShare
        if (labelName) labelRev[labelName] = (labelRev[labelName] || 0) + labelShare
        if (artistUserId) {
          artistRev[artistUserId] = (artistRev[artistUserId] || 0) + artistShare
        }

        return {
          upload_id: upload.id,
          period: r.period,
          isrc: r.isrc,
          upc: r.upc || rel?.upc || '',
          title: r.title || track?.title || null,
          artist: artistName,
          artist_name: artistName,
          label_name: labelName,
          platform: r.platform,
          country: r.country,
          sales_type: r.sales_type || '',
          unit_penjualan: r.sales_unit,
          pendapatan_kotor_dsp: r.net_revenue,
          pendapatan_label_artis: r.net_revenue,
          pendapatan_bersih_soundpub: adminShare,
          artist_revenue: artistShare,
          label_revenue: labelShare,
          soundpub_revenue: adminShare,
          net_revenue: r.net_revenue,
          artist_user_id: artistUserId,
          label_user_id: labelUserId,
        }
      })

      const { error } = await supabaseAdmin.from('royalties').insert(batch)
      if (error) {
        console.error('Royalty batch insert failed:', error)
        throw new Error(`Failed to insert royalties: ${error.message}`)
      }
      inserted += batch.length
    }

    // *** UPDATE UPLOAD RECORD IMMEDIATELY after insert, BEFORE balance updates ***
    await supabaseAdmin.from('royalty_uploads').update({ 
      status: 'inserted', 
      inserted_records: inserted 
    }).eq('id', upload.id)

    // Pre-fetch ALL profiles for case-insensitive name matching
    const allLabelNames = Object.keys(labelRev)
    const { data: allProfiles } = await supabaseAdmin.from('profiles').select('id, full_name, balance, label_revenue')
    const profilesByNormalizedName: Record<string, any> = {}
    allProfiles?.forEach(p => {
      profilesByNormalizedName[p.full_name.trim().toLowerCase()] = p
    })

    // Update label/whitelabel balances by stable user id first, fallback by name.
    const balanceErrors: string[] = []
    for (const [id, amount] of Object.entries(labelRevById)) {
      try {
        const { data: p } = await supabaseAdmin.from('profiles').select('balance, label_revenue').eq('id', id).single()
        if (p) {
          await supabaseAdmin.from('profiles').update({ 
            balance: Number(p.balance || 0) + amount, 
            label_revenue: Number(p.label_revenue || 0) + amount 
          }).eq('id', id)
        }
      } catch (e) {
        console.error(`Failed to update label balance for user "${id}":`, e)
        balanceErrors.push(`Label update failed: ${id}`)
      }
    }

    for (const [name, amount] of Object.entries(labelRev)) {
      try {
        const normalizedName = name.trim().toLowerCase()
        const p = profilesByNormalizedName[normalizedName]
        if (p && !labelRevById[p.id]) {
          await supabaseAdmin.from('profiles').update({ 
            balance: Number(p.balance || 0) + amount, 
            label_revenue: Number(p.label_revenue || 0) + amount 
          }).eq('id', p.id)
        } else if (!p) {
          console.warn(`Label profile not found: "${name}" (normalized: "${normalizedName}")`)
          balanceErrors.push(`Label not found: ${name}`)
        }
      } catch (e) {
        console.error(`Failed to update label balance for "${name}":`, e)
        balanceErrors.push(`Label update failed: ${name}`)
      }
    }

    // Update artist balances with per-item error handling
    for (const [id, amount] of Object.entries(artistRev)) {
      try {
        const { data: p } = await supabaseAdmin.from('profiles').select('balance, artist_revenue').eq('id', id).single()
        if (p) {
          await supabaseAdmin.from('profiles').update({ 
            balance: Number(p.balance || 0) + amount, 
            artist_revenue: Number(p.artist_revenue || 0) + amount 
          }).eq('id', id)
        }
      } catch (e) {
        console.error(`Failed to update artist balance for "${id}":`, e)
        balanceErrors.push(`Artist update failed: ${id}`)
      }
    }

    // Final status update
    await supabaseAdmin.from('royalty_uploads').update({ 
      status: 'completed',
      summary: balanceErrors.length ? { balance_errors: balanceErrors } : null
    }).eq('id', upload.id)

    return new Response(JSON.stringify({ success: true, insertedCount: inserted, uploadId: upload.id, balanceErrors }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    console.error('Process royalty upload error:', e)
    const SAFE_MESSAGES = ['Auth required', 'Unauthorized', 'Admin only', 'No data', 'No valid rows', 'Failed to create upload']
    let safeMessage = 'Failed to process royalty upload'
    if (e instanceof Error && SAFE_MESSAGES.some((m: string) => e.message.startsWith(m) || e.message.includes(m))) {
      safeMessage = e.message
    }
    return new Response(JSON.stringify({ success: false, error: safeMessage }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
