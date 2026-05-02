Saya sudah cek alurnya. Masalah utamanya bukan di ICCN login-nya — ICCN sudah berhasil mengembalikan `code`. Buktinya URL berubah menjadi:

```text
/auth#state=...&session_state=...&iss=...&code=...
```

Tapi kode aplikasi saat ini hanya mendeteksi callback SSO dari query string (`?code=...&state=...`), sedangkan ICCN/Keycloak mengembalikannya lewat URL fragment/hash (`#code=...&state=...`). Akibatnya aplikasi menganggap itu bukan callback, lalu menjalankan silent check lagi, dan token tidak pernah dikirim ke backend `sso-login`. Ini juga terkonfirmasi dari network/log: tidak ada request ke `sso-login`.

## Plan Perbaikan

### 1. Perbaiki deteksi callback SSO
Update helper di `src/lib/keycloak.ts` supaya `isSsoCallback()` membaca dua format:

```text
/auth?code=...&state=...
/auth#code=...&state=...
```

Ini langsung memperbaiki kasus URL yang kamu tunjukkan.

### 2. Paksa Keycloak JS memakai mode callback yang sama
Tambahkan konfigurasi eksplisit di init Keycloak:

```ts
responseMode: 'fragment'
flow: 'standard'
pkceMethod: 'S256'
```

Dipasang di:
- `initKeycloak()` untuk memproses callback login manual
- `initKeycloakSilent()` untuk silent check
- `initKeycloakAndLogin()` untuk redirect login manual

Tujuannya supaya login dimulai dan callback diproses dengan format yang konsisten.

### 3. Proses callback sebelum silent check
Di `src/context/SsoAuthContext.tsx`, pastikan urutannya:

```text
Jika URL punya code/state di query atau hash
  -> proses callback Keycloak
  -> ambil access token ICCN
  -> kirim ke backend sso-login
  -> set session SoundPub
  -> bersihkan URL
  -> masuk dashboard
Jika tidak ada callback
  -> baru jalankan silent check / auto redirect
```

Jadi ketika balik dari ICCN, aplikasi tidak akan lagi jatuh ke log:

```text
SSO: Silent check — no active ICCN session
```

melainkan akan lanjut ke exchange token.

### 4. Redirect ke dashboard setelah session SoundPub berhasil dibuat
Setelah `supabase.auth.setSession()` sukses, arahkan user ke `/dashboard`. Ini membuat flow manual “Login via SSO” selesai otomatis tanpa user perlu refresh.

### 5. Tambah logging aman untuk debugging
Tambahkan log yang tidak membocorkan token/code penuh, misalnya:

```text
SSO: Callback detected in hash
SSO: Processing callback with Keycloak
SSO: Token exchange success
```

Dengan begitu kalau masih gagal, kita bisa tahu titik gagalnya: callback parsing, Keycloak token, atau backend exchange.

### 6. Auto-login tanpa klik di platform utama
Untuk auto-login penuh dari platform utama, silent check lintas domain masih bisa diblokir browser karena third-party cookie. Solusi yang paling stabil tetap full-page redirect otomatis ke ICCN, lalu ICCN langsung balik kalau user sudah login.

Setelah callback hash diperbaiki, opsi ini akan berjalan jika `VITE_SSO_AUTO_REDIRECT=true` di Build Secrets. Jadi flow-nya:

```text
User buka SoundPub
Tidak ada session SoundPub
Redirect top-level ke ICCN
ICCN lihat user sudah login
ICCN callback ke /auth#code=...
SoundPub proses callback
Masuk dashboard
```

## File yang akan diubah

- `src/lib/keycloak.ts`
  - deteksi callback dari `window.location.hash`
  - tambah opsi `responseMode: 'fragment'` dan `flow: 'standard'`
  - optional redirect URI agar flow iframe nanti juga bisa dipakai tanpa merusak platform utama

- `src/context/SsoAuthContext.tsx`
  - proses hash callback lebih dulu
  - exchange token dan redirect dashboard setelah sukses
  - logging yang lebih jelas

- `.env.example`
  - tambahkan catatan bahwa ICCN callback menggunakan fragment/hash
  - tegaskan `VITE_SSO_AUTO_REDIRECT=true` diperlukan untuk auto-login tanpa klik dari platform utama

- `public/exports/SSO-INTEGRATION-DOCS.md`
  - update dokumentasi debugging sesuai behavior ICCN yang mengembalikan `code` via hash

## Catatan penting

Backend `sso-login` belum perlu diubah dulu, karena masalah saat ini terjadi sebelum request backend dipanggil. Setelah perbaikan ini, jika ada error baru dari backend seperti `Invalid azp`, `No access role`, atau `SSO not configured`, baru kita lanjut debug di sisi konfigurasi client/secret ICCN.