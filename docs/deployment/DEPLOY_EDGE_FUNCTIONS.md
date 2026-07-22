# Deploy Edge Functions ke Supabase Production

## Masalah
Error 503 terjadi pada operasi create, edit, dan delete user karena Edge Functions belum di-deploy ke server production (https://supabase.carubra.com).

## Error yang Muncul
`
supabase.carubra.com/functions/v1/create-user:1  Failed to load resource: the server responded with a status of 503 ()
Error creating user: Error: Edge Function returned a non-2xx status code
`

## Solusi

### Opsi 1: Deploy Edge Functions (Recommended)

#### Prasyarat
1. Pastikan Supabase CLI sudah terinstall (sudah terinstall versi 2.106.0)
2. Login ke Supabase menggunakan access token

#### Langkah-langkah Deploy

1. **Login ke Supabase**
   `powershell
   supabase login
   `
   
   Atau jika menggunakan access token:
   `powershell
   $env:SUPABASE_ACCESS_TOKEN = "your-access-token-here"
   `

2. **Link Project ke Supabase**
   `powershell
   supabase link --project-ref opkvvdgnhhopkkeaokzo
   `

3. **Deploy Semua Edge Functions**
   `powershell
   # Deploy semua functions sekaligus
   supabase functions deploy
   
   # Atau deploy satu per satu
   supabase functions deploy create-user
   supabase functions deploy delete-user
   supabase functions deploy update-user-status
   supabase functions deploy update-user-password
   supabase functions deploy create-whitelabel-artist
   `

4. **Verifikasi Deployment**
   `powershell
   supabase functions list
   `

### Opsi 2: Menggunakan Supabase Dashboard

1. Login ke Supabase Dashboard: https://supabase.com/dashboard
2. Pilih project: opkvvdgnhhopkkeaokzo
3. Pergi ke **Edge Functions** di sidebar
4. Deploy functions secara manual melalui UI

### Opsi 3: Deploy via GitHub Actions (CI/CD)

Buat file .github/workflows/deploy-functions.yml:

`yaml
name: Deploy Edge Functions

on:
  push:
    branches:
      - main
    paths:
      - 'supabase/functions/**'
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: supabase/setup-cli@v1
        with:
          version: latest
          
      - name: Deploy functions
        run: supabase functions deploy --project-ref opkvvdgnhhopkkeaokzo
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
`

## Edge Functions yang Perlu Di-Deploy

Berikut adalah edge functions yang digunakan untuk operasi user management:

1. **create-user** - Membuat user baru dengan role tertentu
2. **delete-user** - Menghapus user secara permanen
3. **update-user-status** - Mengubah status user (active/inactive/suspended)
4. **update-user-password** - Mengubah password user
5. **create-whitelabel-artist** - Membuat artist untuk whitelabel
6. **change-own-password** - User mengubah password sendiri

## Troubleshooting

### Error: "Your account does not have the necessary privileges"
- Pastikan access token memiliki permission untuk deploy functions
- Gunakan Owner atau Admin role di Supabase project

### Error: "Cannot find project ref"
- Jalankan: supabase link --project-ref opkvvdgnhhopkkeaokzo

### Error: "unauthorized"
- Pastikan sudah login: supabase login
- Atau set access token: $env:SUPABASE_ACCESS_TOKEN = "token"

## Environment Variables yang Dibutuhkan di Edge Functions

Pastikan environment variables berikut sudah di-set di Supabase Dashboard:

- DATABASE_SCHEMA atau SUPABASE_DB_SCHEMA = soundpub
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

## Verifikasi Setelah Deploy

Test edge functions dengan:
`powershell
# Test create-user function
curl -X POST https://supabase.carubra.com/functions/v1/create-user 
  -H "Authorization: Bearer YOUR_TOKEN" 
  -H "Content-Type: application/json" 
  -d '{\"email\":\"test@example.com\",\"password\":\"test123\",\"full_name\":\"Test User\",\"role\":\"user\"}'
`

## Kontak & Support

Jika masih mengalami masalah:
1. Cek Supabase Dashboard logs: https://supabase.com/dashboard/project/opkvvdgnhhopkkeaokzo/logs/edge-functions
2. Hubungi admin Supabase project
3. Cek status Supabase: https://status.supabase.com/
