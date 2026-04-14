import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const normalizeISRC = (isrc: string) => isrc.replace(/-/g, '').toUpperCase()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ success: false, error: 'Auth required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const supabaseUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })

    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { data: isAdmin } = await supabaseAdmin.rpc('is_admin', { _user_id: user.id })
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

    // Insert royalties
    const labelRev: Record<string, number> = {}
    const artistRev: Record<string, number> = {}
    let inserted = 0

    for (let i = 0; i < validRows.length; i += 100) {
      const batch = validRows.slice(i, i + 100).map((r: any) => {
        const track = isrcMap[r.isrc]
        const rel = track ? relMap[track.release_id] : null
        const labelName = r.label_name || (rel ? labelMap[rel.label_id] : '') || ''
        const artistName = r.artist || track?.artist_name || rel?.artist_name || ''
        
        // Priority: track.artist_user_id > release.artist_user_id (ISRC-based matching)
        const artistUserId = track?.artist_user_id || rel?.artist_user_id || null

        // Revenue split: 70% Artist, 21% Label, 9% Admin (flat for all labels)
        const adminShare = r.net_revenue * 0.09
        const labelShare = r.net_revenue * 0.21
        const artistShare = r.net_revenue * 0.70

        if (labelName) labelRev[labelName] = (labelRev[labelName] || 0) + labelShare
        if (artistUserId) {
          artistRev[artistUserId] = (artistRev[artistUserId] || 0) + artistShare
        } else if (labelName) {
          // If no artist account, artist share goes to label
          labelRev[labelName] = (labelRev[labelName] || 0) + artistShare
        }

        return { ...r, upload_id: upload.id, artist_user_id: artistUserId, label_name: labelName, artist: artistName, upc: r.upc || rel?.upc || '', title: r.title || track?.title || null }
      })

      const { error } = await supabaseAdmin.from('royalties').insert(batch)
      if (error) throw error
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

    // Update label balances with case-insensitive matching + per-item error handling
    const balanceErrors: string[] = []
    for (const [name, amount] of Object.entries(labelRev)) {
      try {
        const normalizedName = name.trim().toLowerCase()
        const p = profilesByNormalizedName[normalizedName]
        if (p) {
          await supabaseAdmin.from('profiles').update({ 
            balance: (p.balance || 0) + amount, 
            label_revenue: (p.label_revenue || 0) + amount 
          }).eq('id', p.id)
        } else {
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
            balance: (p.balance || 0) + amount, 
            artist_revenue: (p.artist_revenue || 0) + amount 
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
