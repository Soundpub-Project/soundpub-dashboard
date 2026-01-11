import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface DeleteUserRequest {
  user_id: string
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify the request is from an authenticated admin
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

    // Check if current user is admin
    const { data: userRole } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUser.id)
      .single()

    const isAdmin = userRole?.role === 'superadmin' || userRole?.role === 'admin'

    if (!isAdmin) {
      throw new Error('Only admins can delete users')
    }

    // Parse request body
    const body: DeleteUserRequest = await req.json()
    const { user_id } = body

    if (!user_id) {
      throw new Error('Missing required field: user_id')
    }

    // Cannot delete yourself
    if (user_id === currentUser.id) {
      throw new Error('Cannot delete your own account')
    }

    // Create admin client
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

    // Check target user's role - cannot delete superadmin unless you're superadmin
    const { data: targetRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user_id)
      .single()

    if (targetRole?.role === 'superadmin' && userRole?.role !== 'superadmin') {
      throw new Error('Only superadmins can delete superadmin accounts')
    }

    // Get target user info for audit log before deletion
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

    // Delete the user using admin API
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id)

    if (deleteError) {
      throw deleteError
    }

    // Log the deletion to audit_logs
    const { error: auditError } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        action: 'user_deleted',
        actor_id: currentUser.id,
        target_id: user_id,
        target_type: 'user',
        details: {
          actor_role: userRole?.role,
          actor_name: actorProfile?.full_name || 'Unknown',
          actor_email: actorProfile?.email || 'Unknown',
          target_name: targetProfile?.full_name || 'Unknown',
          target_email: targetProfile?.email || 'Unknown',
          target_role: targetRole?.role || 'Unknown',
        },
      })

    if (auditError) {
      console.error('Error creating audit log:', auditError)
    }

    console.log(`User deleted: ${actorProfile?.email} deleted user ${targetProfile?.email}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'User deleted successfully'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error: unknown) {
    console.error('Error deleting user:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete user'
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})
