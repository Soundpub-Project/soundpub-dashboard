# URGENT: Cara Deploy Edge Functions Secara Manual

## Masalah Saat Ini
- Edge Functions belum di-deploy ke https://supabase.carubra.com
- Supabase CLI tidak memiliki permission untuk deploy
- User tidak bisa menambah/edit/hapus user karena error 503

## Solusi: Deploy Manual via Supabase Dashboard

### Langkah 1: Login ke Supabase Dashboard
1. Buka: https://supabase.com/dashboard
2. Login dengan akun yang memiliki akses ke project **opkvvdgnhhopkkeaokzo**

### Langkah 2: Buka Project
1. Pilih project yang sesuai dengan **opkvvdgnhhopkkeaokzo**
2. Atau akses langsung: https://supabase.com/dashboard/project/opkvvdgnhhopkkeaokzo

### Langkah 3: Deploy Edge Functions
1. Di sidebar kiri, klik **Edge Functions**
2. Klik tombol **Deploy a new function**

#### Deploy Functions Berikut (Urutan Priority):

**Priority 1 - User Management:**
- **create-user** (dari folder: supabase/functions/create-user/)
- **delete-user** (dari folder: supabase/functions/delete-user/)
- **update-user-status** (dari folder: supabase/functions/update-user-status/)
- **update-user-password** (dari folder: supabase/functions/update-user-password/)

**Priority 2 - Additional:**
- **create-whitelabel-artist** (dari folder: supabase/functions/create-whitelabel-artist/)
- **change-own-password** (dari folder: supabase/functions/change-own-password/)

### Langkah 4: Cara Deploy Setiap Function
Untuk setiap function di atas:

1. Klik **Deploy a new function**
2. **Function name**: masukkan nama function (misal: create-user)
3. **Upload files**: 
   - Upload file index.ts dari folder function tersebut
   - Contoh: untuk create-user, upload dari supabase/functions/create-user/index.ts
4. **Shared dependencies**: Upload folder _shared jika diminta
5. Klik **Deploy**

### Langkah 5: Set Environment Variables (Jika Belum)
1. Go to **Settings** → **Edge Functions** 
2. Tambahkan variable berikut jika belum ada:
   `
   DATABASE_SCHEMA=soundpub
   SUPABASE_DB_SCHEMA=soundpub
   `

### Langkah 6: Verifikasi
1. Setelah deploy semua functions, buka **Edge Functions** page
2. Pastikan semua function status **Deployed** (hijau)
3. Test dengan mencoba add user di dashboard

## Alternative: Deploy via Supabase CLI (Jika Punya Access Token)

Jika Anda memiliki **Personal Access Token** dengan permission yang cukup:

`powershell
# Set access token
$env:SUPABASE_ACCESS_TOKEN = "sbp_xxxxxxxxxxxxxxxxxxxxx"

# Link project
supabase link --project-ref opkvvdgnhhopkkeaokzo

# Deploy semua functions sekaligus
supabase functions deploy

# Atau deploy satu-satu
supabase functions deploy create-user
supabase functions deploy delete-user
supabase functions deploy update-user-status
supabase functions deploy update-user-password
`

### Cara Dapat Access Token:
1. Go to: https://supabase.com/dashboard/account/tokens
2. Klik **Generate new token**
3. Beri nama: "Deploy Edge Functions"
4. Copy token yang di-generate
5. Gunakan token di command di atas

## Troubleshooting

### Error: "Service Unavailable (503)"
- Functions belum di-deploy atau deployment gagal
- Cek status di Dashboard → Edge Functions

### Error: "FunctionsRelayError"
- Network issue atau function crash saat runtime
- Cek logs di Dashboard → Logs → Edge Functions

### Function Di-deploy Tapi Masih Error
- Pastikan _shared/cors.ts juga ter-upload
- Cek environment variables sudah benar
- Restart function dengan redeploy

## Kontak
Jika masih gagal setelah deploy manual:
1. Cek error logs lengkap di Supabase Dashboard
2. Screenshot error dan hubungi Supabase support
3. Alternatif: Gunakan Supabase CLI dari akun owner project
