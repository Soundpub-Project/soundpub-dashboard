# ✅ CHECKLIST UNTUK ADMIN/DEVOPS

## 🎯 Objective
Deploy Edge Functions ke server Supabase (supabase.carubra.com) agar user management berfungsi.

## 📋 Pre-Deployment Checklist

- [ ] Verifikasi akses ke Supabase project: opkvvdgnhhopkkeaokzo
- [ ] Pastikan memiliki Personal Access Token dengan permission deploy
- [ ] Backup konfigurasi Supabase saat ini
- [ ] Siapkan waktu 30 menit untuk deployment

## 🚀 Deployment Steps

### Step 1: Verifikasi Edge Functions Service
`ash
# SSH ke server Supabase atau container
docker ps | grep functions
# Jika tidak ada, edge functions service belum running
`

### Step 2: Setup Environment
`powershell
# Set access token (dapatkan dari https://supabase.com/dashboard/account/tokens)
\ = "sbp_xxxxxxxxxxxxxxxxxxxxx"

# Link project lokal (jika belum)
supabase link --project-ref opkvvdgnhhopkkeaokzo
`

### Step 3: Deploy Edge Functions (Option A: Via CLI)
`powershell
# Deploy semua functions sekaligus
supabase functions deploy

# ATAU deploy satu-satu dengan priority:
supabase functions deploy create-user
supabase functions deploy delete-user
supabase functions deploy update-user-status
supabase functions deploy update-user-password
supabase functions deploy create-whitelabel-artist
supabase functions deploy change-own-password
`

### Step 4: Deploy Edge Functions (Option B: Via Dashboard)
`
1. Login: https://supabase.com/dashboard/project/opkvvdgnhhopkkeaokzo
2. Go to: Edge Functions (sidebar kiri)
3. Click: "Deploy a new function"
4. Upload: File index.ts dari setiap folder di supabase/functions/
5. Repeat untuk semua 6 functions
`

### Step 5: Set Environment Variables (Jika Belum)
Di Supabase Dashboard → Settings → Edge Functions:
`
DATABASE_SCHEMA = soundpub
SUPABASE_DB_SCHEMA = soundpub
`

## ✔️ Post-Deployment Verification

### Verifikasi 1: Functions Status
`powershell
# List semua deployed functions
supabase functions list

# Expected output: Semua functions status DEPLOYED (hijau)
`

### Verifikasi 2: Endpoint Accessibility
`powershell
# Test endpoint
Invoke-WebRequest -Uri "https://supabase.carubra.com/functions/v1/create-user" -Method GET

# Expected: Status 200 OK (atau 405 jika method GET tidak diizinkan, tapi endpoint accessible)
# NOT: 503 Service Unavailable
`

### Verifikasi 3: Full Test di Dashboard
`
1. Login ke dashboard: https://web.maskhar.com/dashboard
2. Go to: Users management page
3. Click: "Tambah User" / "Add User"
4. Fill form dan klik Save
5. Expected: User successfully created (tidak ada error 503)
`

## 🆘 Troubleshooting Jika Deploy Gagal

### Error: "Your account does not have the necessary privileges"
**Solution:**
- Gunakan token dari owner project bukan collaborator
- Generate new token: https://supabase.com/dashboard/account/tokens
- Token harus punya scope: functions.deploy

### Error: "Cannot find project ref"
**Solution:**
`powershell
supabase link --project-ref opkvvdgnhhopkkeaokzo
`

### Functions Deploy Tapi Masih 503
**Solution:**
- Pastikan _shared/cors.ts file ter-upload
- Cek logs: Supabase Dashboard → Logs → Edge Functions
- Redeploy dengan: supabase functions deploy --update-only

### Endpoint Return 404
**Solution:**
- Function belum fully deployed, tunggu 1-2 menit
- Cek status: supabase functions list

## 📊 Functions yang Harus Di-Deploy

| # | Function | Path | Priority | Status |
|---|----------|------|----------|--------|
| 1 | create-user | supabase/functions/create-user/ | HIGH | ⏳ |
| 2 | delete-user | supabase/functions/delete-user/ | HIGH | ⏳ |
| 3 | update-user-status | supabase/functions/update-user-status/ | HIGH | ⏳ |
| 4 | update-user-password | supabase/functions/update-user-password/ | HIGH | ⏳ |
| 5 | create-whitelabel-artist | supabase/functions/create-whitelabel-artist/ | MEDIUM | ⏳ |
| 6 | change-own-password | supabase/functions/change-own-password/ | MEDIUM | ⏳ |

## 📞 Support Resources

Jika ada masalah:
1. Read: DEPLOY_EDGE_FUNCTIONS.md
2. Read: CUSTOM_SUPABASE_SETUP.md
3. Check: Supabase docs https://supabase.com/docs/guides/functions
4. Contact: Supabase support https://supabase.com/support

## ⏱️ Expected Timeline

- Setup & preparation: 5 menit
- Deploy via CLI: 10-15 menit
- Verification: 5 menit
- **Total: 20-25 menit**

## 📝 Notes

- Deployment tidak akan downtime aplikasi
- Existing functions dapat di-update kapan saja
- Logs tersimpan di Supabase Dashboard untuk debugging
- Rekomendasi: Deploy ke staging dulu sebelum production (jika tersedia)

---
**Last Updated**: 2026-07-22 01:45:50
**Required By**: ASAP (untuk fix error 503)
