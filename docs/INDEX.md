# SoundPub Database Documentation Index

## Overview
Dokumentasi lengkap database schema, migrations, dan best practices untuk SoundPub Dashboard.

## 📚 Documentation Structure

\\\
docs/
├── migrations/                          # Main migrations documentation
│   ├── MIGRATION_GUIDE.md              # ⭐ Migration guide & best practices
│   ├── notifications/                   # Notifications system
│   │   ├── README.md                   # Notifications documentation
│   │   └── 20260722_create_notifications_table.sql
│   ├── services/                        # Service-specific migrations
│   │   └── copyright-publishing/
│   │       ├── README.md
│   │       └── migrations/
│   └── soundpub-local-migration/       # Local dev migrations
│       ├── README.md                   # ⭐ Local migration guide
│       ├── 00-HARDRESET-SOUNDPUB-LOCAL.sql
│       ├── 01-reset-and-recreate-soundpub.sql
│       ├── 02-initial-seed.sql
│       └── ... (15 migration files)
├── full-schema-v2.sql                  # Schema snapshots
├── full-schema-v3.sql
└── INDEX.md                            # This file
\\\

## 🚀 Quick Start

### New Developer Setup

1. **Read Migration Guide**
   - [MIGRATION_GUIDE.md](./migrations/MIGRATION_GUIDE.md)
   - Understand migration concepts and workflow

2. **Setup Local Database**
   `ash
   # Clone repository
   git clone <repository-url>
   cd soundpub-dashboard

   # Start Supabase local
   supabase start

   # Run migrations
   cd docs/soundpub-local-migration
   psql -U postgres -d soundpub -f 01-reset-and-recreate-soundpub.sql
   psql -U postgres -d soundpub -f 02-initial-seed.sql

   # Apply notifications migration
   cd ../migrations/notifications
   psql -U postgres -d soundpub -f 20260722_create_notifications_table.sql
   `

3. **Verify Setup**
   `sql
   -- Check schemas
   SELECT schema_name FROM information_schema.schemata;

   -- Check tables in soundpub
   SELECT table_name FROM information_schema.tables WHERE table_schema = 'soundpub';

   -- Check tables in public
   SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
   `

### Adding New Feature

1. **Plan migration**
   - Identify tables/changes needed
   - Check dependencies
   - Review existing patterns

2. **Create migration file**
   `ash
   # Use timestamp naming
   YYYYMMDDHHMMSS_feature_name.sql
   
   # Example
   20260722140000_add_subscription_tiers.sql
   `

3. **Write migration**
   - Follow template in MIGRATION_GUIDE.md
   - Include comments
   - Add RLS policies
   - Create indexes

4. **Document feature**
   - Create README.md in feature folder
   - Document schema
   - Add usage examples
   - Include troubleshooting

## 📖 Documentation Files

### Core Guides

#### [MIGRATION_GUIDE.md](./migrations/MIGRATION_GUIDE.md)
**Comprehensive migration documentation**
- Migration concepts
- Naming conventions
- Writing migrations
- Best practices
- Troubleshooting

**Read this first!**

---

#### [soundpub-local-migration/README.md](./soundpub-local-migration/README.md)
**Local development migrations**
- 15 migration files explained
- Execution order
- Troubleshooting local setup
- Development workflow

**For local development setup**

---

### Feature Documentation

#### [notifications/README.md](./migrations/notifications/README.md)
**Notifications system complete guide**
- Schema definition
- RLS policies
- Frontend integration
- Usage examples
- Real-time subscriptions
- Troubleshooting

**Reference:** docs/migrations/notifications/20260722_create_notifications_table.sql

---

#### [services/copyright-publishing/README.md](./migrations/services/copyright-publishing/README.md)
**Copyright publishing service**
- Registration system
- Schema structure
- Integration guide

**Reference:** docs/services/copyright-publishing/migrations/20260717090000_copyright_publishing_registration.sql

---

## 🗄️ Database Schemas

### Schema Organization

`
┌─────────────────────────────────────────┐
│ auth (Supabase Managed)                 │
├─────────────────────────────────────────┤
│ - users                                 │
│ - sessions                              │
│ - refresh_tokens                        │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ public (Shared Services)                │
├─────────────────────────────────────────┤
│ - notifications ⭐                      │
│ - email_send_log                        │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ soundpub (Core Business Logic)          │
├─────────────────────────────────────────┤
│ - user_roles                            │
│ - profiles                              │
│ - releases                              │
│ - tracks                                │
│ - royalties                             │
│ - payout_requests                       │
│ - royalty_uploads                       │
│ - artist_profiles                       │
│ - artists                               │
│ - composer_royalties                    │
│ - release_payments                      │
│ - audit_logs                            │
│ - app_settings                          │
│ - storage_backup_log                    │
│ - storage_backup_runs                   │
│ + 10 more tables...                     │
└─────────────────────────────────────────┘
`

### Key Tables

#### User Management
- soundpub.user_roles - User role assignments
- soundpub.profiles - User profiles and balances
- soundpub.artist_profiles - Artist-specific data

#### Content Management
- soundpub.releases - Music releases
- soundpub.tracks - Individual tracks
- soundpub.artists - Artist registry

#### Financial
- soundpub.royalties - Royalty records
- soundpub.royalty_uploads - Bulk uploads
- soundpub.payout_requests - Withdrawal requests
- soundpub.composer_royalties - Composer earnings

#### System
- public.notifications - User notifications
- soundpub.audit_logs - Activity tracking
- soundpub.email_send_log - Email tracking

## 🔐 Security (RLS)

All tables use Row Level Security (RLS):

### Common Patterns

