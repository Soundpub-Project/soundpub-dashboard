import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface CreateUserRequest {
  email: string
  password: string
  full_name: string
  phone?: string
  role: 'admin' | 'label' | 'artist' | 'user'
  parent_label_id?: string
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
      throw new Error('Only admins and labels can create users')
    }

    // Parse request body
    const body: CreateUserRequest = await req.json()
    const { email, password, full_name, phone, role, parent_label_id } = body

    // Validate role permissions
    if (isLabel && role !== 'artist') {
      throw new Error('Labels can only create artists')
    }

    if (!isAdmin && role === 'admin') {
      throw new Error('Only admins can create admin users')
    }

    // Create admin client for user creation
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

    // Create user using admin API (this won't affect the current session)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name,
      },
    })

    if (createError) {
      throw createError
    }

    if (!newUser.user) {
      throw new Error('Failed to create user')
    }

    // Wait for trigger to create profile and default role
    await new Promise(resolve => setTimeout(resolve, 500))

    // Update role to the specified role
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .update({ role })
      .eq('user_id', newUser.user.id)

    if (roleError) {
      console.error('Error updating role:', roleError)
    }

    // Set parent_label_id and phone if provided (for artists under a label)
    const labelId = parent_label_id || (isLabel ? currentUser.id : null)
    
    // Update profile with additional fields
    const profileUpdate: Record<string, unknown> = {}
    if (labelId && role === 'artist') {
      profileUpdate.parent_label_id = labelId
    }
    if (phone) {
      profileUpdate.phone = phone
    }
    
    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdate)
        .eq('id', newUser.user.id)

      if (profileError) {
        console.error('Error updating profile:', profileError)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
          full_name,
          role,
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error: unknown) {
    console.error('Error creating user:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to create user'
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