## Jawaban: Yang Diganti Saat Pindah SSO ke Production

Cukup **2 nilai** yang diganti — dari realm `playground` (staging) → `PORTALICCN` (prod). Tidak ada perubahan code.

---

### 1. Backend — Cloud Secrets (Lovable → Cloud → Secrets)

| Secret | Staging (sekarang) | Production |
|---|---|---|
| `SSO_REALM_URL` | `https://sso.iccn.or.id/realms/playground` | `https://sso.iccn.or.id/realms/PORTALICCN` |
| `SSO_CLIENT_ID` | `soundpub` | `soundpub` *(tetap, kecuali ICCN kasih client baru)* |
| `ICCN_MEDIA_LABEL_ID` | UUID label ICCN Media | *(tetap, UUID sama)* |

> Kalau pakai fallback `SSO_BASE_URL` + `SSO_REALM`: ganti `SSO_REALM` dari `playground` → `PORTALICCN`.

### 2. Frontend — Build Secrets (Workspace Settings → Build Secrets)

| Variable | Staging | Production |
|---|---|---|
| `VITE_SSO_BASE_URL` | `https://sso.iccn.or.id` | `https://sso.iccn.or.id` *(tetap)* |
| `VITE_SSO_REALM` | `playground` | `PORTALICCN` |
| `VITE_SSO_CLIENT_ID` | `soundpub` | `soundpub` *(tetap)* |

> Setelah ganti build secret, **wajib re-publish** project supaya Vite re-build dengan env baru.

### 3. Di sisi Keycloak ICCN (minta admin ICCN)

Pastikan di realm `PORTALICCN`, client `soundpub` punya konfigurasi:
- **Valid Redirect URIs**: `https://dashboard.soundpub.xyz/auth`, `https://dashboard.soundpub.xyz/iccn/iframe`
- **Web Origins**: `https://dashboard.soundpub.xyz` (+ origin Super App ICCN kalau pakai iframe)
- **Post Logout Redirect URIs**: `https://dashboard.soundpub.xyz/auth`
- Client tetap **public** (PKCE) — jangan diubah ke confidential, karena kalau confidential perlu tambah `SSO_CLIENT_SECRET`.

---

### Checklist singkat saat cutover

1. Minta admin ICCN siapkan client `soundpub` di realm `PORTALICCN` (lihat poin 3).
2. Update 1 backend secret: `SSO_REALM_URL` → `.../realms/PORTALICCN`.
3. Update 1 build secret: `VITE_SSO_REALM` → `PORTALICCN`.
4. Re-publish project (Lovable → Publish).
5. Smoke test: login SSO dari `/auth`, cek profile tersinkron, cek logout.

### Yang TIDAK perlu diganti

- Code apa pun (`keycloak.ts`, edge function `sso-login`, dst.)
- `ICCN_MEDIA_LABEL_ID` (UUID label di DB SoundPub, bukan dari Keycloak)
- `VITE_SUPABASE_*` (Lovable Cloud sama)
- DB migration / RLS

Mau aku update `docs/MIGRATION-CHECKLIST.md` jadi format checklist cutover staging→prod yang ringkas seperti di atas?
