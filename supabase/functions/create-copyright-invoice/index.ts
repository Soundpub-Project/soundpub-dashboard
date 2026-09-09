import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const schema = () => Deno.env.get('DATABASE_SCHEMA') || Deno.env.get('SUPABASE_DB_SCHEMA') || 'soundpub'
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const client = (url: string, key: string, options: Record<string, unknown> = {}) => createClient(url, key, { ...options, db: { ...((options.db as Record<string, unknown>) || {}), schema: schema() } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const xenditKey = Deno.env.get('XENDIT_SECRET_KEY')
    if (!url || !anonKey || !serviceKey || !xenditKey) return json({ error: 'Payment gateway not configured' }, 503)
    const userClient = client(url, anonKey, { global: { headers: { Authorization: authorization } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const payload = await req.json().catch(() => null)
    const registrationId = payload?.registration_id
    if (!registrationId) return json({ error: 'registration_id is required' }, 400)
    const admin = client(url, serviceKey)
    const { data: registration, error: registrationError } = await admin.from('copyright_registrations').select('id, user_id, legal_name, email, status').eq('id', registrationId).eq('user_id', user.id).maybeSingle()
    if (registrationError || !registration) return json({ error: 'Registration not found' }, 404)
    if (!['awaiting_payment', 'draft'].includes(registration.status)) return json({ error: 'Registration is not awaiting payment' }, 409)
    const { data: payment, error: paymentError } = await admin.from('copyright_registration_payments').select('*').eq('registration_id', registrationId).eq('user_id', user.id).eq('payment_status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (paymentError || !payment) return json({ error: 'Payment record not found' }, 404)
    if (payment.xendit_invoice_url && payment.xendit_invoice_id) return json({ invoice_url: payment.xendit_invoice_url, invoice_id: payment.xendit_invoice_id, amount: Number(payment.amount), reused: true })
    const payerEmail = registration.email || user.email
    if (!payerEmail) return json({ error: 'Payer email not found' }, 400)
    const origin = req.headers.get('origin') || Deno.env.get('PUBLIC_SITE_URL') || 'https://dashboard.soundpub.xyz'
    const externalId = 'copyright-' + registrationId + '-' + Date.now()
    const response = await fetch('https://api.xendit.co/v2/invoices', { method: 'POST', headers: { Authorization: 'Basic ' + btoa(xenditKey + ':'), 'Content-Type': 'application/json' }, body: JSON.stringify({ external_id: externalId, amount: Number(payment.amount), payer_email: payerEmail, description: 'Registrasi Perlindungan Hak Cipta Soundpub', currency: payment.currency || 'IDR', customer: { given_names: registration.legal_name || 'Pemohon Hak Cipta', email: payerEmail }, success_redirect_url: origin + '/payment/callback?status=success&registration_id=' + registrationId, failure_redirect_url: origin + '/payment/callback?status=failed&registration_id=' + registrationId }) })
    const invoice = await response.json()
    if (!response.ok || !invoice.id || !invoice.invoice_url) return json({ error: 'Failed to create payment invoice' }, 422)
    const { error: updateError } = await admin.from('copyright_registration_payments').update({ xendit_invoice_id: invoice.id, xendit_invoice_url: invoice.invoice_url, payment_reference: externalId, updated_at: new Date().toISOString() }).eq('id', payment.id)
    if (updateError) return json({ error: 'Failed to save payment invoice' }, 500)
    return json({ invoice_url: invoice.invoice_url, invoice_id: invoice.id, amount: Number(payment.amount) })
  } catch (error) { console.error(error); return json({ error: 'Internal server error' }, 500) }
})
