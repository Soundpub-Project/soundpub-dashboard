import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// New structure - UPC and ISRC are primary keys for matching
interface RoyaltyRow {
  period: string
  isrc: string
  upc: string
  title?: string
  artist?: string // Optional - can be auto-filled from database
  label_name?: string // Optional - can be auto-filled from database
  platform: string
  country: string
  sales_type?: string
  sales_unit: number
  net_revenue: number
}

interface ValidationError {
  row: number
  field: string
  message: string
}

// Database match result for UPC/ISRC
interface DatabaseMatch {
  labelId?: string
  labelName?: string
  artistUserId?: string
  artistName?: string
  trackTitle?: string
}

// Revenue distribution result
interface RevenueDistribution {
  label_name: string
  artist_name: string
  net_revenue: number
  soundpub_admin_share: number
  label_share: number
  artist_share: number
  is_soundpub_label: boolean
}

const SOUNDPUB_LABEL_NAME = 'Soundpub Music'

// Normalize ISRC - remove dashes for consistent matching
// This allows both formats: FR-X76-25-98330 and FRX762598330
function normalizeISRC(isrc: string): string {
  return isrc.replace(/-/g, '').toUpperCase()
}

// Validation functions
function validatePeriod(period: string): boolean {
  return /^\d{4}-\d{2}$/.test(period)
}

function validateISRC(isrc: string): boolean {
  // Normalize first, then validate
  const normalized = normalizeISRC(isrc)
  // Standard ISRC: 2 letters country + 3 alphanumeric + 7 digits = 12 chars
  return normalized.length === 12 && /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(normalized)
}

function validateUPC(upc: string): boolean {
  return /^\d{12,13}$/.test(upc)
}

function validateCountry(country: string): boolean {
  return /^[A-Z]{2}$/.test(country.toUpperCase())
}

function validateRow(row: RoyaltyRow, rowNumber: number): ValidationError[] {
  const errors: ValidationError[] = []

  // Required fields - UPC and ISRC are the primary keys
  if (!row.period || !row.period.trim()) {
    errors.push({ row: rowNumber, field: 'period', message: 'Period tidak boleh kosong' })
  } else if (!validatePeriod(row.period)) {
    errors.push({ row: rowNumber, field: 'period', message: 'Format period harus YYYY-MM (contoh: 2024-01)' })
  }

  if (!row.isrc || !row.isrc.trim()) {
    errors.push({ row: rowNumber, field: 'isrc', message: 'ISRC tidak boleh kosong' })
  } else if (!validateISRC(row.isrc)) {
    errors.push({ row: rowNumber, field: 'isrc', message: 'Format ISRC tidak valid (contoh: IDABC1234567)' })
  }

  if (!row.upc || !row.upc.trim()) {
    errors.push({ row: rowNumber, field: 'upc', message: 'UPC tidak boleh kosong' })
  } else if (!validateUPC(row.upc)) {
    errors.push({ row: rowNumber, field: 'upc', message: 'UPC harus 12-13 digit angka' })
  }

  // Artist and label_name are now optional - will be auto-filled from database
  // Only validate if provided
  if (row.artist && row.artist.length > 200) {
    errors.push({ row: rowNumber, field: 'artist', message: 'Nama artis maksimal 200 karakter' })
  }

  if (row.label_name && row.label_name.length > 200) {
    errors.push({ row: rowNumber, field: 'label_name', message: 'Nama label maksimal 200 karakter' })
  }

  if (!row.platform || !row.platform.trim()) {
    errors.push({ row: rowNumber, field: 'platform', message: 'Platform tidak boleh kosong' })
  } else if (row.platform.length > 100) {
    errors.push({ row: rowNumber, field: 'platform', message: 'Platform maksimal 100 karakter' })
  }

  if (!row.country || !row.country.trim()) {
    errors.push({ row: rowNumber, field: 'country', message: 'Kode negara tidak boleh kosong' })
  } else if (!validateCountry(row.country)) {
    errors.push({ row: rowNumber, field: 'country', message: 'Kode negara harus 2 huruf (ISO 3166-1 alpha-2)' })
  }

  // Numeric validations
  if (typeof row.sales_unit !== 'number' || isNaN(row.sales_unit)) {
    errors.push({ row: rowNumber, field: 'sales_unit', message: 'Sales unit harus berupa angka' })
  } else if (row.sales_unit < 0) {
    errors.push({ row: rowNumber, field: 'sales_unit', message: 'Sales unit tidak boleh negatif' })
  } else if (row.sales_unit > 1000000000) {
    errors.push({ row: rowNumber, field: 'sales_unit', message: 'Sales unit melebihi batas maksimal' })
  }

  if (typeof row.net_revenue !== 'number' || isNaN(row.net_revenue)) {
    errors.push({ row: rowNumber, field: 'net_revenue', message: 'Net revenue harus berupa angka' })
  } else if (row.net_revenue < 0) {
    errors.push({ row: rowNumber, field: 'net_revenue', message: 'Net revenue tidak boleh negatif' })
  }

  // Optional field validations
  if (row.title && row.title.length > 500) {
    errors.push({ row: rowNumber, field: 'title', message: 'Judul lagu maksimal 500 karakter' })
  }

  if (row.sales_type && row.sales_type.length > 100) {
    errors.push({ row: rowNumber, field: 'sales_type', message: 'Sales type maksimal 100 karakter' })
  }

  return errors
}

