# PENTING: Custom Supabase Instance - supabase.carubra.com

## Temuan
Berdasarkan konfigurasi di .env.local, dashboard menggunakan custom Supabase instance:
- URL: https://supabase.carubra.com
- BUKAN domain standar Supabase (supabase.co)
- Ini adalah Self-Hosted atau Custom Supabase Deploy

## Implikasi untuk Edge Functions

Pada custom Supabase instance, edge functions perlu di-setup dan di-deploy dengan cara berbeda dibanding Supabase Cloud.

## Kemungkinan Root Cause Error 503

1. **Edge Functions service tidak berjalan** di server custom
2. **Edge Functions belum di-enable** di konfigurasi Supabase
3. **Functions relay service down** atau tidak dikonfigurasi
4. **Path functions salah** di server

## Solusi Untuk Custom Supabase Instance

### Option 1: Hubungi Admin/DevOps Server
Karena ini custom instance, administrator server perlu:

1. **Verifikasi Edge Functions Service Running**
   `ash
   # Di server Supabase, cek status edge functions
   docker ps | grep functions
   `

2. **Enable Edge Functions di supabase/config.toml**
   `	oml
   [functions]
   verify_jwt = false
   `

3. **Deploy Functions ke Container**
   `ash
   # Via Supabase CLI lokal
   supabase functions deploy --project-ref opkvvdgnhhopkkeaokzo
   `

4. **Verifikasi Port Functions Accessible**
   - Functions biasanya di: https://supabase.carubra.com/functions/v1/
   - Test: curl -X GET https://supabase.carubra.com/functions/v1/create-user

### Option 2: Workaround - Gunakan Database Triggers

Jika edge functions tidak bisa di-setup, gunakan database triggers sebagai workaround:

`sql
-- Buat trigger untuk auto-create profiles saat auth user dibuat
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
`

Ini akan menghindari dependency pada edge functions.

### Option 3: Create Alternative API Endpoint

Buat REST endpoint alternatif di backend yang terpisah:
- Dashboard panggil backend API sendiri (bukan edge functions)
- Backend handle user creation logic

## Immediate Actions Needed

**Untuk sementara, user tidak bisa add/edit/delete user sampai:**
1. Server admin verifikasi edge functions service
2. Deploy edge functions ke container
3. Atau implementasi workaround

## File yang Sudah Diupdate

Berikut komponen sudah punya error handling yang informatif:
- ✅ AddUserDialog.tsx - akan show pesan 503 yang jelas
- ✅ DeleteUserDialog.tsx - akan show pesan 503 yang jelas
- ✅ ChangePasswordDialog.tsx - akan show pesan 503 yang jelas
- ✅ ChangeStatusDialog.tsx - akan show pesan 503 yang jelas
- ✅ Users.tsx - akan show pesan 503 yang jelas

## Testing Edge Functions Endpoint

Untuk diagnosa, coba test endpoint langsung:

`ash
# Test apakah functions endpoint accessible
curl -X GET https://supabase.carubra.com/functions/v1/

# Test specific function
curl -X POST https://supabase.carubra.com/functions/v1/create-user \
  -H \"Content-Type: application/json\" \
  -d '{\"email\":\"test@test.com\"}'
`

Jika dapat response 403/404 = functions service tidak running
Jika dapat response 500+ = functions ada tapi ada error

## Next Steps

1. **Contact Server Admin** dengan informasi:
   - Error 503 pada endpoint: /functions/v1/create-user
   - Edge functions service perlu di-verify
   - Minta status dan deployment procedures

2. **Provide Admin dengan panduan:**
   - Share file DEPLOY_EDGE_FUNCTIONS.md
   - Beri tahu bahwa ini custom Supabase instance
   - Functions files sudah ada di: supabase/functions/

3. **Alternative sambil menunggu:**
   - Implementasi workaround dengan database triggers
   - Atau create separate backend API
