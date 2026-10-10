import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

// PostgREST exposes schemas in lowercase on self-hosted Supabase.
const DATABASE_SCHEMA = 'soundpub'

const createSoundpubClient = (supabaseUrl: string, supabaseKey: string, options: any = {}) => {
  const existingDb = options.db || {}
  return createClient(supabaseUrl, supabaseKey, {
    ...options,
    db: { ...existingDb, schema: DATABASE_SCHEMA },
  })
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const normalizeISRC = (isrc: string) => isrc.replace(/-/g, '').toUpperCase()
const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const Soundpub_LABEL_NAME = 'Soundpub MUSIC'
const Soundpub_LABEL_ALIASES = new Set(['Soundpub', 'Soundpub music', 'Soundpub music ecosystem'])
const MANAGED_ARTIST_DOMAIN = 'managed.Soundpub.local'
const normalizeName = (value: string | null | undefined) => (value || '').trim().replace(/\s+/g, ' ').toLowerCase()
const slugify = (value: string | null | undefined) => normalizeName(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'artist'
const isSoundpubLabel = (labelUserId: string | null | undefined, labelName: string | null | undefined, SoundpubLabelId: string | null | undefined) => {
  return (!!SoundpubLabelId && labelUserId === SoundpubLabelId) || Soundpub_LABEL_ALIASES.has(normalizeName(labelName))
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
    if (adminError) {
      console.error('Admin check failed:', adminError)
      throw new Error(`Admin check failed: ${adminError.message}`)
    }
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
      net_revenue: roundCurrency(Number(r.net_revenue) || 0),
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
          const { data: oldUploads, error: oldUploadQueryError } = await supabaseAdmin
            .from('royalties')
            .select('upload_id')
            .eq('period', period)
          if (oldUploadQueryError) throw oldUploadQueryError

          const uploadIdsToDelete = new Set((oldUploads || []).map((r: any) => r.upload_id))
          for (const uploadId of uploadIdsToDelete) {
            affectedUploadIds.add(uploadId)
          }

          const { count, error: oldRoyaltiesDeleteError } = await supabaseAdmin
            .from('royalties')
            .delete({ count: 'exact' })
            .eq('period', period)
          if (oldRoyaltiesDeleteError) throw oldRoyaltiesDeleteError
          replacedRows += count || 0
        }
      }

      replacedUploads = affectedUploadIds.size

      for (const uploadId of affectedUploadIds) {
        const { count, error: remainingCheck } = await supabaseAdmin.from('royalties').select('id', { count: 'exact', head: true }).eq('upload_id', uploadId)
        if (!remainingCheck && (count === 0 || count === null)) {
          await supabaseAdmin.from('royalty_uploads').update({ status: 'replaced' }).eq('id', uploadId)
        }
      }
    }

    const { data: upload, error: uploadError } = await supabaseAdmin
      .from('royalty_uploads')
      .insert({ user_id: user.id, filename: filename, original_filename: originalFilename || filename, total_records: validRows.length, status: 'processing' })
      .select()
      .single()
    if (uploadError || !upload) throw new Error(`Failed to create upload record: ${uploadError?.message}`)

    const isrcs = [...new Set(validRows.map((r: any) => r.isrc).filter(Boolean))]
    const { data: isrcData, error: isrcError } = await supabaseAdmin
      .from('tracks')
      .select('isrc, title, artist_name, release_id, artist_user_id')
      .in('isrc', isrcs)
    if (isrcError) console.warn('ISRC fetch failed:', isrcError)
    const isrcMap: Record<string, any> = {}
    ;(isrcData || []).forEach((t: any) => { isrcMap[normalizeISRC(t.isrc)] = t })

    const releaseIds = [...new Set((isrcData || []).map((t: any) => t.release_id).filter(Boolean))]
    const { data: releaseData, error: releaseError } = await supabaseAdmin
      .from('releases')
      .select('id, label_id, upc, artist_name, artist_user_id')
      .in('id', releaseIds)
    if (releaseError) console.warn('Release fetch failed:', releaseError)
    const relMap: Record<string, any> = {}
    ;(releaseData || []).forEach((r: any) => { relMap[r.id] = r })

    const { data: labelRoleData, error: labelRoleError } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'label')
    if (labelRoleError) throw new Error(`Failed to load label roles: ${labelRoleError.message}`)
    const labelRoleIds = [...new Set((labelRoleData || []).map((row: any) => row.user_id).filter(Boolean))]
    const { data: labelData, error: labelError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .in('id', labelRoleIds)
    if (labelError) throw new Error(`Failed to load label profiles: ${labelError.message}`)
    const labelMap: Record<string, string> = {}
    ;(labelData || []).forEach((l: any) => { labelMap[l.id] = l.full_name || '' })

    const { data: SoundpubLabelData, error: SoundpubError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .in('id', labelRoleIds)
      .ilike('full_name', '%Soundpub%')
      .limit(1)
      .single()
    if (SoundpubError || !SoundpubLabelData?.id) throw new Error(`Soundpub label profile not found: ${SoundpubError?.message || 'missing label profile'}`)
    const SoundpubLabelId = SoundpubLabelData.id

    const nameToLabelId: Record<string, string | null> = {}
    const nameCounts: Record<string, number> = {}
    ;(labelData || []).forEach((l: any) => {
      const normalized = normalizeName(l.full_name)
      if (!normalized) return
      nameCounts[normalized] = (nameCounts[normalized] || 0) + 1
      nameToLabelId[normalized] = l.id
    })
    Object.keys(nameCounts).forEach(k => { if (nameCounts[k] > 1) nameToLabelId[k] = null })

    const { data: artistRoleData, error: artistRoleError } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'artist')
    if (artistRoleError) throw new Error(`Failed to load artist roles: ${artistRoleError.message}`)
    const artistRoleIds = [...new Set((artistRoleData || []).map((row: any) => row.user_id).filter(Boolean))]
    const { data: allArtistData, error: allArtistError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, parent_label_id')
      .in('id', artistRoleIds)
    if (allArtistError) throw new Error(`Failed to load artist profiles: ${allArtistError.message}`)

    const artistByLabelAndName: Record<string, string> = {}
    const artistByName: Record<string, string | null> = {}
    const artistNameCounts: Record<string, number> = {}
    ;(allArtistData || []).forEach((a: any) => {
      const normalized = normalizeName(a.full_name)
      if (!normalized) return
      if (a.parent_label_id) artistByLabelAndName[`${a.parent_label_id}|${normalized}`] = a.id
      artistNameCounts[normalized] = (artistNameCounts[normalized] || 0) + 1
      artistByName[normalized] = a.id
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

      try {
        // Create managed artist email with better uniqueness
        const email = `${slugify(artistName).slice(0, 48)}-${labelId.replace(/-/g, '').slice(0, 10)}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}@${MANAGED_ARTIST_DOMAIN}`
        const tempPassword = crypto.randomUUID() + crypto.randomUUID()
        
        // Try to create user via auth.admin
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
        
        if (authCreateError) {
          console.error(`[Managed Artist Creation Failed] ${artistName}:`, authCreateError.message)
          // If user creation fails, skip this managed artist
          return null
        }
        
        const artistId = createdUser?.user?.id
        if (!artistId) {
          console.error(`[Managed Artist ID Missing] ${artistName}`)
          return null
        }

        // Update profile with additional fields
        const { error: profileUpdateError } = await supabaseAdmin
          .from('profiles')
          .update({
            full_name: artistName,
            parent_label_id: labelId,
            is_managed_artist: true,
            auth_user_status: 'managed_only',
          })
          .eq('id', artistId)

        if (profileUpdateError) throw new Error(`[Profile Update Failed] ${artistName}: ${profileUpdateError.message}`)

        const { error: roleInsertError } = await supabaseAdmin
          .from('user_roles')
          .insert({ user_id: artistId, role: 'artist' })
        if (roleInsertError) throw new Error(`[Artist Role Insert Failed] ${artistName}: ${roleInsertError.message}`)

        managedArtistCache[cacheKey] = artistId
        managedArtistsCreated += 1
        registerArtistLookup(artistId, artistName, labelId)
        console.log(`[Managed Artist Created] ${artistName} -> ${artistId}`)
        return artistId
      } catch (error: any) {
        console.error(`[Managed Artist Exception] ${artistName}:`, error.message)
        return null
      }
    }

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
        const SoundpubLabel = isSoundpubLabel(matchedLabelId, sourceLabelName, SoundpubLabelId)
        const labelName = SoundpubLabel ? Soundpub_LABEL_NAME : sourceLabelName
        const labelUserId = SoundpubLabel ? SoundpubLabelId : matchedLabelId
        const artistName = r.artist || track?.artist_name || rel?.artist_name || ''
        
        // Priority: track.artist_user_id > release.artist_user_id > label/name lookup > managed artist fallback
        let artistUserId = track?.artist_user_id || rel?.artist_user_id || resolveArtistUserId(artistName, labelUserId || rel?.label_id) || null
        
        // Try to create managed artist only if we have both artist name and label
        if (!artistUserId && artistName && labelUserId) {
          artistUserId = await createManagedArtist(artistName, labelUserId)
        }

        if (!labelUserId) throw new Error(`No label recipient for ${r.isrc} (${sourceLabelName || 'missing label'})`)

        const adminShare = roundCurrency(r.net_revenue * 0.09)
        const artistShare = artistUserId ? roundCurrency(r.net_revenue * 0.70) : 0
        const labelShare = roundCurrency(r.net_revenue - adminShare - artistShare)

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

    // Update upload record immediately after insert, BEFORE balance updates
    await supabaseAdmin.from('royalty_uploads').update({ 
      status: 'inserted', 
      inserted_records: inserted 
    }).eq('id', upload.id)

    const { error: rebuildBalanceError } = await supabaseAdmin.rpc('rebuild_royalty_balances')
    if (rebuildBalanceError) throw new Error(`Balance rebuild failed: ${rebuildBalanceError.message}`)
    const balanceErrors: string[] = []

    const uploadSummary = {
      ...(replaceExisting ? { replace_existing: true, replace_mode: normalizedReplaceMode, replace_periods: uploadedPeriods, replaced_uploads: replacedUploads, replaced_rows: replacedRows } : {}),
      managed_artists_created: managedArtistsCreated,
      managed_artists_reused: managedArtistsReused,
      balance_errors: balanceErrors,
    }

    // Final status update
    await supabaseAdmin.from('royalty_uploads').update({ 
      status: 'success',
      summary: uploadSummary
    }).eq('id', upload.id)

    return new Response(JSON.stringify({ 
      success: true, 
      insertedCount: inserted, 
      uploadId: upload.id, 
      balanceErrors, 
      managedArtistsCreated, 
      managedArtistsReused, 
      replacedUploads, 
      replacedRows, 
      replaceMode: normalizedReplaceMode, 
      replacePeriods: uploadedPeriods 
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  } catch (e: any) {
    console.error('[Process royalty upload error]:', e)
    const errorMessage = e instanceof Error ? e.message : 'Failed to process royalty upload'
    return new Response(JSON.stringify({ success: false, error: errorMessage }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
