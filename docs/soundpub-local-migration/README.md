# Soundpub Local Migration

## Overview
Migration files untuk local development environment Soundpub Dashboard. File-file ini digunakan untuk setup dan maintenance database lokal.

## ⚠️ WARNING
**PERHATIAN:** Migration files dalam folder ini bersifat **DESTRUCTIVE** dan hanya untuk **local development**. Jangan jalankan di production!

## Migration Files

### 00-HARDRESET-Soundpub-LOCAL.sql
**Purpose:** Complete database reset untuk development

**What it does:**
- Drop semua trigger
- Drop schema Soundpub CASCADE
- Reset auth.users
- Clean slate untuk fresh start

**When to use:**
- Database corrupt
- Butuh clean state
- Major schema changes testing

**⚠️ DANGER:** Menghapus semua data!

---

### 01-reset-and-recreate-Soundpub.sql
**Purpose:** Create complete Soundpub schema dari awal

**What it does:**
- Drop dan recreate Soundpub schema
- Create semua tables:
  - user_roles
  - profiles
  - releases
  - tracks
  - royalties
  - payout_requests
  - notifications (dalam Soundpub schema)
  - dan 20+ tables lainnya
- Setup RLS policies
- Create indexes
- Create triggers
- Setup functions

**When to use:**
- Initial project setup
- After hard reset
- Fresh environment

---

### 02-initial-seed.sql
**Purpose:** Seed initial data untuk testing

**What it does:**
- Insert test users
- Insert sample artists
- Insert sample releases
- Setup initial configuration

**When to use:**
- After schema creation
- Need test data

---

### 03-align-schema-to-csv.sql
**Purpose:** Adjust schema untuk CSV import compatibility

**What it does:**
- Modify columns untuk CSV uploads
- Adjust data types
- Add missing columns

---

### 04-runtime-permissions-and-rpc.sql
**Purpose:** Setup runtime permissions dan RPC functions

**What it does:**
- Grant necessary permissions
- Create RPC functions
- Setup function security

---

### 05-royalty-dashboard-rpcs.sql
**Purpose:** Create stored procedures untuk royalty dashboard

**What it does:**
- RPC untuk statistics
- RPC untuk reports
- RPC untuk calculations

---

### 06-allow-draft-upc-isrc-empty.sql
**Purpose:** Allow draft releases dengan empty identifiers

**What it does:**
- Modify constraints
- Allow NULL untuk draft status

---

### 07-release-status-and-nullable-identifiers.sql
**Purpose:** Add release status tracking

**What it does:**
- Add status columns
- Modify identifier constraints
- Add status checks

---

### 08-user-profile-role-support.sql
**Purpose:** Enhanced role management

**What it does:**
- Add role columns
- Create role functions
- Setup role policies

---

### 09-storage-buckets-and-policies.sql
**Purpose:** Setup Supabase Storage

**What it does:**
- Create storage buckets
- Setup storage policies
- Configure file uploads

---

### 10-reconcile-user-roles-from-csv.sql
**Purpose:** Sync user roles dari CSV imports

**What it does:**
- Read CSV data
- Update user roles
- Reconcile mismatches

---

### 11-signup-default-artist-under-Soundpub.sql
**Purpose:** Auto-assign new artists ke Soundpub label

**What it does:**
- Create trigger
- Auto-assign parent_label_id
- Setup default relationships

---

### 12-add-missing-royalties-columns.sql
**Purpose:** Add missing columns ke royalties table

**What it does:**
- Add new columns
- Backfill default values

---

### 13-recalculate-royalty-balances.sql
**Purpose:** Recalculate semua royalty balances

**What it does:**
- Aggregate royalties
- Update profile balances
- Fix calculation errors

---

### 14-reset-all-profile-balances.sql
**Purpose:** Reset semua profile balances ke 0

**What it does:**
- Update all profiles
- Reset label_revenue
- Reset artist_revenue

---

## Execution Order

### Fresh Setup (Recommended)
\\\ash
# 1. Hard reset (optional, hanya jika perlu clean slate)
psql -U postgres -d Soundpub -f 00-HARDRESET-Soundpub-LOCAL.sql

# 2. Create schema
psql -U postgres -d Soundpub -f 01-reset-and-recreate-Soundpub.sql

# 3. Seed initial data
psql -U postgres -d Soundpub -f 02-initial-seed.sql

# 4. Apply incremental migrations (03 onwards)
psql -U postgres -d Soundpub -f 03-align-schema-to-csv.sql
psql -U postgres -d Soundpub -f 04-runtime-permissions-and-rpc.sql
# ... dan seterusnya
\\\

### Incremental Updates
\\\ash
# Jalankan hanya migration baru yang belum applied
psql -U postgres -d Soundpub -f [XX-new-migration.sql]
\\\

## Using Supabase CLI

\\\ash
# Start local Supabase
supabase start

# Reset database (runs all migrations)
supabase db reset

