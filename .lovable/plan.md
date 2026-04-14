

## Bug: Auto-Redirect ke SSO ICCN

### Akar Masalah

Di `SsoAuthContext.tsx`, Keycloak di-inisialisasi **otomatis** saat app pertama kali dimuat (di `useEffect` baris 58-90) dengan opsi `onLoad: 'check-sso'`. Ini menyebabkan:

1. User buka halaman `/auth` → `SsoAuthProvider` mount → `initKeycloak()` dipanggil
2. Keycloak mencoba **silent check SSO** via iframe ke `sso.iccn.or.id`
3. Jika iframe gagal, timeout, atau ada session SSO yang sudah ada di browser → Keycloak bisa **redirect** user ke halaman login ICCN secara otomatis
4. User yang tidak bermaksud login SSO tiba-tiba diarahkan ke halaman ICCN

### Solusi

**Ubah Keycloak menjadi lazy initialization** — hanya init ketika user secara eksplisit klik tombol "Login via SSO", bukan saat app dimuat.

### Perubahan

#### 1. `src/lib/keycloak.ts`
- Hapus `onLoad: 'check-sso'` dari `initKeycloak()`
- Buat fungsi baru `initKeycloakAndLogin()` yang melakukan init + login dalam satu langkah
- Hapus `silentCheckSsoRedirectUri` karena tidak diperlukan lagi

#### 2. `src/context/SsoAuthContext.tsx`
- **Hapus auto-init `useEffect`** yang memanggil `initKeycloak()` saat mount
- Ubah `triggerSsoLogin` agar memanggil `initKeycloakAndLogin()` — init Keycloak hanya saat user klik tombol SSO
- Tambahkan penanganan callback: setelah redirect dari Keycloak kembali ke `/auth`, cek URL params untuk mendeteksi apakah ini adalah SSO callback, baru kemudian init Keycloak dan exchange token

#### 3. `src/pages/Auth.tsx`
- Tidak perlu perubahan signifikan, hanya pastikan tombol SSO menampilkan loading state saat proses init+login berlangsung

### File yang Diedit

| File | Perubahan |
|------|-----------|
| `src/lib/keycloak.ts` | Refactor: hapus auto check-sso, tambah lazy init+login |
| `src/context/SsoAuthContext.tsx` | Hapus auto-init useEffect, jadikan SSO lazy/on-demand |

### Yang Tidak Berubah
- Edge function `sso-login` — tidak terpengaruh
- Halaman Auth UI — tombol SSO tetap sama
- Flow Google Login — tidak terpengaruh