/**
 * Calculate revenue distribution based on label type
 * 
 * For Soundpub Music Label:
 * - 70% goes to Artist
 * - 30% goes to Soundpub Music (label)
 * - 0% Soundpub Admin fee
 * 
 * For Whitelabel Partners:
 * - 30% goes to Soundpub Admin (platform fee)
 * - From remaining 70%:
 *   - 70% goes to Artist (49% of total)
 *   - 30% goes to Label (21% of total)
 */
function calculateRevenueDistribution(
  labelName: string,
  artistName: string,
  netRevenue: number
): RevenueDistribution {
  const isSoundpubLabel = labelName.toLowerCase() === SOUNDPUB_LABEL_NAME.toLowerCase()

  if (isSoundpubLabel) {
    // Soundpub Music Label: 70% artist, 30% label, no admin fee
    return {
      label_name: labelName,
      artist_name: artistName,
      net_revenue: netRevenue,
      soundpub_admin_share: 0,
      label_share: netRevenue * 0.30, // 30% to Soundpub Music label
      artist_share: netRevenue * 0.70, // 70% to artist
      is_soundpub_label: true,
    }
  } else {
    // Whitelabel Partner: 30% admin, then split remaining 70%
    const adminFee = netRevenue * 0.30 // 30% for Soundpub Admin
    const remainingForLabel = netRevenue * 0.70 // 70% remaining

    return {
      label_name: labelName,
      artist_name: artistName,
      net_revenue: netRevenue,
      soundpub_admin_share: adminFee, // 30% to Soundpub Admin
      label_share: remainingForLabel * 0.30, // 21% of total to label
      artist_share: remainingForLabel * 0.70, // 49% of total to artist
      is_soundpub_label: false,
    }
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    })

    // Get user
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is admin
    const { data: isAdminResult } = await supabaseAdmin.rpc('is_admin', { _user_id: user.id })
    if (!isAdminResult) {
      return new Response(
        JSON.stringify({ success: false, error: 'Only admins can upload royalties' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { rows, filename, originalFilename } = await req.json() as {
      rows: RoyaltyRow[]
      filename: string
      originalFilename: string
    }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No data provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing ${rows.length} royalty rows for user ${user.id}`)

    // Validate all rows
    const allErrors: ValidationError[] = []
    const validRows: RoyaltyRow[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const normalizedRow: RoyaltyRow = {
        period: (row.period || '').trim(),
        isrc: normalizeISRC((row.isrc || '').trim()), // Normalize ISRC - remove dashes
        upc: (row.upc || '').trim(),
        title: row.title?.trim() || undefined,
        artist: row.artist?.trim() || undefined, // Now optional
        label_name: row.label_name?.trim() || undefined, // Now optional
        platform: (row.platform || '').trim(),
        country: (row.country || '').trim().toUpperCase(),
        sales_type: row.sales_type?.trim() || undefined,
        sales_unit: Number(row.sales_unit) || 0,
        net_revenue: Number(row.net_revenue) || 0,
      }

      const rowErrors = validateRow(normalizedRow, i + 2)
      if (rowErrors.length > 0) {
        allErrors.push(...rowErrors)
      } else {
        validRows.push(normalizedRow)
      }
    }

    // If all rows have validation errors, return them
    if (allErrors.length > 0 && validRows.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          validationErrors: allErrors.slice(0, 50),
          totalErrors: allErrors.length
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create upload record
    const { data: uploadRecord, error: uploadError } = await supabaseAdmin
      .from('royalty_uploads')
      .insert({
        user_id: user.id,
        filename: filename,
        original_filename: originalFilename,
        total_records: rows.length,
        inserted_records: 0,
        status: 'processing',
      })
      .select()
      .single()

    if (uploadError) {
      console.error('Error creating upload record:', uploadError)
      throw uploadError
    }

    // Insert royalties and calculate revenue distribution
    const batchSize = 100
    let insertedCount = 0
    
    // Aggregate revenue by label and artist
    const labelRevenueMap: Record<string, { balance: number; label_revenue: number; artist_revenue: number }> = {}
    const artistRevenueMap: Record<string, number> = {}
    let totalSoundpubAdminRevenue = 0

    // Pre-fetch releases by UPC for auto-matching label_id and artist info
    const uniqueUpcs = [...new Set(validRows.map(r => r.upc))]
    const { data: releases } = await supabaseAdmin
      .from('releases')
      .select('upc, label_id, artist_user_id, artist_name, title')
      .in('upc', uniqueUpcs)
    
    // Create UPC to release info map
    const upcReleaseMap: Record<string, { labelId: string; artistUserId: string | null; artistName: string; title: string }> = {}
    if (releases) {
      for (const release of releases) {
        if (release.upc) {
          upcReleaseMap[release.upc] = {
            labelId: release.label_id,
            artistUserId: release.artist_user_id,
            artistName: release.artist_name,
            title: release.title
          }
        }
      }
    }

    // Pre-fetch tracks by normalized ISRC for auto-matching artist_user_id
    const uniqueIsrcs = [...new Set(validRows.map(r => r.isrc))]
    const { data: tracks } = await supabaseAdmin
      .from('tracks')
      .select('isrc, artist_user_id, artist_name, title')
    
    // Create normalized ISRC to track info map
    const isrcTrackMap: Record<string, { artistUserId: string | null; artistName: string; title: string }> = {}
    if (tracks) {
      for (const track of tracks) {
        if (track.isrc) {
          const normalizedIsrc = normalizeISRC(track.isrc)
          isrcTrackMap[normalizedIsrc] = {
            artistUserId: track.artist_user_id,
            artistName: track.artist_name,
            title: track.title
          }
        }
      }
    }

    // Pre-fetch profile names for label_id to label_name mapping
    const labelIds = [...new Set(Object.values(upcReleaseMap).map(r => r.labelId))]
    const { data: labelProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .in('id', labelIds)
    
    const labelIdToName: Record<string, string> = {}
    if (labelProfiles) {
      for (const profile of labelProfiles) {
        labelIdToName[profile.id] = profile.full_name
      }
    }

    console.log(`Found ${Object.keys(upcReleaseMap).length} UPC matches, ${Object.keys(isrcTrackMap).length} ISRC matches`)

    for (let i = 0; i < validRows.length; i += batchSize) {
      const batch = validRows.slice(i, i + batchSize).map(row => {
        // Auto-match from UPC (release) and ISRC (track)
        const releaseInfo = upcReleaseMap[row.upc]
        const trackInfo = isrcTrackMap[row.isrc]
        
        // Priority: CSV data > Track match > Release match
        const artistUserId = trackInfo?.artistUserId || releaseInfo?.artistUserId || null
        const artistName = row.artist || trackInfo?.artistName || releaseInfo?.artistName || ''
        const labelName = row.label_name || (releaseInfo ? labelIdToName[releaseInfo.labelId] : '') || ''
        const title = row.title || trackInfo?.title || releaseInfo?.title || ''
        
        return {
          period: row.period,
          isrc: row.isrc,
          upc: row.upc,
          title: title || null,
          artist: artistName || null,
          label_name: labelName,
          platform: row.platform,
          country: row.country,
          sales_type: row.sales_type || null,
          sales_unit: row.sales_unit,
          net_revenue: row.net_revenue,
          upload_id: uploadRecord.id,
          artist_user_id: artistUserId,
        }
      })

      const { error: insertError } = await supabaseAdmin
        .from('royalties')
        .insert(batch)

      if (insertError) {
        console.error('Batch insert error:', insertError)
        await supabaseAdmin
          .from('royalty_uploads')
          .update({
            status: 'failed',
            error_message: insertError.message,
            inserted_records: insertedCount,
          })
          .eq('id', uploadRecord.id)

        return new Response(
          JSON.stringify({
            success: false,
            error: `Insert error at batch ${Math.floor(i / batchSize) + 1}: ${insertError.message}`,
            insertedCount
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      insertedCount += batch.length

      // Calculate revenue distribution for each row
      for (const row of batch) {
        const labelName = row.label_name || 'Unknown Label'
        const artistName = row.artist || 'Unknown Artist'
        
        const distribution = calculateRevenueDistribution(
          labelName,
          artistName,
          row.net_revenue
        )

        // Initialize label entry if not exists
        if (!labelRevenueMap[labelName]) {
          labelRevenueMap[labelName] = { balance: 0, label_revenue: 0, artist_revenue: 0 }
        }

        // Add label share to label_revenue
        labelRevenueMap[labelName].label_revenue += distribution.label_share
        
        // Add artist share to artist_revenue (tracked under label)
        labelRevenueMap[labelName].artist_revenue += distribution.artist_share
        
        // For balance, add both label and artist share (total for the label account)
        labelRevenueMap[labelName].balance += distribution.label_share + distribution.artist_share

        // Track individual artist revenue
        if (!artistRevenueMap[artistName]) {
          artistRevenueMap[artistName] = 0
        }
        artistRevenueMap[artistName] += distribution.artist_share

        // Accumulate Soundpub Admin revenue (from whitelabel partners)
        totalSoundpubAdminRevenue += distribution.soundpub_admin_share
      }
    }

    console.log('Revenue distribution calculated:', {
      labels: Object.keys(labelRevenueMap),
      totalSoundpubAdminRevenue,
    })

    // Update balances for each label
    const balanceUpdates: { 
      label: string
      balance_added: number
      label_revenue_added: number
      artist_revenue_added: number
      success: boolean 
    }[] = []

    for (const [labelName, revenue] of Object.entries(labelRevenueMap)) {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id, balance, label_revenue, artist_revenue, full_name')
        .eq('full_name', labelName)
        .maybeSingle()

      if (profileError) {
        console.error(`Error finding profile for ${labelName}:`, profileError)
        balanceUpdates.push({ 
          label: labelName, 
          balance_added: revenue.balance,
          label_revenue_added: revenue.label_revenue,
          artist_revenue_added: revenue.artist_revenue,
          success: false 
        })
        continue
      }

      if (profile) {
        const newBalance = (profile.balance || 0) + revenue.balance
        const newLabelRevenue = (profile.label_revenue || 0) + revenue.label_revenue
        const newArtistRevenue = (profile.artist_revenue || 0) + revenue.artist_revenue

        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({ 
            balance: newBalance,
            label_revenue: newLabelRevenue,
            artist_revenue: newArtistRevenue,
          })
          .eq('id', profile.id)

        if (updateError) {
          console.error(`Error updating balance for ${labelName}:`, updateError)
          balanceUpdates.push({ 
            label: labelName, 
            balance_added: revenue.balance,
            label_revenue_added: revenue.label_revenue,
            artist_revenue_added: revenue.artist_revenue,
            success: false 
          })
        } else {
          console.log(`Updated ${labelName}: balance +${revenue.balance}, label_revenue +${revenue.label_revenue}, artist_revenue +${revenue.artist_revenue}`)
          balanceUpdates.push({ 
            label: labelName, 
            balance_added: revenue.balance,
            label_revenue_added: revenue.label_revenue,
            artist_revenue_added: revenue.artist_revenue,
            success: true 
          })
        }
      } else {
        console.log(`Profile not found for label: ${labelName}`)
        balanceUpdates.push({ 
          label: labelName, 
          balance_added: revenue.balance,
          label_revenue_added: revenue.label_revenue,
          artist_revenue_added: revenue.artist_revenue,
          success: false 
        })
      }
    }

    // Update Soundpub Admin balance (find admin users and distribute)
    if (totalSoundpubAdminRevenue > 0) {
      // Find Soundpub Music profile to add the admin revenue
      const { data: soundpubProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, balance, label_revenue, full_name')
        .eq('full_name', SOUNDPUB_LABEL_NAME)
        .maybeSingle()

      if (soundpubProfile) {
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({ 
            balance: (soundpubProfile.balance || 0) + totalSoundpubAdminRevenue,
            label_revenue: (soundpubProfile.label_revenue || 0) + totalSoundpubAdminRevenue,
          })
          .eq('id', soundpubProfile.id)

        if (!updateError) {
          console.log(`Added Soundpub Admin revenue: ${totalSoundpubAdminRevenue}`)
          balanceUpdates.push({
            label: `${SOUNDPUB_LABEL_NAME} (Admin Fee)`,
            balance_added: totalSoundpubAdminRevenue,
            label_revenue_added: totalSoundpubAdminRevenue,
            artist_revenue_added: 0,
            success: true,
          })
        }
      }
    }

    // Update upload record as success
    await supabaseAdmin
      .from('royalty_uploads')
      .update({
        inserted_records: insertedCount,
        status: allErrors.length > 0 ? 'partial' : 'success',
        summary: {
          total: rows.length,
          inserted: insertedCount,
          errors: allErrors.length,
          balanceUpdates: balanceUpdates,
          totalSoundpubAdminRevenue,
          artistRevenueBreakdown: artistRevenueMap,
        },
      })
      .eq('id', uploadRecord.id)

    // Get uploader's profile name
    const { data: uploaderProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()

    // Calculate total revenue
    const totalRevenue = validRows.reduce((sum, row) => sum + row.net_revenue, 0)

    // Send email notification (non-blocking)
    const notificationPayload = {
      uploadId: uploadRecord.id,
      uploadedBy: uploaderProfile?.full_name || uploaderProfile?.email || user.email || 'Unknown',
      totalRows: rows.length,
      insertedCount,
      totalRevenue,
      affectedLabels: Object.keys(labelRevenueMap),
      balanceUpdates,
    }

    // Fire and forget - don't wait for email to complete
    fetch(`${supabaseUrl}/functions/v1/send-royalty-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify(notificationPayload),
    }).then(res => {
      if (res.ok) {
        console.log('Royalty notification sent successfully')
      } else {
        console.error('Failed to send royalty notification:', res.status)
      }
    }).catch(err => {
      console.error('Error sending royalty notification:', err)
    })

    return new Response(
      JSON.stringify({
        success: true,
        uploadId: uploadRecord.id,
        totalRows: rows.length,
        insertedCount,
        validationErrors: allErrors.length > 0 ? allErrors.slice(0, 20) : [],
        totalErrors: allErrors.length,
        balanceUpdates,
        totalSoundpubAdminRevenue,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('Error processing royalty upload:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
