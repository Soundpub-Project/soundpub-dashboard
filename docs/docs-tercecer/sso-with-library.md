# Alur Autentikasi SSO — ICCN

> OAuth2 PKCE + Keycloak. Semua operasi SSO (login, refresh, check-sso) menggunakan `keycloak-js` secara penuh. Logout dilakukan manual karena butuh `id_token_hint` custom untuk skip halaman konfirmasi Keycloak.

---

## Starter Kit

### Realms
| Environment | Realm |
|---|---|
| Staging | `playground` |
| Production | `PORTALICCN` |

### .env
```env
SSO_BASE_URL=https://sso.iccn.or.id
SSO_REALM=playground
SSO_CLIENT_ID=soundpub
```

### Token Lifetime
| Token | Durasi | Keterangan |
|---|---|---|
| `access_token` | 5 menit | JWT RS256, dikirim sebagai Bearer header ke semua API |
| `refresh_token` | 4 jam | Dipakai untuk memperbarui `access_token` yang expired |
| Max idle | 10 jam | Jika tidak ada aktivitas refresh dalam 10 jam, session Keycloak mati |

### Struktur JWT — Decoded Token


```json
{
  "exp": 1772784623,
  "iat": 1772784563,
  "auth_time": 1772784352,
  "iss": "https://sso.iccn.or.id/realms/playground",
  "sub": "b3eca37d-72bd-4c51-aa5b-5d0ff81beeb4",
  "typ": "Bearer",
  "azp": "landing-iccn",
  "sid": "AN8WqgqbwGdjR_wBt7Epvc2o",
  "allowed-origins": [
    "https://next.iccn.or.id",
    "https://cms-sso.iccn.or.id",
    "http://localhost:3000"
  ],
  "realm_access": {
    "roles": ["default-roles-playground", "offline_access", "uma_authorization"]
  },
  "resource_access": {
    "landing-iccn": {
      "roles": ["VIEWER", "MEMBER"]
    }
  },
  "scope": "openid profile email",
  "email_verified": true,
  "province": "Jawa Timur",
  "city": "Kabupaten Tulungagung",
  "phone": "08313737313123",
  "name": "gede hari yoga nanda",
  "fullname": "gede hari yoga nanda",
  "preferred_username": "gedehari.working@gmail.com",
  "avatar": "https://iccn-bucket.s3.ap-southeast-1.amazonaws.com/staging/avatars/...",
  "type": "korda",
  "given_name": "gede hari",
  "family_name": "yoga nanda",
  "email": "gedehari@gmail.com"
}
```

Field penting yang dipakai sistem:

| Field | Keterangan |
|---|---|
| `sub` | User ID di Keycloak — dipakai sebagai `ssoId` di DB |
| `azp` | Client yang menerbitkan token — harus cocok dengan `SSO_CLIENT_ID` |
| `iss` | Issuer — harus cocok dengan `{SSO_BASE_URL}/realms/{realm}` |
| `exp` / `iat` | Expiry / issued at — dicek otomatis oleh `jwt.verify()` |
| `resource_access[clientId].roles` | Roles user di client ini — `VIEWER`, `MEMBER`, dll |
| `realm_access.roles` | Roles di realm level — tidak dipakai untuk otorisasi aplikasi |
| `type` | Tipe keanggotaan — `korda`, `pengurus`, atau kosong |
| `email` | Email user |
| `fullname` | Nama lengkap (custom attribute Keycloak) |
| `phone` | Nomor HP (custom attribute) |
| `city` | Kota (custom attribute) |
| `province` | Provinsi (custom attribute) |
| `avatar` | URL avatar S3 (custom attribute) |

---

## 1. Login

Redirect browser ke halaman login Keycloak via `keycloak-js`.

```ts
// src/lib/keycloak.ts
export async function buildAuthUrl(redirectUri: string): Promise<string> {
  const kc = getKeycloak();
  return kc.createLoginUrl({ redirectUri });
  // keycloak-js generate URL lengkap dengan state, nonce, code_challenge (PKCE S256)
}

// Penggunaan
window.location.href = await buildAuthUrl(`${window.location.origin}/dashboard`);
```

