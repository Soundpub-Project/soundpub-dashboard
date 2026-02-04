import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RemoveArtistRequest {
  artist_id: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's token for authentication check
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client for operations that bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Check user role using admin client
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (roleError) {
      console.error('Error fetching role:', roleError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify permissions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isLabel = roleData?.role === 'label';
    const isWhitelabel = roleData?.role === 'whitelabel';
    const isAdmin = roleData?.role === 'admin' || roleData?.role === 'superadmin';

    if (!isLabel && !isWhitelabel && !isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Only labels or whitelabels can remove artists' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { artist_id }: RemoveArtistRequest = await req.json();

    if (!artist_id) {
      return new Response(
        JSON.stringify({ error: 'artist_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get artist info using admin client
    const { data: artistData, error: artistError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, parent_label_id')
      .eq('id', artist_id)
      .maybeSingle();

    if (artistError || !artistData) {
      return new Response(
        JSON.stringify({ error: 'Artist not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the artist belongs to the label/whitelabel (unless admin)
    if ((isLabel || isWhitelabel) && artistData.parent_label_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'This artist is not under your label' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get label/whitelabel info for audit log
    const { data: labelData } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle();

    // Remove artist from label using admin client (bypasses RLS)
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ parent_label_id: null })
      .eq('id', artist_id);

    if (updateError) {
      console.error('Error removing artist:', updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
