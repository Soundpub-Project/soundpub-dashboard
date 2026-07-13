import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateArtistRequest {
  email: string;
  full_name: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify user is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user is whitelabel
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || !roleData) {
      throw new Error('User role not found');
    }

    if (roleData.role !== 'whitelabel') {
      throw new Error('Only whitelabel users can create artists without password');
    }

    const body: CreateArtistRequest = await req.json();
    const { email, full_name } = body;

    if (!email || !full_name) {
      throw new Error('Email and full name are required');
    }

    // Generate a random temporary password (artist won't know this)
    const tempPassword = crypto.randomUUID() + crypto.randomUUID();

    // Create user in auth.users with metadata indicating password not set
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name,
        password_set: false, // This will be used in handle_new_user trigger
      },
    });

    if (createError) {
      console.error('Error creating user:', createError);
      throw new Error(createError.message);
    }

    if (!newUser.user) {
      throw new Error('Failed to create user');
    }

    // Update the profile to set password_set to false and parent_label_id
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        password_set: false,
        parent_label_id: user.id,
      })
      .eq('id', newUser.user.id);

    if (profileError) {
      console.error('Error updating profile:', profileError);
    }

    // Update user role to artist
    const { error: roleUpdateError } = await supabase
      .from('user_roles')
      .update({ role: 'artist' })
      .eq('user_id', newUser.user.id);

    if (roleUpdateError) {
      console.error('Error updating role:', roleUpdateError);
    }

    // Add to artists table
    const { error: artistError } = await supabase
      .from('artists')
      .insert({
        name: full_name,
        label_id: user.id,
      });

    if (artistError) {
      console.error('Error adding to artists table:', artistError);
    }

    // Log the action
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action: 'whitelabel_artist_created',
      target_type: 'user',
      target_id: newUser.user.id,
      details: {
        email,
        full_name,
        password_set: false,
        whitelabel_id: user.id,
      },
    });

    console.log(`Whitelabel artist created: ${email} by whitelabel ${user.id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
          full_name,
        },
        message: 'Artist created without login access. Upgrade subscription to enable login.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Create whitelabel artist error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
