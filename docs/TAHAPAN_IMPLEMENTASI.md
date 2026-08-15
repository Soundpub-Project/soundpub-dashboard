# 🚀 TAHAPAN IMPLEMENTASI - Auth Verification System
**SoundPub Dashboard - Password Reset & Email Verification**

---

## 📋 OVERVIEW TAHAPAN

Implementasi dibagi menjadi **5 PHASE** dengan total **16 steps**:

```
Phase 1: Database Migration (3 steps)
Phase 2: Backend Functions (6 steps)
Phase 3: Frontend Implementation (5 steps)
Phase 4: Testing & QA (1 step)
Phase 5: Deployment (1 step)
```

**Estimasi Waktu:** 4 minggu (160 jam)  
**Sequence:** Harus dikerjakan berurutan (Phase 1 → Phase 5)

---

## 📊 DEPENDENCY FLOW

```
Phase 1: Database Migration
    ↓
Phase 2: Backend Functions
    ├─ Step 2.1: send-password-reset
    ├─ Step 2.2: verify-password-reset-token
    ├─ Step 2.3: reset-password
    ├─ Step 2.4: send-verification-email
    ├─ Step 2.5: verify-email
    └─ Step 2.6: Update send-app-email
    ↓
Phase 3: Frontend Implementation
    ├─ Step 3.1: ForgotPassword.tsx
    ├─ Step 3.2: ResetPassword.tsx
    ├─ Step 3.3: VerifyEmail.tsx
    ├─ Step 3.4: Update Auth.tsx & useAuth.tsx
    └─ Step 3.5: Update routes & ProtectedRoute
    ↓
Phase 4: Testing & QA
    ↓
Phase 5: Deployment
```

---

## 🔢 PHASE 1: DATABASE MIGRATION

### ⏱️ Estimasi: 2-3 hari

### Step 1.1: Backup & Prepare
**Priority:** 🔴 CRITICAL  
**Estimasi:** 2 jam

**Tasks:**
1. ✅ Backup production database
   ```bash
   pg_dump -h localhost -U postgres -d soundpub > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. ✅ Verify backup integrity
   ```bash
   # Check backup file size
   ls -lh backup_*.sql
   
   # Test restore to temp database (optional)
   createdb soundpub_backup_test
   psql soundpub_backup_test < backup_*.sql
   dropdb soundpub_backup_test
   ```

3. ✅ Review migration script
   - Open: `migrations-complete/002_auth_verification_system.sql`
   - Verify: semua query menggunakan `soundpub.` schema
   - Check: tidak ada hardcoded values yang salah

**Success Criteria:**
- ✅ Backup file created & verified
- ✅ Migration script reviewed & approved
- ✅ Staging environment ready

---

### Step 1.2: Run SQL Migration Script
**Priority:** 🔴 CRITICAL  
**Estimasi:** 1 jam

**Tasks:**
1. ✅ Connect to database
   ```bash
   psql -h localhost -U postgres -d soundpub
   ```

2. ✅ Run migration (STAGING FIRST!)
   ```bash
   # STAGING
   psql -h staging-db -U postgres soundpub < migrations-complete/002_auth_verification_system.sql
   
   # Jika staging OK, baru production
   psql -h localhost -U postgres soundpub < migrations-complete/002_auth_verification_system.sql
   ```

3. ✅ Check migration output
   - Harus muncul: "Migration 002_auth_verification_system.sql completed successfully!"
   - Tidak ada error messages

**Files to Execute:**
- `migrations-complete/002_auth_verification_system.sql`

**Success Criteria:**
- ✅ Migration completed without errors
- ✅ Success message displayed

---

### Step 1.3: Verify & Test Migration
**Priority:** 🔴 CRITICAL  
**Estimasi:** 1 jam

**Tasks:**
1. ✅ Verify new columns exist
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_schema='soundpub' AND table_name='profiles'
   AND column_name LIKE '%token%' OR column_name = 'email_verified';
   ```

