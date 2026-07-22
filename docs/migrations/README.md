# Database Migrations Documentation

## 📚 Overview

Dokumentasi lengkap untuk semua database migrations di SoundPub Dashboard, termasuk schema definitions, migration procedures, dan implementation guides.

## 🗂️ Directory Structure

\\\
docs/migrations/
├── README.md                              # This file - Main migrations index
├── MIGRATION_GUIDE.md                     # ⭐ Complete migration guide
│
├── notifications/                         # Notifications system
│   ├── README.md                          # Complete notifications docs
│   ├── IMPLEMENTATION.md                  # Code examples & integration
│   ├── QUICK_REFERENCE.md                 # Quick start guide
│   ├── CHECKLIST.md                       # Deployment checklist
│   ├── SUMMARY.md                         # Project summary
│   ├── DELIVERY.md                        # Delivery documentation
│   └── 20260722_create_notifications_table.sql
│
├── services/                              # Service-specific migrations
│   └── copyright-publishing/
│       ├── README.md
│       └── migrations/
│           └── 20260717090000_copyright_publishing_registration.sql
│
└── [future-features]/                     # Template for new features
\\\

## 🚀 Quick Start

### For New Developers

1. **Read the Migration Guide**
   \\\ash
   # Start here for complete understanding
   cat docs/migrations/MIGRATION_GUIDE.md
   \\\

2. **Setup Local Database**
   \\\ash
   # Apply base schema
   psql -U postgres -d soundpub -f docs/soundpub-local-migration/01-reset-and-recreate-soundpub.sql
   
   # Apply notifications migration
   psql -U postgres -d soundpub -f docs/migrations/notifications/20260722_create_notifications_table.sql
   \\\

3. **Verify Setup**
   \\\sql
   -- Check all schemas
   SELECT schema_name FROM information_schema.schemata;
   
   -- Check notifications table
   SELECT * FROM information_schema.tables WHERE table_name = 'notifications';
   \\\

### For Fixing Errors

**Error: relation "public.notifications" does not exist**
\\\ash
# Quick fix
cd docs/migrations/notifications
cat QUICK_REFERENCE.md
\\\

**Other database errors**
\\\ash
# Check migration guide
cat docs/migrations/MIGRATION_GUIDE.md
\\\

## 📋 Available Migrations

### Core Features

#### Notifications System
**Status:** ✅ Complete  
**Location:** \
otifications/\  
**Migration:** \20260722_create_notifications_table.sql\

**What it does:**
- Creates public.notifications table
- Enables Row Level Security (RLS)
- Adds 5 performance indexes
- Supports user-specific and global notifications
- Real-time capable

**Documentation:**
- [Complete Guide](./notifications/README.md)
- [Implementation](./notifications/IMPLEMENTATION.md)
- [Quick Reference](./notifications/QUICK_REFERENCE.md)

**Quick Apply:**
\\\ash
psql -U postgres -d soundpub -f docs/migrations/notifications/20260722_create_notifications_table.sql
\\\

---

### Service Migrations

#### Copyright Publishing
**Status:** ✅ Complete  
**Location:** \services/copyright-publishing/\  
**Migration:** \20260717090000_copyright_publishing_registration.sql\

**What it does:**
- Creates copyright registration tables
- Adds publishing workflow support
- Implements royalty tracking

**Quick Apply:**
\\\ash
psql -U postgres -d soundpub -f docs/migrations/services/copyright-publishing/migrations/20260717090000_copyright_publishing_registration.sql
\\\

---

## 🎯 Migration Guidelines

### Naming Convention

\\\
YYYYMMDDHHMMSS_description_of_change.sql

Examples:
✅ 20260722140000_create_notifications_table.sql
✅ 20260717090000_copyright_publishing_registration.sql
✅ 20260801120000_add_subscription_tiers.sql

❌ notifications.sql
❌ migration_v2.sql
❌ fix-bug.sql
\\\

### File Structure for New Feature

\\\
docs/migrations/[feature-name]/
├── README.md                              # Complete documentation
├── IMPLEMENTATION.md                      # Code examples (optional)
├── QUICK_REFERENCE.md                     # Quick start (optional)
└── YYYYMMDDHHMMSS_feature_name.sql       # Migration file
\\\

### Migration Template

\\\sql
-- =============================================
-- MIGRATION: [Feature Name]
-- Description: [Brief description]
-- Date: YYYY-MM-DD
-- Version: [version]
-- =============================================

