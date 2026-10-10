import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const getDatabaseSchema = () => Deno.env.get('DATABASE_SCHEMA') || Deno.env.get('SUPABASE_DB_SCHEMA') || 'Soundpub'

const createSoundpubClient = (supabaseUrl: string, supabaseKey: string, options: any = {}) => {
  const existingDb = options.db || {}
  return createClient(supabaseUrl, supabaseKey, {
    ...options,
    db: { ...existingDb, schema: getDatabaseSchema() },
  })
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TransferArtistLabelRequest {
  artist_id: string
  new_label_id: string
  confirmation_phrase: string
  royalty_transfer_mode?: 'keep_old_label' | 'transfer_all_history'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createSoundpubClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createSoundpubClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const body: TransferArtistLabelRequest = await req.json()
    const { artist_id, new_label_id, confirmation_phrase, royalty_transfer_mode = 'keep_old_label' } = body

    if (!artist_id || !new_label_id) {
      return new Response(JSON.stringify({ error: 'artist_id and new_label_id are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (confirmation_phrase !== 'PINDAH LABEL') {
      return new Response(JSON.stringify({ error: 'Confirmation phrase tidak valid' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (royalty_transfer_mode !== 'keep_old_label') {
      return new Response(JSON.stringify({ error: 'Transfer histori royalty belum diaktifkan. Gunakan keep_old_label.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (roleError) throw roleError

    const actorRole = roleData?.role
    const isAdmin = actorRole === 'admin' || actorRole === 'superadmin'

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Only admin or superadmin can transfer artist label' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: artistData, error: artistError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, parent_label_id')
      .eq('id', artist_id)
      .maybeSingle()

    if (artistError) throw artistError
    if (!artistData) {
      return new Response(JSON.stringify({ error: 'Artist not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: artistRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', artist_id)
      .eq('role', 'artist')
      .maybeSingle()

    if (!artistRole) {
      return new Response(JSON.stringify({ error: 'Target user is not an artist' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (artistData.parent_label_id === new_label_id) {
      return new Response(JSON.stringify({ success: true, message: 'Artist already belongs to selected label' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: labels, error: labelsError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', [artistData.parent_label_id, new_label_id].filter(Boolean))

    if (labelsError) throw labelsError

    const oldLabel = labels?.find((label) => label.id === artistData.parent_label_id) || null
    const newLabel = labels?.find((label) => label.id === new_label_id) || null

    if (!newLabel) {
      return new Response(JSON.stringify({ error: 'New label not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: newLabelRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', new_label_id)
      .in('role', ['label', 'whitelabel'])
      .maybeSingle()

    if (!newLabelRole) {
      return new Response(JSON.stringify({ error: 'New owner must be label or whitelabel' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const [releaseCountResult, trackCountResult, royaltyCountResult] = await Promise.all([
      supabaseAdmin.from('releases').select('id', { count: 'exact', head: true }).eq('artist_user_id', artist_id),
      supabaseAdmin.from('tracks').select('id', { count: 'exact', head: true }).eq('artist_user_id', artist_id),
      supabaseAdmin.from('royalties').select('id', { count: 'exact', head: true }).eq('artist_user_id', artist_id),
    ])

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ parent_label_id: new_label_id })
      .eq('id', artist_id)

    if (updateError) throw updateError

    if (artistData.parent_label_id) {
      const { error: deleteOldArtistError } = await supabaseAdmin
        .from('artists')
        .delete()
        .eq('label_id', artistData.parent_label_id)
        .ilike('name', artistData.full_name)

      if (deleteOldArtistError) console.error('Failed deleting old artists row:', deleteOldArtistError)
    }

    const { data: existingArtistRow } = await supabaseAdmin
      .from('artists')
      .select('id')
      .eq('label_id', new_label_id)
      .ilike('name', artistData.full_name)
      .maybeSingle()

    if (!existingArtistRow) {
      const { error: insertArtistError } = await supabaseAdmin
        .from('artists')
        .insert({ name: artistData.full_name, label_id: new_label_id })

      if (insertArtistError) console.error('Failed inserting new artists row:', insertArtistError)
    }

    await supabaseAdmin.from('audit_logs').insert({
      action: 'artist_label_transferred',
      actor_id: user.id,
      target_id: artist_id,
      target_type: 'user',
      details: {
        actor_role: actorRole,
        artist_name: artistData.full_name,
        artist_email: artistData.email,
        old_label_id: artistData.parent_label_id,
        old_label_name: oldLabel?.full_name || null,
        new_label_id,
        new_label_name: newLabel.full_name,
        royalty_transfer_mode,
        affected_releases: releaseCountResult.count || 0,
        affected_tracks: trackCountResult.count || 0,
        affected_royalties: royaltyCountResult.count || 0,
        note: 'Historical release/track/royalty ownership was kept unchanged.',
      },
    })

    return new Response(JSON.stringify({
      success: true,
      royalty_transfer_mode,
      old_label: oldLabel,
      new_label: newLabel,
      affected: {
        releases: releaseCountResult.count || 0,
        tracks: trackCountResult.count || 0,
        royalties: royaltyCountResult.count || 0,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in transfer-artist-label:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
