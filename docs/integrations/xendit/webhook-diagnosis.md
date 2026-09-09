# Analisis Masalah Webhook Xendit

## Status Saat Ini
❌ Webhook tidak masuk meskipun pembayaran berhasil
✅ Invoice creation berhasil
✅ Pembayaran di Xendit berhasil

## Kemungkinan Penyebab

### 1. **Webhook URL Belum Terdaftar di Xendit Dashboard**
**Probabilitas: TINGGI**

Yang harus dicek:
- Login ke Xendit Dashboard (https://dashboard.xendit.co)
- Masuk ke Settings → Webhooks
- Pastikan URL webhook terdaftar: `https://api.yourdomain.com/functions/v1/xendit-webhook`
- Events yang harus diaktifkan:
  - `invoice.paid`
  - `invoice.expired`
  - `invoice.failed` (opsional)

### 2. **Header x-callback-token Tidak Match**
**Probabilitas: SEDANG**

Webhook function butuh header `x-callback-token` yang sama dengan `XENDIT_WEBHOOK_TOKEN`:

`	ypescript
const webhookToken = Deno.env.get('XENDIT_WEBHOOK_TOKEN')
const callbackToken = req.headers.get('x-callback-token')

if (webhookToken && callbackToken !== webhookToken) {
  console.error('Invalid webhook token')
  return jsonResponse({ error: 'Invalid callback token' }, 403)
}
`

Yang harus dicek di Xendit Dashboard:
- Webhook settings harus punya custom header:
  - Name: `x-callback-token`
  - Value: `O5BcVNSpFouYSTIjwaKAEr8fd4t9DravtWr2tA9nq50Efnsn`

### 3. **Environment Variable XENDIT_WEBHOOK_TOKEN Tidak Ter-set di Edge Function**
**Probabilitas: SEDANG**

Edge function butuh secret ini di server self-hosted.

Cara verifikasi:
`ash
ssh maskhar@supabase-server
cd ~/docker/supabase/supabase-1.26.05/docker
cat .env | grep XENDIT_WEBHOOK_TOKEN
`

Jika tidak ada, tambahkan:
`ash
echo 'XENDIT_WEBHOOK_TOKEN="O5BcVNSpFouYSTIjwaKAEr8fd4t9DravtWr2tA9nq50Efnsn"' >> .env
docker compose up -d --force-recreate functions
`

### 4. **Webhook URL Tidak Accessible dari Internet**
**Probabilitas: RENDAH-SEDANG**

Xendit harus bisa akses webhook endpoint dari internet.

Test dari luar:
`ash
curl -X POST https://api.yourdomain.com/functions/v1/xendit-webhook \
  -H "Content-Type: application/json" \
  -H "x-callback-token: O5BcVNSpFouYSTIjwaKAEr8fd4t9DravtWr2tA9nq50Efnsn" \
  -d '{
    "id": "test-invoice-id",
    "status": "PAID"
  }'
`

Response yang diharapkan: `{"error":"Payment record not found"}` (404) → artinya webhook bisa diakses tapi invoice tidak ada.

### 5. **Xendit Masih dalam Mode Sandbox/Test**
**Probabilitas: RENDAH**

Jika menggunakan Xendit test mode:
- Webhook mungkin tidak auto-trigger
- Harus manual trigger dari Xendit dashboard
- Atau pakai test webhook URL mereka

## Cara Debug

### Check 1: Lihat Xendit Webhook Logs
1. Login ke Xendit Dashboard
2. Developer → Webhooks → Logs
3. Cari event untuk invoice yang sudah dibayar
4. Lihat status:
   - ✅ Success 200 → webhook sampai, cek database
   - ❌ 403 Forbidden → token tidak match
   - ❌ 404/503 → URL salah atau server tidak accessible
   - ⏳ Pending/Retry → Xendit masih coba kirim

### Check 2: Lihat Edge Function Logs
`ash
ssh maskhar@supabase-server
cd ~/docker/supabase/supabase-1.26.05/docker
docker compose logs functions --tail=100 | grep xendit
`

Cari log seperti:
- "Xendit webhook received: ..." → webhook masuk
- "Invalid webhook token" → token tidak match
- "Payment not found for invoice: ..." → invoice ID tidak ada di database

### Check 3: Verifikasi Payment Record
`sql
SELECT 
  id,
  xendit_invoice_id,
  status,
  created_at,
  paid_at
FROM release_payments
WHERE xendit_invoice_id = 'INVOICE_ID_DARI_XENDIT'
ORDER BY created_at DESC;
`

## Solusi Step-by-Step

### Langkah 1: Pastikan Environment Variable Ter-set
`ash
# SSH ke server
ssh maskhar@supabase-server
cd ~/docker/supabase/supabase-1.26.05/docker

# Cek apakah ada
grep XENDIT_WEBHOOK_TOKEN .env

# Jika tidak ada, tambahkan
echo 'XENDIT_WEBHOOK_TOKEN="O5BcVNSpFouYSTIjwaKAEr8fd4t9DravtWr2tA9nq50Efnsn"' >> .env

# Restart functions service
docker compose up -d --force-recreate functions
`

### Langkah 2: Daftarkan Webhook di Xendit
1. Login https://dashboard.xendit.co
2. Settings → Webhooks → Add Webhook
3. Isi:
   - **URL**: `https://api.yourdomain.com/functions/v1/xendit-webhook`
   - **Events**: Pilih `invoice.paid`, `invoice.expired`
   - **Custom Headers**:
     - Name: `x-callback-token`
     - Value: `O5BcVNSpFouYSTIjwaKAEr8fd4t9DravtWr2tA9nq50Efnsn`
4. Save dan test dengan "Send Test Webhook"

### Langkah 3: Test Manual Webhook
Jika pembayaran sudah berhasil tapi webhook belum masuk, trigger manual:

`ash
# Ganti dengan invoice ID yang sudah dibayar
INVOICE_ID="your-xendit-invoice-id"

curl -X POST https://api.yourdomain.com/functions/v1/xendit-webhook \
  -H "Content-Type: application/json" \
  -H "x-callback-token: O5BcVNSpFouYSTIjwaKAEr8fd4t9DravtWr2tA9nq50Efnsn" \
  -d '{"id":"'$INVOICE_ID'","status":"PAID","paid_at":"2026-09-03T15:00:00Z"}'
`

### Langkah 4: Monitoring
Setelah setup, test dengan pembayaran baru:
1. Buat invoice baru
2. Bayar menggunakan test payment
3. Monitor logs real-time:
`ash
ssh maskhar@supabase-server
cd ~/docker/supabase/supabase-1.26.05/docker
docker compose logs -f functions | grep -i xendit
`

## Quick Diagnosis Checklist

- [ ] Webhook URL terdaftar di Xendit Dashboard?
- [ ] Custom header x-callback-token ter-set dengan value yang benar?
- [ ] Events invoice.paid dan invoice.expired sudah dipilih?
- [ ] XENDIT_WEBHOOK_TOKEN ada di server .env?
- [ ] Functions service sudah di-restart setelah update .env?
- [ ] Webhook URL bisa diakses dari internet (test dengan curl)?
- [ ] Xendit webhook logs menunjukkan success atau error?
- [ ] Edge function logs menunjukkan request masuk?

## Kesimpulan

**Most Likely Issue**: Webhook URL belum terdaftar di Xendit Dashboard atau custom header `x-callback-token` belum di-set.

**Quick Fix Priority**:
1. ✅ Daftarkan webhook URL di Xendit Dashboard dengan custom header
2. ✅ Pastikan `XENDIT_WEBHOOK_TOKEN` ada di server .env
3. ✅ Test dengan Send Test Webhook dari Xendit Dashboard
4. ✅ Manual trigger untuk invoice yang sudah dibayar

**Untuk Manual Trigger Invoice yang Sudah Dibayar**:
1. Cari `xendit_invoice_id` dari database `release_payments`
2. Gunakan curl command di Langkah 3 untuk manual trigger
3. Cek apakah status berubah dari `pending` ke `paid`
4. Cek apakah release status berubah ke `pending_paid`
