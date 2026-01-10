import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RoyaltyRow {
  period: string
  isrc: string
  upc: string
  artist_name: string
  label_name: string
  platform: string
  country: string
  unit_penjualan: number
  pendapatan_label_artis: number
  pendapatan_bersih_soundpub: number
  title?: string
  artist?: string
}

interface ValidationError {
  row: number
  field: string
  message: string
}

// Validation functions
function validatePeriod(period: string): boolean {
  return /^\d{4}-\d{2}$/.test(period)
}

function validateISRC(isrc: string): boolean {
  // ISRC format: 2 letters, 3 alphanumeric, 7 digits (12 characters total)
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc.toUpperCase())
}

function validateUPC(upc: string): boolean {
  // UPC: 12 or 13 digits
  return /^\d{12,13}$/.test(upc)
}

function validateCountry(country: string): boolean {
  // ISO 3166-1 alpha-2 code
  return /^[A-Z]{2}$/.test(country.toUpperCase())
}

function validateRow(row: RoyaltyRow, rowNumber: number): ValidationError[] {
  const errors: ValidationError[] = []

  // Required fields
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

  if (!row.artist_name || !row.artist_name.trim()) {
    errors.push({ row: rowNumber, field: 'artist_name', message: 'Nama artis tidak boleh kosong' })
  } else if (row.artist_name.length > 200) {
    errors.push({ row: rowNumber, field: 'artist_name', message: 'Nama artis maksimal 200 karakter' })
  }

  if (!row.label_name || !row.label_name.trim()) {
    errors.push({ row: rowNumber, field: 'label_name', message: 'Nama label tidak boleh kosong' })
  } else if (row.label_name.length > 200) {
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
  if (typeof row.unit_penjualan !== 'number' || isNaN(row.unit_penjualan)) {
    errors.push({ row: rowNumber, field: 'unit_penjualan', message: 'Unit penjualan harus berupa angka' })
  } else if (row.unit_penjualan < 0) {
    errors.push({ row: rowNumber, field: 'unit_penjualan', message: 'Unit penjualan tidak boleh negatif' })
  } else if (row.unit_penjualan > 1000000000) {
    errors.push({ row: rowNumber, field: 'unit_penjualan', message: 'Unit penjualan melebihi batas maksimal' })
  }

  if (typeof row.pendapatan_label_artis !== 'number' || isNaN(row.pendapatan_label_artis)) {
    errors.push({ row: rowNumber, field: 'pendapatan_label_artis', message: 'Pendapatan label/artis harus berupa angka' })
  } else if (row.pendapatan_label_artis < 0) {
    errors.push({ row: rowNumber, field: 'pendapatan_label_artis', message: 'Pendapatan label/artis tidak boleh negatif' })
  }

  if (typeof row.pendapatan_bersih_soundpub !== 'number' || isNaN(row.pendapatan_bersih_soundpub)) {
    errors.push({ row: rowNumber, field: 'pendapatan_bersih_soundpub', message: 'Pendapatan bersih harus berupa angka' })
  } else if (row.pendapatan_bersih_soundpub < 0) {
    errors.push({ row: rowNumber, field: 'pendapatan_bersih_soundpub', message: 'Pendapatan bersih tidak boleh negatif' })
  }

  // Optional field validations
  if (row.title && row.title.length > 500) {
    errors.push({ row: rowNumber, field: 'title', message: 'Judul lagu maksimal 500 karakter' })
  }

  if (row.artist && row.artist.length > 200) {
    errors.push({ row: rowNumber, field: 'artist', message: 'Nama artis (opsional) maksimal 200 karakter' })
  }

  return errors
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
    
    // Use service role client for admin operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    
    // Use user's token to verify authentication
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
      // Normalize data
      const normalizedRow: RoyaltyRow = {
        period: (row.period || '').trim(),
        isrc: (row.isrc || '').trim().toUpperCase(),
        upc: (row.upc || '').trim(),
        artist_name: (row.artist_name || '').trim(),
        label_name: (row.label_name || '').trim(),
        platform: (row.platform || '').trim(),
        country: (row.country || '').trim().toUpperCase(),
        unit_penjualan: Number(row.unit_penjualan) || 0,
        pendapatan_label_artis: Number(row.pendapatan_label_artis) || 0,
        pendapatan_bersih_soundpub: Number(row.pendapatan_bersih_soundpub) || 0,
        title: row.title?.trim() || undefined,
        artist: row.artist?.trim() || undefined,
      }

      const rowErrors = validateRow(normalizedRow, i + 2) // +2 because row 1 is header, 0-indexed
      if (rowErrors.length > 0) {
        allErrors.push(...rowErrors)
      } else {
        validRows.push(normalizedRow)
      }
    }

    // If there are validation errors, return them
    if (allErrors.length > 0 && validRows.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          validationErrors: allErrors.slice(0, 50), // Limit to 50 errors
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

    // Insert royalties in batches and collect label revenue
    const batchSize = 100
    let insertedCount = 0
    const labelRevenue: Record<string, number> = {}

    for (let i = 0; i < validRows.length; i += batchSize) {
      const batch = validRows.slice(i, i + batchSize).map(row => ({
        ...row,
        upload_id: uploadRecord.id,
      }))

      const { error: insertError } = await supabaseAdmin
        .from('royalties')
        .insert(batch)

      if (insertError) {
        console.error('Batch insert error:', insertError)
        // Update upload record as failed
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

      // Collect revenue per label_name
      for (const row of batch) {
        if (!labelRevenue[row.label_name]) {
          labelRevenue[row.label_name] = 0
        }
        labelRevenue[row.label_name] += row.pendapatan_label_artis
      }
    }

    // Update balances for each label
    console.log('Updating balances for labels:', Object.keys(labelRevenue))
    const balanceUpdates: { label: string; amount: number; success: boolean }[] = []

    for (const [labelName, revenue] of Object.entries(labelRevenue)) {
      // Find profile by full_name (label_name)
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id, balance, full_name')
        .eq('full_name', labelName)
        .maybeSingle()

      if (profileError) {
        console.error(`Error finding profile for ${labelName}:`, profileError)
        balanceUpdates.push({ label: labelName, amount: revenue, success: false })
        continue
      }

      if (profile) {
        const newBalance = (profile.balance || 0) + revenue
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({ balance: newBalance })
          .eq('id', profile.id)

        if (updateError) {
          console.error(`Error updating balance for ${labelName}:`, updateError)
          balanceUpdates.push({ label: labelName, amount: revenue, success: false })
        } else {
          console.log(`Updated balance for ${labelName}: ${profile.balance} -> ${newBalance}`)
          balanceUpdates.push({ label: labelName, amount: revenue, success: true })
        }
      } else {
        console.log(`Profile not found for label: ${labelName}`)
        balanceUpdates.push({ label: labelName, amount: revenue, success: false })
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
        },
      })
      .eq('id', uploadRecord.id)

    return new Response(
      JSON.stringify({
        success: true,
        uploadId: uploadRecord.id,
        totalRows: rows.length,
        insertedCount,
        validationErrors: allErrors.length > 0 ? allErrors.slice(0, 20) : [],
        totalErrors: allErrors.length,
        balanceUpdates,
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
