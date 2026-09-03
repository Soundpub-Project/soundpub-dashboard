# 📸 XENDIT DASHBOARD - VISUAL GUIDE

## Lokasi Menu Webhook di Xendit Dashboard

### Tampilan Dashboard Xendit

```
┌────────────────────────────────────────────────────────────────────┐
│  XENDIT                                              [Profile] [🔔] │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────┐                                                 │
│  │              │                                                 │
│  │  🏠 Home     │                                                 │
│  │  💰 Payments │                                                 │
│  │  📊 Reports  │                                                 │
│  │  👥 Customers│                                                 │
│  │  🔧 Developer│  ◄─── KLIK DI SINI (Option 1)                  │
│  │  ⚙️  Settings│  ◄─── ATAU KLIK DI SINI (Option 2)             │
│  │              │                                                 │
│  └──────────────┘                                                 │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Option 1: Via Developer Menu

```
Developer
  ├─ API Keys
  ├─ Webhooks  ◄─── KLIK DI SINI!
  ├─ API Logs
  └─ Documentation
```

### Option 2: Via Settings Menu

```
Settings
  ├─ Business Settings
  ├─ Team Management
  ├─ Webhooks  ◄─── KLIK DI SINI!
  ├─ API Keys
  └─ Billing
```

---

## Form Webhook Registration

Setelah klik "Add New Webhook" atau "+ Create Webhook", kamu akan melihat form seperti ini:

```
┌─────────────────────────────────────────────────────────────────┐
│                      Create New Webhook                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Webhook URL *                                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ https://supabase.carubra.com/functions/v1/xendit-webhook  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Description (optional)                                         │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ SoundPub Payment Webhook Handler                          │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Environment                                                    │
│  ○ Test Mode    ● Live Mode                                    │
│                                                                 │
│  Events *                                                       │
│  ☑ invoice.paid         ◄─── CENTANG INI (WAJIB)              │
│  ☑ invoice.expired      ◄─── CENTANG INI (WAJIB)              │
│  ☐ invoice.failed                                              │
│  ☐ payment.succeeded                                           │
│  ☐ payment.failed                                              │
│                                                                 │
│  Custom Headers (Optional but IMPORTANT!)                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Header Name:  x-callback-token                          │   │
│  │ Header Value: O5BcVNSpFouYSTIjwaKAEr8fd4t9DravtWr...   │   │
│  └─────────────────────────────────────────────────────────┘   │
│  [+ Add Header]                                                 │
│                                                                 │
│                          [ Cancel ]  [ Create Webhook ]         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Setelah Webhook Dibuat

Kamu akan melihat webhook terdaftar seperti ini:

```
┌─────────────────────────────────────────────────────────────────┐
│  Webhooks                                    [+ Create Webhook] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ● Active                                                       │
│  https://supabase.carubra.com/functions/v1/xendit-webhook      │
│  Events: invoice.paid, invoice.expired                          │
│  Created: 2026-09-03                                            │
│                                                                 │
│  [View Logs] [Test Webhook] [Edit] [Delete]                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Test Webhook Button

Klik tombol **[Test Webhook]** untuk verify connection:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Test Webhook                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Select Event Type:                                             │
│  [ invoice.paid ▼ ]                                             │
│                                                                 │
│  Test Payload:                                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ {                                                         │ │
│  │   "id": "test-invoice-123",                               │ │
│  │   "status": "PAID",                                       │ │
│  │   "amount": 100000,                                       │ │
│  │   ...                                                     │ │
│  │ }                                                         │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│                              [Send Test]                        │
│                                                                 │
│  Result:                                                        │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ ✅ Status: 404 Not Found                                  │ │
│  │ Response: {"error":"Payment record not found"}            │ │
│  │                                                           │ │
│  │ This is NORMAL! Test invoice tidak ada di database.      │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Expected Results:**
- ✅ 404 Not Found = Webhook bisa diakses, tapi test invoice tidak ada (NORMAL!)
- ❌ 403 Forbidden = Header x-callback-token salah
- ❌ 500/503 = Server error atau endpoint tidak accessible
- ❌ Timeout = URL tidak bisa diakses dari internet

---

## Webhook Logs / Delivery History

Untuk melihat webhook yang sudah dikirim Xendit:

```
┌─────────────────────────────────────────────────────────────────┐
│  Webhook Logs                                  [Filter ▼]       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  2026-09-03 22:05:23                                            │
│  invoice.paid                                                   │
│  Invoice: 64f2b8d59f2d4c0017123abc                              │
│  ✅ Delivered (200 OK)                      [View Details]      │
│                                                                 │
│  ──────────────────────────────────────────────────────────────│
│                                                                 │
│  2026-09-03 21:30:15                                            │
│  invoice.paid                                                   │
│  Invoice: 64f2b8d59f2d4c0017123def                              │
│  ❌ Failed (403 Forbidden)                  [Retry]             │
│                                                                 │
│  ──────────────────────────────────────────────────────────────│
│                                                                 │
│  2026-09-03 20:15:42                                            │
│  invoice.expired                                                │
│  Invoice: 64f2b8d59f2d4c0017123ghi                              │
│  ✅ Delivered (200 OK)                      [View Details]      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Penjelasan Status:**
- ✅ **Delivered (200 OK)** = Webhook berhasil diterima server kamu
- ❌ **Failed (403)** = Token tidak match, cek custom header
- ❌ **Failed (404)** = Payment record tidak ada di database
- ❌ **Failed (503/Timeout)** = Server tidak response
- ⏳ **Pending/Retry** = Xendit akan coba kirim ulang

---

## Checklist Setelah Setup

Setelah mendaftarkan webhook, pastikan:

- [ ] Webhook URL: https://supabase.carubra.com/functions/v1/xendit-webhook
- [ ] Status: **Active** (ada dot hijau ●)
- [ ] Environment: **Live Mode** (jika production) atau **Test Mode** (jika testing)
- [ ] Events selected: invoice.paid, invoice.expired
- [ ] Custom header added: x-callback-token
- [ ] Test webhook result: 404 atau 200 (keduanya OK)
- [ ] XENDIT_WEBHOOK_TOKEN ada di server .env

---

## Troubleshooting Quick Reference

| Issue | Kemungkinan Penyebab | Solusi |
|-------|---------------------|--------|
| Test webhook 403 | Header x-callback-token salah | Cek value header = token di .env |
| Test webhook timeout | Endpoint tidak accessible | Cek firewall/DNS/SSL |
| Real payment tidak trigger webhook | Webhook belum terdaftar | Daftar webhook di dashboard |
| Webhook 200 tapi DB tidak update | Logic error di function | Cek Edge Function logs |

---

## Screenshot Xendit Dashboard (Reference)

**Menu Location:**
- **Developer → Webhooks** (untuk developer/technical account)
- **Settings → Webhooks** (untuk business/admin account)

**URL Direct:**
- Test Mode: https://dashboard.xendit.co/settings/webhooks?environment=test
- Live Mode: https://dashboard.xendit.co/settings/webhooks?environment=live

---

Generated: 2026-09-03 22:36:09 WIB
