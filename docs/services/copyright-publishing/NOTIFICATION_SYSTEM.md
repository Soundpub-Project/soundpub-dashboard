# Notification & Email System Documentation

## Overview

Sistem notifikasi dan email terintegrasi untuk fitur Copyright Publishing Service.

## Database Schema

### Table: email_templates
Template email yang dapat dikonfigurasi dengan variabel dinamis.

**Columns:**
- id - UUID primary key
- 	emplate_key - Unique identifier untuk template (e.g., 'copyright_approved')
- subject - Subject email dengan variabel {{variable}}
- ody_html - HTML body dengan variabel
- ody_text - Plain text alternative
- ariables - Array JSON dari variabel yang digunakan
- description - Deskripsi template
- is_active - Status aktif/non-aktif
- created_at, updated_at - Timestamps

### Existing Table: 
otifications
In-app notifications untuk user.

**Columns:**
- id - UUID primary key
- user_id - Reference ke auth.users
- 	ype - Type notifikasi: 'info', 'success', 'warning', 'error'
- 	itle - Judul notifikasi
- message - Isi pesan
- is_read - Status sudah dibaca atau belum
- metadata - Data tambahan dalam JSON
- created_at - Timestamp

### Existing Table: email_send_log
Log semua email yang dikirim.

**Columns:**
- id - UUID primary key
- 	emplate_name - Nama template yang digunakan
- ecipient_email - Email penerima
- ecipient_user_id - User ID penerima (optional)
- status - Status pengiriman: 'pending', 'sent', 'failed'
- error_message - Error jika gagal
- metadata - Data variabel email dalam JSON
- idempotency_key - Untuk prevent duplicate emails
- created_at - Timestamp

## Email Templates

### 1. copyright_registration_submitted
**Trigger:** User submit form pendaftaran
**Variables:** legal_name, email, submitted_at
**Purpose:** Konfirmasi bahwa pendaftaran diterima

### 2. copyright_payment_required
**Trigger:** Status berubah ke awaiting_payment
**Variables:** legal_name, amount, bank_name, bank_account
**Purpose:** Reminder untuk melakukan pembayaran

### 3. copyright_revision_requested
**Trigger:** Admin request revision
**Variables:** legal_name, revision_notes
**Purpose:** Notifikasi bahwa ada revisi yang perlu dilakukan

### 4. copyright_approved
**Trigger:** Admin approve pendaftaran
**Variables:** legal_name, composer_code, contract_number, approved_at
**Purpose:** Notifikasi pendaftaran disetujui dan composer code diberikan

### 5. copyright_rejected
**Trigger:** Admin reject pendaftaran
**Variables:** legal_name, rejection_reason
**Purpose:** Notifikasi pendaftaran ditolak dengan alasan

### 6. copyright_contract_ready
**Trigger:** Kontrak sudah bermeterai (status = stamped)
**Variables:** legal_name, contract_number
**Purpose:** Notifikasi kontrak siap didownload

### 7. copyright_contract_active
**Trigger:** Kontrak ditandatangani (status = active)
**Variables:** legal_name, composer_code, contract_number, signed_at
**Purpose:** Notifikasi kontrak aktif dan dashboard royalti tersedia

## Functions

### soundpub.create_copyright_notification()
Membuat in-app notification.

**Parameters:**
- _user_id - UUID user
- _type - Type notifikasi
- _title - Judul
- _message - Pesan
- _metadata - JSON metadata (optional)

**Returns:** UUID notification_id

### soundpub.queue_copyright_email()
Queue email untuk dikirim.

**Parameters:**
- _template_key - Key template email
- _recipient_email - Email penerima
- _recipient_user_id - UUID user
- _variables - JSON variables untuk template

**Returns:** UUID log_id

### soundpub.notify_copyright_event()
Unified function untuk send notification + email sekaligus.

**Parameters:**
- _user_id - UUID user
- _event_type - Event type string
- _registration_data - JSON data pendaftaran

**Event Types:**
- submitted - Pendaftaran submitted
- payment_required - Pembayaran diperlukan
- evision_requested - Revisi diminta
- pproved - Pendaftaran disetujui
- ejected - Pendaftaran ditolak
- contract_ready - Kontrak siap download
- contract_active - Kontrak aktif

