

## Penyebab Error: Konfigurasi `.env` Salah

Edge function `sso-login` membaca 3 secret berikut:

| Secret | Fungsi | Nilai yang BENAR |
|---|---|---|
| `SSO_REALM_URL` | URL **lengkap realm** Keycloak (issuer JWT) | `https://sso.iccn.or.id/realms/playground` |
| `SSO_CLIENT_ID` | Client ID di Keycloak | `soundpub` |
| `ICCN_MEDIA_LABEL_ID` | UUID label "ICCN Media" di tabel `profiles` | UUID (misal `a1b2c3d4-...`) |

### Yang salah di `.env` Anda saat ini

```
SSO_REALM_URL="https://sso.iccn.or.id"          ❌ Kurang /realms/playground
ICCN_MEDIA_LABEL_ID="soundpub"                  ❌ Ini Client ID, bukan Label UUID
SSO_CLIENT_ID="playground"                      ❌ Ini nama realm, bukan Client ID
```

Akibatnya:
1. **`verifyJwt` gagal** — karena `payload.iss` dari token ICCN adalah `https://sso.iccn.or.id/realms/playground`, tapi function membandingkan dengan `https://sso.iccn.or.id` → error "Invalid issuer".
2. **JWKS fetch ke URL salah** → `https://sso.iccn.or.id/protocol/openid-connect/certs` (404) seharusnya `.../realms/playground/protocol/openid-connect/certs`.
3. **Cek `resource_access[clientId]`** mencari role di key `playground`, padahal seharusnya di `soundpub` → user dianggap tidak punya akses.
4. **`ICCN_MEDIA_LABEL_ID` bukan UUID** → function fallback ke lookup `email = halo.iccn@gmail.com`. Jika profile itu tidak ada → error.

### Perbaikan

**Update 3 secret Lovable Cloud** (bukan `.env` frontend — ini secrets backend untuk edge function):

```
SSO_REALM_URL = https://sso.iccn.or.id/realms/playground
SSO_CLIENT_ID = soundpub
ICCN_MEDIA_LABEL_ID = <UUID profile ICCN Media dari tabel profiles>
```

Untuk mendapatkan `ICCN_MEDIA_LABEL_ID`, kita query `profiles` dengan `email = halo.iccn@gmail.com` dan ambil `id`-nya.

### Catatan: `.env` vs Secrets

- File `.env` Anda kemungkinan dimaksud sebagai **secrets edge function** — tapi edge function di Lovable Cloud TIDAK membaca `.env` lokal. Mereka membaca **Cloud Secrets** yang harus diset lewat tool `add_secret`.
- Frontend `src/lib/keycloak.ts` memakai env Vite (`VITE_SSO_BASE_URL`, `VITE_SSO_REALM`, `VITE_SSO_CLIENT_ID`) — saat ini hardcoded fallback ke `https://sso.iccn.or.id` / `playground` / `soundpub` yang sudah benar, jadi frontend OK.

### Langkah Implementasi (saat plan disetujui)

1. Query database untuk dapatkan UUID profile `halo.iccn@gmail.com`
2. Set/update 3 Cloud Secrets dengan nilai yang benar via `add_secret`
3. Cek log edge function `sso-login` untuk verifikasi tidak ada error issuer/JWKS lagi
4. Minta Anda test ulang tombol "Login via SSO"

### Tidak Ada Perubahan Kode

Logika edge function sudah benar — hanya nilai secrets yang perlu dikoreksi. Tidak ada file yang perlu diedit.

