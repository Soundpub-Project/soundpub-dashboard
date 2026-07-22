# Notifications Implementation Guide

## Overview
Panduan lengkap implementasi notifications system di SoundPub Dashboard.

## Prerequisites

1. **Database Setup**
   - PostgreSQL dengan Supabase
   - Migration sudah applied: 20260722_create_notifications_table.sql
   - RLS policies aktif

2. **Frontend Setup**
   - React dengan TypeScript
   - Supabase client library
   - Components di \src/components/notifications/\

3. **Permissions**
   - User sudah authenticated
   - Have necessary RLS permissions

## File Structure

\\\
src/
├── components/
│   └── notifications/
│       ├── NotificationBell.tsx          # Bell icon + dropdown
│       ├── NotificationCenter.tsx        # Full notification view
│       ├── AnnouncementDialog.tsx        # Global announcements
│       ├── NotificationItem.tsx          # Individual notification card
│       └── NotificationProvider.tsx      # Context provider (optional)
├── hooks/
│   └── useNotifications.ts               # Notification logic hook
├── types/
│   └── notifications.ts                  # Type definitions
├── utils/
│   └── notificationUtils.ts              # Helper functions
└── pages/
    └── NotificationManagement.tsx        # Admin notifications page
\\\

## Type Definitions

Create \src/types/notifications.ts\:

\\\	ypescript
export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'announcement';

export interface Notification {
  id: string;
  user_id: string | null;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  is_global: boolean;
  metadata?: Record<string, any>;
  created_by?: string;
  created_at: string;
}

export interface NotificationInput {
  user_id?: string | null;
  type?: NotificationType;
  title: string;
  message: string;
  is_read?: boolean;
  is_global?: boolean;
  metadata?: Record<string, any>;
  created_by?: string;
}

export interface NotificationFilter {
  is_read?: boolean;
  type?: NotificationType;
  is_global?: boolean;
}

export interface NotificationStats {
  total: number;
  unread: number;
  by_type: Record<NotificationType, number>;
}
\\\

## Hooks

Create \src/hooks/useNotifications.ts\:

\\\	ypescript
import { useEffect, useState, useCallback } from 'react';
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Notification, NotificationInput, NotificationFilter, NotificationStats } from '@/types/notifications';

export const useNotifications = () => {
  const supabase = useSupabaseClient();
  const user = useUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [stats, setStats] = useState<NotificationStats>({ total: 0, unread: 0, by_type: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  let subscription: RealtimeChannel | null = null;

  // Fetch notifications
  const fetchNotifications = useCallback(async (filter?: NotificationFilter) => {
    if (!user?.id) return;

    try {
      setLoading(true);
      let query = supabase
        .from('notifications')
        .select('*')
        .or(\user_id.eq.\,is_global.eq.true\)
        .order('created_at', { ascending: false });

      if (filter?.is_read !== undefined) {
        query = query.eq('is_read', filter.is_read);
      }
      if (filter?.type) {
        query = query.eq('type', filter.type);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      setNotifications(data || []);
      calculateStats(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch notifications');
    } finally {
      setLoading(false);
    }
  }, [user?.id, supabase]);

  // Calculate statistics
  const calculateStats = (notifs: Notification[]) => {
    const stats: NotificationStats = { total: notifs.length, unread: 0, by_type: {} };
    
    notifs.forEach(notif => {
      if (!notif.is_read) stats.unread++;
      if (!stats.by_type[notif.type]) stats.by_type[notif.type] = 0;
      stats.by_type[notif.type]++;
    });

    setStats(stats);
  };

  // Mark as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as read');
    }
  }, [supabase]);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark all as read');
    }
  }, [user?.id, supabase]);

  // Create notification
  const createNotification = useCallback(async (input: NotificationInput) => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert({
          ...input,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create notification');
      throw err;
    }
  }, [user?.id, supabase]);

  // Delete notification
  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete notification');
    }
  }, [supabase]);

  // Setup real-time subscription
  useEffect(() => {
    if (!user?.id) return;

    fetchNotifications();

    // Subscribe to new notifications
    subscription = supabase
      .channel('notifications-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: \user_id=eq.\\,
        },
        (payload) => {
          setNotifications(prev => [payload.new as Notification, ...prev]);
          calculateStats([payload.new as Notification, ...notifications]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: \user_id=eq.\\,
        },
        (payload) => {
          setNotifications(prev =>
            prev.map(n => n.id === payload.new.id ? payload.new : n)
          );
        }
      )
      .subscribe();

    return () => {
      if (subscription) {
        supabase.removeChannel(subscription);
      }
    };
  }, [user?.id, supabase, fetchNotifications]);

  return {
    notifications,
    stats,
    loading,
    error,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    createNotification,
    deleteNotification,
  };
};
\\\

