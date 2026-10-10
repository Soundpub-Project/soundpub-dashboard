// Edge Function to update user role with server-side validation
// Prevents privilege escalation by enforcing role change rules
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'

const databaseSchema = Deno.env.get('DATABASE_SCHEMA') || Deno.env.get('SUPABASE_DB_SCHEMA') || 'Soundpub'

interface UpdateRoleRequest {
  user_id: string
  new_role: 'superadmin' | 'admin' | 'label' | 'artist' | 'user' | 'copyright' | 'whitelabel'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!accessToken) {
      throw new Error('Invalid authorization token')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        db: { schema: databaseSchema },
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(accessToken)
    if (authError || !user) throw new Error('Unauthorized')

    const { data: actorRole } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    const isAdmin = actorRole?.role === 'superadmin' || actorRole?.role === 'admin'
    const isSuperadmin = actorRole?.role === 'superadmin'

    if (!isAdmin) {
      throw new Error('Only admins can update user roles')
    }

    const body: UpdateRoleRequest = await req.json()
    const { user_id, new_role } = body

    if (!user_id || !new_role) {
      throw new Error('Missing required fields: user_id and new_role')
    }

    // Cannot change your own role
    if (user_id === user.id) {
      throw new Error('Cannot change your own role')
    }

    // Only superadmins can grant superadmin role
    if (new_role === 'superadmin' && !isSuperadmin) {
      throw new Error('Only superadmins can grant superadmin role')
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { db: { schema: databaseSchema } },
    )

    // Check target user's current role
    const { data: targetRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user_id)
      .single()

    // Non-superadmin admins cannot change superadmin roles
    if (targetRole?.role === 'superadmin' && !isSuperadmin) {
      throw new Error('Only superadmins can change superadmin roles')
    }

    const previousRole = targetRole?.role

    // Update role
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .update({ role: new_role })
      .eq('user_id', user_id)

    if (roleError) throw roleError

    // Get target user profile
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', user_id)
      .single()

    // Log the role change to audit_logs
    await supabaseAdmin.from('audit_logs').insert({
      action: 'role_change',
      actor_id: user.id,
      target_id: user_id,
      target_type: 'user',
      details: {
        actor_role: actorRole?.role,
        target_email: targetProfile?.email,
        target_name: targetProfile?.full_name,
        previous_role: previousRole,
        new_role: new_role,
      },
    })

    console.log(`Role changed: ${user.email} changed ${targetProfile?.email} role from ${previousRole} to ${new_role}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'User role updated successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    console.error('Error updating user role:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to update user role'
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

