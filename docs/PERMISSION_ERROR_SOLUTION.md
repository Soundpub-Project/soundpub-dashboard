# 🔧 SOLUSI ERROR: "must be owner of table profiles"

**Error Message:** `ERROR: 42501: must be owner of table profiles`

**Root Cause:** User yang menjalankan migration tidak punya ALTER permission pada table profiles

---

## 🎯 SOLUSI - ADA 3 OPSI

### ✅ OPSI 1: GUNAKAN MIGRATION SCRIPT VERSI BARU (RECOMMENDED)

Saya sudah membuat versi baru yang lebih aman dan memberikan feedback lebih baik.

**File Baru:** `migrations-complete/002_auth_verification_system_v2.sql`

**Cara Pakai:**
1. Buka Supabase SQL Editor
2. Copy paste ISI FILE `002_auth_verification_system_v2.sql` (bukan yang lama)
3. Run script
4. Script akan otomatis skip kolom yang sudah ada
5. Check output untuk success message

**Keuntungan:**
- ✅ Lebih toleran terhadap error
- ✅ Skip kolom yang sudah ada
- ✅ Feedback yang jelas
- ✅ Automatic verification

---

### ✅ OPSI 2: RUN SEBAGAI POSTGRES SUPERUSER

**Jika Anda punya akses postgres superuser:**

```sql
-- Connect sebagai postgres superuser
-- Then run migration script
```

**Di Supabase Self-hosted:**
1. Login ke server database
2. Connect sebagai postgres:
   ```bash
   psql -U postgres -d soundpub
   ```
3. Paste migration script
4. Run

---

### ✅ OPSI 3: GRANT ALTER PERMISSION DULU (Jika pakai user terbatas)

**Step 1: Grant permission**
```sql
-- Run sebagai postgres superuser atau table owner
GRANT ALTER ON soundpub.profiles TO authenticated;
GRANT ALTER ON soundpub.profiles TO service_role;

-- Grant untuk create table
GRANT CREATE ON SCHEMA soundpub TO authenticated;
GRANT CREATE ON SCHEMA soundpub TO service_role;
```

**Step 2: Run migration**
Setelah grant, jalankan migration script seperti biasa

---

## 📋 LANGKAH-LANGKAH LENGKAP (OPSI 1 - RECOMMENDED)

### 1. Gunakan Script Versi Baru

**File:** `migrations-complete/002_auth_verification_system_v2.sql`

**Lokasi:** 
```
I:\website-devops\soundpub-project\soundpub-dashboard\
migrations-complete\002_auth_verification_system_v2.sql
```

### 2. Jalankan via Supabase SQL Editor

1. Buka: https://supabase.carubra.com
2. Login, pilih project soundpub
3. Klik **SQL Editor** di sidebar
4. Klik **New query**
5. Buka file `002_auth_verification_system_v2.sql` di komputer
6. Copy SEMUA isi file
7. Paste ke SQL Editor
8. Klik **RUN**

### 3. Check Output

**Harus muncul:**
```
NOTICE: Running migration as user: ...
NOTICE: Added column: email_verified
NOTICE: Added column: verification_token
NOTICE: Added column: verification_token_expires_at
...
NOTICE: ✅ All 3 new columns added successfully to profiles table
NOTICE: ✅ Both new tables (auth_events, rate_limits) created successfully
NOTICE: ═══════════════════════════════════════════════════════
NOTICE: ✅ Migration 002_auth_verification_system.sql completed!
NOTICE: ═══════════════════════════════════════════════════════
```

### 4. Verify Manual

**Query check kolom:**
```sql
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_schema='soundpub' 
  AND table_name='profiles'
  AND column_name IN (
    'email_verified',
    'verification_token',
    'verification_token_expires_at',
    'password_reset_token',
    'password_reset_token_expires_at'
  )
ORDER BY column_name;
```

**Expected Result:**
```
column_name                      | data_type
---------------------------------+---------------------------
email_verified                   | boolean
password_reset_token             | text
password_reset_token_expires_at  | timestamp with time zone
verification_token               | text
verification_token_expires_at    | timestamp with time zone

(5 rows)
```

