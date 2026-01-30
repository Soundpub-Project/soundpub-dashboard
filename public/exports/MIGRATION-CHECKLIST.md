# SoundPub Dashboard - Migration Checklist

Checklist untuk memastikan semua langkah migrasi ke VPS selesai dengan benar.

---

## 📋 Pre-Migration Checklist

### Persiapan Server

- [ ] VPS dengan spesifikasi minimum (2 CPU, 4GB RAM, 30GB SSD)
- [ ] OS terinstall (Ubuntu 22.04 LTS recommended)
- [ ] Akses SSH ke server
- [ ] Domain pointing ke IP VPS
- [ ] Firewall dikonfigurasi (port 80, 443, 22)

### Persiapan Data

- [ ] Export data dari Lovable Cloud
- [ ] Download semua file dari storage buckets
- [ ] Backup credentials disimpan dengan aman
- [ ] Catat semua API keys dan secrets yang digunakan

### Persiapan Files

- [ ] Clone repository frontend ke lokal
- [ ] Pastikan semua edge functions tersedia
- [ ] Download migration scripts

---

## 🐳 Docker Installation

- [ ] Update system packages
- [ ] Install Docker prerequisites
- [ ] Add Docker GPG key
- [ ] Add Docker repository
- [ ] Install Docker Engine
- [ ] Install Docker Compose plugin
- [ ] Add user to docker group
- [ ] Verify: `docker --version` berhasil
- [ ] Verify: `docker compose version` berhasil
- [ ] Test: `docker run hello-world` berhasil

---

## 🚀 Supabase Setup

### Clone & Configure

- [ ] Clone Supabase docker repository
- [ ] Copy `.env.example` ke `.env`
- [ ] Generate POSTGRES_PASSWORD (openssl rand -hex 32)
- [ ] Generate JWT_SECRET (openssl rand -hex 64)
- [ ] Generate ANON_KEY
- [ ] Generate SERVICE_ROLE_KEY
- [ ] Set DASHBOARD_USERNAME & PASSWORD
- [ ] Configure SITE_URL
- [ ] Configure API_EXTERNAL_URL
- [ ] Configure SMTP settings

### Start Services

