# 📧 Email dan Notification System - Soundpub Dashboard

## Overview

Soundpub Dashboard menggunakan sistem notifikasi dual-channel:
1. **In-App Notifications** - Notifikasi real-time dalam dashboard (bell icon)
2. **Email Notifications** - Email otomatis via Gmail API

---

## 🏗️ Arsitektur Sistem

### 1. Database Schema

#### Table: `soundpub.notifications`
```sql
CREATE TABLE soundpub.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'info', -- 'info', 'success', 'warning', 'error', 'release', 'announcement', 'payout'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_global BOOLEAN NOT NULL DEFAULT false, -- true = broadcast ke semua user
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Features:**
- Mendukung notifikasi personal (per user) dan global (broadcast)
- Real-time updates via Supabase Realtime
- Metadata fleksibel untuk context tambahan

#### Table: `soundpub.email_send_log`
```sql
CREATE TABLE soundpub.email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_user_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL, -- 'sent', 'failed', 'suppressed'
  error_message TEXT,
  metadata JSONB,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Features:**
- Log semua email yang dikirim
- Idempotency untuk mencegah duplicate
- Status tracking untuk monitoring

#### Table: `soundpub.email_templates`
```sql
CREATE TABLE soundpub.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT UNIQUE NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Templates tersedia:**
- `copyright_registration_submitted`
- `copyright_payment_required`
- `copyright_revision_requested`
- `copyright_approved`
- `copyright_rejected`
- `copyright_contract_ready`
- `copyright_contract_active`

#### Email Preferences di `soundpub.profiles`
```sql
ALTER TABLE soundpub.profiles ADD COLUMN
  email_notif_payout BOOLEAN DEFAULT true,
  email_notif_release BOOLEAN DEFAULT true,
  email_notif_payment BOOLEAN DEFAULT true,
  email_notif_announcement BOOLEAN DEFAULT true;
```

---

## 📬 Email Sending System

### Edge Function: `send-app-email`

**Location:** `supabase/functions/send-app-email/index.ts`

**Authentication:** Gmail API via Lovable Connector Gateway

#### Email Templates Hardcoded:

1. **Payout Templates:**
   - `payout-requested` - Notifikasi ke admin saat ada pengajuan payout
   - `payout-approved` - Konfirmasi ke user saat payout disetujui
   - `payout-rejected` - Notifikasi ke user saat payout ditolak
   - `payout-paid` - Konfirmasi transfer dana ke user

2. **Release Templates:**
   - `release-approved` - Release disetujui admin
   - `release-rejected` - Release ditolak admin
   - `release-payment-confirmed` - Pembayaran release berhasil

3. **Announcement:**
   - `announcement` - Broadcast pengumuman ke semua user

#### Opt-in System

Email hanya dikirim jika user mengaktifkan preferensi:
- `email_notif_payout` → untuk email payout
- `email_notif_release` → untuk email release
- `email_notif_payment` → untuk email pembayaran
- `email_notif_announcement` → untuk pengumuman

**Suppression:** Jika user opt-out, email tidak dikirim dan dicatat sebagai `suppressed` di log.

#### Request Format:

```typescript
interface SendInput {
  templateName: string;
  templateData?: Record<string, any>;
  recipientUserId?: string;
  recipientEmail?: string;
  broadcastRoles?: string[]; // ['admin', 'superadmin', 'label', etc]
  idempotencyKey?: string;
}
```

#### Response:
```json
{
  "sent": 5,
  "suppressed": 2,
  "failed": 0
}
```

#### Environment Variables:
```bash
LOVABLE_API_KEY          # Managed by Lovable Cloud
GOOGLE_MAIL_API_KEY      # Gmail connector API key
```

**Sender:** `Soundpub <publishersoundpub@gmail.com>`

---

## 📨 Royalty Notification System

### Edge Function: `send-royalty-notification`

**Location:** `supabase/functions/send-royalty-notification/index.ts`

**Triggered by:** Admin setelah upload royalty berhasil

#### Features:
1. **Admin Notification** - Email ke semua admin dengan ringkasan upload
2. **Label Notification** - Email ke label yang terpengaruh dengan detail balance update

#### Payload:
```typescript
interface NotificationPayload {
  uploadId: string;
  uploadedBy: string;
  totalRows: number;
  insertedCount: number;
  totalRevenue: number;
  affectedLabels: string[];
  balanceUpdates: {
    label: string;
    balance_added: number;
    label_revenue_added: number;
    artist_revenue_added: number;
    success: boolean;
  }[];
}
```

---

## 🔔 In-App Notification System

### Frontend Components

#### 1. NotificationBell Component
**Location:** `src/components/notifications/NotificationBell.tsx`

**Features:**
- Bell icon dengan badge unread count
- Popover dropdown dengan list notifikasi
- Real-time updates via Supabase subscription
- Mark as read functionality
- "Mark all as read" batch action

**Real-time Subscription:**
```typescript
const channel = supabase
  .channel('notifications-realtime')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
  }, (payload) => {
    // Handle new notification
  })
  .subscribe();
