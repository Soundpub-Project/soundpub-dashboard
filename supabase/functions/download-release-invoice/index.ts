import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const schema = () => Deno.env.get('DATABASE_SCHEMA') || Deno.env.get('SUPABASE_DB_SCHEMA') || 'Soundpub'
const client = (url: string, key: string, options: Record<string, unknown> = {}) => createClient(url, key, {
  ...options,
  db: { ...((options.db as Record<string, unknown>) || {}), schema: schema() },
})
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
})
const text = (value: unknown) => String(value || '-').replace(/[\r\n]+/g, ' ').slice(0, 100)
const currency = (amount: number, code: string) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: code || 'IDR', minimumFractionDigits: 0,
}).format(amount)
const date = (value: string | null) => value ? new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta',
}).format(new Date(value)) : '-'

async function makePdf(payment: any, release: any, profile: any, number: string) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const navy = rgb(0.05, 0.08, 0.14)
  const orange = rgb(0.96, 0.39, 0.05)
  const row = (label: string, value: string, y: number) => {
    page.drawText(label, { x: 54, y, size: 10, font: bold, color: navy })
    page.drawText(value, { x: 210, y, size: 10, font: regular, color: navy, maxWidth: 320 })
  }
  page.drawRectangle({ x: 0, y: 758, width: 595, height: 84, color: navy })
  page.drawText('soundpub', { x: 54, y: 793, size: 25, font: bold, color: rgb(1, 1, 1) })
  page.drawText('BUKTI PEMBAYARAN RELEASE', { x: 54, y: 775, size: 9, font: regular, color: rgb(0.82, 0.86, 0.91) })
  page.drawRectangle({ x: 385, y: 779, width: 156, height: 26, color: orange })
  page.drawText('LUNAS / PAID', { x: 409, y: 788, size: 10, font: bold, color: rgb(1, 1, 1) })
  page.drawText('Invoice Pembayaran', { x: 54, y: 710, size: 20, font: bold, color: navy })
  page.drawText(number, { x: 54, y: 688, size: 11, font: bold, color: orange })
  page.drawText('Dibayar pada ' + date(payment.paid_at), { x: 54, y: 671, size: 9, font: regular, color: rgb(0.35, 0.39, 0.46) })
  page.drawRectangle({ x: 54, y: 565, width: 487, height: 82, borderColor: rgb(0.85, 0.87, 0.91), borderWidth: 1 })
  row('Pembayar', text(profile?.full_name), 625)
  row('Email', text(profile?.email), 604)
  row('Referensi', text(payment.xendit_invoice_id || payment.id), 583)
  page.drawText('Detail Release', { x: 54, y: 526, size: 13, font: bold, color: navy })
  page.drawRectangle({ x: 54, y: 402, width: 487, height: 100, borderColor: rgb(0.85, 0.87, 0.91), borderWidth: 1 })
  row('Judul Release', text(release.title), 478)
  row('Artist Utama', text(release.artist_name), 457)
  row('Jumlah Track', String(payment.track_count || 0) + ' track', 436)
  row('Harga per Track', currency(Number(payment.price_per_track || 0), payment.currency), 415)
  page.drawRectangle({ x: 54, y: 322, width: 487, height: 55, color: rgb(0.96, 0.97, 0.99) })
  page.drawText('TOTAL DIBAYAR', { x: 72, y: 350, size: 10, font: bold, color: navy })
  page.drawText(currency(Number(payment.amount), payment.currency), { x: 370, y: 343, size: 16, font: bold, color: orange })
  page.drawText('Dokumen ini dibuat otomatis oleh Soundpub sebagai bukti pembayaran.', { x: 54, y: 90, size: 8, font: regular, color: rgb(0.4, 0.43, 0.5) })
  return pdf.save()
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405)
  const url = Deno.env.get('SUPABASE_URL')
  const publicUrl = Deno.env.get('SUPABASE_PUBLIC_URL') || url
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('authorization')
  if (!authorization) return response({ error: 'Unauthorized' }, 401)
  if (!url || !publicUrl || !anonKey || !serviceKey) return response({ error: 'Function environment is incomplete' }, 500)
  const userDb = client(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user } } = await userDb.auth.getUser()
  if (!user) return response({ error: 'Unauthorized' }, 401)
  const input = await request.json().catch(() => ({}))
  if (!input.payment_id || typeof input.payment_id !== 'string') return response({ error: 'payment_id wajib diisi' }, 400)
  const db = client(url, serviceKey)
  const { data: roles } = await db.from('user_roles').select('role').eq('user_id', user.id)
  if (!roles?.some((item: { role: string }) => item.role === 'admin' || item.role === 'superadmin')) return response({ error: 'Forbidden' }, 403)
  const { data: payment, error: paymentError } = await db.from('release_payments').select('*').eq('id', input.payment_id).maybeSingle()
  if (paymentError || !payment) return response({ error: 'Invoice tidak ditemukan' }, 404)
  if (payment.status !== 'paid') return response({ error: 'PDF hanya tersedia untuk invoice lunas' }, 409)
  const invoiceNumber = payment.invoice_number || ('SPB-' + new Date(payment.paid_at || payment.created_at).toISOString().slice(0, 7).replace('-', '') + '-' + payment.id.slice(0, 8).toUpperCase())
  const path = payment.invoice_pdf_path || (payment.user_id + '/' + payment.id + '/' + invoiceNumber + '.pdf')
  if (!payment.invoice_pdf_path) {
    const [{ data: release }, { data: profile }] = await Promise.all([
      db.from('releases').select('title, artist_name').eq('id', payment.release_id).maybeSingle(),
      db.from('profiles').select('full_name, email').eq('id', payment.user_id).maybeSingle(),
    ])
    if (!release) return response({ error: 'Release invoice tidak ditemukan' }, 404)
    const { error: uploadError } = await db.storage.from('release-invoices').upload(path, await makePdf(payment, release, profile, invoiceNumber), { contentType: 'application/pdf', upsert: false })
    if (uploadError && !uploadError.message.includes('already exists')) return response({ error: 'Gagal menyimpan PDF invoice' }, 500)
    const { error: updateError } = await db.from('release_payments').update({ invoice_number: invoiceNumber, invoice_pdf_path: path, invoice_pdf_generated_at: new Date().toISOString() }).eq('id', payment.id)
    if (updateError) return response({ error: 'Gagal menyimpan metadata invoice' }, 500)
  }
  const publicStorage = client(publicUrl, serviceKey)
  const { data: signed, error: signedError } = await publicStorage.storage.from('release-invoices').createSignedUrl(path, 600, { download: invoiceNumber + '.pdf' })
  if (signedError || !signed?.signedUrl) return response({ error: 'Gagal membuat link invoice' }, 500)
  return response({ invoice_number: invoiceNumber, url: signed.signedUrl })
})
