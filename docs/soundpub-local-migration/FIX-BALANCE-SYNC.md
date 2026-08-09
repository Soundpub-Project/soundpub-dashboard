# Fix Balance Synchronization Issue

## Problem
Balance di header (Rp 38.214,7) dan Saldo Tersedia di dashboard (Rp 439.551) tidak sinkron untuk user dengan role label.

## Root Cause
- Balance di header menggunakan profiles.balance (static field)
- Saldo Tersedia di dashboard menggunakan kalkulasi real-time dari oyalties table
- profiles.balance tidak di-update otomatis ketika royalties berubah

## Solution
1. **Database Trigger**: Otomatis update profiles.balance setiap kali ada perubahan di oyalties table
2. **Frontend Real-time Subscription**: Balance di header akan otomatis update via Supabase realtime
3. **Balance Rebuild**: Sync ulang semua balance yang sudah tidak sinkron

## How to Apply the Fix

### Method 1: Using Supabase Dashboard (RECOMMENDED)

1. Buka **Supabase Dashboard**
2. Pilih project Anda
3. Go to **SQL Editor** (di sidebar kiri)
4. Buka file: \docs/soundpub-local-migration/31-auto-sync-profile-balance-trigger-supabase.sql\
5. Copy seluruh isi file tersebut
6. Paste di SQL Editor
7. Klik **Run** atau tekan Ctrl+Enter

**Benefits:**
- Tidak perlu install psql atau Supabase CLI
- Sudah punya permission yang benar
- Langsung bisa lihat hasilnya

### Method 2: Using PowerShell Script

\\\powershell
cd I:\website-devops\soundpub-project\soundpub-dashboard
.\docs\soundpub-local-migration\run-migration-31.ps1
\\\

### Method 3: Using psql

\\\ash
psql -U postgres -d soundpub -f docs/soundpub-local-migration/31-auto-sync-profile-balance-trigger.sql
\\\

### Method 4: Using Supabase CLI

\\\ash
supabase db execute --file docs/soundpub-local-migration/31-auto-sync-profile-balance-trigger.sql
\\\

## What the Migration Does

1. **Creates Trigger Function**: \sync_profile_balance_from_royalties()\
   - Automatically updates profile balance when royalties change
   - Handles INSERT, UPDATE, DELETE operations
   - Updates both artist and label balances

2. **Creates Trigger**: \sync_profile_balance_on_royalty_change\
   - Fires on every royalty table change
   - Calls the trigger function

3. **Rebuilds All Balances**: 
   - Resets all balances to 0
   - Recalculates from royalties table
   - Fixes current inconsistencies

4. **Shows Summary**:
   - Total profiles with balance
   - Total balance amount
   - Total artist revenue
   - Total label revenue

## Expected Result

After running the migration:

\\\
status              | total_profiles_with_balance | total_balance | total_artist_revenue | total_label_revenue
--------------------|-----------------------------|---------------|---------------------|--------------------
Migration Completed | XX                          | XXX,XXX.XX    | XXX,XXX.XX          | XXX,XXX.XX
\\\

## Verification

1. Refresh dashboard (atau tunggu beberapa detik)
2. Check balance di header
3. Check Saldo Tersedia di dashboard
4. Kedua nilai harus sama sekarang!

## Frontend Changes

File \src/components/layout/DashboardLayout.tsx\ sudah di-update dengan:
- Real-time subscription ke profile balance changes
- Otomatis update balance di header tanpa perlu refresh

## Testing

1. Login sebagai label user
2. Check balance di header dan dashboard - harus sama
3. (Optional) Upload royalty baru
4. Balance harus otomatis update di kedua tempat

## Troubleshooting

### Error: "permission denied for schema soundpub"
**Solution**: Gunakan Method 1 (Supabase Dashboard SQL Editor)

### Balance masih belum sinkron setelah migration
**Solution**: 
1. Hard refresh browser (Ctrl+Shift+R)
2. Logout dan login kembali
3. Check apakah migration berhasil di database

### Trigger tidak jalan
**Solution**: Check apakah trigger berhasil dibuat:
\\\sql
SELECT * FROM information_schema.triggers 
WHERE trigger_name = 'sync_profile_balance_on_royalty_change';
\\\

## Files Changed/Created

- ✅ \docs/soundpub-local-migration/31-auto-sync-profile-balance-trigger.sql\
- ✅ \docs/soundpub-local-migration/31-auto-sync-profile-balance-trigger-supabase.sql\
- ✅ \docs/soundpub-local-migration/run-migration-31.ps1\
- ✅ \src/components/layout/DashboardLayout.tsx\ (modified)

## Next Steps

After migration is successful:
1. Test dengan beberapa user roles (artist, label, admin)
2. Verify balance calculations
3. Monitor for any issues

## Support

Jika masih ada masalah, check:
1. Database logs
2. Browser console
3. Network tab (untuk realtime subscription)
