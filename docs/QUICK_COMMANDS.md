# Quick Commands Reference - SoundPub Dashboard

## 🔗 Environment
- **Supabase Instance:** https://supabase.carubra.com
- **Database:** soundpub
- **Primary Schema:** soundpub

## 🚀 Quick Migration Commands

### Apply Notifications Migration
\\\ash
# Using psql (Recommended)
psql -h supabase.carubra.com -U postgres -d soundpub -f docs/migrations/notifications/20260722_create_notifications_table.sql

# Using Supabase CLI (if configured)
supabase db execute --file docs/migrations/notifications/20260722_create_notifications_table.sql
\\\

### Verify Migration
\\\ash
# Connect to database
psql -h supabase.carubra.com -U postgres -d soundpub

# Then run these queries:
# Check table exists
\dt public.notifications

# Check table structure
\d+ public.notifications

# Check RLS enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'notifications';

# Check policies
SELECT policyname FROM pg_policies WHERE tablename = 'notifications';

# Exit
\q
\\\

## 📊 Common Database Commands

### Connection
\\\ash
# Interactive connection
psql -h supabase.carubra.com -U postgres -d soundpub

# Execute single query
psql -h supabase.carubra.com -U postgres -d soundpub -c "SELECT COUNT(*) FROM public.notifications;"
\\\

### Schema Information
\\\sql
-- List all schemas
\dn

-- List tables in soundpub schema
\dt soundpub.*

-- List tables in public schema
\dt public.*

-- Show search path
SHOW search_path;
\\\

### Notifications Table Queries
\\\sql
-- Count notifications
SELECT COUNT(*) FROM public.notifications;

-- Get unread count per user
SELECT user_id, COUNT(*) as unread 
FROM public.notifications 
WHERE is_read = false 
GROUP BY user_id;

-- Get recent notifications
SELECT * FROM public.notifications 
ORDER BY created_at DESC 
LIMIT 10;

-- Check global announcements
SELECT * FROM public.notifications 
WHERE is_global = true 
ORDER BY created_at DESC;
\\\

## 🔧 Troubleshooting Commands

### Check if notifications table exists
\\\sql
SELECT table_schema, table_name 
FROM information_schema.tables 
WHERE table_name = 'notifications';
-- Expected: public | notifications
\\\

### Check RLS policies
\\\sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'notifications';
-- Expected: 4 policies
\\\

### Check indexes
\\\sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'notifications';
-- Expected: 5 indexes
\\\

### Test notification creation
\\\sql
-- Create test notification
INSERT INTO public.notifications (
    user_id, type, title, message, is_read, is_global
) VALUES (
    'test-user-id', 'info', 'Test', 'This is a test notification', false, false
) RETURNING *;

-- Delete test notification
DELETE FROM public.notifications WHERE title = 'Test';
\\\

## 🌐 Supabase Studio Access

### URLs
- **Dashboard:** https://supabase.carubra.com/project/default
- **SQL Editor:** https://supabase.carubra.com/project/default/sql
- **Table Editor:** https://supabase.carubra.com/project/default/editor
- **Database:** https://supabase.carubra.com/project/default/database/tables

### Via Studio SQL Editor
1. Open: https://supabase.carubra.com/project/default/sql
2. Create new query
3. Paste SQL commands
4. Click "Run"

## 📦 Migration Workflow

### Step 1: Backup (Optional but Recommended)
\\\ash
# Backup entire database (PowerShell)
pg_dump -h supabase.carubra.com -U postgres soundpub > "backup_soundpub_20260722.sql"

# Backup specific schema
pg_dump -h supabase.carubra.com -U postgres -n soundpub soundpub > backup_soundpub_schema.sql

# Backup public schema
pg_dump -h supabase.carubra.com -U postgres -n public soundpub > backup_public_schema.sql
\\\

### Step 2: Apply Migration
\\\ash
psql -h supabase.carubra.com -U postgres -d soundpub -f docs/migrations/notifications/20260722_create_notifications_table.sql
\\\

### Step 3: Verify
\\\ash
psql -h supabase.carubra.com -U postgres -d soundpub -c "\d+ public.notifications"
\\\

### Step 4: Test Application
\\\ash
# Restart dev server
npm run dev

# Test in browser
# Navigate to application
# Check browser console for errors
\\\

## 🔍 Monitoring Queries

### Table sizes
\\\sql
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname IN ('public', 'soundpub')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;
\\\

### Active connections
\\\sql
SELECT 
    datname, 
    usename, 
    application_name, 
    state, 
    count(*) 
FROM pg_stat_activity 
WHERE datname = 'soundpub'
GROUP BY datname, usename, application_name, state;
\\\

### Recent queries
\\\sql
SELECT 
    pid,
    usename,
    state,
    query,
    now() - query_start as duration
FROM pg_stat_activity
WHERE datname = 'soundpub' AND state != 'idle'
ORDER BY duration DESC;
\\\

## 💡 Useful Shortcuts

### psql Meta-commands
\\\
\l          - List databases
\dn         - List schemas
\dt         - List tables in current schema
\dt *.*     - List all tables in all schemas
\d table    - Describe table structure
\d+ table   - Describe table with extra details
\du         - List users/roles
\dp table   - Show table permissions
\q          - Quit psql
\?          - Help on psql commands
\h          - Help on SQL commands
\\\

### PowerShell Aliases (add to profile)
\\\powershell
# Add to: C:\Users\bimok\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1
function Connect-SoundpubDB { psql -h supabase.carubra.com -U postgres -d soundpub }
function Get-SoundpubTables { psql -h supabase.carubra.com -U postgres -d soundpub -c "\dt soundpub.*" }
function Get-NotificationCount { psql -h supabase.carubra.com -U postgres -d soundpub -c "SELECT COUNT(*) FROM public.notifications;" }

# Usage:
# Connect-SoundpubDB
# Get-SoundpubTables
# Get-NotificationCount
\\\

## 🔐 Security Check Commands

### Check RLS on all tables
\\\sql
SELECT 
    schemaname,
    tablename,
    CASE WHEN rowsecurity THEN '✅ Enabled' ELSE '❌ Disabled' END as rls_status
FROM pg_tables
WHERE schemaname IN ('public', 'soundpub')
ORDER BY schemaname, tablename;
\\\

### Check policies count
\\\sql
SELECT 
    schemaname,
    tablename,
    COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname IN ('public', 'soundpub')
GROUP BY schemaname, tablename
ORDER BY schemaname, tablename;
\\\

## 📋 Checklist After Migration

- [ ] Table created: \\d public.notifications\
- [ ] RLS enabled: Check pg_tables
- [ ] 4 policies created: Check pg_policies
- [ ] 5 indexes created: Check pg_indexes
- [ ] 1 trigger created: Check pg_triggers
- [ ] Test insert: Try creating test notification
- [ ] Test query: Try selecting notifications
- [ ] Application works: Test in browser
- [ ] No errors: Check logs

## 📞 Quick Help

**Error: connection refused**
→ Check if Supabase instance is running: https://supabase.carubra.com

**Error: relation does not exist**
→ Apply migration: See "Apply Notifications Migration" above

**Error: permission denied**
→ Check RLS policies: See "Security Check Commands" above

---

**Instance:** https://supabase.carubra.com  
**Database:** soundpub  
**Schema:** soundpub (primary), public (utilities)  
**Updated:** 2026-07-22

