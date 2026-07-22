import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const getDatabaseSchema = () => Deno.env.get('DATABASE_SCHEMA') || Deno.env.get('SUPABASE_DB_SCHEMA') || 'soundpub'

const createSoundpubClient = (supabaseUrl: string, supabaseKey: string, options: any = {}) => {
  const existingDb = options.db || {}
  return createClient(supabaseUrl, supabaseKey, {
    ...options,
    db: { ...existingDb, schema: getDatabaseSchema() },
  })
}


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GMAIL_GATEWAY = 'https://connector-gateway.lovable.dev/google_mail/gmail/v1'
const FROM_NAME = 'Soundpub'
const FROM_EMAIL = 'publishersoundpub@gmail.com'

function base64UrlEncode(str: string): string {
  // Encode UTF-8 string to base64url
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sendGmail(opts: { to: string | string[]; subject: string; html: string }) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
  const GOOGLE_MAIL_API_KEY = Deno.env.get('GOOGLE_MAIL_API_KEY')
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured')
  if (!GOOGLE_MAIL_API_KEY) throw new Error('GOOGLE_MAIL_API_KEY not configured (Gmail connector not linked)')

  const toList = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to
  const message = [
    `From: ${FROM_NAME} <${FROM_EMAIL}>`,
    `To: ${toList}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    opts.html,
  ].join('\r\n')

  const raw = base64UrlEncode(message)

  const res = await fetch(`${GMAIL_GATEWAY}/users/me/messages/send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': GOOGLE_MAIL_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gmail API failed [${res.status}]: ${body}`)
  }
  return await res.json()
}

