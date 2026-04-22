

## Analisis Dokumentasi SSO Baru ICCN vs Implementasi Saat Ini

Saya sudah mempelajari dokumentasi PDF terbaru. Ada beberapa perubahan penting & klarifikasi yang berbeda dengan implementasi kita sekarang.

### Perbedaan Utama

| Aspek | Dokumentasi Baru | Implementasi Kita Sekarang | Status |
|---|---|---|---|
| **Realm Staging** | `playground` | `playground` | ✅ Match |
| **Realm Production** | `PORTALICCN` | belum ada | ⚠️ Perlu dukungan |
| **Token endpoint** | `/realms/{realm}/protocol/openid-connect/token` (manual fetch) | Pakai `keycloak-js` library | ✅ OK (library handle) |
| **JWT field `sub`** | Dipakai sebagai `ssoId` di DB | Tidak disimpan | ⚠️ Sebaiknya disimpan |
| **JWT field `azp`** | Harus dicek = `SSO_CLIENT_ID` | TIDAK dicek | ❌ Missing validation |
| **JWT custom fields** | `fullname`, `phone`, `city`, `province`, `type`, `avatar` | Hanya `name`, `email`, `avatar` | ⚠️ Data SSO terbuang |
| **Iframe Integration** | Halaman `/iccn/iframe` untuk embed di Super App | Tidak ada | ❌ Missing |
| **Profile Update API** | `PUT https://next.iccn.or.id/api/external/sso/profile` | Tidak dipakai (kita simpan lokal) | ℹ️ Opsional |
| **Logout** | Pakai `id_token_hint` agar skip halaman konfirmasi | Sudah pakai `idToken` | ✅ Match |
| **Refresh Token** | Pakai endpoint `/token` dengan `grant_type=refresh_token` | `keycloak-js.updateToken()` | ✅ OK |

### Yang Perlu Diperbaiki / Ditambahkan

#### 1. **Validasi `azp` (audience party)** — KEAMANAN
Dokumentasi menegaskan `azp` di JWT harus cocok dengan `SSO_CLIENT_ID`. Saat ini kita hanya cek `iss` dan `resource_access[clientId].roles` ada. Tambah validasi `payload.azp === clientId` di `verifyJwt` edge function.

#### 2. **Simpan field tambahan dari JWT ke `profiles`**
Dokumentasi jelas menyebutkan custom attribute Keycloak yang bisa dimanfaatkan:
- `phone` → `profiles.phone` (kalau kosong)
- `city` → `profiles.city`
- `province` → `profiles.province`
- `type` (korda/pengurus) → simpan untuk metadata
- `fullname` (lebih akurat dari `name`) → prefer ini untuk `full_name`
- `sub` → simpan sebagai `sso_user_id` untuk tracking ID SSO yang stabil (kalau email berubah)

Perlu **migrasi DB**: tambah kolom `phone`, `city`, `province`, `sso_user_id`, `sso_user_type` di `profiles` (semua nullable). Kolom `phone` mungkin sudah ada — kita cek dulu.

#### 3. **Dukungan multi-realm (Staging + Production)**
Saat ini hardcoded `playground`. Buat fleksibel via secret `SSO_REALM_URL` (sudah ada) dan `VITE_SSO_REALM` di frontend. Tidak perlu code change tambahan — cukup dokumentasikan cara switch ke production realm `PORTALICCN`.

#### 4. **Halaman `/iccn/iframe`** — Integrasi Super App ICCN
Dokumentasi menambahkan flow baru: SoundPub bisa di-embed sebagai iframe di ICCN Super App. Halaman ini:
- Cek session lokal dulu, kalau ada → render langsung (jangan trigger SSO)
- Kalau belum ada → jalankan flow SSO (sudah pasti user login di ICCN)
- Setelah dapat session → redirect ke `/dashboard` di dalam iframe

Tambah route `/iccn/iframe` di `App.tsx` + komponen `IccnIframeAuth.tsx` yang reuse logic `SsoAuthContext`.