### Inisialisasi — `kc.init()` dengan `check-sso`

Dipanggil sekali saat app mount. Mendeteksi session aktif dari client lain via iframe tanpa redirect.

```ts
// src/context/sso-auth-context.tsx
const authenticated = await kc.init({
  pkceMethod: "S256",
  checkLoginIframe: false,
  responseMode: "fragment",
  onLoad: "check-sso",
  silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
});
```

**Cara kerja `check-sso`:**
1. keycloak-js buka iframe tersembunyi ke Keycloak, redirect ke `silent-check-sso.html`
2. Keycloak cek SSO cookie di browser
3. Jika ada session aktif → `authenticated = true`, `kc.token` + `kc.refreshToken` terisi
4. Jika tidak ada → `authenticated = false` → fallback ke `refresh_token` di localStorage

**`public/silent-check-sso.html`** — wajib ada:
```html
<!DOCTYPE html>
<html><body>
  <script>parent.postMessage(location.href, location.origin);</script>
</body></html>
```

### Callback setelah login
1. `kc.init()` deteksi `code` di URL fragment → exchange code → `kc.token` + `kc.refreshToken` terisi
2. `hasClientAccess(kc.token)` — decode JWT, cek `resource_access[clientId].roles` tidak kosong dan client_id ada -> jika tidak ditemukan throw Tidak Ada Akses!

```ts
/**
 * Decode JWT payload and check resource_access roles for this client.
 */
export function hasClientAccess(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1]));
    const clientRoles =
      payload.resource_access?.[keycloakConfig.clientId]?.roles;
    return Array.isArray(clientRoles) && clientRoles.length > 0;
  } catch {
    return false;
  }
}

```

3. Simpan ke localStorage, kirim `access_token` ke backend untuk verifikasi signature token

### Proses backend — verifikasi & upsert user

```ts
function getJwksClient(): jwksClient.JwksClient {
  if (!jwksClientInstance) {
    const jwksUri = `${SSO_BASE_URL}/realms/${SSO_REALM}/protocol/openid-connect/certs`;
    jwksClientInstance = jwksClient({
      jwksUri,
      cache: true,
      cacheMaxAge: 86400000, // 24 hours
      rateLimit: true,
    });
  }
  return jwksClientInstance;
}

async function getSigningKey(kid: string): Promise<string> {
  const client = getJwksClient();
  return new Promise((resolve, reject) => {
    client.getSigningKey(kid, (err, key) => {
      if (err) reject(err);
      else resolve(key!.getPublicKey());
    });
  });
}

/** Verify token via JWKS (RS256 signature + issuer check) */
private static async verifyTokenViaJwks(
    token: string,
  ): Promise<SsoTokenPayload> {
    const decoded = jwt.decode(token, { complete: true });

    if (!decoded || !decoded.header.kid) {
      throw new Error("Invalid token structure — no kid in header");
    }

    const signingKey = await getSigningKey(decoded.header.kid);

    const verified = jwt.verify(token, signingKey, {
      algorithms: ["RS256"],
      issuer: `${SSO_BASE_URL}/realms/${SSO_REALM}`,
      clockTolerance: 30, // 30 second tolerance for clock skew
    }) as SsoTokenPayload;

    return verified;
}

// Validate resource access
private static validateResourceAccess(payload: SsoTokenPayload): void {
    if (!payload.resource_access) {
      throw new Error("E_FORBIDDEN_ACCESS: No resource access in token");
    }
    if (!payload.resource_access[SSO_CLIENT_ID]) {
      throw new Error(
        `E_FORBIDDEN_ACCESS: No access for client ${SSO_CLIENT_ID}`,
      );
    }
    if (!Array.isArray(payload.resource_access[SSO_CLIENT_ID].roles)) {
      throw new Error("E_FORBIDDEN_ACCESS: No roles found");
    }
}

// Upsert: cari by sso_id → by email → buat baru
// Rekomendasi: Selalu sync role + profile dari JWT ke DB saat user login
```

---

## 2. Refresh Session

Menggunakan `kc.updateToken()` dari keycloak-js

