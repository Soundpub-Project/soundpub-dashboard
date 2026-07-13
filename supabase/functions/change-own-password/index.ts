import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

interface ChangePasswordRequest {
  new_password: string;
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
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's token
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { new_password }: ChangePasswordRequest = await req.json();

    if (!new_password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Password baru wajib diisi' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (new_password.length < 6 || new_password.length > 128) {
      return new Response(
        JSON.stringify({ success: false, error: 'Password harus 6-128 karakter' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client for password update
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Update password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: new_password }
    );

    if (updateError) {
      console.error('Error updating password:', updateError);
      const anyErr = updateError as unknown as { code?: string; reasons?: string[]; message?: string }
      let msg = 'Gagal mengubah password'
      if (anyErr.code === 'weak_password' || (Array.isArray(anyErr.reasons) && anyErr.reasons.includes('pwned'))) {
        msg = 'Password ini terlalu lemah atau pernah bocor di internet. Silakan pilih password yang lebih kuat dan unik.'
      } else if (anyErr.message?.toLowerCase().includes('same')) {
        msg = 'Password baru tidak boleh sama dengan password lama.'
      }
      return new Response(
        JSON.stringify({ success: false, error: msg }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark password as set in profile (for Google OAuth users who set password for first time)
    await supabaseAdmin
      .from('profiles')
      .update({ password_set: true })
      .eq('id', user.id);

    // Get user info for audit log
    const { data: profileData } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle();

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    // Log the action
    await supabaseAdmin.from('audit_logs').insert({
      action: 'self_password_change',
      actor_id: user.id,
      target_id: user.id,
      target_type: 'user',
      details: {
        actor_role: roleData?.role,
        actor_name: profileData?.full_name,
        actor_email: profileData?.email,
        target_name: profileData?.full_name,
        target_email: profileData?.email,
      },
    });

    console.log(`User ${profileData?.full_name} changed their own password`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in change-own-password:', error);
    const SAFE_MESSAGES = ['Missing authorization', 'Unauthorized', 'Password']
    let safeMessage = 'Terjadi kesalahan saat mengubah password'
    if (error instanceof Error && SAFE_MESSAGES.some(m => error.message.startsWith(m) || error.message.includes(m))) {
      safeMessage = error.message
    }
    return new Response(
      JSON.stringify({ success: false, error: safeMessage }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
