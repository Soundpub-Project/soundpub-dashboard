import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RemoveArtistRequest {
  artist_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Check user role
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (roleError) {
      console.error('Error fetching role:', roleError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify permissions' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isLabel = roleData?.role === 'label';
    const isWhitelabel = roleData?.role === 'whitelabel';
    const isAdmin = roleData?.role === 'admin' || roleData?.role === 'superadmin';

    if (!isLabel && !isWhitelabel && !isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Only labels or whitelabels can remove artists' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { artist_id }: RemoveArtistRequest = await req.json();

    if (!artist_id) {
      return new Response(
        JSON.stringify({ error: 'artist_id is required' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get artist info
    const { data: artistData, error: artistError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, parent_label_id')
      .eq('id', artist_id)
      .maybeSingle();

    if (artistError || !artistData) {
      return new Response(
        JSON.stringify({ error: 'Artist not found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the artist belongs to the label/whitelabel (unless admin)
    if ((isLabel || isWhitelabel) && artistData.parent_label_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'This artist is not under your label' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if artist has active or pending releases
    const labelId = artistData.parent_label_id;
    const { data: activeReleases, error: releasesError } = await supabaseAdmin
      .from('releases')
      .select('id, title, status')
      .or(`artist_user_id.eq.${artist_id},and(artist_user_id.is.null,artist_name.eq.${artistData.full_name})`)
      .in('status', ['active', 'pending']);

    if (releasesError) {
      console.error('Error checking releases:', releasesError);
    }

    if (activeReleases && activeReleases.length > 0) {
      const releaseNames = activeReleases.map(r => `${r.title} (${r.status})`).join(', ');
      return new Response(
        JSON.stringify({ 
          error: `Artis ini memiliki ${activeReleases.length} release aktif/pending dan tidak bisa dihapus. Releases: ${releaseNames}` 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get label info for audit log
    const { data: labelData } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle();

    // Remove from artists table (used by release forms)
    if (labelId) {
      const { error: deleteArtistError } = await supabaseAdmin
        .from('artists')
        .delete()
        .eq('label_id', labelId)
        .ilike('name', artistData.full_name);

      if (deleteArtistError) {
        console.error('Error deleting from artists table:', deleteArtistError);
      }
    }

    // Remove artist from label (clear parent_label_id)
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ parent_label_id: null })
      .eq('id', artist_id);

    if (updateError) {
      console.error('Error removing artist:', updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the action
    await supabaseAdmin.from('audit_logs').insert({
      action: 'artist_removed',
      actor_id: user.id,
      target_id: artist_id,
      target_type: 'user',
      details: {
        actor_role: roleData?.role,
        actor_name: labelData?.full_name,
        actor_email: labelData?.email,
        target_name: artistData.full_name,
        target_email: artistData.email,
      },
    });

    console.log(`Artist ${artistData.full_name} removed from label by ${labelData?.full_name}`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in remove-artist-from-label:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