```ts
// src/lib/keycloak.ts
export async function exchangeRefreshToken(_refreshToken: string) {
  const kc = getKeycloak();
  await kc.updateToken(-1); // -1 = force refresh
  return {
    access_token: kc.token!,
    refresh_token: kc.refreshToken!,
    id_token: kc.idToken,
  };
}
```

### Kapan refresh terjadi
| Momen | Keterangan |
|---|---|
| **Page load** | `check-sso` via iframe — jika ada SSO session aktif, token langsung didapat. Jika tidak, fallback ke `refresh_token` di localStorage via `kc.updateToken()` |
| **API return 401** | `api-client` interceptor: panggil `exchangeRefreshToken()` → retry request. Jika gagal → logout paksa |

Concurrent protection: singleton lock di `api-client` — hanya 1 refresh berjalan sekaligus.

---

## 3. Logout

Dilakukan manual (bukan `kc.logout()`) karena butuh `id_token_hint` untuk skip halaman konfirmasi Keycloak.

```ts
// src/lib/keycloak.ts
export function buildLogoutUrl(postLogoutRedirectUri: string, idTokenHint?: string): string {
  const logoutUrl = `${keycloakConfig.url}/realms/${keycloakConfig.realm}/protocol/openid-connect/logout`;
  const params = new URLSearchParams({
    client_id: keycloakConfig.clientId,
    post_logout_redirect_uri: postLogoutRedirectUri,
  });
  if (idTokenHint) params.set("id_token_hint", idTokenHint);
  return `${logoutUrl}?${params}`;
}

// src/context/sso-auth-context.tsx
const logout = async () => {
  // Ambil id_token dari kc instance (sudah ada setelah check-sso/login)
  // Fallback: exchange refresh token jika kc.idToken kosong
  const idToken = kcRef.current?.idToken ?? (await exchangeRefreshToken(""))?.id_token;
  clearSession();
  window.location.href = buildLogoutUrl(window.location.origin, idToken);
};
```

### Flow
1. Ambil `id_token` dari `kc.idToken` (sudah tersedia di instance) — tidak perlu fetch tambahan
2. Clear localStorage + reset state
3. Redirect ke Keycloak logout URL dengan `id_token_hint` → SSO cookie dihapus tanpa konfirmasi

---

## Storage

| Key | Storage | Isi |
|---|---|---|
| `access_token` | localStorage | JWT, ~5 menit |
| `token` | localStorage | Refresh token, ~4 jam |
| `kc-callback-{state}` | localStorage | PKCE state internal keycloak-js, dihapus otomatis |

`id_token` tidak disimpan — diambil langsung dari `kc.idToken` saat logout.

---

## 4. External API — Update Profil SSO

Digunakan aplikasi eksternal (CMS, mobile) untuk update profil user di sync Keycloak. endpoint ini hanya support saat anda login authentikasi menggunakan token SSO. 
### Base URL

| Environment | Base URL |
|---|---|
| Staging | `https://dev.iccn.or.id` |
| Production | `https://iccn.or.id` |

### Endpoint

```
PUT /api/external/sso/profile

### Headers

Authorization: Bearer <access_token>
Content-Type: multipart/form-data
```

### Request Body (FormData)

| Field | Type | Keterangan |
|---|---|---|
| `fullname` | string | Nama lengkap |
| `phone` | string | `08xxx` → otomatis dikonversi ke `628xxx` |
| `city` | string | Kota |
| `province` | string | Provinsi |
| `avatar` | File | Maks 5MB, JPEG/PNG/WebP |

Semua field opsional — hanya field yang dikirim yang diperbarui.

### Response

```json
{
  "data": {
    "fullname": "Budi Santoso",
    "phone": "6281234567890",
    "city": "Jakarta",
    "province": "DKI Jakarta",
    "avatar": "avatars/uuid-avatar.jpg"
  },
  "message": "Profile berhasil diperbarui",
  "statusCode": 201
}
```

| Status | Keterangan |
|---|---|
| `401` | Token tidak valid atau expired |
| `422` | Format/ukuran avatar tidak valid |
| `500` | Gagal update ke Keycloak |
