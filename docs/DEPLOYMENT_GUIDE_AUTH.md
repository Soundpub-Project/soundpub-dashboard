# 🚀 DEPLOYMENT GUIDE - Auth Verification System

**Tanggal:** 2026-08-14  
**Version:** v2.1.0  
**Status:** Ready for Deployment  

---

## 📋 PRE-DEPLOYMENT CHECKLIST

### ✅ Completed Items
- [x] Frontend pages created (ResetPassword, VerifyEmail, VerifyEmailRequired)
- [x] Routing updated in App.tsx
- [x] Auth.tsx enhanced with forgot password link
- [x] TypeScript compilation successful
- [x] Edge Functions already exist
- [x] Migration script available

### ⚠️ Pending Items
- [ ] Database migration executed
- [ ] Edge Functions verified deployed
- [ ] Email templates configured
- [ ] End-to-end testing completed
- [ ] Production deployment

---

## 🗄️ STEP 1: DATABASE MIGRATION

### Backup Database First
```bash
# Create backup
pg_dump -h localhost -U postgres -d Soundpub > backups/backup_20260814_$(date +%H%M%S).sql

# Verify backup
ls -lh backups/
```

### Run Migration
```bash
# Connect to database
psql -h localhost -U postgres -d Soundpub

# Run migration script
\i migrations-complete/002_auth_verification_system.sql

# Verify success message
# Should see: "Migration 002_auth_verification_system.sql completed successfully!"
```

### Verify Migration
```sql
-- Check new columns in profiles
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema='Soundpub' AND table_name='profiles'
AND (column_name LIKE '%token%' OR column_name = 'email_verified');

-- Expected output:
-- email_verified | boolean
-- verification_token | text
-- verification_token_expires_at | timestamp with time zone
-- verification_sent_at | timestamp with time zone
-- password_reset_token | text
-- password_reset_token_expires_at | timestamp with time zone
-- password_reset_sent_at | timestamp with time zone

-- Check new tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema='Soundpub' 
AND table_name IN ('auth_events', 'rate_limits');

-- Expected output:
-- auth_events
-- rate_limits

-- Test utility functions
SELECT Soundpub.cleanup_rate_limits();
SELECT Soundpub.cleanup_expired_tokens();
```

---

## ⚙️ STEP 2: VERIFY EDGE FUNCTIONS

### List Deployed Functions
```bash
supabase functions list
```

### Required Functions
Pastikan functions berikut sudah deployed:
- ✅ `send-password-reset`
- ✅ `verify-password-reset-token`
- ✅ `reset-password`
- ✅ `send-verification-email`
- ✅ `verify-email`
- ✅ `send-app-email` (updated with new templates)

### Deploy If Missing
```bash
cd supabase/functions

# Deploy individual functions
supabase functions deploy send-password-reset --project-ref <YOUR_PROJECT_REF>
supabase functions deploy verify-password-reset-token --project-ref <YOUR_PROJECT_REF>
supabase functions deploy reset-password --project-ref <YOUR_PROJECT_REF>
supabase functions deploy send-verification-email --project-ref <YOUR_PROJECT_REF>
supabase functions deploy verify-email --project-ref <YOUR_PROJECT_REF>
supabase functions deploy send-app-email --project-ref <YOUR_PROJECT_REF>
```

### Test Functions (Optional)
```bash
# Test send-password-reset
curl -X POST https://supabase.carubra.com/functions/v1/send-password-reset \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"email":"test@example.com"}'

# Expected: {"success":true,"message":"If email exists, reset link sent."}
```

---

## 📧 STEP 3: VERIFY EMAIL TEMPLATES

### Check send-app-email Function
Pastikan template berikut ada di `supabase/functions/send-app-email/index.ts`:

```typescript
// Required templates:
'password-reset' -> Link reset password
'email-verification' -> Link verifikasi email
'password-changed' -> Konfirmasi password berhasil diubah
```

### Template Variables
**password-reset:**
- `{{ userName }}` - Nama user
- `{{ resetUrl }}` - Link reset password

