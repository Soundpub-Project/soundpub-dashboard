# 🔧 Xendit Webhook Troubleshooting Tools

## 📦 File yang Tersedia

### 📚 Dokumentasi
- **webhook-troubleshooting.md** - Panduan lengkap step-by-step troubleshooting
- **webhook-diagnosis.md** - Analisis kemungkinan penyebab masalah
- **webhook-helper-scripts.md** - Contoh script dan command tambahan

### 🛠️ PowerShell Scripts
- **scripts/xendit/trigger-webhook.ps1** - Manual trigger webhook untuk invoice tertentu
- **scripts/xendit/check-invoice.ps1** - Cek status invoice di Xendit API
- **scripts/xendit/test-webhook-endpoint.ps1** - Test apakah webhook endpoint accessible

---

## 🚀 Quick Start

### 1. Test Webhook Endpoint (Wajib Pertama Kali)

```powershell
.\scripts/xendit/test-webhook-endpoint.ps1
```

**Output yang diharapkan**:
- ✅ OPTIONS request successful
- ✅ POST without token → 403 Forbidden
- ✅ POST with token + fake invoice → 404 Not Found
- ✅ DNS resolved successfully

### 2. Cek Status Invoice di Xendit

```powershell
.\scripts/xendit/check-invoice.ps1 -InvoiceId "64f2b8d59f2d4c0017123abc" -SecretKey "xnd_..."
```

**Ganti**:
- InvoiceId: ID invoice dari Xendit
- SecretKey: Xendit secret key (bisa ambil dari .env atau Xendit Dashboard)

### 3. Manual Trigger Webhook

Jika pembayaran sudah PAID tapi status di database masih pending:

```powershell
.\scripts/xendit/trigger-webhook.ps1 -InvoiceId "64f2b8d59f2d4c0017123abc"
```

**Output yang diharapkan**:
```
✅ SUCCESS!
Status Code: 200
Response: {"success":true}
```

---

## 🔍 Kemungkinan Root Cause

Berdasarkan analisis kode webhook, masalah paling sering terjadi karena:

### 1. **Webhook URL Belum Terdaftar di Xendit** (Probabilitas: TINGGI ⚠️)

**Solusi**:
1. Login ke https://dashboard.xendit.co
2. Settings → Webhooks → Add New Webhook
3. Isi:
   - URL: https://api.yourdomain.com/functions/v1/xendit-webhook
   - Events: ☑ invoice.paid, ☑ invoice.expired
   - Custom Headers:
     - Name: x-callback-token
     - Value: O5BcVNSpFouYSTIjwaKAEr8fd4t9DravtWr2tA9nq50Efnsn

### 2. **Environment Variable Missing** (Probabilitas: SEDANG)

**Check via SSH**:
```bash
ssh maskhar@supabase-server
cd ~/docker/supabase/supabase-1.26.05/docker
grep XENDIT_WEBHOOK_TOKEN .env
```

**Jika tidak ada, tambahkan**:
```bash
echo 'XENDIT_WEBHOOK_TOKEN="O5BcVNSpFouYSTIjwaKAEr8fd4t9DravtWr2tA9nq50Efnsn"' >> .env
docker compose up -d --force-recreate functions
```

### 3. **Webhook Endpoint Not Accessible** (Probabilitas: RENDAH-SEDANG)

**Test**:
```powershell
.\scripts/xendit/test-webhook-endpoint.ps1
```

Jika gagal, cek:
- Firewall/security group
- Reverse proxy (nginx) configuration
- SSL certificate

---

## 📊 Cara Cek Payment yang Stuck

### Via Database Query

```sql
-- Cari payment yang pending lebih dari 1 jam
SELECT 
  rp.id,
  rp.xendit_invoice_id,
  rp.status,
  rp.amount,
  rp.created_at,
  r.title as release_title,
  p.email as user_email
FROM release_payments rp
JOIN releases r ON r.id = rp.release_id
JOIN profiles p ON p.id = rp.user_id
WHERE rp.status = 'pending'
  AND rp.xendit_invoice_id IS NOT NULL
  AND rp.created_at < NOW() - INTERVAL '1 hour'
ORDER BY rp.created_at DESC;
```

### Untuk Setiap Invoice yang Stuck:

1. **Verify di Xendit** apakah benar sudah PAID:
   ```powershell
   .\scripts/xendit/check-invoice.ps1 -InvoiceId "INVOICE_ID" -SecretKey "xnd_..."
   ```

2. **Jika status = PAID**, trigger manual:
   ```powershell
   .\scripts/xendit/trigger-webhook.ps1 -InvoiceId "INVOICE_ID"
   ```

3. **Verify database updated**:
   ```sql
   SELECT status, paid_at FROM release_payments WHERE xendit_invoice_id = 'INVOICE_ID';
   SELECT status FROM releases WHERE id = (SELECT release_id FROM release_payments WHERE xendit_invoice_id = 'INVOICE_ID');
   ```

---

## 🎯 Expected Behavior Setelah Webhook Masuk

Ketika webhook berhasil di-process, sistem akan:

1. ✅ Update elease_payments.status dari pending → paid
2. ✅ Set elease_payments.paid_at dengan timestamp
3. ✅ Update eleases.status dari draft/pending_payment → pending_paid
4. ✅ Buat notifikasi untuk user: "Pembayaran Berhasil"
5. ✅ Buat notifikasi untuk admin/superadmin: "Release Baru Dibayar"
6. ✅ Kirim email ke user (via send-app-email)
7. ✅ Kirim email ke admin (via Resend - legacy)

**Jika webhook gagal atau tidak masuk**, semua proses di atas tidak terjadi.

---

## 🐛 Debug Tips

### Monitor Webhook Real-time

Di server:
```bash
ssh maskhar@supabase-server
cd ~/docker/supabase/supabase-1.26.05/docker
docker compose logs -f functions | grep -i xendit
```

### Test Webhook dari Xendit Dashboard

1. Xendit Dashboard → Settings → Webhooks
2. Pilih webhook yang terdaftar
3. Klik "Send Test Webhook"
4. Lihat response code:
   - 200 ✅ = webhook working
   - 403 ❌ = token tidak match
   - 404/503 ❌ = endpoint issue

### Check Xendit Webhook Delivery Logs

1. Xendit Dashboard → Developer → Webhooks → Logs
2. Filter by date
3. Lihat delivery status untuk setiap invoice

---

## 📞 Jika Masih Bermasalah

Baca panduan lengkap: **webhook-troubleshooting.md**

Atau collect informasi berikut:
- Screenshot Xendit webhook settings
- Screenshot Xendit webhook delivery logs
- Edge Function logs (last 100 lines with grep xendit)
- Database query result untuk invoice yang bermasalah
- Output dari .\scripts/xendit/test-webhook-endpoint.ps1

---

**Created**: 2026-09-03 22:09 WIB
**Author**: Kiro AI Assistant
**Project**: SoundPub Dashboard - Xendit Payment Integration