2. ✅ Verify new tables created
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema='soundpub' 
   AND table_name IN ('auth_events', 'rate_limits');
   ```

3. ✅ Test utility functions
   ```sql
   -- Test cleanup functions
   SELECT soundpub.cleanup_rate_limits();
   SELECT soundpub.cleanup_expired_tokens();
   
   -- Test rate limit function
   SELECT soundpub.check_rate_limit('test@example.com', 'password_reset', 3, 60);
   ```

4. ✅ Check RLS policies
   ```sql
   SELECT schemaname, tablename, policyname 
   FROM pg_policies 
   WHERE schemaname = 'soundpub';
   ```

**Success Criteria:**
- ✅ All new columns exist
- ✅ All new tables created
- ✅ All functions working
- ✅ RLS policies active

---

## ⚙️ PHASE 2: BACKEND FUNCTIONS (Edge Functions)

### ⏱️ Estimasi: 1 minggu

### Step 2.1: Create send-password-reset Function
**Priority:** 🔴 HIGH  
**Estimasi:** 4 jam

**Tasks:**
1. ✅ Create function directory
   ```bash
   mkdir -p supabase/functions/send-password-reset
   ```

2. ✅ Create `index.ts` file dengan konten:
   - Import dependencies (supabase-js)
   - Setup CORS headers
   - Parse request body (email)
   - Validate email format
   - Check rate limit (3/hour)
   - Query user by email
   - Generate secure token (crypto.randomUUID)
   - Update profiles table (token + expiry 24h)
   - Call send-app-email
   - Log to auth_events
   - Return success response

3. ✅ Test locally
   ```bash
   supabase functions serve send-password-reset
   
   # Test with curl
   curl -X POST http://localhost:54321/functions/v1/send-password-reset \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com"}'
   ```

4. ✅ Deploy to staging
   ```bash
   supabase functions deploy send-password-reset --project-ref staging
   ```

**Files to Create:**
- `supabase/functions/send-password-reset/index.ts`

**Reference:**
- Template code: `docs/API_DOCUMENTATION.md` (section "Backend Function Template")
- Full spec: `docs/RANCANGAN_AUTH_VERIFICATION.md` (section "Edge Functions")

**Success Criteria:**
- ✅ Function created & tested locally
- ✅ Deployed to staging
- ✅ Rate limiting works
- ✅ Email sent successfully

---

### Step 2.2: Create verify-password-reset-token Function
**Priority:** 🟡 MEDIUM  
**Estimasi:** 2 jam

**Tasks:**
1. ✅ Create function directory
   ```bash
   mkdir -p supabase/functions/verify-password-reset-token
   ```

2. ✅ Create `index.ts` file dengan:
   - Parse token from request
   - Query profiles by password_reset_token
   - Check token exists
   - Check token not expired
   - Return validation result (valid/invalid)

3. ✅ Test locally & deploy

**Files to Create:**
- `supabase/functions/verify-password-reset-token/index.ts`

**Success Criteria:**
- ✅ Valid token returns user info
- ✅ Invalid token returns error
- ✅ Expired token returns error

---

### Step 2.3: Create reset-password Function
**Priority:** 🔴 HIGH  
**Estimasi:** 3 jam

**Tasks:**
1. ✅ Create function directory
   ```bash
   mkdir -p supabase/functions/reset-password
   ```

2. ✅ Create `index.ts` file dengan:
   - Parse token & newPassword
   - Validate password strength (min 8 char, mixed case)
   - Query profile by token
   - Check token expiry
   - Update password via Supabase Admin API
   - Clear password_reset_token
   - Log to auth_events
   - Send confirmation email
   - Return success

3. ✅ Test locally & deploy

**Files to Create:**
- `supabase/functions/reset-password/index.ts`

**Success Criteria:**
- ✅ Password updated successfully
- ✅ Token cleared after use
- ✅ Confirmation email sent
- ✅ Can login with new password

---

### Step 2.4: Create send-verification-email Function
**Priority:** 🟡 MEDIUM  
**Estimasi:** 3 jam

**Tasks:**
1. ✅ Create function directory
   ```bash
   mkdir -p supabase/functions/send-verification-email
   ```

2. ✅ Create `index.ts` file dengan:
   - Parse userId, email, isResend
   - Check rate limit (5/hour for resend)
   - Generate verification token
   - Set expiry (7 days)
   - Update profiles table
   - Call send-app-email
   - Log to auth_events
   - Return success

3. ✅ Test locally & deploy

**Files to Create:**
- `supabase/functions/send-verification-email/index.ts`

**Success Criteria:**
- ✅ Verification email sent
- ✅ Token saved with 7-day expiry
- ✅ Resend rate limiting works

---

### Step 2.5: Create verify-email Function
**Priority:** 🟡 MEDIUM  
**Estimasi:** 3 jam

**Tasks:**
1. ✅ Create function directory
   ```bash
   mkdir -p supabase/functions/verify-email
   ```

2. ✅ Create `index.ts` file dengan:
   - Parse token
   - Query profile by verification_token
   - Check token expiry
   - Set email_verified = true
   - Update auth.users.confirmed_at
   - Clear verification_token
   - Log to auth_events
   - Return success with redirect URL

3. ✅ Test locally & deploy

**Files to Create:**
- `supabase/functions/verify-email/index.ts`

**Success Criteria:**
- ✅ Email verified successfully
- ✅ Token cleared after use
- ✅ User can access full features

---

### Step 2.6: Update send-app-email Templates
**Priority:** 🔴 HIGH  
**Estimasi:** 2 jam

**Tasks:**
1. ✅ Open existing file
   ```bash
   code supabase/functions/send-app-email/index.ts
   ```

2. ✅ Add 3 new templates:
   - `password-reset` template
   - `email-verification` template
   - `password-reset-confirmation` template

3. ✅ Add 'security' scope to SCOPE_TO_OPTIN mapping

4. ✅ Test all templates locally

5. ✅ Deploy updated function
   ```bash
   supabase functions deploy send-app-email
   ```

**Files to Update:**
- `supabase/functions/send-app-email/index.ts`

**Reference:**
- Template code: `docs/RANCANGAN_AUTH_VERIFICATION.md` (section "Update send-app-email")

**Success Criteria:**
- ✅ All 3 templates added
- ✅ Templates render correctly
- ✅ Emails sent successfully

---

## 🎨 PHASE 3: FRONTEND IMPLEMENTATION

### ⏱️ Estimasi: 1 minggu

### Step 3.1: Create ForgotPassword Page
**Priority:** 🔴 HIGH  
**Estimasi:** 4 jam

**Tasks:**
1. ✅ Create page file
   ```bash
   # Create file
   New-Item -Path "src/pages" -Name "ForgotPassword.tsx" -ItemType File
   ```

2. ✅ Implement component dengan:
   - Email input (validated dengan Zod)
   - Submit handler (call send-password-reset)
   - Loading state
   - Success state (email sent message)
   - Error handling (rate limit, invalid email)
   - "Back to Login" link
   - Toast notifications

3. ✅ Style dengan Tailwind + shadcn/ui components

4. ✅ Test UI interactions

**Files to Create:**
- `src/pages/ForgotPassword.tsx`

**Reference:**
- UI mockup: `docs/RANCANGAN_AUTH_VERIFICATION.md` (section "Frontend Implementation")
- Code example: `docs/API_DOCUMENTATION.md` (section "Usage in Component")

**Success Criteria:**
- ✅ Form validates email
- ✅ API call works
- ✅ Success message shown
- ✅ Error handling works

---

### Step 3.2: Create ResetPassword Page
**Priority:** 🔴 HIGH  
**Estimasi:** 5 jam

**Tasks:**
1. ✅ Create page file
   ```bash
   New-Item -Path "src/pages" -Name "ResetPassword.tsx" -ItemType File
   ```

2. ✅ Implement component dengan:
   - Read token from URL query params
   - Token validation on mount
   - Password input fields (new + confirm)
   - Password strength indicator
   - Show/hide password toggle
   - Submit handler (call reset-password)
   - Success state (redirect to login)
   - Error handling (invalid/expired token)

3. ✅ Add password strength indicator component

4. ✅ Test all states

**Files to Create:**
- `src/pages/ResetPassword.tsx`

**Success Criteria:**
- ✅ Token validated on load
- ✅ Password strength shown
- ✅ Passwords match validated
- ✅ Redirect after success

---

### Step 3.3: Create VerifyEmail Page
**Priority:** 🟡 MEDIUM  
**Estimasi:** 3 jam

**Tasks:**
1. ✅ Create page file
   ```bash
   New-Item -Path "src/pages" -Name "VerifyEmail.tsx" -ItemType File
   ```

2. ✅ Implement component dengan:
   - Read token from URL
   - Auto-verify on mount (call verify-email)
   - Loading state
   - Success state (redirect to dashboard)
   - Error state (invalid/expired)
   - "Resend Verification" button on error

3. ✅ Create VerifyEmailRequired.tsx (instruction page)

**Files to Create:**
- `src/pages/VerifyEmail.tsx`
- `src/pages/VerifyEmailRequired.tsx`

**Success Criteria:**
- ✅ Auto-verification works
- ✅ Redirect after success
- ✅ Resend option available

---

### Step 3.4: Update Auth.tsx & useAuth.tsx
**Priority:** 🔴 HIGH  
**Estimasi:** 3 hours

**Tasks:**
1. ✅ Update `src/pages/Auth.tsx`:
   - Add "Lupa Password?" link in login form
   - Update signup success handler
   - Call send-verification-email after signup
   - Show "Cek email untuk verifikasi" toast

2. ✅ Update `src/hooks/useAuth.tsx`:
   - Add to AuthContextType interface:
     ```typescript
     requestPasswordReset: (email: string) => Promise<{ error: Error | null }>;
     resendVerificationEmail: () => Promise<{ error: Error | null }>;
     isEmailVerified: boolean;
     ```
   - Implement requestPasswordReset function
   - Implement resendVerificationEmail function
   - Add isEmailVerified computed value

3. ✅ Add email verification banner to dashboard

**Files to Update:**
- `src/pages/Auth.tsx`
- `src/hooks/useAuth.tsx`
- `src/pages/Dashboard.tsx` (or main layout)

**Success Criteria:**
- ✅ "Lupa Password?" link visible
- ✅ Verification email sent after signup
- ✅ Banner shown for unverified users
- ✅ Resend button works

---

### Step 3.5: Update Routes & ProtectedRoute
**Priority:** 🔴 HIGH  
**Estimasi:** 2 jam

**Tasks:**
1. ✅ Add new routes to router config:
   ```typescript
   {
     path: '/forgot-password',
     element: <ForgotPassword />
   },
   {
     path: '/reset-password',
     element: <ResetPassword />
   },
   {
     path: '/verify-email',
     element: <VerifyEmail />
   },
   {
     path: '/verify-email-required',
     element: <VerifyEmailRequired />
   }
   ```

2. ✅ Update `src/components/auth/ProtectedRoute.tsx`:
   - Add optional prop: `requireEmailVerified?: boolean`
   - Add email verification check
   - Redirect to `/verify-email-required` if not verified

3. ✅ Test all navigation paths

**Files to Update:**
- `src/App.tsx` (or router config file)
- `src/components/auth/ProtectedRoute.tsx`

**Success Criteria:**
- ✅ All routes accessible
- ✅ Email verification check works
- ✅ Redirects work correctly

---

## 🧪 PHASE 4: TESTING & QA

### ⏱️ Estimasi: 1 minggu

### Step 4.1: Comprehensive Testing
**Priority:** 🔴 CRITICAL  
**Estimasi:** 1 minggu

**Tasks:**

**4.1.1 Unit Tests (if time permits)**
- Test React components
- Test useAuth hook
- Test form validations

**4.1.2 Integration Tests**
- ✅ Full password reset flow:
  1. Request reset
  2. Check email received
  3. Click link
  4. Reset password
  5. Login with new password

- ✅ Full email verification flow:
  1. Signup
  2. Check email received
  3. Click verification link
  4. Access dashboard

- ✅ Resend verification flow
- ✅ Rate limiting behavior
- ✅ Token expiry scenarios

**4.1.3 Manual Testing**
- ✅ Test on Chrome
- ✅ Test on Firefox
- ✅ Test on Safari
- ✅ Test on Edge
- ✅ Test on mobile (iOS & Android)

**4.1.4 Email Testing**
- ✅ Gmail inbox
- ✅ Outlook inbox
- ✅ Yahoo inbox
- ✅ Check spam folders

**4.1.5 Security Testing**
- ✅ Test rate limiting enforcement
- ✅ Test token expiry
- ✅ Test password strength validation
- ✅ Test SQL injection prevention (parameterized queries)
- ✅ Test XSS prevention

**4.1.6 Accessibility Testing**
- ✅ Run Lighthouse audit
- ✅ Test keyboard navigation
- ✅ Test screen reader (if available)

**Success Criteria:**
- ✅ All flows work end-to-end
- ✅ No critical bugs
- ✅ Email delivery > 95%
- ✅ Cross-browser compatible
- ✅ Mobile responsive
- ✅ Accessibility score > 90

---

## 🚀 PHASE 5: DEPLOYMENT

### ⏱️ Estimasi: 2-3 hari

### Step 5.1: Production Deployment
**Priority:** 🔴 CRITICAL  
**Estimasi:** 2-3 hari

**Tasks:**

**5.1.1 Pre-Deployment**
- ✅ All tests passing
- ✅ Code review completed
- ✅ Security review completed
- ✅ Changelog created
- ✅ Release notes prepared

**5.1.2 Staging Deployment (Day 1)**
- ✅ Deploy backend functions to staging
  ```bash
  supabase functions deploy send-password-reset --project-ref staging
  supabase functions deploy verify-password-reset-token --project-ref staging
  supabase functions deploy reset-password --project-ref staging
  supabase functions deploy send-verification-email --project-ref staging
  supabase functions deploy verify-email --project-ref staging
  supabase functions deploy send-app-email --project-ref staging
  ```

- ✅ Deploy frontend to staging
  ```bash
  pnpm build
  # Deploy to staging server
  ```

- ✅ Run smoke tests on staging
- ✅ Get QA approval

**5.1.3 Production Deployment (Day 2)**
- ✅ Schedule deployment window
- ✅ Notify stakeholders
- ✅ Create production backup (if not done in Phase 1)

- ✅ Deploy backend functions to production
  ```bash
  supabase functions deploy send-password-reset --project-ref prod
  supabase functions deploy verify-password-reset-token --project-ref prod
  supabase functions deploy reset-password --project-ref prod
  supabase functions deploy send-verification-email --project-ref prod
  supabase functions deploy verify-email --project-ref prod
  supabase functions deploy send-app-email --project-ref prod
  ```

- ✅ Deploy frontend to production
  ```bash
  pnpm build
  docker build -t soundpub-dashboard:v2.0.0 .
  docker tag soundpub-dashboard:v2.0.0 soundpub-dashboard:latest
  docker-compose up -d
  ```

- ✅ Verify deployment successful
- ✅ Run smoke tests on production
- ✅ Monitor error logs (first 1 hour)

**5.1.4 Post-Deployment (Day 3)**
- ✅ Announce new features to users
- ✅ Monitor email delivery rates
- ✅ Monitor user adoption (analytics)
- ✅ Collect user feedback
- ✅ Address any issues promptly

**Success Criteria:**
- ✅ Zero critical errors
- ✅ Email delivery > 95%
- ✅ All functions operational
- ✅ No user complaints
- ✅ Metrics tracking active

---

## 📊 MONITORING AFTER DEPLOYMENT

### Daily (Week 1)
```sql
-- Email delivery rate
SELECT status, COUNT(*) 
FROM soundpub.email_send_log 
WHERE created_at >= CURRENT_DATE 
GROUP BY status;