### soundpub.admin_review_copyright_registration() (Updated)
RPC untuk admin review dengan auto notification.

**Parameters:**
- _registration_id - UUID pendaftaran
- _action - Action: 'in_review', 'revision', 'approve', 'reject'
- _admin_notes - Catatan admin (optional)
- _revision_notes - Catatan revisi (optional)

**Auto Triggers:**
- revision → send revision_requested notification
- approve → send approved notification + generate contract
- reject → send rejected notification

### soundpub.update_copyright_contract_with_notification() (New)
RPC untuk update contract status dengan auto notification.

**Parameters:**
- _contract_id - UUID contract
- _new_status - Status baru
- _metadata - JSON metadata (optional)

**Auto Triggers:**
- stamped → send contract_ready notification
- active → send contract_active notification

## Frontend Components

### NotificationCenter.tsx
Component untuk menampilkan in-app notifications.

**Features:**
- Badge unread count
- Real-time updates via Supabase subscription
- Mark as read functionality
- Mark all as read
- Dropdown list dengan scroll
- Type-based color coding

**Usage:**
`	sx
import NotificationCenter from '@/components/notifications/NotificationCenter';

// In AppSidebar or Header
<NotificationCenter />
`

## Frontend Integration

### CopyrightRegistrationReview.tsx (Updated)
Admin review page kini menggunakan RPC baru:

**Before:**
`	s
supabase.rpc('admin_review_copyright_registration', {
  _registration_id: id,
  _status: 'approved',
  ...
})
`

**After:**
`	s
supabase.rpc('admin_review_copyright_registration', {
  _registration_id: id,
  _action: 'approve', // mapped from status
  _admin_notes: null,
  _revision_notes: null,
})
`

Contract update juga menggunakan RPC baru:
`	s
supabase.rpc('update_copyright_contract_with_notification', {
  _contract_id: contract.id,
  _new_status: 'stamped',
})
`

## Email Sending Implementation (Future)

Email templates sudah siap di database. Untuk implementasi email sending:

### Option 1: Supabase Edge Function
`sql
-- Trigger setiap ada email_send_log dengan status 'pending'
-- Edge function fetch template, render dengan variables, kirim via Resend/SendGrid
`

### Option 2: External Service
`	s
// Polling service yang check email_send_log status='pending'
// Render template dan send email
// Update status menjadi 'sent' atau 'failed'
`

### Option 3: Webhook
`sql
-- Trigger pg_notify saat ada pending email
-- Service listen dan process
`

## Testing Checklist

### In-App Notifications
- [ ] User submit pendaftaran → notifikasi muncul
- [ ] Admin request revision → user dapat notifikasi
- [ ] Admin approve → user dapat notifikasi dengan composer code
- [ ] Admin reject → user dapat notifikasi dengan alasan
- [ ] Contract stamped → user dapat notifikasi kontrak ready
- [ ] Contract active → user dapat notifikasi kontrak aktif
- [ ] Unread badge count bekerja
- [ ] Mark as read bekerja
- [ ] Real-time subscription bekerja

### Email Queue
- [ ] Setiap event masuk ke email_send_log dengan status 'pending'
- [ ] Idempotency key prevent duplicate
- [ ] Variables tersimpan dengan benar di metadata
- [ ] Template_name sesuai dengan event

### Email Templates
- [ ] Semua template ada di database
- [ ] Variables match dengan documentation
- [ ] HTML rendering baik
- [ ] Plain text alternative tersedia

## Migration Files

1. 20260721233430_copyright_notifications.sql
   - Table email_templates
   - Email templates data
   - Helper functions
   - Indexes & policies

2. 20260721233430_copyright_notifications_functions.sql
   - Updated admin_review_copyright_registration RPC
   - New update_copyright_contract_with_notification RPC

## Next Steps

1. ✅ Create notification infrastructure
2. ✅ Create email templates
3. ✅ Update RPC functions
4. ✅ Update frontend components
5. ⏳ Setup email sending service (Resend/SendGrid)
6. ⏳ Test notification flow end-to-end
7. ⏳ Test email delivery

---

**Created:** 2026-07-21
**Last Updated:** 2026-07-21
**Status:** Infrastructure Complete, Email Sending Pending
