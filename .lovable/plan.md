

## Plan: Penyempurnaan SSO + Login Method Visibility + Dokumentasi

### Ringkasan

Menjawab 2 pertanyaan tambahan, lalu menyusun plan implementasi yang mencakup: (1) sinkronisasi avatar dari SSO ICCN, (2) kolom "Login Method" di halaman Users untuk admin/superadmin, dan (3) dokumentasi teknis.

---

### Jawaban Pertanyaan 1: Apakah perlu implementasi berbeda untuk data SSO dari ICCN?

**Tidak perlu implementasi yang sangat berbeda**, tetapi ada satu hal yang bisa ditambahkan: **sinkronisasi avatar dari JWT ICCN**.

Data yang dikirim ICCN via JWT:
- `email` → sudah disinkronkan
- `fullname` / `name` → sudah disinkronkan
- `avatar` → **belum disinkronkan** — ini bisa langsung disimpan ke `profiles.avatar_url`

Yang perlu ditambahkan di edge function `sso-login`:
- Extract field `avatar` dari JWT payload
- Simpan ke `profiles.avatar_url` saat user pertama kali login (jika belum punya avatar)
- Untuk login berikutnya, **tidak overwrite** avatar jika user sudah upload sendiri di SoundPub

---

### Jawaban Pertanyaan 2: Bisa admin melihat metode login user?

**Ya, bisa.** Kolom `sso_provider` di tabel `profiles` sudah menyimpan info ini:
- `null` → login biasa (email/password)
- `'iccn'` → login via SSO ICCN
- `'google'` → login via Google (nanti)

Yang perlu ditambahkan:
- Kolom **"Login Method"** di tabel Users (`src/pages/Users.tsx`)
- Badge visual: `Email`, `SSO ICCN`, `Google`
- Filter tambahan berdasarkan login method

---

### Step 1: Sinkronisasi Avatar dari SSO ICCN

**File**: `supabase/functions/sso-login/index.ts`

- Extract `payload.avatar` dari JWT (URL S3 dari Keycloak)
- Untuk user baru: simpan langsung ke `profiles.avatar_url`
- Untuk user existing: simpan hanya jika `avatar_url` masih `null`

---

### Step 2: Tambah Kolom "Login Method" di Halaman Users

**File**: `src/pages/Users.tsx`

- Tambah `sso_provider` ke `UserProfile` interface
- Tambah kolom tabel "Metode Login" dengan badge:
  - `null` → Badge "Email" (default, warna netral)
  - `'iccn'` → Badge "SSO ICCN" (warna biru/branded)
  - `'google'` → Badge "Google" (warna merah/branded)
- Tambah filter dropdown "Metode Login" di section filter (Email / SSO ICCN / Google / Semua)

---

### Step 3: Hardening Edge Function (dari plan sebelumnya yang sudah diapprove)

**File**: `supabase/functions/sso-login/index.ts`

- Tambahkan validasi hasil update profile — jika `sso_provider` atau `parent_label_id` gagal tersimpan, return error
- Untuk user baru: tambahkan delay/retry setelah `createUser` agar trigger `handle_new_user` selesai dulu sebelum update profile
- Repair data: update akun `bimokharis2708@gmail.com` agar `sso_provider='iccn'` dan `parent_label_id` terisi

---

### Step 4: Onboarding Dialog Fix

**File**: `src/pages/Dashboard.tsx`

- Pastikan `useEffect` untuk auto-open onboarding dialog berjalan setelah profile ter-refresh
- Tambahkan fallback: jika `profile` berubah dan `isSsoUser && !isArtistProfileCompleted`, buka dialog

---

### Step 5: Dokumentasi Teknis

**File**: `public/exports/SSO-INTEGRATION-DOCS.md`

Dokumentasi mencakup:
- Arsitektur SSO ICCN (Keycloak → Edge Function → Supabase Auth)
- Data yang disinkronkan (email, nama, avatar, parent label)
- Kolom `sso_provider` dan nilai-nilainya
- Flow onboarding artis untuk user SSO
- Cara menambahkan provider login baru (Google, dll)
- Cara admin mengidentifikasi metode login user

---

### File yang akan diubah/dibuat

| File | Aksi |
|---|---|
| `supabase/functions/sso-login/index.ts` | Edit — tambah sinkronisasi avatar, hardening validasi |
| `src/pages/Users.tsx` | Edit — tambah kolom & filter "Metode Login" |
| `src/pages/Dashboard.tsx` | Edit — fix onboarding auto-open |
| `public/exports/SSO-INTEGRATION-DOCS.md` | Baru — dokumentasi lengkap integrasi SSO |
| Data repair via insert tool | Update `bimokharis2708@gmail.com` profile |

