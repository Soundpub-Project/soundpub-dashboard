

## Analisis Masalah SSO di `dev.soundpub.xyz`

### Masalah yang Teridentifikasi

Ada **3 masalah** yang menyebabkan SSO tidak bekerja di deployment staging:

#### 1. Edge Function masih error "Failed to fetch JWKS: 404"
Log terbaru menunjukkan `SSO_REALM_URL` secret kemungkinan belum ter-apply dengan benar ke edge function. Meskipun sudah di-update berkali-kali, edge function masih gagal fetch JWKS. Perlu di-redeploy ulang dan di-test langsung.

#### 2. Domain `dev.soundpub.xyz` tidak ada di Keycloak `allowed-origins`
Dari JWT yang kamu berikan, `allowed-origins` hanya berisi:
- `https://next.iccn.or.id`
- `http://localhost:5173`, `http://localhost:3000`, `http://localhost:4560`
- Beberapa URL ngrok dan `cms-sso.iccn.or.id`, `fe-sso.iccn.or.id`

**`dev.soundpub.xyz` tidak terdaftar.** Artinya Keycloak `check-sso` (silent iframe) akan gagal karena domain tidak diizinkan. Kamu perlu minta tim ICCN menambahkan `https://dev.soundpub.xyz` ke:
- **Valid Redirect URIs** di client `soundpub` di Keycloak
- **Web Origins** di client `soundpub` di Keycloak

#### 3. Token yang dikirim adalah dari client `landing-iccn`, bukan `soundpub`
JWT menunjukkan `azp: "landing-iccn"`. Keycloak `check-sso` dari frontend SoundPub seharusnya mendapatkan token dengan `azp: "soundpub"`. Jika domain `dev.soundpub.xyz` tidak terdaftar di client `soundpub`, Keycloak tidak akan memberikan token untuk client tersebut.

### Rencana Fix

#### Step 1: Konfigurasi Keycloak (dilakukan oleh tim ICCN)
Minta admin Keycloak ICCN untuk menambahkan di client **`soundpub`**:
- **Valid Redirect URIs**: `https://dev.soundpub.xyz/*`
- **Web Origins**: `https://dev.soundpub.xyz`
- Juga untuk domain produksi nantinya: `https://dashboard.soundpub.xyz`

#### Step 2: Redeploy edge function `sso-login`
Redeploy ulang untuk memastikan secret `SSO_REALM_URL = https://sso.iccn.or.id/realms/playground` benar-benar ter-apply. Tambahkan logging `console.log("SSO_REALM_URL:", realmUrl)` untuk debugging.

#### Step 3: Tambahkan error handling yang lebih jelas di frontend
Update `SsoAuthContext.tsx` untuk menampilkan pesan error yang lebih informatif saat token exchange gagal, sehingga mudah di-debug.

#### Step 4: Pastikan `.env` di staging benar
File `.env` di `dev.soundpub.xyz` harus mengarah ke backend Lovable Cloud yang benar:
```
VITE_SUPABASE_URL=https://opkvvdgnhhopkkeaokzo.supabase.co
VITE_SUPABASE_PROJECT_ID=opkvvdgnhhopkkeaokzo
VITE_SSO_BASE_URL=https://sso.iccn.or.id
VITE_SSO_REALM=playground
VITE_SSO_CLIENT_ID=soundpub
```

### Ringkasan
Yang paling kritis adalah **Step 1** — tanpa domain `dev.soundpub.xyz` terdaftar di Keycloak client `soundpub`, silent check-sso tidak akan pernah berhasil mendapatkan token. Ini harus dilakukan oleh admin Keycloak ICCN.

