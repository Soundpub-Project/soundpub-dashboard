import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
const getDatabaseSchema = () => Deno.env.get('DATABASE_SCHEMA') || Deno.env.get('SUPABASE_DB_SCHEMA') || 'soundpub'

const createSoundpubClient = (supabaseUrl: string, supabaseKey: string, options: any = {}) => {
  const existingDb = options.db || {}
  return createClient(supabaseUrl, supabaseKey, {
    ...options,
    db: { ...existingDb, schema: getDatabaseSchema() },
  })
}


// Input validation schema
const CreateUserSchema = z.object({
  email: z.string()
    .max(255, 'Email terlalu panjang')
    .optional()
    .nullable()
    .or(z.literal('')),
  password: z.string()
    .max(128, 'Password terlalu panjang')
    .optional()
    .nullable()
    .or(z.literal('')),
  full_name: z.string()
    .min(2, 'Nama minimal 2 karakter')
    .max(200, 'Nama terlalu panjang')
    .regex(/^[\p{L}\p{M}\s'.-]+$/u, 'Nama mengandung karakter tidak valid'),
  phone: z.string()
    .regex(/^(\+?[1-9]\d{1,14})?$/, 'Format nomor telepon tidak valid')
    .max(20, 'Nomor telepon terlalu panjang')
    .optional()
    .nullable()
    .or(z.literal('')),
  role: z.enum(['superadmin', 'admin', 'label', 'artist', 'user', 'copyright', 'whitelabel'], {
    errorMap: () => ({ message: 'Role tidak valid' })
  }),
  parent_label_id: z.string().uuid('Format parent_label_id tidak valid').optional().nullable(),
})

type CreateUserRequest = z.infer<typeof CreateUserSchema>

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
    const supabaseClient = createSoundpubClient(
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
    const isWhitelabel = userRole?.role === 'whitelabel'

    if (!isAdmin && !isLabel && !isWhitelabel) {
      throw new Error('Only admins, labels, and whitelabels can create users')
    }

    // Parse and validate request body
    const rawBody = await req.json()
    const validationResult = CreateUserSchema.safeParse(rawBody)
    
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message
      }))
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Validation failed',
          details: errors
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }
    
    let { email, password, full_name, phone, role, parent_label_id } = validationResult.data

    // For label creating artists, email & password are not inputted. We generate them.
    if (isLabel && role === 'artist') {
      if (!email || email.trim() === '') {
        const dummyUuid = crypto.randomUUID()
        email = `artist_${dummyUuid}@managed.soundpub.local`
      }
      if (!password || password.trim() === '') {
        password = crypto.randomUUID() + crypto.randomUUID()
      }
    } else {
      if (!email || email.trim() === '') {
        throw new Error('Email is required')
      }
      if (!password || password.trim() === '') {
        throw new Error('Password is required')
      }
      if (password.length < 6) {
        throw new Error('Password minimal 6 karakter')
      }
    }

    // Validate role permissions
    if ((isLabel || isWhitelabel) && role !== 'artist') {
      throw new Error('Labels and whitelabels can only create artists')
    }

    if (!isAdmin && (role === 'admin' || role === 'superadmin')) {
      throw new Error('Only admins can create admin users')
    }

    // Create admin client for user creation
    const supabaseAdmin = createSoundpubClient(
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
      .upsert({ user_id: newUser.user.id, role }, { onConflict: 'user_id' })

    if (roleError) {
      console.error('Error updating role:', roleError)
    }

    // Set parent_label_id and phone if provided (for artists under a label)
    const labelId = parent_label_id || ((isLabel || isWhitelabel) ? currentUser.id : null)
    
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

    // CRITICAL: Sync to artists table for label/whitelabel integration
    // This ensures artists appear in release forms immediately without manual re-adding
    if (role === 'artist' && labelId) {
      // Check if artist already exists in artists table
      const { data: existingArtist } = await supabaseAdmin
        .from('artists')
        .select('id')
        .eq('name', full_name)
        .eq('label_id', labelId)
        .maybeSingle()

      if (!existingArtist) {
        const { error: artistError } = await supabaseAdmin
          .from('artists')
          .insert({
            name: full_name,
            label_id: labelId,
          })

        if (artistError) {
          console.error('Error syncing to artists table:', artistError)
        } else {
          console.log(`Artist "${full_name}" synced to artists table for label ${labelId}`)
        }
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
    const SAFE_MESSAGES = ['Unauthorized', 'Only admins', 'Labels can only', 'Labels and whitelabels can only', 'Failed to create user', 'User already registered', 'already been registered']
    let safeMessage = 'Failed to create user'
    if (error instanceof Error && SAFE_MESSAGES.some(m => error.message.startsWith(m) || error.message.includes(m))) {
      safeMessage = error.message
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

