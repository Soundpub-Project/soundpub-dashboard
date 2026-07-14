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

const SOUNDPUB_LABEL_NAME = 'SOUNDPUB MUSIC'
const SOUNDPUB_LABEL_ALIASES = new Set(['soundpub', 'soundpub music', 'soundpub music ecosystem'])
const MANAGED_ARTIST_DOMAIN = 'managed.soundpub.local'
const normalizeName = (value: string | null | undefined) => (value || '').trim().replace(/\s+/g, ' ').toLowerCase()
const slugify = (value: string | null | undefined) => normalizeName(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'artist'
const isSoundpubLabel = (labelUserId: string | null | undefined, labelName: string | null | undefined, soundpubLabelId: string | null | undefined) => {
  return (!!soundpubLabelId && labelUserId === soundpubLabelId) || SOUNDPUB_LABEL_ALIASES.has(normalizeName(labelName))
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

    const { rows, filename, originalFilename, replaceExisting = false, replaceMode = 'filename_period' } = await req.json()
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

    const uploadedPeriods = [...new Set(validRows.map((row: any) => row.period).filter(Boolean))]
    const normalizedReplaceMode = replaceMode === 'period' ? 'period' : 'filename_period'
    let replacedUploads = 0
    let replacedRows = 0

    if (replaceExisting && uploadedPeriods.length > 0) {
      const affectedUploadIds = new Set<string>()

      if (normalizedReplaceMode === 'filename_period') {
        if (!originalFilename) throw new Error('Original filename is required for filename + period replace')

        const { data: oldUploads, error: oldUploadError } = await supabaseAdmin
          .from('royalty_uploads')
          .select('id, inserted_records, original_filename')
          .eq('original_filename', originalFilename)
        if (oldUploadError) throw oldUploadError

        for (const oldUpload of oldUploads || []) {
          for (const period of uploadedPeriods) {
            const { count, error: oldRoyaltiesDeleteError } = await supabaseAdmin
              .from('royalties')
              .delete({ count: 'exact' })
              .eq('upload_id', oldUpload.id)
              .eq('period', period)
            if (oldRoyaltiesDeleteError) throw oldRoyaltiesDeleteError
            if ((count || 0) > 0) {
              affectedUploadIds.add(oldUpload.id)
              replacedRows += count || 0
            }
          }
        }
      } else {
        for (const period of uploadedPeriods) {
          const { data: periodUploadRows, error: periodUploadReadError } = await supabaseAdmin
            .from('royalties')
            .select('upload_id')
            .eq('period', period)
          if (periodUploadReadError) throw periodUploadReadError

          const periodUploadIds = [...new Set((periodUploadRows || []).map((row: any) => row.upload_id).filter(Boolean))]
          for (const uploadId of periodUploadIds) {
            const { count, error: periodDeleteError } = await supabaseAdmin
              .from('royalties')
              .delete({ count: 'exact' })
              .eq('upload_id', uploadId)
              .eq('period', period)
            if (periodDeleteError) throw periodDeleteError
            if ((count || 0) > 0) {
              affectedUploadIds.add(uploadId)
              replacedRows += count || 0
            }
          }
        }
      }

      replacedUploads = affectedUploadIds.size

      for (const oldUploadId of affectedUploadIds) {
        const { count, error: remainingCountError } = await supabaseAdmin
          .from('royalties')
          .select('id', { count: 'exact', head: true })
          .eq('upload_id', oldUploadId)
        if (remainingCountError) throw remainingCountError

        if ((count || 0) === 0) {
          const { error: oldUploadDeleteError } = await supabaseAdmin
            .from('royalty_uploads')
            .delete()
            .eq('id', oldUploadId)
          if (oldUploadDeleteError) throw oldUploadDeleteError
        } else {
          const { error: oldUploadUpdateError } = await supabaseAdmin
            .from('royalty_uploads')
            .update({ inserted_records: count, summary: { partially_replaced: true, replaced_periods: uploadedPeriods } })
            .eq('id', oldUploadId)
          if (oldUploadUpdateError) throw oldUploadUpdateError
        }
      }
    }

    // Create upload record
    const { data: upload } = await supabaseAdmin.from('royalty_uploads').insert({ user_id: user.id, filename, original_filename: originalFilename, total_records: rows.length, status: 'processing', summary: replaceExisting ? { replace_existing: true, replace_mode: normalizedReplaceMode, replace_periods: uploadedPeriods, replaced_uploads: replacedUploads, replaced_rows: replacedRows } : null }).select().single()
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

    const { data: soundpubProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, created_at')
      .or('email.eq.publishersoundpub@gmail.com,full_name.ilike.%soundpub%')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    const soundpubLabelId = soundpubProfile?.id || nameToLabelId['soundpub music ecosystem'] || nameToLabelId['soundpub music'] || null
    if (soundpubLabelId) {
      nameToLabelId['soundpub'] = soundpubLabelId
      nameToLabelId['soundpub music'] = soundpubLabelId
      nameToLabelId['soundpub music ecosystem'] = soundpubLabelId
      labelMap[soundpubLabelId] = SOUNDPUB_LABEL_NAME
    }

    // Build artist lookup by parent label + artist name so royalties still map when track/release artist_user_id is missing.
    const { data: artistRoleRows } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'artist')
    const artistUserIds = [...new Set((artistRoleRows || []).map((r: any) => r.user_id))]
    const { data: artistProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, parent_label_id, status')
      .in('id', artistUserIds.length ? artistUserIds : ['_'])
    const { data: artistProfileRows } = await supabaseAdmin
      .from('artist_profiles')
      .select('user_id, artist_name')
      .in('user_id', artistUserIds.length ? artistUserIds : ['_'])

    const artistByLabelAndName: Record<string, string> = {}
    const artistNameCounts: Record<string, number> = {}
    const artistByName: Record<string, string | null> = {}
    const addArtistLookup = (name: string | null | undefined, artistId: string, labelId: string | null | undefined) => {
      const normalized = normalizeName(name)
      if (!normalized) return
      if (labelId) artistByLabelAndName[`${labelId}|${normalized}`] = artistId
      artistNameCounts[normalized] = (artistNameCounts[normalized] || 0) + 1
      artistByName[normalized] = artistId
    }
    ;(artistProfiles || [])
      .filter((p: any) => !['suspended', 'deleted'].includes(normalizeName(p.status)))
      .forEach((p: any) => addArtistLookup(p.full_name, p.id, p.parent_label_id))
    ;(artistProfileRows || []).forEach((ap: any) => {
      const owner = (artistProfiles || []).find((p: any) => p.id === ap.user_id)
      if (owner && !['suspended', 'deleted'].includes(normalizeName(owner.status))) {
        addArtistLookup(ap.artist_name, ap.user_id, owner.parent_label_id)
      }
    })
    Object.keys(artistNameCounts).forEach(k => { if (artistNameCounts[k] > 1) artistByName[k] = null })
    const resolveArtistUserId = (name: string, labelId: string | null | undefined) => {
      const normalized = normalizeName(name)
      if (!normalized) return null
      if (labelId && artistByLabelAndName[`${labelId}|${normalized}`]) return artistByLabelAndName[`${labelId}|${normalized}`]
      return artistByName[normalized] || null
    }

    const managedArtistCache: Record<string, string> = {}
    let managedArtistsCreated = 0
    let managedArtistsReused = 0

    const registerArtistLookup = (artistId: string, name: string, labelId: string | null | undefined) => {
      const normalized = normalizeName(name)
      if (!normalized) return
      if (labelId) artistByLabelAndName[`${labelId}|${normalized}`] = artistId
      if (!artistByName[normalized]) artistByName[normalized] = artistId
    }

    const createManagedArtist = async (artistName: string, labelId: string | null | undefined) => {
      const normalized = normalizeName(artistName)
      if (!normalized || !labelId) return null
      const cacheKey = `${labelId}|${normalized}`
      if (managedArtistCache[cacheKey]) return managedArtistCache[cacheKey]

      const existingArtistId = resolveArtistUserId(artistName, labelId)
      if (existingArtistId) {
        managedArtistCache[cacheKey] = existingArtistId
        managedArtistsReused += 1
        return existingArtistId
      }

      const email = `${slugify(artistName).slice(0, 48)}-${labelId.replace(/-/g, '').slice(0, 10)}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}@${MANAGED_ARTIST_DOMAIN}`
      const tempPassword = crypto.randomUUID() + crypto.randomUUID()
      const { data: createdUser, error: authCreateError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: artistName,
          managed_artist: true,
          auth_user_status: 'managed_only',
          password_set: false,
          created_from_royalty_upload: true,
        },
      })
      if (authCreateError) throw authCreateError
      const artistId = createdUser?.user?.id
      if (!artistId) throw new Error(`Failed to create managed artist for ${artistName}`)

      await new Promise(resolve => setTimeout(resolve, 100))

      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({
          full_name: artistName,
          parent_label_id: labelId,
          artist_profile_completed: true,
          is_managed_artist: true,
          auth_user_status: 'managed_only',
          password_set: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', artistId)
      if (profileError) throw profileError

      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .upsert({ user_id: artistId, role: 'artist' }, { onConflict: 'user_id,role' })
      if (roleError) throw roleError

      const { error: artistProfileError } = await supabaseAdmin
        .from('artist_profiles')
        .upsert({ user_id: artistId, artist_name: artistName, artist_type: 'managed', social_links: {} }, { onConflict: 'user_id' })
      if (artistProfileError) throw artistProfileError

      const { data: existingArtistRow, error: artistLookupError } = await supabaseAdmin
        .from('artists')
        .select('id')
        .eq('label_id', labelId)
        .eq('name', artistName)
        .maybeSingle()
      if (artistLookupError) throw artistLookupError
      if (!existingArtistRow) {
        const { error: artistError } = await supabaseAdmin.from('artists').insert({ label_id: labelId, name: artistName })
        if (artistError) throw artistError
      }

      managedArtistCache[cacheKey] = artistId
      registerArtistLookup(artistId, artistName, labelId)
      managedArtistsCreated += 1
      return artistId
    }

    // Insert royalties
    const labelRev: Record<string, number> = {}
    const artistRev: Record<string, number> = {}
    const labelRevById: Record<string, number> = {}
    let inserted = 0

    for (let i = 0; i < validRows.length; i += 100) {
      const batch: any[] = []
      for (const r of validRows.slice(i, i + 100)) {
        const track = isrcMap[r.isrc]
        const rel = track ? relMap[track.release_id] : null
        const sourceLabelName = r.label_name || (rel ? labelMap[rel.label_id] : '') || ''
        const matchedLabelId = (rel?.label_id) || nameToLabelId[normalizeName(sourceLabelName)] || null
        const soundpubLabel = isSoundpubLabel(matchedLabelId, sourceLabelName, soundpubLabelId)
        const labelName = soundpubLabel ? SOUNDPUB_LABEL_NAME : sourceLabelName
        // Stable label identifier: prefer release.label_id (authoritative), fallback to unique name match.
        const labelUserId = soundpubLabel ? soundpubLabelId : matchedLabelId
        const artistName = r.artist || track?.artist_name || rel?.artist_name || ''
        
        // Priority: track.artist_user_id > release.artist_user_id > label/name lookup > managed artist fallback
        let artistUserId = track?.artist_user_id || rel?.artist_user_id || resolveArtistUserId(artistName, labelUserId || rel?.label_id) || null
        if (!artistUserId && artistName && labelUserId) {
          artistUserId = await createManagedArtist(artistName, labelUserId)
        }

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

        batch.push({
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
        })
      }

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

    const balanceErrors: string[] = []

    // Rebuild royalty-derived balances from the whole royalties table.
    // This makes replacement/re-upload idempotent and prevents double-counted profile balances.
    const { error: resetBalanceError } = await supabaseAdmin
      .from('profiles')
      .update({ balance: 0, artist_revenue: 0, label_revenue: 0 })
      .not('id', 'is', null)
    if (resetBalanceError) balanceErrors.push(`Balance reset failed: ${resetBalanceError.message}`)

    const { data: allRoyaltyRowsForBalance, error: allRoyaltyError } = await supabaseAdmin
      .from('royalties')
      .select('artist_user_id,label_user_id,artist_revenue,label_revenue')
    if (allRoyaltyError) balanceErrors.push(`Balance rebuild source failed: ${allRoyaltyError.message}`)

    const rebuiltBalances: Record<string, { balance: number; artist_revenue: number; label_revenue: number }> = {}
    ;(allRoyaltyRowsForBalance || []).forEach((royaltyRow: any) => {
      if (royaltyRow.artist_user_id) {
        rebuiltBalances[royaltyRow.artist_user_id] ||= { balance: 0, artist_revenue: 0, label_revenue: 0 }
        const amount = Number(royaltyRow.artist_revenue || 0)
        rebuiltBalances[royaltyRow.artist_user_id].balance += amount
        rebuiltBalances[royaltyRow.artist_user_id].artist_revenue += amount
      }
      if (royaltyRow.label_user_id) {
        rebuiltBalances[royaltyRow.label_user_id] ||= { balance: 0, artist_revenue: 0, label_revenue: 0 }
        const amount = Number(royaltyRow.label_revenue || 0)
        rebuiltBalances[royaltyRow.label_user_id].balance += amount
        rebuiltBalances[royaltyRow.label_user_id].label_revenue += amount
      }
    })

    for (const [profileId, totals] of Object.entries(rebuiltBalances)) {
      const { error: rebuildProfileError } = await supabaseAdmin
        .from('profiles')
        .update(totals)
        .eq('id', profileId)
      if (rebuildProfileError) balanceErrors.push(`Balance rebuild failed: ${profileId}`)
    }

    const uploadSummary = {
      ...(replaceExisting ? { replace_existing: true, replace_mode: normalizedReplaceMode, replace_periods: uploadedPeriods, replaced_uploads: replacedUploads, replaced_rows: replacedRows } : {}),
      managed_artists_created: managedArtistsCreated,
      managed_artists_reused: managedArtistsReused,
      balance_errors: balanceErrors,
    }

    // Final status update
    await supabaseAdmin.from('royalty_uploads').update({ 
      status: 'completed',
      summary: uploadSummary
    }).eq('id', upload.id)

    return new Response(JSON.stringify({ success: true, insertedCount: inserted, uploadId: upload.id, balanceErrors, managedArtistsCreated, managedArtistsReused, replacedUploads, replacedRows, replaceMode: normalizedReplaceMode, replacePeriods: uploadedPeriods }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    console.error('Process royalty upload error:', e)
    const errorMessage = e instanceof Error ? e.message : 'Failed to process royalty upload'
    return new Response(JSON.stringify({ success: false, error: errorMessage }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})