## Component: NotificationBell

Create \src/components/notifications/NotificationBell.tsx\:

\\\	ypescript
import React, { useState, useRef, useEffect } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { Notification } from '@/types/notifications';
import { Bell, X } from 'lucide-react';

export const NotificationBell: React.FC = () => {
  const { notifications, stats, markAsRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadNotifications = notifications.filter(n => !n.is_read).slice(0, 5);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className="relative">
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
        aria-label="Notifications"
      >
        <Bell size={24} />
        {stats.unread > 0 && (
          <span className="absolute top-1 right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
            {stats.unread > 9 ? '9+' : stats.unread}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg z-50">
          <div className="p-4 border-b dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Notifications
            </h3>
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {unreadNotifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No notifications yet
              </div>
            ) : (
              unreadNotifications.map(notification => (
                <div
                  key={notification.id}
                  className="p-3 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition"
                  onClick={() => {
                    markAsRead(notification.id);
                  }}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 dark:text-white text-sm">
                        {notification.title}
                      </p>
                      <p className="text-gray-600 dark:text-gray-400 text-xs mt-1">
                        {notification.message}
                      </p>
                      <p className="text-gray-500 text-xs mt-2">
                        {new Date(notification.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div
                      className={\w-2 h-2 rounded-full mt-1 flex-shrink-0 \\}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t dark:border-gray-700">
            <a
              href="/notifications"
              className="text-blue-600 dark:text-blue-400 text-sm font-semibold hover:underline"
            >
              View All Notifications
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
\\\

## Component: NotificationCenter

Create \src/components/notifications/NotificationCenter.tsx\:

\\\	ypescript
import React, { useState } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { NotificationType } from '@/types/notifications';
import { Trash2, CheckCircle2 } from 'lucide-react';

export const NotificationCenter: React.FC = () => {
  const { notifications, stats, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.is_read)
    : notifications;

  const getTypeColor = (type: NotificationType) => {
    const colors = {
      info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      announcement: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    };
    return colors[type];
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Notifications
        </h1>
        {stats.unread > 0 && (
          <button
            onClick={markAllAsRead}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2"
          >
            <CheckCircle2 size={16} />
            Mark all as read
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Total</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Unread</p>
          <p className="text-2xl font-bold text-red-600">{stats.unread}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Success</p>
          <p className="text-2xl font-bold text-green-600">{stats.by_type.success || 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Errors</p>
          <p className="text-2xl font-bold text-red-600">{stats.by_type.error || 0}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={\px-4 py-2 rounded-lg font-semibold transition \\}
        >
          All ({stats.total})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={\px-4 py-2 rounded-lg font-semibold transition \\}
        >
          Unread ({stats.unread})
        </button>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filteredNotifications.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">No notifications</p>
          </div>
        ) : (
          filteredNotifications.map(notification => (
            <div
              key={notification.id}
              className="bg-white dark:bg-gray-800 rounded-lg p-4 border-l-4 border-gray-300 hover:shadow-md transition"
              style={{
                borderLeftColor: notification.type === 'error' ? '#ef4444' :
                                 notification.type === 'success' ? '#22c55e' :
                                 notification.type === 'warning' ? '#eab308' :
                                 notification.type === 'announcement' ? '#a855f7' :
                                 '#3b82f6'
              }}
            >
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={\px-2 py-1 rounded text-xs font-semibold \\}>
                      {notification.type.toUpperCase()}
                    </span>
                    {!notification.is_read && (
                      <span className="inline-block w-2 h-2 bg-blue-600 rounded-full"></span>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {notification.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mt-2">
                    {notification.message}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-3">
                    {new Date(notification.created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => deleteNotification(notification.id)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition"
                  title="Delete notification"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
\\\

## Creating Notifications in Code

### Personal Notification
\\\	ypescript
// In any component
const { createNotification } = useNotifications();

await createNotification({
  user_id: targetUserId,
  type: 'success',
  title: 'Payment Processed',
  message: 'Your payout has been approved and will be transferred soon.',
  metadata: {
    amount: 1000000,
    payment_id: 'pay_123',
    currency: 'IDR'
  }
});
\\\

### Global Announcement (Admin Only)
\\\	ypescript
const { createNotification } = useNotifications();

await createNotification({
  is_global: true,
  type: 'announcement',
  title: 'System Maintenance',
  message: 'We will perform scheduled maintenance on July 25, 2026 at 2:00 AM UTC.',
  metadata: {
    duration_minutes: 30,
    impact: 'all_users'
  }
});
\\\

## Integration Examples

### After Payout Approval
\\\	ypescript
// In payout approval handler
const approvePayout = async (payoutId: string) => {
  // Update payout status
  await updatePayoutStatus(payoutId, 'approved');

  // Notify user
  const payout = await getPayoutDetails(payoutId);
  await createNotification({
    user_id: payout.user_id,
    type: 'success',
    title: 'Payout Approved',
    message: \Your payout request of Rp \ has been approved.\,
    metadata: {
      payout_id: payoutId,
      amount: payout.amount,
      event: 'payout_approved'
    }
  });
};
\\\

### After Release Upload
\\\	ypescript
// In release upload handler
const onReleaseUploaded = async (release: Release) => {
  await createNotification({
    user_id: release.created_by,
    type: 'info',
    title: 'Release Pending Review',
    message: \Your release "\" has been uploaded and is pending admin review.\,
    metadata: {
      release_id: release.id,
      status: 'pending',
      event: 'release_uploaded'
    }
  });
};
\\\

### Error Handling
\\\	ypescript
// In error handler
const handleError = async (userId: string, error: Error) => {
  await createNotification({
    user_id: userId,
    type: 'error',
    title: 'Action Failed',
    message: error.message,
    metadata: {
      error_code: error.name,
      timestamp: new Date().toISOString()
    }
  });
};
\\\

## Best Practices

1. **Keep Messages Concise**
   - Title: max 50 characters
   - Message: max 200 characters

2. **Use Appropriate Types**
   - success: positive actions completed
   - error: problems or failures
   - warning: attention needed
   - info: informational
   - announcement: system-wide

3. **Add Metadata**
   - Store IDs for linking
   - Include amounts for financial notifications
   - Add timestamps for audit trail

4. **Real-time Updates**
   - Use subscription for instant notifications
   - Update count immediately
   - Show toast for urgent items

5. **Performance**
   - Paginate large lists
   - Archive old notifications (monthly)
   - Use indexes for filtering

## Testing

\\\	ypescript
// Test creating notification
test('create personal notification', async () => {
  const { createNotification } = useNotifications();
  
  const result = await createNotification({
    user_id: 'test-user-id',
    type: 'success',
    title: 'Test Notification',
    message: 'This is a test'
  });

  expect(result.id).toBeDefined();
  expect(result.title).toBe('Test Notification');
});

// Test filtering
test('filter unread notifications', () => {
  const { notifications } = useNotifications();
  
  const unread = notifications.filter(n => !n.is_read);
  expect(unread.length).toBeGreaterThanOrEqual(0);
});
\\\

## Migration Checklist

- [ ] Run migration: \20260722_create_notifications_table.sql\
- [ ] Create type definitions
- [ ] Create useNotifications hook
- [ ] Create NotificationBell component
- [ ] Create NotificationCenter component
- [ ] Add NotificationBell to header
- [ ] Update pages to use notifications
- [ ] Add notification creation on key events
- [ ] Test in development
- [ ] Deploy to staging
- [ ] Test real-time subscriptions
- [ ] Deploy to production