- [ ] Run `docker compose up -d`
- [ ] All containers running (`docker compose ps`)
- [ ] API endpoint responding (curl localhost:8000)
- [ ] Studio accessible (http://server-ip:3000)

---

## 🗃️ Database Setup

### Schema Migration

- [ ] Copy `full-schema-v2.sql` ke server
- [ ] Connect ke PostgreSQL container
- [ ] Run schema SQL
- [ ] No errors during execution

### Verification

- [ ] Tables created:
  - [ ] profiles
  - [ ] user_roles
  - [ ] artists
  - [ ] releases
  - [ ] tracks
  - [ ] royalty_uploads
  - [ ] royalties
  - [ ] composer_royalties
  - [ ] payout_requests
  - [ ] audit_logs
  - [ ] app_settings

- [ ] Functions created:
  - [ ] has_role()
  - [ ] is_admin()
  - [ ] is_whitelabel()
  - [ ] get_user_role()
  - [ ] get_user_full_name()
  - [ ] get_user_parent_label_id()
  - [ ] get_user_release_label_ids()
  - [ ] handle_new_user()
  - [ ] update_timestamp()
  - [ ] update_balance_on_payout_status_change()

- [ ] Triggers created:
  - [ ] on_auth_user_created
  - [ ] update_profiles_timestamp
  - [ ] update_artists_timestamp
  - [ ] update_releases_timestamp
  - [ ] update_tracks_timestamp
  - [ ] update_royalty_uploads_timestamp
  - [ ] update_payout_requests_timestamp
  - [ ] update_composer_royalties_timestamp
  - [ ] on_payout_status_change

- [ ] RLS enabled on all tables:
  - [ ] profiles
  - [ ] user_roles
  - [ ] artists
  - [ ] releases
  - [ ] tracks
  - [ ] royalty_uploads
  - [ ] royalties
  - [ ] composer_royalties
  - [ ] payout_requests
  - [ ] audit_logs
  - [ ] app_settings

### Admin User

- [ ] Create first user via Auth API or signup
- [ ] Update user role to 'superadmin'
- [ ] Test login berhasil

---

## 📦 Storage Setup

### Buckets

- [ ] release-covers bucket created (private)
- [ ] track-audio bucket created (private)
- [ ] track-video bucket created (private)
- [ ] audio-clips bucket created (public)
- [ ] label-logos bucket created (public)

### Storage Policies

- [ ] RLS policies for release-covers
- [ ] RLS policies for track-audio
- [ ] RLS policies for track-video
- [ ] RLS policies for audio-clips
- [ ] RLS policies for label-logos

### Persistent Storage

- [ ] Storage directory created (/data/supabase/storage)
- [ ] Correct permissions (chown 1000:1000)
- [ ] Docker volume configured

### Test Upload

- [ ] Test upload ke release-covers berhasil
- [ ] Test upload ke audio-clips berhasil
- [ ] Test upload ke label-logos berhasil

---

## ⚡ Edge Functions

### Deployment

- [ ] Copy edge functions to server
- [ ] Functions container running
- [ ] All functions deployed:
  - [ ] change-own-password
  - [ ] create-user
  - [ ] create-whitelabel-artist
  - [ ] delete-user
  - [ ] get-catalog-tracks
  - [ ] get-ga4-config
  - [ ] process-royalty-upload
  - [ ] remove-artist-from-label
  - [ ] send-royalty-notification
  - [ ] set-artist-password
  - [ ] update-app-settings
  - [ ] update-user-password
  - [ ] update-user-status

### Secrets

- [ ] RESEND_API_KEY configured (untuk email)
- [ ] GA4_MEASUREMENT_ID configured (opsional)
- [ ] Other required secrets configured

### Test Functions

- [ ] Test endpoint call berhasil
- [ ] No CORS errors

---

## 🔒 SSL/HTTPS Setup

### Nginx Installation

- [ ] Nginx installed
- [ ] Sites-available config created
- [ ] Sites-enabled symlink created
- [ ] Nginx config test passed
- [ ] Nginx reloaded

### SSL Certificates

- [ ] Certbot installed
- [ ] Certificate generated for api.domain.com
- [ ] Certificate generated for studio.domain.com
- [ ] Certificate generated for app.domain.com
- [ ] Auto-renewal configured (crontab)

### HTTPS Test

- [ ] https://api.domain.com accessible
- [ ] https://studio.domain.com accessible
- [ ] https://app.domain.com accessible
- [ ] No SSL warnings

---

## 📊 Data Migration

### Export from Lovable Cloud

- [ ] Profiles data exported
- [ ] User roles data exported
- [ ] Artists data exported
- [ ] Releases data exported
- [ ] Tracks data exported
- [ ] Royalty uploads data exported
- [ ] Royalties data exported
- [ ] Composer royalties data exported
- [ ] Payout requests data exported
- [ ] Audit logs data exported
- [ ] App settings data exported

### Import to VPS

- [ ] Migration script configured
- [ ] Environment variables set
- [ ] Users migrated
- [ ] Profiles imported
- [ ] User roles imported
- [ ] Artists imported
- [ ] Releases imported
- [ ] Tracks imported
- [ ] Other data imported

### Storage Migration

- [ ] Release covers uploaded
- [ ] Track audio files uploaded
- [ ] Audio clips uploaded
- [ ] Label logos uploaded

### Data Verification

- [ ] Row counts match
- [ ] Sample data spot-check passed
- [ ] Foreign key relationships intact

---

## 🖥️ Frontend Deployment

### Build

- [ ] Update .env with new Supabase URL
- [ ] Update .env with new API keys
- [ ] Run `npm run build`
- [ ] Build successful

### Deploy

- [ ] Upload dist folder to server
- [ ] Nginx serving frontend correctly
- [ ] All static assets loading

### Test

- [ ] Homepage loads
- [ ] Login works
- [ ] Dashboard accessible
- [ ] All pages render correctly

---

## ✅ Final Testing

### Authentication

- [ ] Signup works
- [ ] Email verification (if enabled)
- [ ] Login works
- [ ] Password reset works
- [ ] Logout works

### CRUD Operations

- [ ] Create release works
- [ ] Read releases works
- [ ] Update release works
- [ ] Delete release works

### Role-Based Access

- [ ] Superadmin access correct
- [ ] Admin access correct
- [ ] Label access correct
- [ ] Whitelabel access correct
- [ ] Artist access correct
- [ ] Copyright access correct
- [ ] User access correct

### Storage

- [ ] Upload images works
- [ ] Upload audio works
- [ ] Download files works
- [ ] Signed URLs work (private buckets)

### Edge Functions

- [ ] Create user works
- [ ] Update password works
- [ ] Process royalty upload works
- [ ] Send notifications works

### Performance

- [ ] Page load < 3 seconds
- [ ] API response < 500ms
- [ ] No console errors

---

## 🔧 Maintenance Setup

### Backup

- [ ] Backup script created
- [ ] Backup cron job scheduled
- [ ] Test backup successful
- [ ] Test restore successful

### Monitoring

- [ ] Log rotation configured
- [ ] Monitoring dashboard setup (optional)
- [ ] Alerting configured (optional)

### Security

- [ ] SSH key-only authentication
- [ ] Firewall active
- [ ] All passwords strong
- [ ] Regular security updates enabled

---

## 📝 Documentation

- [ ] Server credentials documented
- [ ] API keys documented
- [ ] Backup procedures documented
- [ ] Restore procedures documented
- [ ] Troubleshooting guide reviewed

---

## 🎉 Go Live

- [ ] All checklist items completed
- [ ] Final testing passed
- [ ] DNS propagated
- [ ] Old system decommissioned (after confirmation)
- [ ] Team notified of new URLs

---

**Migration Completed:** ☐

**Date:** _________________

**Completed By:** _________________

**Notes:**
```




```