interface NotificationPayload {
  uploadId: string
  uploadedBy: string
  totalRows: number
  insertedCount: number
  totalRevenue: number
  affectedLabels: string[]
  balanceUpdates: {
    label: string
    balance_added: number
    label_revenue_added: number
    artist_revenue_added: number
    success: boolean
  }[]
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabaseAdmin = createSoundpubClient(supabaseUrl, supabaseServiceKey)
    const supabaseUser = createSoundpubClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    })

    // Get user
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is admin
    const { data: isAdminResult } = await supabaseAdmin.rpc('is_admin', { user_id: user.id })
    if (!isAdminResult) {
      return new Response(
        JSON.stringify({ success: false, error: 'Only admins can send notifications' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const payload: NotificationPayload = await req.json()
    
    console.log('Sending royalty notification:', payload)

    // Get admin users to notify
    const { data: adminUsers, error: adminError } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .in('role', ['superadmin', 'admin'])

    if (adminError) {
      console.error('Error fetching admin users:', adminError)
      throw adminError
    }

    if (!adminUsers || adminUsers.length === 0) {
      console.log('No admin users found to notify')
      return new Response(
        JSON.stringify({ success: true, message: 'No admins to notify' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get admin emails
    const { data: adminProfiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name')
      .in('id', adminUsers.map(u => u.user_id))

    if (profilesError) {
      console.error('Error fetching admin profiles:', profilesError)
      throw profilesError
    }

    // Get affected labels' emails
    const { data: labelProfiles, error: labelsError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name')
      .in('full_name', payload.affectedLabels)

    if (labelsError) {
      console.error('Error fetching label profiles:', labelsError)
    }

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('id-ID', { 
        style: 'currency', 
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(amount)
    }

    const formatNumber = (num: number) => {
      return new Intl.NumberFormat('id-ID').format(num)
    }

    const uploadDate = new Date().toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    // Build balance updates table
    const balanceUpdatesRows = payload.balanceUpdates
      .filter(u => u.success)
      .map(u => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${u.label}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(u.balance_added)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(u.label_revenue_added)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(u.artist_revenue_added)}</td>
        </tr>
      `)
      .join('')

    // Send email to admin users
    const adminEmails = adminProfiles?.map(p => p.email).filter(Boolean) || []
    
    if (adminEmails.length > 0) {
      const adminHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #374151; margin: 0; padding: 0; background-color: #f3f4f6;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0; padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Ã°Å¸â€œÅ  Royalty Upload Notification</h1>
            </div>
            
            <div style="background: white; border-radius: 0 0 12px 12px; padding: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <p style="margin-top: 0;">Halo Admin,</p>
              
              <p>Data royalti baru telah berhasil diupload ke sistem Soundpub.</p>
              
              <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #1f2937;">Ã°Å¸â€œâ€¹ Ringkasan Upload</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Upload ID:</td>
                    <td style="padding: 8px 0; text-align: right; font-family: monospace;">${payload.uploadId.substring(0, 8)}...</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Diupload oleh:</td>
                    <td style="padding: 8px 0; text-align: right;">${payload.uploadedBy}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Waktu:</td>
                    <td style="padding: 8px 0; text-align: right;">${uploadDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Total Data:</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: 600;">${formatNumber(payload.totalRows)} baris</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Berhasil Diproses:</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #059669;">${formatNumber(payload.insertedCount)} baris</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Total Revenue:</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #7c3aed;">${formatCurrency(payload.totalRevenue)}</td>
                  </tr>
                </table>
              </div>
              
              ${payload.balanceUpdates.length > 0 ? `
              <div style="margin: 20px 0;">
                <h3 style="color: #1f2937;">Ã°Å¸â€™Â° Update Saldo per Label</h3>
                <div style="overflow-x: auto;">
                  <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    <thead>
                      <tr style="background: #f3f4f6;">
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Label</th>
                        <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Total Saldo</th>
                        <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Label Revenue</th>
                        <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Artist Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${balanceUpdatesRows}
                    </tbody>
                  </table>
                </div>
              </div>
              ` : ''}
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
                <p style="color: #6b7280; font-size: 14px; margin: 0;">
                  Email ini dikirim otomatis oleh sistem Soundpub.<br>
                  Silakan login ke dashboard untuk melihat detail lebih lanjut.
                </p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `

      try {
        await sendGmail({
          to: adminEmails,
          subject: `Ã°Å¸Å½Âµ Royalty Upload: ${formatNumber(payload.insertedCount)} data baru - ${formatCurrency(payload.totalRevenue)}`,
          html: adminHtml,
        })
        console.log(`Admin notification sent to: ${adminEmails.join(', ')}`)
      } catch (emailErr) {
        console.error('Failed to send admin email:', emailErr)
      }
    }

    // Send individual notifications to affected labels
    const labelNotifications: { email: string; success: boolean }[] = []
    
    for (const label of labelProfiles || []) {
      const labelUpdate = payload.balanceUpdates.find(u => u.label === label.full_name && u.success)
      
      if (!labelUpdate || !label.email) continue

      const labelHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #374151; margin: 0; padding: 0; background-color: #f3f4f6;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 12px 12px 0 0; padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Ã°Å¸â€™Â° Royalty Baru Masuk!</h1>
            </div>
            
            <div style="background: white; border-radius: 0 0 12px 12px; padding: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <p style="margin-top: 0;">Halo ${label.full_name},</p>
              
              <p>Kabar baik! Royalti baru telah ditambahkan ke akun Anda.</p>
              
              <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 12px; padding: 24px; margin: 20px 0; text-align: center;">
                <p style="margin: 0; color: #059669; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Total Saldo Ditambahkan</p>
                <p style="margin: 10px 0 0; font-size: 32px; font-weight: 700; color: #047857;">${formatCurrency(labelUpdate.balance_added)}</p>
              </div>
              
              <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #1f2937;">Ã°Å¸â€œÅ  Rincian Pembagian</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0; color: #6b7280;">Label Revenue:</td>
                    <td style="padding: 10px 0; text-align: right; font-weight: 600;">${formatCurrency(labelUpdate.label_revenue_added)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #6b7280;">Artist Revenue:</td>
                    <td style="padding: 10px 0; text-align: right; font-weight: 600;">${formatCurrency(labelUpdate.artist_revenue_added)}</td>
                  </tr>
                  <tr style="border-top: 1px solid #e5e7eb;">
                    <td style="padding: 10px 0; color: #1f2937; font-weight: 600;">Total:</td>
                    <td style="padding: 10px 0; text-align: right; font-weight: 700; color: #059669;">${formatCurrency(labelUpdate.balance_added)}</td>
                  </tr>
                </table>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <p style="color: #6b7280; font-size: 14px;">
                  Login ke dashboard Soundpub untuk melihat detail royalti dan mengajukan penarikan saldo.
                </p>
              </div>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
                <p style="color: #6b7280; font-size: 12px; margin: 0;">
                  Email ini dikirim otomatis oleh sistem Soundpub.<br>
                  Jika ada pertanyaan, silakan hubungi tim support kami.
                </p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `

      try {
        await sendGmail({
          to: label.email,
          subject: `Ã°Å¸â€™Â° Royalty Baru: ${formatCurrency(labelUpdate.balance_added)} telah ditambahkan ke saldo Anda`,
          html: labelHtml,
        })
        console.log(`Label notification sent to: ${label.email}`)
        labelNotifications.push({ email: label.email, success: true })
      } catch (labelErr) {
        console.error(`Failed to send email to ${label.email}:`, labelErr)
        labelNotifications.push({ email: label.email, success: false })
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        adminNotifications: adminEmails.length,
        labelNotifications: labelNotifications.filter(n => n.success).length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('Error sending royalty notification:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