**email-verification:**
- `{{ userName }}` - Nama user
- `{{ verificationUrl }}` - Link verifikasi

**password-changed:**
- `{{ userName }}` - Nama user

---

## 🖥️ STEP 4: FRONTEND DEPLOYMENT

### Build Application
```bash
# Install dependencies (if needed)
pnpm install

# Build
pnpm build

# Check build output
ls -lh dist/
```

### Deploy with Docker
```bash
# Build Docker image
docker build -t Soundpub-dashboard:v2.1.0 .

# Tag as latest
docker tag Soundpub-dashboard:v2.1.0 Soundpub-dashboard:latest

# Stop current container
docker-compose down

# Start new version
docker-compose up -d

# Check logs
docker-compose logs -f --tail=100
```

### Verify Deployment
```bash
# Check container running
docker ps | grep Soundpub

# Check health
curl http://localhost:5173/
```

---

## 🧪 STEP 5: END-TO-END TESTING

### Test 1: Forgot Password Flow
1. Navigate to: `http://localhost:5173/forgot-password`
2. Enter registered email
3. Submit form
4. Check email inbox for reset link
5. Click reset link
6. Should open: `http://localhost:5173/reset-password?token=xxx`
7. Enter new password (min 6 chars)
8. Submit
9. Should see success message
10. Try login with new password

**Expected Result:** ✅ Can login with new password

### Test 2: New User Signup with Verification
1. Navigate to: `http://localhost:5173/auth`
2. Click "Daftar" tab
3. Fill signup form
4. Submit
5. Should see email verification instructions
6. Check email inbox
7. Click verification link
8. Should open: `http://localhost:5173/verify-email?token=xxx`
9. Should see success and redirect to dashboard

**Expected Result:** ✅ Email verified, can access dashboard

### Test 3: Resend Verification Email
1. Login with unverified account
2. Navigate to: `http://localhost:5173/verify-email-required`
3. Click "Kirim Ulang Email Verifikasi"
4. Should see success toast
5. Button should show countdown (60s)
6. Check email inbox

**Expected Result:** ✅ New verification email received

### Test 4: Rate Limiting
1. Go to forgot password page
2. Submit same email 4 times quickly
3. Should see rate limit error on 4th attempt

**Expected Result:** ✅ Rate limit message shown

### Test 5: Token Expiry
1. Request password reset
2. Wait 25 hours (or manually expire in DB)
3. Try to use reset link
4. Should see "Token expired" error

**Expected Result:** ✅ Expired token handled correctly

---

## 📊 STEP 6: MONITORING SETUP

### Create Admin Dashboard Queries
```sql
-- Save these queries for monitoring

-- Daily signup & verification rate
CREATE OR REPLACE VIEW Soundpub.daily_verification_stats AS
SELECT 
  DATE(created_at) AS date,
  COUNT(*) AS total_signups,
  COUNT(*) FILTER (WHERE email_verified = true) AS verified_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE email_verified = true) / COUNT(*), 2) AS verification_rate
FROM Soundpub.profiles
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Password reset activity
CREATE OR REPLACE VIEW Soundpub.password_reset_stats AS
SELECT 
  DATE(created_at) AS date,
  event_type,
  COUNT(*) AS event_count
FROM Soundpub.auth_events
WHERE event_type LIKE 'password_reset%'
  AND created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at), event_type
ORDER BY date DESC;

-- Current rate limits
CREATE OR REPLACE VIEW Soundpub.active_rate_limits AS
SELECT 
  identifier,
  action_type,
  attempt_count,
  blocked_until,
  last_attempt_at
FROM Soundpub.rate_limits
WHERE blocked_until > NOW()
ORDER BY last_attempt_at DESC;
```

### Setup Alerts (Optional)
```sql
-- Alert if verification rate drops below 50%
-- Alert if password reset failures > 10/day
-- Alert if rate limit blocks > 20/hour
```

---

## 🔧 STEP 7: ENVIRONMENT VARIABLES

