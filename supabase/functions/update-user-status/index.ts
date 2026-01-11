import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface UpdateStatusRequest {
  user_id: string
  status: 'active' | 'inactive' | 'suspended'
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
      throw new Error('Only admins can update user status')
    }

    // Parse request body
    const body: UpdateStatusRequest = await req.json()
    const { user_id, status } = body

    if (!user_id || !status) {
      throw new Error('Missing required fields: user_id and status')
    }

    const validStatuses = ['active', 'inactive', 'suspended']
    if (!validStatuses.includes(status)) {
      throw new Error('Invalid status. Must be: active, inactive, or suspended')
    }

    // Cannot change your own status
    if (user_id === currentUser.id) {
      throw new Error('Cannot change your own status')
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

    // Check target user's role - cannot change superadmin status unless you're superadmin
    const { data: targetRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user_id)
      .single()

    if (targetRole?.role === 'superadmin' && userRole?.role !== 'superadmin') {
      throw new Error('Only superadmins can change superadmin status')
    }

    // Get current status for audit log
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email, status')
      .eq('id', user_id)
      .single()

    if (!targetProfile) {
      throw new Error('User not found')
    }

    const previousStatus = targetProfile.status

    // Update the user's status in profiles
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ status })
      .eq('id', user_id)

    if (updateError) {
      throw updateError
    }

    // If suspended, also ban the user in auth (optional - prevents login)
    if (status === 'suspended') {
      await supabaseAdmin.auth.admin.updateUserById(user_id, {
        ban_duration: '876000h' // ~100 years
      })
    } else if (previousStatus === 'suspended' && status === 'active') {
      // Unban if changing from suspended to active
      await supabaseAdmin.auth.admin.updateUserById(user_id, {
        ban_duration: 'none'
      })
    }

    // Get actor info for audit log
    const { data: actorProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', currentUser.id)
      .single()

    // Log the status change to audit_logs
    const { error: auditError } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        action: 'status_change',
        actor_id: currentUser.id,
        target_id: user_id,
        target_type: 'user',
        details: {
          actor_role: userRole?.role,
          actor_name: actorProfile?.full_name || 'Unknown',
          actor_email: actorProfile?.email || 'Unknown',
          target_name: targetProfile?.full_name || 'Unknown',
          target_email: targetProfile?.email || 'Unknown',
          previous_status: previousStatus,
          new_status: status,
        },
      })

    if (auditError) {
      console.error('Error creating audit log:', auditError)
    }

    console.log(`Status changed: ${actorProfile?.email} changed ${targetProfile?.email} status from ${previousStatus} to ${status}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'User status updated successfully'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error: unknown) {
    console.error('Error updating user status:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to update user status'
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
