import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SetPasswordRequest {
  artist_id: string;
  password: string;
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

    // Check if user is admin or the whitelabel parent of this artist
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || !roleData) {
      throw new Error('User role not found');
    }

    const body: SetPasswordRequest = await req.json();
    const { artist_id, password } = body;

    if (!artist_id || !password) {
      throw new Error('Artist ID and password are required');
    }

    if (password.length < 6 || password.length > 128) {
      throw new Error('Password must be 6-128 characters');
    }

    // Check if the caller has permission
    const isAdmin = ['superadmin', 'admin'].includes(roleData.role);
    
    if (!isAdmin) {
      // Check if user is the whitelabel parent
      const { data: artistProfile, error: artistError } = await supabase
        .from('profiles')
        .select('parent_label_id')
        .eq('id', artist_id)
        .single();

      if (artistError || !artistProfile) {
        throw new Error('Artist not found');
      }

      if (artistProfile.parent_label_id !== user.id) {
        throw new Error('You do not have permission to set password for this artist');
      }

      // Check if whitelabel has upgraded subscription
      const { data: whitelabelProfile, error: wlError } = await supabase
        .from('profiles')
        .select('subscription_status')
        .eq('id', user.id)
        .single();

      if (wlError || !whitelabelProfile) {
        throw new Error('Whitelabel profile not found');
      }

      if (whitelabelProfile.subscription_status !== 'active') {
        throw new Error('Upgrade subscription required to enable artist login');
      }
    }

    // Update the user's password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      artist_id,
      { password }
    );

    if (updateError) {
      console.error('Error updating password:', updateError);
      throw new Error('Failed to set password');
    }

    // Update profile to mark password as set
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ password_set: true })
      .eq('id', artist_id);

    if (profileError) {
      console.error('Error updating profile:', profileError);
    }

    // Log the action
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action: 'artist_password_set',
      target_type: 'user',
      target_id: artist_id,
      details: {
        set_by_role: roleData.role,
      },
    });

    console.log(`Password set for artist ${artist_id} by ${user.id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Password set successfully. Artist can now login.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Set artist password error:', error);
    const SAFE_MESSAGES = ['Unauthorized', 'User role not found', 'Artist ID and password', 'Password must be', 'Artist not found', 'You do not have permission', 'Whitelabel profile not found', 'Upgrade subscription', 'Failed to set password']
    let safeMessage = 'An error occurred'
    if (error instanceof Error && SAFE_MESSAGES.some((m: string) => error.message.startsWith(m) || error.message.includes(m))) {
      safeMessage = error.message
    }
    return new Response(
      JSON.stringify({ error: safeMessage }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
