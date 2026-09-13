# PANDUAN LENGKAP: Troubleshooting Webhook Xendit

## 📋 Ringkasan Masalah

**Gejala**: Pembayaran berhasil di Xendit, tapi status di database tetap pending

**Root Cause**: Webhook dari Xendit tidak sampai ke server atau tidak ter-process dengan benar

---

## 🔍 Diagnosis Step-by-Step

### Step 1: Verifikasi Webhook Endpoint Accessible

Jalankan script test:

```powershell
.\scripts/xendit/test-webhook-endpoint.ps1
```

**Expected Result**:
- ✅ OPTIONS request successful
- ✅ POST tanpa token → 403 Forbidden
- ✅ POST dengan token + fake invoice → 404 Not Found
- ✅ DNS resolved

**Jika gagal**: 
- Cek firewall/security group di server
- Pastikan port 443 terbuka untuk public
- Cek nginx/reverse proxy configuration

---

### Step 2: Cek Webhook Registration di Xendit Dashboard

1. Login ke https://dashboard.xendit.co
2. Masuk ke **Settings** → **Webhooks**
3. Cari webhook dengan URL: https://api.yourdomain.com/functions/v1/xendit-webhook

**Yang harus ada**:
- ✅ Webhook URL terdaftar dan aktif
- ✅ Events dipilih: invoice.paid, invoice.expired
- ✅ Custom Header:
  - Name: x-callback-token
  - Value: O5BcVNSpFouYSTIjwaKAEr8fd4t9DravtWr2tA9nq50Efnsn

**Jika belum ada**, tambahkan webhook baru:

```
URL: https://api.yourdomain.com/functions/v1/xendit-webhook

Events:
  ☑ invoice.paid
  ☑ invoice.expired
  ☑ invoice.failed (optional)

Custom Headers:
  Name: x-callback-token
  Value: O5BcVNSpFouYSTIjwaKAEr8fd4t9DravtWr2tA9nq50Efnsn
```

**Test webhook** dengan tombol "Send Test Webhook" di Xendit Dashboard.

---

### Step 3: Cek Environment Variable di Server

Webhook function memerlukan XENDIT_WEBHOOK_TOKEN di server.

**Manual check** (jika punya akses SSH):

```bash
ssh maskhar@supabase-server
cd ~/docker/supabase/supabase-1.26.05/docker
grep XENDIT_WEBHOOK_TOKEN .env
```

**Expected output**:
```
XENDIT_WEBHOOK_TOKEN="O5BcVNSpFouYSTIjwaKAEr8fd4t9DravtWr2tA9nq50Efnsn"
```

**Jika tidak ada**:

```bash
echo 'XENDIT_WEBHOOK_TOKEN="O5BcVNSpFouYSTIjwaKAEr8fd4t9DravtWr2tA9nq50Efnsn"' >> .env
docker compose up -d --force-recreate functions
```

**Verifikasi restart berhasil**:
```bash
docker compose ps | grep functions
docker compose logs functions --tail=20
```

---

### Step 4: Cek Webhook Logs di Xendit

1. Xendit Dashboard → **Developer** → **Webhooks** → **Logs**
2. Filter by date (pilih tanggal pembayaran)
3. Cari event untuk invoice yang sudah dibayar

**Possible statuses**:

| Status | Meaning | Action |
|--------|---------|--------|
| ✅ **200 Success** | Webhook diterima server | Cek database, mungkin ada error di logic |
| ❌ **403 Forbidden** | Token tidak match | Cek custom header di webhook settings |
| ❌ **404 Not Found** | URL salah atau endpoint tidak ada | Cek URL webhook registration |
| ❌ **500/502/503** | Server error | Cek Edge Function logs |
| ⏳ **Pending/Retry** | Xendit masih coba kirim ulang | Tunggu atau trigger manual |
| ❌ **Timeout** | Server tidak response dalam 10s | Cek server load/performance |

---

### Step 5: Cek Edge Function Logs

**Manual check** (jika punya akses SSH):

```bash
ssh maskhar@supabase-server
cd ~/docker/supabase/supabase-1.26.05/docker
docker compose logs functions --tail=100 | grep -i xendit
```

**Cari log patterns**:

| Log Message | Meaning | Action |
|-------------|---------|--------|
| Xendit webhook received: {...} | ✅ Webhook masuk | Lanjut cek error berikutnya |
| Invalid webhook token | ❌ Token tidak match | Cek XENDIT_WEBHOOK_TOKEN di .env |
| Payment not found for invoice: ... | ❌ Invoice ID tidak ada di DB | Cek elease_payments table |
| Payment update error: ... | ❌ Gagal update payment | Cek database permissions |
| Release update error: ... | ❌ Gagal update release | Cek database permissions |

**Real-time monitoring**:

```bash
# Monitor webhook logs real-time
docker compose logs -f functions | grep -i xendit
```

Kemudian trigger test webhook dari Xendit Dashboard.

---

### Step 6: Cek Database Payment Records

Koneksi ke database dan jalankan query:

```sql
-- Cari payment berdasarkan invoice ID
SELECT 
  id,
  release_id,
  user_id,
  xendit_invoice_id,
  status,
  amount,
  created_at,
  paid_at
FROM release_payments
WHERE xendit_invoice_id = 'GANTI_DENGAN_INVOICE_ID'
ORDER BY created_at DESC;
```

**Expected result**:
- Row ditemukan dengan xendit_invoice_id yang sesuai
- Status: pending, paid, xpired, atau ailed

**Jika tidak ada row**:
- Invoice creation gagal
- Cek create-xendit-invoice function logs

**Jika status masih pending padahal sudah dibayar**:
- Webhook belum masuk atau gagal process
- Lakukan manual trigger (Step 7)

