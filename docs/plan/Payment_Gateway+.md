## Plan: Payment Gateway Xendit + Update Dokumentasi Migrasi

### Ringkasan

Menambahkan sistem pembayaran Xendit ke alur pembuatan release, update dokumentasi migrasi VPS, dan update schema SQL. Setelah ini selesai, baru lanjut ke fitur login Google.

---

### Alur Payment yang Akan Dibangun

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

### Step 1: Database — Tabel `release_payments` + Update `releases`

**Migration SQL:**

- Tambah tabel `release_payments` untuk menyimpan data transaksi:
  - `id`, `release_id`, `user_id`, `amount`, `currency`, `xendit_invoice_id`, `xendit_invoice_url`, `status` (pending/paid/expired/failed), `paid_at`, `created_at`, `updated_at`
- Tambah value status baru di releases: `draft` dan `pending_paid`
- RLS policies: user bisa lihat payment sendiri, admin bisa lihat semua

---

### Step 2: Edge Function — `create-xendit-invoice`

**File:** `supabase/functions/create-xendit-invoice/index.ts`

- Menerima `release_id` dan `amount` dari frontend
- Memanggil Xendit Invoice API (`POST /v2/invoices/`) untuk buat invoice
- Menyimpan data invoice ke `release_payments`
- Return `invoice_url` untuk redirect user ke halaman pembayaran Xendit
- **Secrets yang diperlukan:** `XENDIT_SECRET_KEY`

---

### Step 3: Edge Function — `xendit-webhook`

**File:** `supabase/functions/xendit-webhook/index.ts`

- Endpoint callback dari Xendit saat pembayaran selesai/gagal
- Verifikasi webhook token (`X-CALLBACK-TOKEN`) dari Xendit
- Update `release_payments.status` dan `releases.status`
- Jika pembayaran berhasil:
  - Set `release_payments.status = 'paid'`
  - Set `releases.status = 'pending_paid'`
  - Kirim email notifikasi ke `publisher@soundpub.xyz` via SMTP (menggunakan mail server yang sudah ada)
- **Secrets yang diperlukan:** `XENDIT_WEBHOOK_TOKEN`

---

### Step 4: Edge Function — `send-release-notification`

**File:** `supabase/functions/send-release-notification/index.ts`

- Mengirim email notifikasi ke admin bahwa ada release baru yang sudah dibayar
- Menggunakan SMTP langsung (mail server yang sudah disediakan user)
- **Secrets yang diperlukan:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `NOTIFICATION_EMAIL` (publisher@soundpub.xyz)

---

### Step 5: Update UI — Form Release

**File:** `src/components/releases/ReleaseFormDialog.tsx` dan `ArtistReleaseFormDialog.tsx`

- Ubah tombol "Simpan" menjadi dua pilihan:
  - **"Simpan Draft"** → simpan dengan `status: 'draft'`
  - **"Lanjutkan Pembayaran"** → simpan dengan `status: 'pending'`, lalu panggil `create-xendit-invoice`, redirect ke Xendit
- Tambah halaman/dialog konfirmasi pembayaran dengan ringkasan (judul release, jumlah track, harga)

---

### Step 6: Halaman Payment Callback

**File:** `src/pages/PaymentCallback.tsx` (baru)

- Route: `/payment/callback`
- Menampilkan status pembayaran (berhasil/gagal/expired)
- Redirect kembali ke halaman releases setelah beberapa detik

---

### Step 7: Update Halaman Releases — Status Badge Baru

**File:** `src/pages/Releases.tsx`

- Tambah badge untuk status baru:
  - `draft` → Badge abu-abu "Draft"
  - `pending_paid` → Badge hijau "Sudah Dibayar"
- Filter berdasarkan status pembayaran
- Admin bisa melihat dan mengonfirmasi release yang `pending_paid`

---

### Step 8: Halaman Admin — Konfirmasi Release Berbayar

- Di halaman Releases (admin view), tambah aksi "Konfirmasi & Aktifkan" untuk release berstatus `pending_paid`
- Mengubah status dari `pending_paid` ke `active`

---

### Step 9: Update Dokumentasi & File Migrasi

**Files yang diupdate:**

- `public/exports/full-schema-v2.sql` → tambah tabel `release_payments`, update status enum
- `public/exports/SSO-INTEGRATION-DOCS.md` → update dengan info terbaru
- `public/exports/MIGRATION-GUIDE.md` → tambah section payment gateway + SMTP
- `public/exports/MIGRATION-CHECKLIST.md` → tambah checklist Xendit & SMTP
- `public/exports/VPS-SETUP-GUIDE.md` → tambah konfigurasi Xendit webhook URL + SMTP
- **Baru:** `public/exports/PAYMENT-GATEWAY-DOCS.md` → dokumentasi lengkap alur pembayaran

---

### Secrets yang Diperlukan

| Secret                   | Keterangan                                       |
| ------------------------ | ------------------------------------------------ |
| `XENDIT_SECRET_KEY`    | API key Xendit (dari dashboard Xendit)           |
| `XENDIT_WEBHOOK_TOKEN` | Verification token untuk webhook callback        |
| `SMTP_HOST`            | Host mail server                                 |
| `SMTP_PORT`            | Port SMTP                                        |
| `SMTP_USER`            | Email user untuk kirim notifikasi                |
| `SMTP_PASS`            | Password email                                   |
| `NOTIFICATION_EMAIL`   | Email tujuan notifikasi (publisher@soundpub.xyz) |

---

### Harga Release

Pertanyaan: **Berapa harga per release?** Apakah ada perbedaan harga berdasarkan:

- Tipe release (Single vs Album vs EP)?
- Jumlah track?
- Atau harga flat untuk semua?

---

### File yang Akan Dibuat/Diubah

| File                                                      | Aksi                                       |
| --------------------------------------------------------- | ------------------------------------------ |
| `supabase/functions/create-xendit-invoice/index.ts`     | Baru                                       |
| `supabase/functions/xendit-webhook/index.ts`            | Baru                                       |
| `supabase/functions/send-release-notification/index.ts` | Baru                                       |
| `src/pages/PaymentCallback.tsx`                         | Baru                                       |
| `public/exports/PAYMENT-GATEWAY-DOCS.md`                | Baru                                       |
| `src/components/releases/ReleaseFormDialog.tsx`         | Edit                                       |
| `src/components/releases/ArtistReleaseFormDialog.tsx`   | Edit                                       |
| `src/pages/Releases.tsx`                                | Edit                                       |
| `src/App.tsx`                                           | Edit — tambah route `/payment/callback` |
| `supabase/config.toml`                                  | Edit — tambah config edge functions baru  |
| `public/exports/full-schema-v2.sql`                     | Edit                                       |
| `public/exports/MIGRATION-GUIDE.md`                     | Edit                                       |
| `public/exports/MIGRATION-CHECKLIST.md`                 | Edit                                       |
| `public/exports/VPS-SETUP-GUIDE.md`                     | Edit                                       |
| `public/exports/SSO-INTEGRATION-DOCS.md`                | Edit                                       |
| Database migration                                        | Tabel `release_payments` + RLS           |
