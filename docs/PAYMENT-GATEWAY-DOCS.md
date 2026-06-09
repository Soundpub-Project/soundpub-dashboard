# SoundPub Dashboard — Payment Gateway Documentation

Dokumentasi lengkap integrasi payment gateway **Xendit** untuk pembayaran release musik.
Update: Mei 2026.

---

## Daftar Isi
1. [Arsitektur](#arsitektur)
2. [Alur Pembayaran](#alur-pembayaran)
3. [Database Schema](#database-schema)
4. [Edge Functions](#edge-functions)
5. [Konfigurasi Harga](#konfigurasi-harga)
6. [Webhook Setup](#webhook-setup)
7. [Email Notifikasi (Gmail)](#email-notifikasi-gmail)
8. [Status Release](#status-release)
9. [Secrets](#secrets)
10. [Troubleshooting](#troubleshooting)

---

## Arsitektur

```text
┌──────────┐   1. POST /create-xendit-invoice   ┌──────────────────┐
│ Frontend │ ────────────────────────────────► │ Edge Function    │
│ (User)   │                                    │ create-xendit-   │
└──────────┘                                    │ invoice          │
     ▲                                          └────────┬─────────┘
     │                                                   │ 2. Create Invoice
     │ 3. Redirect ke checkout URL                       ▼
     │                                          ┌──────────────────┐
     │                                          │   Xendit API     │
     │                                          └────────┬─────────┘
     │                                                   │ 4. User bayar
     │                                                   ▼
     │                                          ┌──────────────────┐
     │              5. Webhook callback         │   Xendit         │
     │              POST /xendit-webhook ──────►│   Server         │
     │                                          └────────┬─────────┘
     │                                                   │
     │                                                   ▼
     │                                          ┌──────────────────┐
     │              6. Update DB                │ Edge Function    │
     │              + send email Gmail          │ xendit-webhook   │
     │              + insert notification       └────────┬─────────┘
     │                                                   │
     └───────────────────────────────────────────────────┘
```

---

## Alur Pembayaran

1. **User membuat release** (status: `draft`)
2. **Klik tombol "Bayar"** di UI
3. Frontend POST ke `/create-xendit-invoice` dengan `release_id`
4. Edge function:
   - Cek pending invoice → reuse jika masih valid (cek ke Xendit API)
   - Hitung harga (per-track atau per-category)
   - Create invoice ke Xendit
   - Insert ke tabel `release_payments` (status `pending`)
   - Insert notifikasi user
5. Frontend redirect ke `invoice_url` (Xendit checkout)
6. User bayar di Xendit (VA, eWallet, QRIS, dll)
7. Xendit kirim webhook `POST /xendit-webhook` dengan status `PAID`/`EXPIRED`/`FAILED`
8. Edge function `xendit-webhook`:
   - Validasi `x-callback-token` header
   - Update `release_payments.status` + `paid_at`
   - **PAID** → release status = `pending_paid`, kirim notif user + admin, kirim email Gmail
   - **EXPIRED/FAILED** → release status = `draft`, notif user
9. Admin konfirmasi release di dashboard → status `active`

---

## Database Schema

### `release_payments`
| Kolom               | Tipe          | Keterangan                                  |
|---------------------|---------------|---------------------------------------------|
| `id`                | uuid PK       |                                             |
| `release_id`        | uuid FK       | → `releases.id`                             |
| `user_id`           | uuid          | User yang membayar                          |
| `amount`            | numeric       | Total IDR                                   |
| `currency`          | text          | `IDR`                                       |
| `track_count`       | int           | Jumlah track                                |
| `price_per_track`   | numeric       | Harga per track saat invoice dibuat         |
| `xendit_invoice_id` | text          | ID invoice Xendit                           |
| `xendit_invoice_url`| text          | URL checkout                                |
| `status`            | text          | `pending` / `paid` / `expired` / `failed`   |
| `paid_at`           | timestamptz   | Filled saat status → paid                   |
| `created_at`        | timestamptz   |                                             |

RLS:
- User bisa SELECT payment miliknya sendiri
- Admin bisa SELECT semua
- Hanya service role yang bisa INSERT/UPDATE (lewat edge function)

---

## Edge Functions

### `create-xendit-invoice`
- **Auth:** Bearer token user
- **Input:** `{ release_id }`
- **Output:** `{ invoice_url, invoice_id, amount, track_count, price_per_track, reused? }`
- **Logic:**
  - Reuse pending invoice jika masih `PENDING` di Xendit
  - Mark expired/paid invoice lama sesuai status Xendit
  - Hitung harga dari `app_settings`

### `xendit-webhook`
- **Auth:** Header `x-callback-token` (compare dengan `XENDIT_WEBHOOK_TOKEN`)
- **Input:** Body Xendit `{ id, status, ... }`
- **Output:** `{ success: true }` (200)
- **Side effects:**
  - Update `release_payments`
  - Update `releases.status`
  - Insert notifications (user + per-admin, BUKAN global)
  - Trigger email Gmail ke `NOTIFICATION_EMAIL`

---

## Konfigurasi Harga

Stored di tabel `app_settings`:

### Mode `per_track` (default)
| Key                          | Default    |
|------------------------------|------------|
| `release_pricing_mode`       | `per_track`|
| `release_price_per_track`    | `50000`    |

Total = `price_per_track × track_count`

### Mode `per_category`
| Key                          | Default     |
|------------------------------|-------------|
| `release_pricing_mode`       | `per_category` |
| `release_price_single`       | `50000`     |
| `release_price_ep`           | `150000`    |
| `release_price_album`        | `300000`    |

Total = harga sesuai `release_type` (single/ep/album).
`price_per_track` = `total / track_count`.

Edit via UI **Settings → Pricing** (admin only).

---

## Webhook Setup

### Di Xendit Dashboard

1. Login → **Settings → Developers → Webhooks**
2. Set URL: `https://<project-ref>.supabase.co/functions/v1/xendit-webhook`
3. Pilih events: **Invoice Paid**, **Invoice Expired**
4. Generate **Callback Verification Token**
5. Copy token → set di Lovable Cloud Secrets sebagai `XENDIT_WEBHOOK_TOKEN`

### Header yang Dikirim Xendit
```
Content-Type: application/json
x-callback-token: <XENDIT_WEBHOOK_TOKEN>
```

### Body Webhook (contoh PAID)
```json
{
  "id": "xnd_inv_xxx",
  "external_id": "release-<uuid>-<timestamp>",
  "status": "PAID",
  "amount": 150000,
  "paid_amount": 150000,
  "paid_at": "2026-05-07T12:34:56.000Z",
  "payment_method": "EWALLET",
  "payment_channel": "OVO"
}
```

### Status Mapping
| Xendit Status | DB Status   | Action                                         |
|---------------|-------------|------------------------------------------------|
| `PAID`        | `paid`      | Release → `pending_paid`, notif + email Gmail  |
| `SETTLED`     | `paid`      | Sama dengan PAID                               |
| `EXPIRED`     | `expired`   | Release → `draft`, notif user                  |
| `FAILED`      | `failed`    | Release → `draft`, notif user                  |

### Test Webhook
Xendit menyediakan tombol **"Test"** di dashboard. Atau pakai cURL:
```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/xendit-webhook \
  -H "Content-Type: application/json" \
  -H "x-callback-token: <XENDIT_WEBHOOK_TOKEN>" \
  -d '{"id":"test_invoice_id","status":"PAID"}'
```
*(Pastikan `xendit_invoice_id` cocok dengan record di DB)*

### Webhook Security
- **Wajib** set `XENDIT_WEBHOOK_TOKEN` di production
- Edge function return `403` jika token tidak match
- Webhook idempotent: re-deliver Xendit aman (status check di code)

---

## Email Notifikasi (Gmail)

Sejak Mei 2026, email notifikasi dikirim via **Google Mail Connector** (akun `publishersoundpub@gmail.com`), bukan lagi Resend.

### Trigger
- Webhook PAID → kirim email ke `NOTIFICATION_EMAIL` (admin)
- Email format RFC 2822, dikirim via Gmail API gateway endpoint `/messages/send`

### Quota Gmail
- Akun Gmail biasa: ~500 email/hari
- Workspace: 2.000 email/hari
- Cukup untuk notifikasi internal admin/label

### Template Email PAID
Subject: `[SoundPub] Release Baru Dibayar: <title>`
Body: Tabel HTML berisi release, artist, jumlah track, total, payer, waktu bayar.

### Reconnect Connector
Jika token Gmail expired:
1. Lovable → **Connectors → Google Mail**
2. Klik **Reconnect** → login ulang Google

---

## Status Release

```text
draft ──[create invoice]──► draft (payment: pending)
                              │
                              │ webhook PAID
                              ▼
                          pending_paid ──[admin konfirmasi]──► active
                              │
                              │ webhook EXPIRED/FAILED
                              ▼
                            draft
```

Detail:
- `draft` — Belum bayar / payment expired/failed
- `pending_paid` — Sudah bayar, menunggu admin verifikasi
- `active` — Live di catalog
- `archived` — Diarsip admin

**Lock rules:**
- Status `pending_paid` & `active` → release **terkunci**, tidak bisa edit/hapus
- Status `draft` & `pending` → bisa edit
- Hapus release berbayar → auto refund balance user (lihat memory `payment-refund-mechanism`)

---

## Secrets

Lihat `ENV-DOCS.md` bagian Cloud Secrets:
- `XENDIT_SECRET_KEY` — auth ke Xendit API (Basic Auth, base64)
- `XENDIT_WEBHOOK_TOKEN` — verifikasi callback
- `NOTIFICATION_EMAIL` — penerima email admin
- `GOOGLE_MAIL_API_KEY` — auto via connector

---

## Troubleshooting

| Masalah                             | Solusi                                                                |
|-------------------------------------|------------------------------------------------------------------------|
| Invoice URL expired saat dibuka     | Frontend re-call `create-xendit-invoice` → reuse atau buat baru        |
| Webhook 403 Forbidden               | Cek `x-callback-token` match `XENDIT_WEBHOOK_TOKEN`                   |
| Webhook 404 Payment not found       | Pastikan `xendit_invoice_id` ter-save di `release_payments`           |
| Status release tidak update         | Cek edge function logs `xendit-webhook`                               |
| Email PAID tidak terkirim           | Cek connector Google Mail aktif. Lihat logs `xendit-webhook`           |
| User dobel bayar                    | Edge function reuse pending invoice — cek logic `existingPayment`      |
| Refund balance setelah delete       | Auto-trigger lewat trigger `update_balance_on_payout_status_change`    |

### Debug Webhook
```bash
# Lihat logs edge function
supabase functions logs xendit-webhook --project-ref <ref>

# Cek payment record
SELECT * FROM release_payments WHERE xendit_invoice_id = 'xnd_inv_xxx';

# Cek release status
SELECT id, title, status FROM releases WHERE id = '<release_id>';
```