# Apply single migration
supabase db execute --file docs/Soundpub-local-migration/[migration-file].sql
\\\

## Schema Comparison

### Soundpub schema
Primary schema untuk business logic:
- User management
- Release management
- Royalty tracking
- Payment processing

### public schema
Untuk shared utilities:
- notifications (cross-service)
- system logs

## Important Notes

### Notifications Table
**BREAKING CHANGE:** Notifications table ada di **DUA** schema:

1. **Soundpub.notifications** (old - dari 01-reset-and-recreate-Soundpub.sql)
2. **public.notifications** (new - recommended)

**Solution:** 
- Frontend menggunakan \public.notifications\
- Migration baru sudah dibuat: \docs/migrations/notifications/20260722_create_notifications_table.sql\
- Jalankan migration tersebut setelah schema creation

### Migration Sequence Issue
Jika terjadi error "relation does not exist":
1. Check apakah schema sudah dibuat
2. Check execution order
3. Check dependencies antar tables

## Troubleshooting

### Error: relation "public.notifications" does not exist
**Solution:**
\\\ash
# Run notifications migration
psql -U postgres -d Soundpub -f docs/migrations/notifications/20260722_create_notifications_table.sql
\\\

### Error: schema "Soundpub" does not exist
**Solution:**
\\\ash
# Run schema creation
psql -U postgres -d Soundpub -f 01-reset-and-recreate-Soundpub.sql
\\\

### Error: permission denied
**Solution:**
\\\ash
# Run permissions setup
psql -U postgres -d Soundpub -f 04-runtime-permissions-and-rpc.sql
\\\

### Data inconsistency after migration
**Solution:**
\\\ash
# Recalculate balances
psql -U postgres -d Soundpub -f 13-recalculate-royalty-balances.sql
\\\

## Verification Queries

### Check all tables in Soundpub schema
\\\sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'Soundpub'
ORDER BY table_name;
\\\

### Check RLS status
\\\sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'Soundpub'
ORDER BY tablename;
\\\

### Check policies
\\\sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'Soundpub'
ORDER BY tablename, policyname;
\\\

### Check functions
\\\sql
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'Soundpub'
ORDER BY routine_name;
\\\

### Count records per table
\\\sql
SELECT 
    schemaname,
    tablename,
    (xpath('/row/cnt/text()', 
           xml_count))[1]::text::int as row_count
FROM (
    SELECT 
        schemaname,
        tablename,
        query_to_xml(format('SELECT COUNT(*) as cnt FROM %I.%I', 
                            schemaname, tablename), 
                     false, true, '') as xml_count
    FROM pg_tables
    WHERE schemaname = 'Soundpub'
) t
ORDER BY row_count DESC;
\\\

## Development Workflow

### Starting New Feature
1. Create feature branch
2. Write migration file
3. Test locally dengan migrations
4. Document changes
5. Commit migration file

### Testing Schema Changes
\\\ash
# 1. Save current state (if needed)
pg_dump Soundpub > backup.sql

# 2. Apply new migration
psql -U postgres -d Soundpub -f XX-new-feature.sql

# 3. Test application

# 4. If issues, restore
psql -U postgres -d Soundpub < backup.sql
\\\

## Best Practices

1. **Always backup before major changes**
   \\\ash
   pg_dump Soundpub > backup.sql
   \\\

2. **Test migrations in isolation**
   - Reset database
   - Run migration
   - Verify schema
   - Test application

3. **Never modify applied migrations**
   - Create new migration instead
   - Use timestamp for ordering

4. **Document breaking changes**
   - Update README
   - Add comments in migration
   - Notify team

5. **Keep migrations idempotent**
   - Use IF NOT EXISTS
   - Check before dropping
   - Handle existing data

## Related Documentation

- [Migration Guide](../MIGRATION_GUIDE.md)
- [Notifications System](../notifications/README.md)
- [Database Schema](../../SCHEMA.md)

## Changelog

| Date | Migration | Description |
|------|-----------|-------------|
| 2026-07-22 | - | Created documentation |
| 2026-07-12 | 14 | Reset profile balances |
| 2026-07-11 | 13 | Recalculate royalty balances |
| 2026-07-11 | 12 | Add missing royalties columns |
| 2026-07-11 | 11 | Default artist under Soundpub |
| 2026-07-12 | 10 | Reconcile user roles from CSV |
| 2026-07-11 | 09 | Storage buckets and policies |
| 2026-07-11 | 08 | User profile role support |
| 2026-07-11 | 07 | Release status and nullable identifiers |
| 2026-07-11 | 06 | Allow draft UPC/ISRC empty |
| 2026-07-11 | 05 | Royalty dashboard RPCs |
| 2026-07-11 | 04 | Runtime permissions and RPC |
| 2026-07-11 | 03 | Align schema to CSV |
| 2026-07-10 | 02 | Initial seed |
| 2026-07-11 | 01 | Reset and recreate Soundpub |
| 2026-07-12 | 00 | Hard reset script |