-- Password reset requests
SELECT COUNT(*) 
FROM soundpub.auth_events 
WHERE event_type = 'password_reset_requested' 
  AND created_at >= CURRENT_DATE;

-- Rate limit violations
SELECT COUNT(*) 
FROM soundpub.rate_limits 
WHERE blocked_until > NOW();
```

### Weekly
```sql
-- Email verification rate
SELECT 
  COUNT(*) FILTER (WHERE email_verified = true) * 100.0 / COUNT(*) AS rate
FROM soundpub.profiles
WHERE created_at >= NOW() - INTERVAL '7 days';
```

---

## ✅ CHECKLIST SUMMARY

### Phase 1: Database Migration
- [ ] 1.1 Backup & Prepare
- [ ] 1.2 Run SQL Migration
- [ ] 1.3 Verify & Test

### Phase 2: Backend Functions
- [ ] 2.1 send-password-reset
- [ ] 2.2 verify-password-reset-token
- [ ] 2.3 reset-password
- [ ] 2.4 send-verification-email
- [ ] 2.5 verify-email
- [ ] 2.6 Update send-app-email

### Phase 3: Frontend
- [ ] 3.1 ForgotPassword page
- [ ] 3.2 ResetPassword page
- [ ] 3.3 VerifyEmail page
- [ ] 3.4 Update Auth & useAuth
- [ ] 3.5 Update routes

### Phase 4: Testing
- [ ] 4.1 Comprehensive testing

### Phase 5: Deployment
- [ ] 5.1 Production deployment

---

## 🎯 SUCCESS CRITERIA

**Week 1 Post-Launch:**
- Email verification rate: > 60%
- Password reset completion: > 70%
- Email delivery rate: > 95%
- Critical bugs: 0

**Month 1:**
- Email verification rate: > 80%
- Support ticket reduction: 30%
- User satisfaction: > 8/10

---

## ⚠️ CRITICAL REMINDERS

🔴 **ALWAYS** use schema `soundpub` not `public`  
🔴 **BACKUP** database before migration  
🔴 **TEST** on staging first  
🔴 **REVIEW** all code before production  

---

## 📞 SUPPORT

**Reference Documentation:** `docs/IMPLEMENTATION_CHECKLIST.md`  
**API Reference:** `docs/API_DOCUMENTATION.md`  
**Questions:** dev@soundpub.xyz

---

**Created:** 2026-08-14  
**Version:** 1.0  
**Status:** Ready to Execute

🎵 **SoundPub - Empowering Musicians, Securing Accounts** 🎵
