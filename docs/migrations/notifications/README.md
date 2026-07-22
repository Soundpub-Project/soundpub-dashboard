# Notifications System Documentation

## Overview
Notification system untuk SoundPub Dashboard yang mendukung notifikasi personal dan global announcements.

## Table Schema

### Table: public.notifications

`sql
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error', 'announcement')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    is_global BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
`

## Column Descriptions

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | gen_random_uuid() | Primary key |
| user_id | UUID | YES | NULL | Target user (NULL for global notifications) |
| 	ype | TEXT | NO | 'info' | Notification type: info, success, warning, error, announcement |
| 	itle | TEXT | NO | - | Notification title |
| message | TEXT | NO | - | Notification message content |
| is_read | BOOLEAN | NO | false | Read status |
| is_global | BOOLEAN | NO | false | Global announcement flag |
| metadata | JSONB | YES | '{}' | Additional data (JSON) |
| created_by | UUID | YES | NULL | Creator user ID (for admin-created notifications) |
| created_at | TIMESTAMPTZ | NO | now() | Creation timestamp |

## Notification Types

- **info**: Informational notifications (blue)
- **success**: Success messages (green)
- **warning**: Warning messages (yellow)
- **error**: Error messages (red)
- **announcement**: Global announcements (purple)

## Row Level Security (RLS)

### Policies

1. **Users can view own and global notifications**
   - Users can view notifications where user_id = auth.uid() OR is_global = true

2. **Users can update own notifications**
   - Users can update their own notifications (mark as read)

3. **System can insert notifications**
   - Authenticated users can insert notifications

4. **Admins can manage all notifications**
   - Admin and superadmin can manage all notifications

## Indexes

`sql
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX idx_notifications_is_global ON public.notifications(is_global);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX idx_notifications_type ON public.notifications(type);
`

## Usage Examples

### Frontend Integration

#### Fetch User Notifications
`	ypescript
const { data, error } = await supabase
  .from('notifications')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(20);
`

#### Mark Notification as Read
`	ypescript
const { error } = await supabase
  .from('notifications')
  .update({ is_read: true })
  .eq('id', notificationId);
`

#### Mark All as Read
`	ypescript
const { error } = await supabase
  .from('notifications')
  .update({ is_read: true })
  .eq('user_id', userId)
  .eq('is_read', false);
`

#### Create Personal Notification
`	ypescript
await supabase.from('notifications').insert({
  user_id: targetUserId,
  type: 'success',
  title: 'Payment Processed',
  message: 'Your payout request has been processed successfully.',
  metadata: { amount: 1000000, payment_id: 'xxx' }
});
`

#### Create Global Announcement
`	ypescript
await supabase.from('notifications').insert({
  is_global: true,
  type: 'announcement',
  title: 'System Maintenance',
  message: 'Scheduled maintenance on July 25, 2026.',
  created_by: adminUserId
});
`

### Backend Integration (Supabase Functions)

#### Trigger Notification on Event
`	ypescript
// Example: Send notification after payout approval
async function notifyPayoutApproval(userId: string, amount: number) {
  const { error } = await supabaseAdmin
    .from('notifications')
    .insert({
      user_id: userId,
      type: 'success',
      title: 'Payout Approved',
      message: \Your payout request of Rp \ has been approved.\,
      metadata: {
        amount,
        event: 'payout_approved',
        timestamp: new Date().toISOString()
      }
    });
  
  if (error) console.error('Failed to create notification:', error);
}
`

## Components

### NotificationBell
Located at: src/components/notifications/NotificationBell.tsx

**Features:**
- Real-time notification counter
- Dropdown list of recent notifications
- Mark as read functionality
- Navigate to notification center

### NotificationCenter
Located at: src/components/notifications/NotificationCenter.tsx

**Features:**
- Full list of notifications
- Filter by read/unread status
- Mark all as read
- Delete notifications (admin only)

### AnnouncementDialog
Located at: src/components/notifications/AnnouncementDialog.tsx

**Features:**
- Display global announcements
- Auto-show on new announcements
- Dismissible by users

## Migration

### Apply Migration
`ash
# Execute migration file in Supabase SQL Editor
psql -U postgres -d soundpub -f docs/migrations/notifications/20260722_create_notifications_table.sql
`

### Rollback (if needed)
`sql
DROP TABLE IF EXISTS public.notifications CASCADE;
`

## Best Practices

1. **Performance**
   - Use indexes for filtering (user_id, is_read, created_at)
   - Implement pagination for large notification lists
   - Archive old notifications periodically

2. **Security**
   - Always validate user permissions before creating notifications
   - Use RLS policies to restrict access
   - Sanitize notification content to prevent XSS

3. **User Experience**
   - Keep notification messages concise and actionable
   - Use appropriate notification types
   - Implement real-time updates using Supabase Realtime
   - Group similar notifications

4. **Metadata Usage**
   - Store additional context in metadata field
   - Use for action links, transaction IDs, etc.
   - Keep metadata structure consistent

## Real-time Subscriptions

`	ypescript
// Subscribe to new notifications
const subscription = supabase
  .channel('notifications')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: \user_id=eq.\\
    },
    (payload) => {
      console.log('New notification:', payload.new);
      // Update UI
    }
  )
  .subscribe();
`

## Monitoring

### Useful Queries

#### Count unread notifications per user
`sql
SELECT user_id, COUNT(*) as unread_count
FROM public.notifications
WHERE is_read = false
GROUP BY user_id
ORDER BY unread_count DESC;
`

#### Most common notification types
`sql
SELECT type, COUNT(*) as count
FROM public.notifications
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY type
ORDER BY count DESC;
`

#### Global announcements in last 7 days
`sql
SELECT *
FROM public.notifications
WHERE is_global = true
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
`

## Troubleshooting

### Error: relation "public.notifications" does not exist
**Solution:** Run the migration file to create the table.

### Permission Denied
**Solution:** Check RLS policies and ensure user is authenticated.

### Notifications not appearing in real-time
**Solution:** Verify Supabase Realtime is enabled for the notifications table.

## Future Enhancements

- [ ] Email notifications for critical events
- [ ] Push notifications (Web Push API)
- [ ] Notification preferences per user
- [ ] Notification templates
- [ ] Scheduled notifications
- [ ] Notification categories/tags
- [ ] Bulk notification management
- [ ] Notification analytics dashboard

## Related Files

- Migration: docs/migrations/notifications/20260722_create_notifications_table.sql
- Components: src/components/notifications/
- Types: src/types/ (if applicable)

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-07-22 | 1.0.0 | Initial notifications table creation |

