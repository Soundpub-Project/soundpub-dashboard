# Notifications System - Quick Reference

## 🚀 Quick Start

### 1. Apply Migration
\\\ash
psql -U postgres -d soundpub -f docs/migrations/notifications/20260722_create_notifications_table.sql
\\\

### 2. Verify Installation
\\\sql
-- Check table exists
SELECT * FROM information_schema.tables WHERE table_name = 'notifications';

-- Check RLS enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'notifications';

-- Check policies
SELECT policyname FROM pg_policies WHERE tablename = 'notifications';
\\\

### 3. Frontend Integration
\\\	ypescript
import { useNotifications } from '@/hooks/useNotifications';

const MyComponent = () => {
  const { notifications, stats, markAsRead } = useNotifications();
  
  return (
    <div>
      <p>Unread: {stats.unread}</p>
      {notifications.map(n => (
        <div key={n.id}>{n.message}</div>
      ))}
    </div>
  );
};
\\\

## 📋 Common Operations

### Fetch Notifications
\\\	ypescript
const { data } = await supabase
  .from('notifications')
  .select('*')
  .order('created_at', { ascending: false });
\\\

### Create Notification
\\\	ypescript
await supabase.from('notifications').insert({
  user_id: userId,
  type: 'success',
  title: 'Payment Processed',
  message: 'Your payment has been approved.'
});
\\\

### Mark as Read
\\\	ypescript
await supabase
  .from('notifications')
  .update({ is_read: true })
  .eq('id', notificationId);
\\\

### Delete Notification
\\\	ypescript
await supabase
  .from('notifications')
  .delete()
  .eq('id', notificationId);
\\\

## 🎨 Notification Types

| Type | Usage | Color |
|------|-------|-------|
| **info** | General information | Blue |
| **success** | Successful actions | Green |
| **warning** | Warnings, attention needed | Yellow |
| **error** | Errors, failures | Red |
| **announcement** | System-wide announcements | Purple |

## 📊 Table Schema (Short)

\\\sql
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY,
    user_id UUID,                    -- NULL for global
    type TEXT,                       -- info, success, warning, error, announcement
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    is_global BOOLEAN DEFAULT false,
    metadata JSONB,
    created_by UUID,
    created_at TIMESTAMPTZ
);
\\\

## 🔐 RLS Policies

1. **Users can view own and global notifications**
   - \user_id = auth.uid() OR is_global = true\

2. **Users can update own notifications**
   - \user_id = auth.uid()\

3. **System can insert notifications**
   - All authenticated users

4. **Admins can manage all**
   - Admin/Superadmin only

## 🔔 Components

### NotificationBell
- Bell icon with badge
- Dropdown with recent 5 notifications
- Mark as read on click
- Location: Header/Navbar

### NotificationCenter
- Full list of notifications
- Filter by read/unread
- Mark all as read
- Delete notifications
- Location: /notifications page

### AnnouncementDialog
- Auto-show global announcements
- Dismissible by user
- Remembers dismissed state

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| [README.md](./README.md) | Complete documentation |
| [IMPLEMENTATION.md](./IMPLEMENTATION.md) | Implementation guide |
| [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) | This file |
| [20260722_create_notifications_table.sql](./20260722_create_notifications_table.sql) | Migration file |

## 🐛 Troubleshooting

### Error: relation "public.notifications" does not exist
**Fix:** Run migration file

### Permission denied
**Fix:** Check RLS policies, ensure user is authenticated

### Real-time not working
**Fix:** Enable Realtime in Supabase Dashboard

## 📞 Support

- Full docs: [README.md](./README.md)
- Implementation: [IMPLEMENTATION.md](./IMPLEMENTATION.md)
- Migration guide: [../MIGRATION_GUIDE.md](../MIGRATION_GUIDE.md)
- Main index: [../../INDEX.md](../../INDEX.md)

---

**Last Updated:** 2026-07-22  
**Version:** 1.0.0

