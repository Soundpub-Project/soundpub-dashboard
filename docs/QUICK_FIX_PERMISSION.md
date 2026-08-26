# 🎯 QUICK FIX - ERROR PERMISSION

## ❌ ERROR
```
ERROR: 42501: must be owner of table profiles
```

## ✅ SOLUSI (3 MENIT)

### 1. GUNAKAN FILE BARU
**File:** `migrations-complete/002_auth_verification_system_v2.sql`

### 2. JALANKAN DI SQL EDITOR
1. Buka: https://supabase.carubra.com
2. SQL Editor → New query
3. Copy paste file V2 (⚠️ BUKAN yang lama!)
4. Run
5. Check success message

### 3. VERIFY
```sql
-- Harus return 3 rows
SELECT column_name FROM information_schema.columns 
WHERE table_schema='Soundpub' AND table_name='profiles'
AND column_name IN ('email_verified', 'verification_token', 'password_reset_token');
```

## 🎯 KENAPA V2 LEBIH BAIK?
- ✅ Auto-check kolom sebelum alter
- ✅ Skip jika sudah ada
- ✅ Better error handling
- ✅ Clear success/fail messages

## 📋 AFTER SUCCESS
✅ Kolom & table ada
➡️ LANGKAH 2: Set secrets (docs/MISSING_CHECKLIST.md)
➡️ LANGKAH 3: Re-deploy functions
➡️ LANGKAH 4: Test

## 🆘 JIKA MASIH ERROR
Option A: Grant permission
```sql
GRANT ALTER ON Soundpub.profiles TO authenticated;
GRANT CREATE ON SCHEMA Soundpub TO authenticated;
```

Option B: Run sebagai postgres superuser
```bash
psql -U postgres -d Soundpub
-- paste script V2
```

---

**File Lokasi:**
- Script: `migrations-complete/002_auth_verification_system_v2.sql`
- Docs: `docs/PERMISSION_ERROR_SOLUTION.md`

**Next:** Run file V2, report hasilnya! 🚀