**Query check table:**
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema='soundpub' 
  AND table_name IN ('auth_events', 'rate_limits')
ORDER BY table_name;
```

**Expected Result:**
```
table_name
-----------
auth_events
rate_limits

(2 rows)
```

---

## 🔍 JIKA MASIH ERROR

### Error: "relation soundpub.profiles does not exist"

**Cek schema dan table:**
```sql
-- Check schema
SELECT schema_name FROM information_schema.schemata 
WHERE schema_name = 'soundpub';

-- Check table
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'soundpub' AND table_name = 'profiles';
```

**Solusi:** Table profiles mungkin di schema berbeda (public?)
```sql
-- Check di schema public
SELECT table_schema, table_name 
FROM information_schema.tables 
WHERE table_name = 'profiles';
```

---

### Error: Permission Denied untuk CREATE TABLE

**Solusi:** Grant CREATE permission:
```sql
-- Run sebagai postgres superuser
GRANT CREATE ON SCHEMA soundpub TO authenticated;
GRANT CREATE ON SCHEMA soundpub TO service_role;
```

---

### Error: Function soundpub.is_admin does not exist

**Solusi:** Function is_admin harus dibuat dulu atau skip RLS policies:

**Opsi A - Comment out RLS policies sementara:**
Edit script, comment section PART 6 (RLS Policies)

**Opsi B - Create is_admin function:**
```sql
CREATE OR REPLACE FUNCTION soundpub.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM soundpub.user_roles
    WHERE user_id = $1 AND role IN ('superadmin', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 🎯 QUICK CHECKLIST

### Sebelum Run Migration:
- [ ] Backup database (jika production)
- [ ] Gunakan file v2 (002_auth_verification_system_v2.sql)
- [ ] Connected sebagai user yang punya permission
- [ ] Schema 'soundpub' exists
- [ ] Table 'profiles' exists

### Setelah Run Migration:
- [ ] No critical errors
- [ ] 5 kolom baru ada di profiles table
- [ ] 2 table baru (auth_events, rate_limits) ada
- [ ] Functions created successfully
- [ ] Success message muncul

---

## 🆘 TROUBLESHOOTING PERMISSION ISSUES

### Cek User Saat Ini
```sql
SELECT current_user, session_user;
```

### Cek Permission User
```sql
SELECT grantee, privilege_type 
FROM information_schema.table_privileges 
WHERE table_schema = 'soundpub' 
  AND table_name = 'profiles'
  AND grantee = current_user;
```

### Cek Owner Table
```sql
SELECT schemaname, tablename, tableowner 
FROM pg_tables 
WHERE schemaname = 'soundpub' 
  AND tablename = 'profiles';
```

### Grant All Permissions (Jika Perlu)
```sql
-- Run sebagai postgres superuser
GRANT ALL ON soundpub.profiles TO authenticated;
GRANT ALL ON SCHEMA soundpub TO authenticated;
```

---

## ✅ RECOMMENDED APPROACH

**GUNAKAN OPSI 1 dengan file v2:**

1. ✅ Gunakan `002_auth_verification_system_v2.sql`
2. ✅ Run via Supabase SQL Editor
3. ✅ Check output untuk success message
4. ✅ Verify dengan query manual
5. ✅ Lanjut ke Step 2 (Set Secrets)

**File v2 sudah dibuat dan tersimpan di:**
```
I:\website-devops\soundpub-project\soundpub-dashboard\
migrations-complete\002_auth_verification_system_v2.sql
```

---

## 📞 NEXT STEPS SETELAH MIGRATION BERHASIL

1. ✅ Verify kolom & table ada
2. ➡️ Set Edge Function Secrets (LANGKAH 2)
3. ➡️ Re-deploy Functions
4. ➡️ Test semua flow

---

**Status:** Script v2 ready, silakan dicoba!  
**File:** `migrations-complete/002_auth_verification_system_v2.sql`

🎵 **Good luck! Report hasilnya setelah run script v2!** 🎵
