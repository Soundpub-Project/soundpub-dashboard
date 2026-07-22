# Environment Configuration - SoundPub Dashboard

## 🌐 Database Environment

### Supabase Instance
- **Host:** https://supabase.carubra.com
- **Type:** Supabase Local
- **Database Name:** soundpub
- **Primary Schema:** soundpub

### Schema Organization

\\\
Database: soundpub
├── auth (Supabase managed)
│   ├── users
│   ├── sessions
│   └── ...
│
├── public (Shared utilities)
│   ├── notifications ⭐ (created by migration)
│   └── ...
│
└── soundpub (Main application schema) ⭐
    ├── user_roles
    ├── profiles
    ├── releases
    ├── tracks
    ├── royalties
    ├── payout_requests
    ├── royalty_uploads
    └── ... (20+ tables)
\\\

## 📝 Important Notes

### Schema Strategy
- **soundpub schema:** All core business logic tables
- **public schema:** Cross-service utilities (like notifications)
- **auth schema:** Supabase authentication (managed)

### Why notifications is in public schema?
- Frontend Supabase client defaults to \public\ schema
- Cross-service feature accessible from multiple schemas
- Easier integration without schema prefix in queries

### Connection Information

**For Migrations:**
\\\ash
# Using psql
psql -h supabase.carubra.com -U postgres -d soundpub -f migration-file.sql

# Using Supabase Studio
URL: https://supabase.carubra.com/project/default/editor
\\\

**For Application:**
\\\	ypescript
// Supabase client configuration
const supabaseUrl = 'https://supabase.carubra.com'
const supabaseAnonKey = 'your-anon-key'
\\\

## 🔧 Migration Commands

### Apply Notifications Migration (Local Instance)
\\\ash
# From project root
psql -h supabase.carubra.com -U postgres -d soundpub -f docs/migrations/notifications/20260722_create_notifications_table.sql
\\\

### Verify Schema
\\\ash
# Connect to database
psql -h supabase.carubra.com -U postgres -d soundpub

# Check schemas
\l soundpub

# Check tables in soundpub schema
\dt soundpub.*

# Check tables in public schema
\dt public.*

# Check notifications table
\d public.notifications
\d+ public.notifications
\\\

## 📊 Schema Access Patterns

### From Application Code (TypeScript)
\\\	ypescript
// Access soundpub schema tables (automatic)
supabase.from('profiles').select('*')  // Uses soundpub.profiles
supabase.from('releases').select('*')  // Uses soundpub.releases

// Access public schema tables (automatic)
supabase.from('notifications').select('*')  // Uses public.notifications
\\\

### From SQL Queries
\\\sql
-- Explicit schema reference
SELECT * FROM soundpub.profiles;
SELECT * FROM soundpub.releases;
SELECT * FROM public.notifications;

-- Implicit (depends on search_path)
SELECT * FROM profiles;  -- Searches in search_path order
\\\

## 🔍 Troubleshooting

### Connection Issues
\\\ash
# Test connection
ping supabase.carubra.com

# Test PostgreSQL connection
psql -h supabase.carubra.com -U postgres -d soundpub -c "SELECT version();"
\\\

### Schema Issues
\\\sql
-- Check current schema search path
SHOW search_path;

-- Expected: "\", public, soundpub

-- Set search path if needed
SET search_path TO public, soundpub;
\\\

### Table Not Found
\\\sql
-- Check if table exists in specific schema
SELECT schemaname, tablename 
FROM pg_tables 
WHERE tablename = 'notifications';

-- Should show: public | notifications
\\\

## 🚀 Quick Access

### Supabase Studio
- **URL:** https://supabase.carubra.com/project/default
- **SQL Editor:** https://supabase.carubra.com/project/default/sql
- **Table Editor:** https://supabase.carubra.com/project/default/editor

### Database Direct Access
\\\ash
# Interactive session
psql -h supabase.carubra.com -U postgres -d soundpub

# One-line query
psql -h supabase.carubra.com -U postgres -d soundpub -c "SELECT COUNT(*) FROM public.notifications;"
\\\

## 📋 Environment Variables

### For Local Development
\\\.env
# Supabase Configuration
VITE_SUPABASE_URL=https://supabase.carubra.com
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Database Configuration (for direct access)
DATABASE_URL=postgresql://postgres:password@supabase.carubra.com:5432/soundpub
DB_HOST=supabase.carubra.com
DB_PORT=5432
DB_NAME=soundpub
DB_SCHEMA=soundpub
\\\

### Connection String Format
\\\
postgresql://[user]:[password]@supabase.carubra.com:5432/soundpub?schema=soundpub
\\\

## 🔐 Security Notes

### Schema Isolation
- **soundpub schema:** Protected by RLS on per-table basis
- **public.notifications:** Protected by RLS policies
- **auth schema:** Managed by Supabase (no direct access)

### Access Control
\\\sql
-- Check RLS status
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname IN ('public', 'soundpub')
ORDER BY schemaname, tablename;

-- Check policies
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname IN ('public', 'soundpub')
ORDER BY schemaname, tablename;
\\\

## 📖 Related Documentation

- [Main Index](../INDEX.md)
- [Migration Guide](./migrations/MIGRATION_GUIDE.md)
- [Notifications System](./migrations/notifications/README.md)
- [Local Migrations](./soundpub-local-migration/README.md)

## 📝 Notes for Developers

1. **Default Schema:** Most tables are in \soundpub\ schema
2. **Shared Utilities:** Use \public\ schema for cross-service features
3. **Connection:** Always use https://supabase.carubra.com for this instance
4. **Migration Path:** All migrations should be tested on this instance first

---

**Environment:** Supabase Local  
**Instance:** https://supabase.carubra.com  
**Database:** soundpub  
**Primary Schema:** soundpub  
**Last Updated:** 2026-07-22

