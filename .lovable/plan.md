## Tujuan

Saat user buka **dashboard.soundpub.xyz** (platform utama, bukan iframe), dan user **sudah login di SSO ICCN** di tab/browser yang sama, SoundPub harus otomatis login tanpa user perlu klik tombol "Login via SSO". Tombol manual SSO tetap berfungsi sebagai fallback.

## Analisis Kondisi Saat Ini

`SsoAuthProvider` sebenarnya **sudah** menjalankan `initKeycloakSilent()` saat mount di setiap halaman. Tapi log menunjukkan:

```
SSO: Silent check — no active ICCN session
```

Padahal user sudah login di ICCN. Penyebab paling mungkin (sesuai jawaban user: domain sudah di-whitelist):

1. **`silent-check-sso.html` salah pakai `location.origin`** sebagai target `postMessage`. Halaman ini di-load di iframe oleh Keycloak dari domain SoundPub, lalu Keycloak (di domain `sso.iccn.or.id`) yang mendengarkan `message`. `location.origin` di iframe = origin SoundPub, sehingga Keycloak-JS di parent menolak pesannya. Harus pakai `'*'` (standar contoh resmi Keycloak).
2. **`checkLoginIframe: false`** mematikan mekanisme deteksi sesi via iframe — tapi `silent-check-sso` masih jalan via redirect iframe terpisah, jadi ini OK.
3. **3rd-party cookie**: Browser modern (Chrome, Safari, Firefox) blokir cookie pihak ketiga secara default. Saat iframe dari `dashboard.soundpub.xyz` membuka `sso.iccn.or.id`, cookie session Keycloak **tidak dikirim** → silent check selalu return "no session". Ini batasan fundamental browser.

## Solusi

### 1. Fix `silent-check-sso.html` (quick win)

Ubah target `postMessage` ke `'*'` sesuai contoh resmi Keycloak, supaya pesan diterima dengan benar.

```html
<script>parent.postMessage(location.href, '*');</script>
```

### 2. Tambah fallback: deteksi via session storage flag

Karena 3rd-party cookie sering diblokir, kita tambahkan deteksi sekunder:
- Saat user **berhasil** login via SSO (manual atau silent), simpan flag `iccn_sso_active=true` di `localStorage` SoundPub dengan TTL (misal 8 jam).
- Saat mount, jika flag masih valid **dan** belum ada session Supabase → jalankan silent check.
- Saat Keycloak return "not authenticated" → hapus flag.

Ini bukan bypass keamanan (token tetap divalidasi server-side), hanya hint UX agar silent check dijalankan lebih agresif setelah pernah login.

### 3. Tambah opsi auto-redirect untuk first-time visitors (opt-in via env)

Tambahkan flag `VITE_SSO_AUTO_REDIRECT=true` (default `false`). Jika `true` **dan** silent check gagal **dan** belum ada session Supabase **dan** user di route `/` atau `/auth` → otomatis redirect ke Keycloak login (bukan silent, full redirect). Setelah login Keycloak akan kembalikan dengan `code+state` dan auto-exchange jalan.

User bisa enable ini hanya di production agar UX seamless. Default off supaya tidak ganggu development.

### 4. Improve logging

Tambahkan log eksplisit:
- Origin yang dikirim untuk silent check
- Apakah cookie 3rd-party kemungkinan diblokir (deteksi via failure pattern)
- Status flag localStorage

## Yang Akan Diubah

1. **`public/silent-check-sso.html`** — ganti target `postMessage` ke `'*'`.
2. **`src/lib/keycloak.ts`** — tambah helper `markSsoActive()` / `clearSsoActive()` / `wasSsoActive()` pakai localStorage (key: `soundpub_iccn_sso_active`, TTL 8 jam).
3. **`src/context/SsoAuthContext.tsx`**:
   - Panggil `markSsoActive()` setelah exchange token sukses.
   - Panggil `clearSsoActive()` saat logout atau silent check gagal.
   - Jika `VITE_SSO_AUTO_REDIRECT=true` dan silent check gagal di route public → trigger full redirect login.
4. **`src/pages/Auth.tsx`** — tampilkan indikator kecil "Mendeteksi sesi ICCN..." saat `ssoChecking=true` agar user tahu sistem sedang cek (sudah ada `ssoChecking`, hanya dipakai).
5. **`.env.example`** — dokumentasikan `VITE_SSO_AUTO_REDIRECT`.
6. **`public/exports/SSO-INTEGRATION-DOCS.md`** — update dokumentasi auto-login + catatan 3rd-party cookie.

## Catatan Penting untuk User

**3rd-party cookie adalah penghalang utama** auto-login lintas domain. Solusi paling andal jangka panjang:
- **Opsi A (recommended)**: Pakai subdomain bersama, mis. `sso.iccn.or.id` dan `dashboard.iccn.or.id` (atau letakkan SoundPub di subdomain `iccn.or.id`). Cookie jadi same-site → silent check 100% jalan.
- **Opsi B**: Aktifkan `VITE_SSO_AUTO_REDIRECT=true` — UX trade-off: user yang **belum** login di ICCN akan tetap di-redirect ke halaman login ICCN otomatis. Cocok kalau SoundPub memang khusus user ICCN.
- **Opsi C**: Status quo + tombol manual "Login via SSO" yang sudah ada. Paling aman, butuh 1 klik.

Saya akan implement fix #1 + #2 + #3 (opt-in) sehingga ketiga opsi tersedia, user tinggal pilih via env.

## Tidak Termasuk Plan Ini

- Setup iframe ICCN Super App (sudah dibahas, akan dikerjakan setelah platform utama solid).
- Perubahan di sisi Keycloak / admin ICCN.
- Migrasi domain.