-- Step 1: Create tables
CREATE TABLE IF NOT EXISTS [schema].[table_name] (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- columns here
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Step 2: Enable RLS
ALTER TABLE [schema].[table_name] ENABLE ROW LEVEL SECURITY;

-- Step 3: Create policies
CREATE POLICY "policy_name"
ON [schema].[table_name]
FOR SELECT
TO authenticated
USING (/* condition */);

-- Step 4: Create indexes
CREATE INDEX IF NOT EXISTS idx_name 
ON [schema].[table_name](column_name);

-- Step 5: Create triggers (if needed)
CREATE TRIGGER trigger_name
BEFORE INSERT ON [schema].[table_name]
FOR EACH ROW EXECUTE FUNCTION function_name();

-- =============================================
-- VERIFICATION
-- =============================================
-- SELECT * FROM information_schema.tables WHERE table_name = '[table_name]';

-- =============================================
-- ROLLBACK (if needed)
-- =============================================
-- DROP TABLE IF EXISTS [schema].[table_name] CASCADE;
\\\

## 📖 Documentation Standards

### Required Files

1. **Migration SQL File**
   - Idempotent (uses IF NOT EXISTS)
   - Well commented
   - Includes verification queries
   - Includes rollback instructions

2. **README.md**
   - Schema description
   - Column definitions
   - RLS policies explanation
   - Usage examples
   - Troubleshooting

3. **IMPLEMENTATION.md** (for complex features)
   - Type definitions
   - Code examples
   - Integration patterns
   - Testing examples

4. **QUICK_REFERENCE.md** (optional)
   - One-page reference
   - Common operations
   - Quick troubleshooting

### Documentation Template

\\\markdown
# [Feature Name]

## Overview
Brief description of the feature.

## Schema
Table structure and relationships.

## RLS Policies
Security policies explanation.

## Usage Examples
Common operations with code.

## Troubleshooting
Common issues and solutions.

## Related Files
Links to related documentation.
\\\

## 🔧 Common Operations

### Apply Migration

\\\ash
# Local PostgreSQL
psql -U postgres -d soundpub -f docs/migrations/[feature]/[migration-file].sql

# Supabase CLI
supabase db execute --file docs/migrations/[feature]/[migration-file].sql
\\\

### Verify Migration

\\\sql
-- Check table exists
SELECT table_name FROM information_schema.tables 
WHERE table_schema = '[schema]' AND table_name = '[table]';

-- Check columns
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_schema = '[schema]' AND table_name = '[table]';

-- Check RLS enabled
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = '[schema]' AND tablename = '[table]';

-- Check policies
SELECT policyname FROM pg_policies 
WHERE schemaname = '[schema]' AND tablename = '[table]';
\\\

### Rollback Migration

\\\sql
-- Careful! This is destructive
DROP TABLE IF EXISTS [schema].[table_name] CASCADE;
\\\

## 📊 Migration Status

| Feature | Status | Location | Last Updated |
|---------|--------|----------|--------------|
| Notifications | ✅ Complete | notifications/ | 2026-07-22 |
| Copyright Publishing | ✅ Complete | services/copyright-publishing/ | 2026-07-17 |
| Base Schema | ✅ Complete | ../soundpub-local-migration/ | 2026-07-12 |

## 🐛 Troubleshooting

### Common Issues

#### "relation does not exist"
**Cause:** Migration not applied  
**Fix:** Apply the migration file

#### "permission denied"
**Cause:** RLS policy blocking access  
**Fix:** Check policies, verify user authentication

#### "already exists"
**Cause:** Migration already applied  
**Fix:** Normal, migration is idempotent

### Getting Help

1. Check feature-specific README
2. Review MIGRATION_GUIDE.md
3. Check docs/INDEX.md
4. Contact development team

## 📚 Additional Resources

### Internal Documentation
- [Main Documentation Index](../INDEX.md)
- [Local Migrations Guide](../soundpub-local-migration/README.md)
- [Schema Documentation](../SCHEMA.md) (if exists)

### External Resources
- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [SQL Best Practices](https://www.sqlstyle.guide/)

## 🤝 Contributing

### Adding New Migration

1. **Create feature directory**
   \\\ash
   mkdir -p docs/migrations/[feature-name]
   \\\

2. **Write migration file**
   - Use naming convention
   - Follow template
   - Include comments

3. **Write documentation**
   - Create README.md
   - Add usage examples
   - Include troubleshooting

4. **Test locally**
   - Apply migration
   - Verify schema
   - Test queries

5. **Create PR**
   - Include all files
   - Update this README
   - Add to migration status table

### Documentation Checklist

- [ ] Migration file created with proper naming
- [ ] README.md with complete documentation
- [ ] Usage examples included
- [ ] Troubleshooting section added
- [ ] Tested locally
- [ ] Verified in staging
- [ ] Added to migration status table
- [ ] Updated MIGRATION_GUIDE.md if needed

## 📞 Support

### Quick Help
- **General migrations:** [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)
- **Notifications:** [notifications/README.md](./notifications/README.md)
- **Main index:** [../INDEX.md](../INDEX.md)

### Contact
- Development Team
- Database Administrator
- DevOps Team

---

**Last Updated:** 2026-07-22  
**Version:** 1.0.0  
**Maintained By:** SoundPub Development Team