**User-owned data:**
`sql
CREATE POLICY "Users can view own data"
ON table_name FOR SELECT
TO authenticated
USING (user_id = auth.uid());
`

**Admin access:**
`sql
CREATE POLICY "Admins can manage all"
ON table_name FOR ALL
TO authenticated
USING (soundpub.is_admin(auth.uid()));
`

**Global visibility:**
`sql
CREATE POLICY "Public read access"
ON table_name FOR SELECT
TO authenticated
USING (is_global = true OR user_id = auth.uid());
`

## 🔍 Common Queries

### User Information
`sql
-- Get user with roles
SELECT 
    p.*,
    array_agg(ur.role) as roles
FROM soundpub.profiles p
LEFT JOIN soundpub.user_roles ur ON p.id = ur.user_id
WHERE p.id = '<user-id>'
GROUP BY p.id;
`

### Royalty Summary
`sql
-- User royalty summary
SELECT 
    SUM(artist_revenue) as total_artist_revenue,
    SUM(pendapatan_label_artis) as total_label_revenue,
    COUNT(*) as total_records
FROM soundpub.royalties
WHERE upload_id IN (
    SELECT id FROM soundpub.royalty_uploads WHERE user_id = '<user-id>'
);
`

### Notifications
`sql
-- Unread notifications count
SELECT COUNT(*) 
FROM public.notifications
WHERE user_id = '<user-id>' AND is_read = false;

-- Recent notifications
SELECT *
FROM public.notifications
WHERE user_id = '<user-id>' OR is_global = true
ORDER BY created_at DESC
LIMIT 10;
`

## 🛠️ Maintenance

### Backup Database
`ash
# Full backup
pg_dump -U postgres soundpub > backup_full.sql

# Schema only
pg_dump -U postgres --schema-only soundpub > backup_schema.sql

# Data only
pg_dump -U postgres --data-only soundpub > backup_data.sql
`

### Monitor Performance
`sql
-- Table sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname IN ('public', 'soundpub')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Active queries
SELECT pid, usename, state, query, now() - query_start as duration
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;

-- Slow queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
`

## 📝 Change Log

### Recent Changes

**2026-07-22**
- ✅ Created notifications migration for public schema
- ✅ Added comprehensive notifications documentation
- ✅ Created migration guide
- ✅ Added local migration documentation
- ✅ Created documentation index

**2026-07-18**
- ✅ Added copyright publishing service migration

**2026-07-12**
- ✅ Reconcile user roles from CSV (migration 10)
- ✅ Reset profile balances (migration 14)

**2026-07-11**
- ✅ Complete soundpub schema setup
- ✅ Added 9 incremental migrations
- ✅ Setup RLS policies and permissions

## 🐛 Troubleshooting

### Common Issues

#### Error: relation "public.notifications" does not exist
**Cause:** Migration not applied

**Solution:**
`ash
psql -U postgres -d soundpub -f docs/migrations/notifications/20260722_create_notifications_table.sql
`

#### Error: permission denied for schema soundpub
**Cause:** Missing permissions setup

**Solution:**
`ash
psql -U postgres -d soundpub -f docs/soundpub-local-migration/04-runtime-permissions-and-rpc.sql
`

#### Error: duplicate key value violates unique constraint
**Cause:** Attempting to insert existing data

**Solution:**
- Use ON CONFLICT clause
- Check existing data first
- Use UPDATE instead of INSERT

#### RLS blocking access
**Cause:** Policy not matching user context

**Solution:**
`sql
-- Check active policies
SELECT * FROM pg_policies WHERE tablename = 'your_table';

-- Test as specific user
SET LOCAL ROLE authenticated;
SET request.jwt.claim.sub = '<user-id>';
-- Run your query
`

### Getting Help

1. **Check documentation**
   - MIGRATION_GUIDE.md
   - Feature-specific README files
   - This INDEX.md

2. **Check existing migrations**
   - Look for similar patterns
   - Review RLS policies
   - Check function definitions

3. **Verify database state**
   `sql
   -- Check table exists
   SELECT * FROM information_schema.tables 
   WHERE table_name = 'your_table';
   
   -- Check columns
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'your_table';
   
   -- Check constraints
   SELECT * FROM information_schema.table_constraints 
   WHERE table_name = 'your_table';
   `

4. **Contact team**
   - Development team
   - Database administrator
   - DevOps team

## 🎯 Next Steps

### For Developers

- [ ] Read MIGRATION_GUIDE.md
- [ ] Setup local database
- [ ] Run all migrations
- [ ] Verify setup
- [ ] Test application locally

### For DBAs

- [ ] Review all migrations
- [ ] Setup monitoring
- [ ] Configure backups
- [ ] Document production deployment process
- [ ] Create rollback procedures

### For DevOps

- [ ] Setup CI/CD for migrations
- [ ] Configure automated backups
- [ ] Setup monitoring alerts
- [ ] Document disaster recovery
- [ ] Create staging environment

## 📚 Additional Resources

### Internal
- [Full Schema v3](./full-schema-v3.sql) - Latest complete schema
- [Full Schema v2](./full-schema-v2.sql) - Previous schema version
- Service migrations in docs/migrations/services/

### External
- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [SQL Best Practices](https://www.sqlstyle.guide/)

## 🤝 Contributing

### Adding New Migration

1. Follow naming convention
2. Use migration template
3. Test locally
4. Document changes
5. Create PR with:
   - Migration file
   - README update
   - Changelog entry

### Updating Documentation

1. Keep documentation in sync with code
2. Add examples for complex features
3. Update troubleshooting section
4. Keep changelog current

---

**Last Updated:** 2026-07-22  
**Version:** 1.0.0  
**Maintainer:** SoundPub Development Team

