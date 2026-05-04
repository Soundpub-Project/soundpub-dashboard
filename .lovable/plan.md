## Fix SSO Logout Error

**Masalah**: `kc.logout()` dari `keycloak-js` crash karena instance belum pernah di-`init()` (kita pakai PKCE manual via redirect, bukan adapter Keycloak).

### Perubahan

**`src/lib/keycloak.ts`** — tulis ulang `keycloakLogout()`:
- Bangun URL logout manual: `{SSO_BASE_URL}/realms/{SSO_REALM}/protocol/openid-connect/logout`
- Tambahkan `client_id` dan `post_logout_redirect_uri=${origin}/auth`
- Sertakan `id_token_hint` hanya jika ada (opsional)
- Bersihkan state lokal: `resetKeycloak()`, `clearSsoActive()`, hapus `SSO_PKCE_KEY` dan `SSO_PROMPT_NONE_TRIED_KEY` dari sessionStorage
- Redirect top-level dengan `window.location.href`

Tidak ada perubahan di backend, database, atau komponen lain.