### Required Variables
```bash
# Check these are set in your environment
SUPABASE_URL=https://supabase.carubra.com
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
DATABASE_SCHEMA=Soundpub
LOVABLE_API_KEY=<your-lovable-key>
GOOGLE_MAIL_API_KEY=<your-gmail-key>
APP_URL=https://dashboard.Soundpub.xyz
```

### Verify in Edge Functions
```bash
# Check function logs for environment issues
supabase functions logs send-password-reset
```

---

## 🚨 ROLLBACK PLAN

### If Critical Issues Occur

**Option 1: Rollback Frontend Only**
```bash
docker tag Soundpub-dashboard:v2.0.0 Soundpub-dashboard:latest
docker-compose down
docker-compose up -d
```

**Option 2: Rollback Database (EXTREME)**
```bash
# Only if database corruption occurs
psql -h localhost -U postgres -d Soundpub < backups/backup_20260814_*.sql
```

**Option 3: Disable Features**
```sql
-- Temporarily disable email verification requirement
UPDATE Soundpub.profiles SET email_verified = true WHERE email_verified = false;
```

---

## ✅ POST-DEPLOYMENT CHECKLIST

### Day 1
- [ ] Monitor error logs every hour
- [ ] Check email delivery rate
- [ ] Verify no critical bugs reported
- [ ] Test all flows working

### Week 1
- [ ] Review verification rate (target: >60%)
- [ ] Review password reset completion (target: >70%)
- [ ] Check user feedback
- [ ] Monitor rate limit violations

### Month 1
- [ ] Verification rate goal: >80%
- [ ] Support ticket reduction: >30%
- [ ] Performance review
- [ ] Plan Phase 2 features (2FA, etc.)

---

## 📞 TROUBLESHOOTING

### Issue: Email tidak terkirim
```sql
-- Check email logs
SELECT * FROM Soundpub.email_send_log 
WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
ORDER BY created_at DESC 
LIMIT 50;

-- Check for errors
SELECT status, error_message, COUNT(*) 
FROM Soundpub.email_send_log 
WHERE created_at >= CURRENT_DATE
GROUP BY status, error_message;
```

**Solution:** Check Gmail API credentials, verify Lovable connector

### Issue: Token tidak valid
```sql
-- Check token in database
SELECT 
  id, email, 
  verification_token, 
  verification_token_expires_at,
  password_reset_token,
  password_reset_token_expires_at
FROM Soundpub.profiles 
WHERE email = 'user@example.com';
```

**Solution:** Generate new token, check expiry times

### Issue: Rate limit false positive
```sql
-- Check and clear rate limit
SELECT * FROM Soundpub.rate_limits 
WHERE identifier = 'user@example.com';

-- Clear specific rate limit
DELETE FROM Soundpub.rate_limits 
WHERE identifier = 'user@example.com' 
AND action_type = 'password_reset';
```

---

## 🎯 SUCCESS METRICS

**Target Week 1:**
- Email verification rate: >60%
- Password reset completion: >70%
- Email delivery rate: >95%
- Critical bugs: 0
- User complaints: <5

**Target Month 1:**
- Email verification rate: >80%
- Support ticket reduction: 30%
- User satisfaction: >8/10
- System uptime: >99.9%

---

## 📚 DOCUMENTATION LINKS

- Implementation Guide: `docs/FRONTEND_AUTH_IMPLEMENTATION_COMPLETE.md`
- Design Document: `docs/RANCANGAN_AUTH_VERIFICATION.md`
- Summary: `docs/RINGKASAN_AUTH_VERIFICATION.md`
- Implementation Steps: `docs/TAHAPAN_IMPLEMENTASI.md`
- Checklist: `docs/IMPLEMENTATION_CHECKLIST.md`

---

**Deployment Status:** 🟡 Ready - Pending Database Migration  
**Next Action:** Execute Step 1 (Database Migration)  
**Version:** v2.1.0  
**Date:** 2026-08-14

🎵 **Soundpub - Empowering Musicians, Securing Accounts** 🎵