#### 5. **Sync `fullname` dan avatar saat token refresh**
Saat ini `syncProfile` hanya jalan saat user pertama login. Setiap refresh token, sebaiknya update field SSO yang berubah (avatar, phone, dll) tapi JANGAN overwrite kalau user sudah edit manual.

### Yang TIDAK Akan Diubah

- Flow PKCE (sudah benar via `keycloak-js`)
- Silent SSO check (sudah dikerjakan kemarin)
- Logout dengan `id_token_hint` (sudah benar)
- Mekanisme exchange token Supabase via magiclink (sudah jalan)
- `PUT /api/external/sso/profile` endpoint — ini untuk update profil ke ICCN, **tidak dipakai** karena SoundPub menyimpan profil sendiri

---

### Rencana Implementasi

**Step 1 — Database Migration**
- Tambah kolom di `profiles` (semua nullable):
  - `phone TEXT` (kalau belum ada)
  - `city TEXT`
  - `province TEXT`
  - `sso_user_id TEXT` (= `sub` JWT, untuk tracking stabil)
  - `sso_user_type TEXT` (= `type` JWT: korda/pengurus/null)
- Index ringan di `sso_user_id`

**Step 2 — Edge Function `sso-login`**
- Tambah validasi `payload.azp === clientId` (return 401 kalau mismatch)
- Extract & sync field baru: `phone`, `city`, `province`, `sso_user_id`, `sso_user_type`, `fullname`
- Logic: kolom hanya diisi kalau masih NULL (jangan overwrite manual edit)
- Update `full_name` prefer `fullname` JWT > `name` > `preferred_username`

**Step 3 — Halaman `/iccn/iframe`**
- File baru: `src/pages/IccnIframeAuth.tsx`
- Route baru di `App.tsx`: `<Route path="/iccn/iframe" element={<IccnIframeAuth />} />`
- Logic:
  1. Cek `supabase.auth.getSession()` → kalau ada session valid, langsung redirect `/dashboard`
  2. Kalau tidak ada → trigger `initKeycloakSilent()` → exchange token
  3. Tampilkan loader "Memuat SoundPub..." selama proses
- Pastikan route ini bisa di-iframe (atur header `X-Frame-Options` di `index.html` meta atau biarkan default agar bisa embed dari `iccn.or.id`)

**Step 4 — Dokumentasi Internal**
Update `public/exports/SSO-INTEGRATION-DOCS.md` agar match dengan dokumentasi ICCN terbaru:
- Tambah tabel realm staging vs production
- Daftar field JWT yang disinkronkan (versi lengkap)
- Catatan validasi `azp`
- Petunjuk integrasi iframe

### File yang Akan Diedit/Dibuat

| File | Aksi |
|------|------|
| Migration baru | Tambah kolom `phone`, `city`, `province`, `sso_user_id`, `sso_user_type` di `profiles` |
| `supabase/functions/sso-login/index.ts` | Edit — validasi `azp`, sync field tambahan |
| `src/pages/IccnIframeAuth.tsx` | Baru — halaman embed iframe |
| `src/App.tsx` | Edit — tambah route `/iccn/iframe` |
| `public/exports/SSO-INTEGRATION-DOCS.md` | Edit — update sesuai docs baru |

### Catatan Penting

- **Production realm `PORTALICCN`**: Saat siap deploy production, cukup update 2 secret di Cloud (`SSO_REALM_URL` → `https://sso.iccn.or.id/realms/PORTALICCN`) + env Vite (`VITE_SSO_REALM=PORTALICCN`). Tidak perlu code change.
- **Iframe security**: Browser modern menerapkan SameSite cookie. Pastikan Supabase auth cookie set dengan `SameSite=None; Secure` agar bisa jalan di iframe lintas-domain. Supabase client sudah handle ini secara default di production (HTTPS).
- **Tidak ada breaking change** untuk user existing — semua kolom baru nullable, validasi `azp` hanya menolak token yang memang invalid.