```

#### 2. NotificationCenter Component
**Location:** `src/components/notifications/NotificationCenter.tsx`

Alternative notification center dengan UI berbeda (legacy/backup).

#### 3. AnnouncementDialog Component
**Location:** `src/components/notifications/AnnouncementDialog.tsx`

**Features:**
- Admin-only dialog untuk kirim pengumuman global
- Toggle untuk kirim via email juga
- Memanggil edge function `send-app-email` dengan `broadcastRoles`

**Usage:**
```tsx
<AnnouncementDialog 
  open={open} 
  onOpenChange={setOpen} 
/>
```

#### 4. EmailNotificationSettings Component
**Location:** `src/components/settings/EmailNotificationSettings.tsx`

**Features:**
- User preferences untuk opt-in/opt-out email notifications
- 4 kategori: Payout, Release, Payment, Announcement
- Auto-save ke database

---

## 🔧 Notification Management (Admin)

### Page: NotificationManagement
**Location:** `src/pages/NotificationManagement.tsx`

**Features:**
- View semua notifikasi (global & personal)
- Filter: All, Global, Personal
- Search by title/message
- Edit notification (title & message)
- Delete notification
- Badge type: success, warning, error, release, announcement, info, payout

**Access:** Admin only

---

## 🎯 Use Cases & Implementation

### 1. Payout Workflow

#### User Request Payout:
```typescript
// src/pages/Payouts.tsx
await supabase.from('notifications').insert(notifs);

supabase.functions.invoke('send-app-email', {
  body: {
    templateName: 'payout-requested',
    broadcastRoles: ['superadmin', 'admin'],
    templateData: { userName, amount, bankName, accountNumber },
    idempotencyKey: `payout-req-${payoutId}`,
  },
});
```

#### Admin Approve/Reject:
```typescript
// src/pages/AdminPayouts.tsx
await supabase.from('notifications').insert({
  user_id: selectedPayout.user_id,
  type: notifType,
  title: `Payout ${statusLabel}`,
  message: notifMessage,
  metadata: { payout_id, amount },
});

const tplMap = {
  approve: 'payout-approved',
  reject: 'payout-rejected',
  pay: 'payout-paid',
} as const;

supabase.functions.invoke('send-app-email', {
  body: {
    templateName: tplMap[actionType],
    recipientUserId: selectedPayout.user_id,
    templateData: { amount, bankName },
    idempotencyKey: `payout-${actionType}-${payoutId}`,
  },
});
```

### 2. Copyright Registration Workflow

**Function:** `soundpub.notify_copyright_event()`

**Events:**
- `submitted` → `copyright_registration_submitted`
- `payment_required` → `copyright_payment_required`
- `revision_requested` → `copyright_revision_requested`
- `approved` → `copyright_approved`
- `rejected` → `copyright_rejected`
- `contract_ready` → `copyright_contract_ready`
- `contract_active` → `copyright_contract_active`

**Triggered by:** Admin actions in copyright review workflow

### 3. Royalty Upload

**Trigger:** Admin upload CSV royalty

```typescript
await supabase.functions.invoke('send-royalty-notification', {
  body: {
    uploadId,
    uploadedBy: user.email,
    totalRows,
    insertedCount,
    totalRevenue,
    affectedLabels,
    balanceUpdates,
  },
});
```

### 4. Announcement Broadcast

```typescript
await supabase.from('notifications').insert({
  user_id: user?.id,
  type: 'announcement',
  title,
  message,
  is_global: true,
  created_by: user?.id,
  metadata: { send_email: sendEmail },
});

if (sendEmail) {
  await supabase.functions.invoke('send-app-email', {
    body: {
      templateName: 'announcement',
      broadcastRoles: ['superadmin', 'admin', 'label', 'whitelabel', 'artist', 'copyright'],
      templateData: { title, message },
      idempotencyKey: `announcement-${Date.now()}`,
    },
  });
}
```

---

## 🔐 Security & Permissions

### RLS Policies

#### `notifications` table:
```sql
-- Users can view own and global notifications
CREATE POLICY "Users can view own and global notifications"
  ON soundpub.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_global = true);

-- Users can update own notifications (mark read)
CREATE POLICY "Users can update own notifications"
  ON soundpub.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR is_global = true);

-- Admins can manage all notifications
CREATE POLICY "Admins can manage all notifications"
  ON soundpub.notifications FOR ALL
  TO authenticated
  USING (soundpub.is_admin(auth.uid()));
