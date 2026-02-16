import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

interface UpdatePasswordRequest {
  user_id: string
  new_password: string
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify the request is from an authenticated admin or label
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Create a client with the user's token to check their permissions
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    // Get the current user
    const { data: { user: currentUser }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !currentUser) {
      throw new Error('Unauthorized')
    }

    // Check if current user is admin or label
    const { data: userRole } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUser.id)
      .single()

    const isAdmin = userRole?.role === 'superadmin' || userRole?.role === 'admin'
    const isLabel = userRole?.role === 'label'

    if (!isAdmin && !isLabel) {
      throw new Error('Only admins and labels can update passwords')
    }

    // Parse request body
    const body: UpdatePasswordRequest = await req.json()
    const { user_id, new_password } = body

    if (!user_id || !new_password) {
      throw new Error('Missing required fields: user_id and new_password')
    }

    if (new_password.length < 6 || new_password.length > 128) {
      throw new Error('Password must be 6-128 characters')
    }

    // If label, verify the target user is their artist
    if (isLabel) {
      const { data: targetProfile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('parent_label_id')
        .eq('id', user_id)
        .single()

      if (profileError || !targetProfile) {
        throw new Error('User not found')
      }

      if (targetProfile.parent_label_id !== currentUser.id) {
        throw new Error('You can only update passwords for your own artists')
      }
    }

    // If admin, verify they're not trying to change a superadmin's password (unless they're superadmin)
    if (isAdmin && userRole?.role !== 'superadmin') {
      const { data: targetRole } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user_id)
        .single()

      if (targetRole?.role === 'superadmin') {
        throw new Error('Only superadmins can change superadmin passwords')
      }
    }

    // Create admin client for password update
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Update user password using admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user_id,
      { password: new_password }
    )

    if (updateError) {
      throw updateError
    }

    // Get target user info for audit log
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', user_id)
      .single()

    // Get actor info for audit log
    const { data: actorProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', currentUser.id)
      .single()

    // Log the password change to audit_logs
    const { error: auditError } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        action: 'password_change',
        actor_id: currentUser.id,
        target_id: user_id,
        target_type: 'user',
        details: {
          actor_role: userRole?.role,
          actor_name: actorProfile?.full_name || 'Unknown',
          actor_email: actorProfile?.email || 'Unknown',
          target_name: targetProfile?.full_name || 'Unknown',
          target_email: targetProfile?.email || 'Unknown',
        },
      })

    if (auditError) {
      console.error('Error creating audit log:', auditError)
      // Don't fail the request if audit log fails
    }

    console.log(`Password changed: ${actorProfile?.email} changed password for ${targetProfile?.email}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Password updated successfully'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error: unknown) {
    console.error('Error updating password:', error)
    const SAFE_MESSAGES = ['Unauthorized', 'Password must be', 'Missing required', 'Only admins', 'Only superadmins', 'User not found', 'You can only update']
    let safeMessage = 'Failed to update password'
    if (error instanceof Error) {
      if (SAFE_MESSAGES.some(m => error.message.startsWith(m) || error.message.includes(m))) {
        safeMessage = error.message
      }
    }
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: safeMessage
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})
