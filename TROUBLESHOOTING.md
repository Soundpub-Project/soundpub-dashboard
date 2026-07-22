# Troubleshooting: Error 503 pada User Management

## Ringkasan Masalah
Saat menambah, mengedit, atau menghapus user di dashboard, muncul error:
`
Failed to load resource: the server responded with a status of 503
Error: Edge Function returned a non-2xx status code
`

## Root Cause
Edge Functions belum di-deploy ke server production Supabase (https://supabase.carubra.com).

## Solusi Cepat

### 1. Setup Credentials
`powershell
# Dapatkan access token dari https://supabase.com/dashboard/account/tokens
$env:SUPABASE_ACCESS_TOKEN = "your-access-token-here"
`

### 2. Link Project
`powershell
supabase link --project-ref opkvvdgnhhopkkeaokzo
`

### 3. Deploy Edge Functions
`powershell
# Deploy semua functions
supabase functions deploy

# Atau deploy satu-satu
supabase functions deploy create-user
supabase functions deploy delete-user
supabase functions deploy update-user-status
supabase functions deploy update-user-password
supabase functions deploy create-whitelabel-artist
supabase functions deploy change-own-password
`

### 4. Verifikasi
`powershell
supabase functions list
`

Pastikan semua functions menampilkan status "deployed".

## Jika Masalah Persist

### Cek Logs
1. Login ke Supabase Dashboard: https://supabase.com/dashboard
2. Pilih project: opkvvdgnhhopkkeaokzo
3. Go to **Logs** → **Edge Functions**
4. Cari error details

### Cek Environment Variables
Di Supabase Dashboard:
1. Go to **Settings** → **Edge Functions**
2. Verifikasi bahwa environment variables berikut sudah di-set:
   - DATABASE_SCHEMA = soundpub
   - Jika ada error tentang schema, tambahkan variable ini

### Manual Deploy via Dashboard
1. Go to https://supabase.com/dashboard/project/opkvvdgnhhopkkeaokzo/functions
2. Klik **Deploy a new function**
3. Upload file dari supabase/functions/create-user/ 
4. Ulangi untuk semua functions

## Error Messages yang Sudah Ditambahkan

Setelah perbaikan ini, user akan melihat pesan error yang lebih informatif:
- "Edge Function tidak tersedia (Error 503). Silakan hubungi administrator untuk deploy edge functions."
- Pesan akan mengarahkan user ke file DEPLOY_EDGE_FUNCTIONS.md

## Files yang Diupdate

Berikut adalah komponen yang sudah ditambahkan error handling:
- src/components/users/AddUserDialog.tsx
- src/components/users/DeleteUserDialog.tsx
- src/components/users/ChangePasswordDialog.tsx
- src/components/users/ChangeStatusDialog.tsx
- src/pages/Users.tsx

## Kontak Support

Jika masalah berlanjut setelah deploy:
1. Cek Supabase status: https://status.supabase.com/
2. Buat issue dengan error logs
3. Hubungi Supabase support: https://supabase.com/support