```

### Edge Function Security:
- Authorization header required
- Admin check for broadcast/management actions
- Idempotency key untuk prevent duplicate sends

---

## 📊 Monitoring & Logging

### Email Send Log
Query email status:
```sql
SELECT 
  template_name,
  recipient_email,
  status,
  error_message,
  created_at
FROM soundpub.email_send_log
WHERE status = 'failed'
ORDER BY created_at DESC;
```

### Notification Stats
```sql
-- Unread notifications per user
SELECT 
  user_id,
  COUNT(*) as unread_count
FROM soundpub.notifications
WHERE is_read = false
GROUP BY user_id;

-- Global notifications
SELECT * 
FROM soundpub.notifications 
WHERE is_global = true 
ORDER BY created_at DESC;
```

---

## 🚀 Deployment Notes

### Lovable Cloud:
- `LOVABLE_API_KEY` dan `GOOGLE_MAIL_API_KEY` managed otomatis
- Gmail connector sudah linked
- Realtime enabled by default

### Self-Hosted (VPS):
1. Setup SMTP alternatif (bukan Gmail API)
2. Modify `send-app-email` function untuk gunakan SMTP
3. Set environment variables di Supabase CLI:
   ```bash
   supabase secrets set SMTP_HOST=smtp.gmail.com
   supabase secrets set SMTP_PORT=587
   supabase secrets set SMTP_USER=your-email
   supabase secrets set SMTP_PASS=your-app-password
   ```

---

## 🎨 UI/UX Flow

### User Journey:

1. **User Login** → NotificationBell muncul di navbar
2. **New Event** → Real-time notification masuk + email (jika opt-in)
3. **User Click Bell** → Popover shows notifications
4. **User Click Notification** → Mark as read otomatis
5. **User Settings** → Email preferences dapat diatur

### Admin Journey:

1. **Admin Dashboard** → "Notification Management" menu
2. **View All Notifications** → List dengan filter & search
3. **Send Announcement** → Dialog dengan toggle email
4. **Manage Actions** → Edit/Delete notifications

---

## 📝 Best Practices

### 1. Idempotency
Selalu gunakan `idempotencyKey` untuk prevent duplicate:
```typescript
idempotencyKey: `event-${entityId}-${timestamp}`
```

### 2. Error Handling
```typescript
try {
  await supabase.functions.invoke('send-app-email', { ... });
} catch (error) {
  console.error('Email failed:', error);
  // Fallback: still show in-app notification
}
```

### 3. User Experience
- In-app notification ALWAYS shown (tidak tergantung email pref)
- Email hanya supplement, bukan primary channel
- Toast notification untuk immediate feedback

### 4. Performance
- Batch notifications untuk broadcast
- 300ms throttle antar email sends
- Limit notifications query (max 50-200 rows)

---

## 🔍 Troubleshooting

### Email tidak terkirim?
1. Check `email_send_log` table untuk status
2. Verify user email preferences (opt-in)
3. Check `GOOGLE_MAIL_API_KEY` di Supabase secrets
4. Verify Gmail API quota

### Notification tidak real-time?
1. Check Supabase Realtime enabled
2. Verify publication: `supabase_realtime` include `notifications`
3. Check client subscription code

### Duplicate emails?
1. Verify `idempotencyKey` unique per event
2. Check `email_send_log` untuk duplicate keys

---

## 📚 Related Files

### Frontend:
- `src/components/notifications/NotificationBell.tsx`
- `src/components/notifications/NotificationCenter.tsx`
- `src/components/notifications/AnnouncementDialog.tsx`
- `src/components/settings/EmailNotificationSettings.tsx`
- `src/pages/NotificationManagement.tsx`

### Backend:
- `supabase/functions/send-app-email/index.ts`
- `supabase/functions/send-royalty-notification/index.ts`
- `supabase/migrations/20260407223310_*_notifications.sql`
- `supabase/migrations/20260721233430_copyright_notifications.sql`

### Types:
- `src/integrations/supabase/types.ts` (generated)

---

## 🔄 Future Enhancements

1. **Push Notifications** - Web Push API untuk browser notifications
2. **SMS Notifications** - Via Twilio untuk critical alerts
3. **Notification Categories** - More granular control (e.g., marketing vs transactional)
4. **Rich Notifications** - Support images, actions, deep links
5. **Notification History** - Archive & search old notifications
6. **A/B Testing** - Test email templates effectiveness
7. **Analytics Dashboard** - Open rates, click rates, engagement metrics

---

## 📞 Support

Untuk pertanyaan atau issue terkait notification system:
- Check logs di `email_send_log` table
- Review error messages di Supabase Functions logs
- Contact: Tim Backend Soundpub

---

**Last Updated:** 2026-07-22
**Version:** 1.0
**Maintainer:** Soundpub Dev Team