---

## 🔧 Manual Trigger Webhook

Jika pembayaran sudah berhasil tapi webhook tidak masuk, trigger manual:

### 1. Get Invoice ID dari Database

```sql
SELECT 
  rp.xendit_invoice_id,
  r.title as release_title,
  p.email as user_email
FROM release_payments rp
JOIN releases r ON r.id = rp.release_id
JOIN profiles p ON p.id = rp.user_id
WHERE rp.status = 'pending'
  AND rp.xendit_invoice_id IS NOT NULL
ORDER BY rp.created_at DESC
LIMIT 10;
```

### 2. (Optional) Verify Invoice Status di Xendit

```powershell
.\scripts/xendit/check-invoice.ps1 -InvoiceId "64f2b8d59f2d4c0017123abc" -SecretKey "xnd_..."
```

Pastikan status = PAID

### 3. Trigger Webhook Manual

```powershell
.\scripts/xendit/trigger-webhook.ps1 -InvoiceId "64f2b8d59f2d4c0017123abc"
```

**Expected output**:
```
✅ SUCCESS!
Status Code: 200
Response: {"success":true}
```

### 4. Verify Database Updated

```sql
SELECT status, paid_at
FROM release_payments
WHERE xendit_invoice_id = '64f2b8d59f2d4c0017123abc';

-- Should show:
-- status: paid
-- paid_at: <timestamp>
```

```sql
SELECT status
FROM releases
WHERE id = (
  SELECT release_id 
  FROM release_payments 
  WHERE xendit_invoice_id = '64f2b8d59f2d4c0017123abc'
);

-- Should show:
-- status: pending_paid
```

---

## 🔄 Batch Processing Multiple Invoices

Jika ada banyak invoice yang stuck:

### 1. Export Pending Invoices

```sql
-- Save to CSV
\COPY (
  SELECT xendit_invoice_id
  FROM release_payments
  WHERE status = 'pending'
    AND xendit_invoice_id IS NOT NULL
    AND created_at < NOW() - INTERVAL '1 hour'
) TO 'pending_invoices.csv' CSV HEADER;
```

### 2. Verify Each Invoice di Xendit

```powershell
# Create verify-batch.ps1
$invoices = Import-Csv pending_invoices.csv
$secretKey = "xnd_..."

foreach ($inv in $invoices) {
    Write-Host "Checking: $($inv.xendit_invoice_id)"
    .\scripts/xendit/check-invoice.ps1 -InvoiceId $inv.xendit_invoice_id -SecretKey $secretKey
    Write-Host ""
}
```

### 3. Trigger Webhook untuk PAID Invoices

```powershell
# Manual: trigger satu-satu
.\scripts/xendit/trigger-webhook.ps1 -InvoiceId "invoice-1"
.\scripts/xendit/trigger-webhook.ps1 -InvoiceId "invoice-2"

# Or create batch script
$paidInvoices = @("invoice-1", "invoice-2", "invoice-3")

foreach ($inv in $paidInvoices) {
    Write-Host "Processing: $inv"
    .\scripts/xendit/trigger-webhook.ps1 -InvoiceId $inv
    Start-Sleep -Seconds 2
}
```

---

## 📊 Monitoring & Prevention

### Enable Webhook Retry di Xendit

Xendit automatically retries failed webhooks:
- Initial: immediate
- Retry 1: after 1 minute
- Retry 2: after 5 minutes
- Retry 3: after 15 minutes
- Retry 4: after 1 hour
- Max: 24 hours

Pastikan webhook endpoint selalu available.

### Alert Setup

Setup monitoring untuk detect stuck payments:

```sql
-- Query untuk payment yang stuck > 1 jam
SELECT COUNT(*)
FROM release_payments
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '1 hour';
```

### Regular Check

Buat cron job untuk check stuck payments:

```bash
#!/bin/bash
# check-stuck-payments.sh

STUCK_COUNT=$(psql -h localhost -U postgres -d soundpub -t -c "
  SELECT COUNT(*) 
  FROM release_payments 
  WHERE status='pending' 
    AND created_at < NOW() - INTERVAL '1 hour'
")

if [ $STUCK_COUNT -gt 0 ]; then
  echo "WARNING: $STUCK_COUNT stuck payments detected!"
  # Send alert email/notification
fi
```

---

## ✅ Checklist Lengkap

Sebelum menganggap masalah selesai, pastikan:

- [ ] Webhook URL terdaftar di Xendit Dashboard
- [ ] Custom header x-callback-token ter-set dengan value yang benar
- [ ] Events invoice.paid dan invoice.expired diaktifkan
- [ ] XENDIT_WEBHOOK_TOKEN ada di server .env
- [ ] Functions service sudah di-restart setelah update .env
- [ ] Webhook endpoint accessible dari internet (test dengan curl)
- [ ] Test webhook dari Xendit Dashboard berhasil (200 OK)
- [ ] Edge Function logs menunjukkan "Xendit webhook received"
- [ ] Manual trigger untuk invoice yang stuck berhasil
- [ ] Database payment status berubah dari pending ke paid
- [ ] Release status berubah ke pending_paid
- [ ] User dan admin menerima notifikasi

---

## 📞 Support & Debugging

Jika masih gagal setelah semua langkah:

1. **Collect logs**:
   - Xendit webhook delivery logs
   - Edge Function logs (last 200 lines)
   - Database query result untuk affected invoices

2. **Check Xendit Status Page**: https://status.xendit.co

3. **Contact Xendit Support** dengan info:
   - Invoice ID
   - Expected webhook URL
   - Timestamp pembayaran
   - Webhook delivery status dari dashboard

---

Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
