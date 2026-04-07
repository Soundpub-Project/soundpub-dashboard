# SoundPub Dashboard - Payment Gateway Documentation

Dokumentasi lengkap integrasi payment gateway Xendit untuk pembayaran release musik.
Updated: April 2026

---

## Daftar Isi

1. [Arsitektur](#arsitektur)
2. [Alur Pembayaran](#alur-pembayaran)
3. [Database Schema](#database-schema)
4. [Edge Functions](#edge-functions)
5. [Konfigurasi Harga](#konfigurasi-harga)
6. [Webhook Setup](#webhook-setup)
7. [Email Notifikasi](#email-notifikasi)
8. [Status Release](#status-release)
9. [Secrets yang Diperlukan](#secrets-yang-diperlukan)
10. [Troubleshooting](#troubleshooting)

---

## Arsitektur

```text
User Buat Release
       │
       ▼
┌─────────────────────┐
│  Isi Form Release   │
│  (seperti biasa)    │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────────────┐
│  Pilih:                     │
│  [Simpan Draft]  [Bayar]    │
└──────┬──────────────┬───────┘
       │              │
       ▼              ▼
  Status:         Edge Function
  "draft"         create-xendit-invoice
                       │
                       ▼
                  Redirect ke
                  Xendit Payment Page
                       │
                       ▼
              ┌────────┴────────┐
              │ Webhook Callback │
              │ (xendit-webhook) │
              └────────┬────────┘
                       │
                       ▼
                 Update status:
                 "pending_paid"
                       │
                       ▼
              Kirim Email Notifikasi
              ke publisher@soundpub.xyz
                       │
                       ▼
              Admin konfirmasi →
              Status: "active"
```

---

## Alur Pembayaran

### 1. User Membuat Release
- User mengisi form release seperti biasa (judul, artist, tracks, cover, dll)
- Saat menyimpan, ada 2 pilihan:
  - **Simpan Draft**: Menyimpan release dengan status `draft`
  - **Lanjutkan Pembayaran**: Menyimpan release dan redirect ke Xendit

### 2. Proses Pembayaran
- System menghitung harga berdasarkan jumlah track × harga per track
- Edge function `create-xendit-invoice` membuat invoice di Xendit
- User di-redirect ke halaman pembayaran Xendit
- User memilih metode pembayaran dan menyelesaikan pembayaran

### 3. Callback & Notifikasi
- Xendit mengirim webhook ke `xendit-webhook` setelah pembayaran
- System mengupdate status pembayaran dan release:
  - Berhasil: `release.status = 'pending_paid'`
  - Gagal/Expired: `release.status = 'draft'`
- Email notifikasi dikirim ke `publisher@soundpub.xyz`

### 4. Konfirmasi Admin
- Admin melihat release dengan status "Sudah Dibayar" di dashboard
- Admin mengklik "Konfirmasi & Aktifkan"
- Release status berubah ke `active`

---

## Database Schema

### Tabel `release_payments`

| Kolom | Tipe | Deskripsi |
|-------|------|-----------|
| `id` | UUID | Primary key |
| `release_id` | UUID | FK ke releases |
| `user_id` | UUID | User yang membayar |
| `amount` | NUMERIC(18,2) | Total pembayaran |
| `currency` | TEXT | Mata uang (default: IDR) |
| `track_count` | INTEGER | Jumlah track |
| `price_per_track` | NUMERIC(18,2) | Harga per track saat pembayaran |
| `xendit_invoice_id` | TEXT | ID invoice Xendit |
| `xendit_invoice_url` | TEXT | URL pembayaran Xendit |
| `status` | TEXT | pending/paid/expired/failed |
| `paid_at` | TIMESTAMPTZ | Waktu pembayaran berhasil |
| `created_at` | TIMESTAMPTZ | Waktu dibuat |
| `updated_at` | TIMESTAMPTZ | Waktu diupdate |

### RLS Policies

- Users bisa melihat dan membuat payment sendiri
- Admin bisa manage semua payment
- Webhook (service role) bisa update status payment

### SQL Migration

```sql
CREATE TABLE public.release_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'IDR',
  track_count INTEGER NOT NULL DEFAULT 1,
  price_per_track NUMERIC(18,2) NOT NULL DEFAULT 50000,
  xendit_invoice_id TEXT,
  xendit_invoice_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_release_payments_release_id ON public.release_payments(release_id);
CREATE INDEX idx_release_payments_user_id ON public.release_payments(user_id);
CREATE INDEX idx_release_payments_status ON public.release_payments(status);
CREATE INDEX idx_release_payments_xendit_invoice_id ON public.release_payments(xendit_invoice_id);

ALTER TABLE public.release_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own payments"
ON public.release_payments FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own payments"
ON public.release_payments FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all payments"
ON public.release_payments FOR ALL TO authenticated
USING (is_admin(auth.uid()));

CREATE TRIGGER update_release_payments_timestamp
  BEFORE UPDATE ON public.release_payments
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

INSERT INTO public.app_settings (key, value) VALUES ('release_price_per_track', '50000')
ON CONFLICT (key) DO NOTHING;
```

---

## Edge Functions

### `create-xendit-invoice`

**Endpoint:** `POST /functions/v1/create-xendit-invoice`

**Request Body:**
```json
{
  "release_id": "uuid"
}
```

**Response:**
```json
{
  "invoice_url": "https://checkout.xendit.co/...",
  "invoice_id": "xendit-invoice-id",
  "amount": 150000,
  "track_count": 3,
  "price_per_track": 50000
}
```

**Alur:**
1. Autentikasi user via JWT
2. Ambil data release dan hitung jumlah track
3. Ambil harga per track dari `app_settings`
4. Buat invoice di Xendit API
5. Simpan record payment di `release_payments`
6. Return URL pembayaran

### `xendit-webhook`

**Endpoint:** `POST /functions/v1/xendit-webhook`

**Headers:**
- `X-CALLBACK-TOKEN`: Token verifikasi dari Xendit

**Request Body:** (dari Xendit)
```json
{
  "id": "xendit-invoice-id",
  "status": "PAID",
  "external_id": "release-uuid-timestamp"
}
```

**Alur:**
1. Verifikasi callback token
2. Cari payment record berdasarkan `xendit_invoice_id`
3. Update status payment
4. Jika PAID: update release ke `pending_paid`, kirim email
5. Jika EXPIRED/FAILED: revert release ke `draft`

---

## Konfigurasi Harga

Harga per track disimpan di tabel `app_settings`:

| Key | Value | Deskripsi |
|-----|-------|-----------|
| `release_price_per_track` | `50000` | Harga per track dalam IDR |

### Mengubah Harga

**Via Database:**
```sql
UPDATE app_settings SET value = '75000' WHERE key = 'release_price_per_track';
```

**Via Dashboard (Superadmin):**
- Buka Settings > Super Admin Settings
- Ubah harga per track

### Perhitungan Harga

```
Total = Jumlah Track × Harga Per Track

Contoh:
- Single (1 track): 1 × Rp50.000 = Rp50.000
- EP (4 tracks): 4 × Rp50.000 = Rp200.000
- Album (10 tracks): 10 × Rp50.000 = Rp500.000
```

---

## Webhook Setup

### Di Dashboard Xendit

1. Login ke [dashboard.xendit.co](https://dashboard.xendit.co)
2. Buka **Settings > Webhooks**
3. Tambahkan webhook URL:
   - **URL**: `https://[supabase-project-id].supabase.co/functions/v1/xendit-webhook`
   - **Events**: Invoice paid, expired, failed
4. Catat **Verification Token** untuk secret `XENDIT_WEBHOOK_TOKEN`

### Untuk VPS/Self-Hosted

URL webhook berubah sesuai domain:
```
https://[your-supabase-domain]/functions/v1/xendit-webhook
```

---

## Email Notifikasi

Saat pembayaran berhasil, email dikirim ke `publisher@soundpub.xyz` berisi:

- Judul release
- Nama artist
- Jumlah track
- Total pembayaran
- Nama dan email pembayar
- Waktu pembayaran

**Email Provider:**
- **Cloud (Lovable):** Menggunakan Resend API
- **VPS/Self-Hosted:** Menggunakan SMTP server sendiri

---

## Status Release

| Status | Deskripsi | Warna Badge |
|--------|-----------|-------------|
| `draft` | Disimpan sebagai draft, belum dibayar | Abu-abu |
| `pending` | Menunggu pembayaran | Kuning |
| `pending_paid` | Sudah dibayar, menunggu konfirmasi admin | Hijau |
| `active` | Aktif, sudah dikonfirmasi admin | Biru |
| `rejected` | Ditolak oleh admin | Merah |
| `inactive` | Dinonaktifkan | Abu-abu |

---

## Secrets yang Diperlukan

| Secret | Wajib | Deskripsi |
|--------|-------|-----------|
| `XENDIT_SECRET_KEY` | ✅ | API Key dari dashboard Xendit |
| `XENDIT_WEBHOOK_TOKEN` | ✅ | Verification token untuk webhook |
| `RESEND_API_KEY` | ⚠️ Cloud | API Key Resend (untuk Cloud/Lovable) |
| `SMTP_HOST` | ⚠️ VPS | Host mail server (untuk VPS) |
| `SMTP_PORT` | ⚠️ VPS | Port SMTP (biasanya 587) |
| `SMTP_USER` | ⚠️ VPS | Username email SMTP |
| `SMTP_PASS` | ⚠️ VPS | Password email SMTP |
| `NOTIFICATION_EMAIL` | ✅ | Email tujuan notifikasi (publisher@soundpub.xyz) |

---

## Troubleshooting

### Pembayaran tidak redirect ke Xendit
- Pastikan `XENDIT_SECRET_KEY` sudah di-set
- Cek console browser untuk error
- Cek edge function logs

### Webhook tidak diterima
- Pastikan URL webhook benar di dashboard Xendit
- Pastikan `XENDIT_WEBHOOK_TOKEN` sesuai dengan yang di Xendit
- Cek edge function logs: `supabase functions logs xendit-webhook`

### Email notifikasi tidak terkirim
- Cek `RESEND_API_KEY` atau konfigurasi SMTP
- Cek `NOTIFICATION_EMAIL` sudah di-set
- Email gagal tidak menggagalkan webhook (fail-safe)

### Status release tidak berubah setelah bayar
- Cek `release_payments` di database
- Pastikan webhook Xendit berjalan
- Cek edge function logs

---

*Dokumen ini di-generate untuk SoundPub Dashboard. Updated: April 2026*
