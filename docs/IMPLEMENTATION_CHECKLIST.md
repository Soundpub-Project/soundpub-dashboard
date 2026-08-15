# ✅ IMPLEMENTATION CHECKLIST
**SoundPub Dashboard - Auth Verification System**

---

## 📋 PRE-IMPLEMENTATION

### Setup & Planning
- [ ] Review dokumen lengkap: `docs/RANCANGAN_AUTH_VERIFICATION.md`
- [ ] Review ringkasan: `docs/RINGKASAN_AUTH_VERIFICATION.md`
- [ ] Approval dari Tech Lead/CTO
- [ ] Approval dari Security Officer
- [ ] Setup staging environment
- [ ] Create GitHub issues/project board
- [ ] Assign developer resources

### Environment Preparation
- [ ] Verify Supabase self-hosted running
- [ ] Confirm database access (soundpub schema)
- [ ] Check Gmail API credentials valid
- [ ] Backup production database
- [ ] Setup environment variables (staging & production)
- [ ] Test email sending capability

---

## 🗄️ PHASE 1: DATABASE MIGRATION

### Pre-Migration
- [ ] Create database backup
  ```bash
  pg_dump soundpub > backups/backup_$(date +%Y%m%d_%H%M%S).sql
  ```
- [ ] Verify backup integrity
  ```bash
  pg_restore --list backups/backup_*.sql | head
  ```
- [ ] Review migration script: `migrations-complete/002_auth_verification_system.sql`
- [ ] Test migration on staging first

### Run Migration (Staging)
- [ ] Connect to staging database
- [ ] Run migration script
  ```bash
  psql -h staging-db -U postgres soundpub < migrations-complete/002_auth_verification_system.sql
  ```
- [ ] Verify new columns exist
  ```sql
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_schema='soundpub' AND table_name='profiles'
  AND column_name LIKE '%token%' OR column_name = 'email_verified';
  ```
- [ ] Verify new tables created
  ```sql
  SELECT table_name FROM information_schema.tables 
  WHERE table_schema='soundpub' 
  AND table_name IN ('auth_events', 'rate_limits');
  ```
- [ ] Verify indexes created
  ```sql
  SELECT indexname FROM pg_indexes 
  WHERE schemaname='soundpub' 
  AND indexname LIKE 'idx_%token%';
  ```
- [ ] Test new functions
  ```sql
  SELECT soundpub.cleanup_rate_limits();
  SELECT soundpub.cleanup_expired_tokens();
  SELECT soundpub.check_rate_limit('test@example.com', 'password_reset', 3, 60);
  ```

### Run Migration (Production)
- [ ] Schedule maintenance window
- [ ] Notify users about brief downtime (optional)
- [ ] Create production backup
- [ ] Run migration on production
- [ ] Verify all changes applied
- [ ] Run smoke tests
- [ ] Monitor error logs

---

## ⚙️ PHASE 2: BACKEND FUNCTIONS

### Function 1: send-password-reset
- [ ] Create directory: `supabase/functions/send-password-reset/`
- [ ] Create `index.ts` file
- [ ] Implement request validation (email format)
- [ ] Implement rate limiting check
- [ ] Implement token generation (crypto.randomUUID)
- [ ] Implement database update (profiles table)
- [ ] Implement email sending (call send-app-email)
- [ ] Implement audit logging (auth_events)
- [ ] Add error handling
- [ ] Test locally with `supabase functions serve`
- [ ] Deploy to staging
  ```bash
  supabase functions deploy send-password-reset --project-ref staging
  ```
- [ ] Test on staging with Postman/curl
- [ ] Deploy to production

### Function 2: verify-password-reset-token
- [ ] Create directory: `supabase/functions/verify-password-reset-token/`
- [ ] Create `index.ts` file
- [ ] Implement token validation
- [ ] Implement expiry check
- [ ] Return user info if valid
- [ ] Test locally
- [ ] Deploy to staging
- [ ] Test on staging
- [ ] Deploy to production

### Function 3: reset-password
- [ ] Create directory: `supabase/functions/reset-password/`
- [ ] Create `index.ts` file
- [ ] Implement token validation
- [ ] Implement password strength validation
- [ ] Update password via Supabase Admin API
- [ ] Clear token from database
- [ ] Send confirmation email
- [ ] Log to auth_events
- [ ] Test locally
- [ ] Deploy to staging
- [ ] Test end-to-end flow
- [ ] Deploy to production

### Function 4: send-verification-email
- [ ] Create directory: `supabase/functions/send-verification-email/`
- [ ] Create `index.ts` file
- [ ] Implement token generation
- [ ] Implement rate limiting for resend
- [ ] Update profiles table
- [ ] Send email via send-app-email
- [ ] Log to auth_events
- [ ] Test locally
- [ ] Deploy to staging
- [ ] Test on staging
- [ ] Deploy to production

### Function 5: verify-email
- [ ] Create directory: `supabase/functions/verify-email/`
- [ ] Create `index.ts` file
- [ ] Implement token validation
- [ ] Set email_verified = true
- [ ] Update auth.users.confirmed_at
- [ ] Clear token
- [ ] Send welcome email (optional)
- [ ] Log to auth_events
- [ ] Test locally
- [ ] Deploy to staging
- [ ] Test on staging
- [ ] Deploy to production

### Update Existing: send-app-email
- [ ] Open `supabase/functions/send-app-email/index.ts`
- [ ] Add 'security' scope to SCOPE_TO_OPTIN mapping
- [ ] Add template: 'password-reset'
- [ ] Add template: 'email-verification'
- [ ] Add template: 'password-reset-confirmation'
- [ ] Test all new templates
- [ ] Deploy to staging
- [ ] Send test emails
- [ ] Deploy to production

### Configuration
- [ ] Update `supabase/config.toml`
  ```toml
  [functions.send-password-reset]
  verify_jwt = false

  [functions.verify-password-reset-token]
  verify_jwt = false

  [functions.reset-password]
  verify_jwt = false

  [functions.send-verification-email]
  verify_jwt = false

  [functions.verify-email]
  verify_jwt = false
  ```
- [ ] Commit and push config changes

---

## 🎨 PHASE 3: FRONTEND IMPLEMENTATION

### Page 1: ForgotPassword.tsx
- [ ] Create file: `src/pages/ForgotPassword.tsx`
- [ ] Setup component structure
- [ ] Add email input with validation (Zod)
- [ ] Add submit handler (call send-password-reset)
- [ ] Add loading state
- [ ] Add success state (email sent message)
- [ ] Add error handling (rate limit, invalid email)
- [ ] Add "Back to Login" link
- [ ] Style with Tailwind + shadcn/ui
- [ ] Test UI interactions
- [ ] Test form validation
- [ ] Test error states

### Page 2: ResetPassword.tsx
- [ ] Create file: `src/pages/ResetPassword.tsx`
- [ ] Setup component structure
- [ ] Read token from URL query params
- [ ] Validate token on mount (call verify-password-reset-token)
- [ ] Add password input fields (new + confirm)
- [ ] Add password strength indicator
- [ ] Add show/hide password toggle
- [ ] Add submit handler (call reset-password)
- [ ] Add success state (redirect to login)
- [ ] Add error handling (invalid token, expired, mismatch)
- [ ] Style with Tailwind + shadcn/ui
- [ ] Test all states

### Page 3: VerifyEmail.tsx
- [ ] Create file: `src/pages/VerifyEmail.tsx`
- [ ] Setup component structure
- [ ] Read token from URL query params
- [ ] Auto-verify on mount (call verify-email)
- [ ] Add loading state
- [ ] Add success state (redirect to dashboard)
- [ ] Add error state (invalid/expired token)
- [ ] Add "Resend Verification" button on error
- [ ] Style with Tailwind + shadcn/ui
- [ ] Test all states

### Page 4: VerifyEmailRequired.tsx
- [ ] Create file: `src/pages/VerifyEmailRequired.tsx`
- [ ] Setup component structure
- [ ] Show instructions for email verification
- [ ] Add "Resend Email" button
- [ ] Add "Logout" option
- [ ] Style with Tailwind + shadcn/ui
- [ ] Test interactions

### Update: Auth.tsx
- [ ] Open `src/pages/Auth.tsx`
- [ ] Add "Lupa Password?" link in login form
  ```tsx
  <Link to="/forgot-password">Lupa Password?</Link>
  ```
- [ ] Update signup success handler
- [ ] Call send-verification-email after signup
- [ ] Show toast: "Cek email untuk verifikasi"
- [ ] Test signup flow
- [ ] Test link navigation

### Update: useAuth.tsx
- [ ] Open `src/hooks/useAuth.tsx`
- [ ] Add to AuthContextType interface:
  - `requestPasswordReset(email: string)`
  - `resendVerificationEmail()`
  - `isEmailVerified: boolean`
- [ ] Implement requestPasswordReset function
- [ ] Implement resendVerificationEmail function
- [ ] Add isEmailVerified computed value
- [ ] Export in context provider
- [ ] Test all new functions

### Update: ProtectedRoute.tsx
- [ ] Open `src/components/auth/ProtectedRoute.tsx`
- [ ] Add optional prop: `requireEmailVerified?: boolean`
- [ ] Add email verification check
- [ ] Redirect to `/verify-email-required` if not verified
- [ ] Test protected routes
- [ ] Update route definitions

### Update Routes
- [ ] Open router config file
- [ ] Add route: `/forgot-password` → ForgotPassword
- [ ] Add route: `/reset-password` → ResetPassword
- [ ] Add route: `/verify-email` → VerifyEmail
- [ ] Add route: `/verify-email-required` → VerifyEmailRequired
- [ ] Test all navigation paths
- [ ] Test route guards

### UI Components
- [ ] Create email verification banner component
  ```tsx
  {!profile?.email_verified && (
    <Alert variant="warning">
      <AlertTitle>Email Belum Terverifikasi</AlertTitle>
      <AlertDescription>
        <Button onClick={handleResend}>Kirim Ulang</Button>
      </AlertDescription>
    </Alert>
  )}
  ```
- [ ] Add to Dashboard layout
- [ ] Style banner
- [ ] Test "Kirim Ulang" functionality

---

## 🧪 PHASE 4: TESTING

### Unit Tests
- [ ] Write tests for ForgotPassword component
- [ ] Write tests for ResetPassword component
- [ ] Write tests for VerifyEmail component
- [ ] Write tests for useAuth hook updates
- [ ] Write tests for edge functions (Deno test)
- [ ] Run all tests: `pnpm test`
- [ ] Achieve >80% code coverage

### Integration Tests
- [ ] Test full signup → verify email flow
- [ ] Test full password reset flow
- [ ] Test resend verification flow
- [ ] Test rate limiting behavior
- [ ] Test token expiry scenarios
- [ ] Test error handling paths

### E2E Tests (Playwright)
- [ ] Write E2E test for password reset
- [ ] Write E2E test for email verification
- [ ] Write E2E test for signup + verification
- [ ] Run E2E tests: `pnpm test:e2e`
- [ ] Fix any failing tests

### Manual Testing
- [ ] Test on Chrome
- [ ] Test on Firefox
- [ ] Test on Safari
- [ ] Test on Edge
- [ ] Test on mobile (iOS Safari)
- [ ] Test on mobile (Android Chrome)
- [ ] Test email delivery (Gmail)
- [ ] Test email delivery (Outlook)
- [ ] Test email delivery (Yahoo)
- [ ] Test spam folder behavior

### Security Testing
- [ ] Test SQL injection prevention
- [ ] Test XSS prevention
- [ ] Test CSRF protection
- [ ] Test rate limiting enforcement
- [ ] Test token brute-force protection
- [ ] Test password strength validation
- [ ] Test email enumeration prevention
- [ ] Run security audit tools (OWASP ZAP)

### Performance Testing
- [ ] Test edge function latency
- [ ] Test database query performance
- [ ] Test email sending speed
- [ ] Load test with Artillery.io
- [ ] Optimize slow queries if needed

### Accessibility Testing
- [ ] Run Lighthouse audit
- [ ] Run axe DevTools
- [ ] Test keyboard navigation
- [ ] Test screen reader compatibility
- [ ] Fix accessibility issues
- [ ] Achieve WCAG 2.1 Level AA

---

## 🚀 PHASE 5: DEPLOYMENT

### Pre-Deployment
- [ ] All tests passing
- [ ] Code review completed
- [ ] Security review completed
- [ ] Documentation updated
- [ ] Changelog created
- [ ] Release notes prepared

### Staging Deployment
- [ ] Build frontend: `pnpm build`
- [ ] Deploy backend functions
- [ ] Deploy frontend to staging
- [ ] Run smoke tests on staging
- [ ] Test all critical paths
- [ ] Get QA approval

### Production Deployment
- [ ] Schedule deployment window
- [ ] Notify stakeholders
- [ ] Create production backup
- [ ] Deploy backend functions
  ```bash
  supabase functions deploy send-password-reset --project-ref prod
  supabase functions deploy verify-password-reset-token --project-ref prod
  supabase functions deploy reset-password --project-ref prod
  supabase functions deploy send-verification-email --project-ref prod
  supabase functions deploy verify-email --project-ref prod
  ```
- [ ] Deploy frontend
  ```bash
  docker build -t soundpub-dashboard:v2.0.0 .
  docker tag soundpub-dashboard:v2.0.0 soundpub-dashboard:latest
  docker-compose up -d
  ```
- [ ] Verify deployment successful
- [ ] Run smoke tests on production
- [ ] Monitor error logs (first 1 hour)
- [ ] Monitor performance metrics

### Post-Deployment
- [ ] Announce new features to users
- [ ] Update user documentation
- [ ] Monitor email delivery rates
- [ ] Monitor user adoption (analytics)
- [ ] Collect user feedback
- [ ] Address any issues promptly

---

## 📊 PHASE 6: MONITORING & MAINTENANCE

### Monitoring Setup
- [ ] Setup Sentry for error tracking
- [ ] Configure error alerts (Slack/Discord)
- [ ] Setup email delivery monitoring
- [ ] Setup rate limit alerts
- [ ] Create admin dashboard for metrics
- [ ] Document monitoring procedures

### Daily Monitoring
- [ ] Check email delivery rate (> 95%)
- [ ] Check error rate (< 1%)
- [ ] Check rate limit violations
- [ ] Review failed email logs
- [ ] Check auth_events for anomalies

### Weekly Tasks
- [ ] Review weekly metrics
- [ ] Run cleanup functions manually (if cron not setup)
  ```sql
  SELECT soundpub.cleanup_rate_limits();
  SELECT soundpub.cleanup_expired_tokens();
  ```
- [ ] Review user feedback
- [ ] Update documentation if needed
- [ ] Plan improvements

### Monthly Tasks
- [ ] Security audit review
- [ ] Performance review
- [ ] Database cleanup (auth_events > 90 days)
  ```sql
  SELECT soundpub.cleanup_old_auth_events();
  ```
- [ ] Dependency updates
- [ ] Backup rotation

---

## 📈 SUCCESS METRICS TRACKING

### Week 1 KPIs
- [ ] Email verification rate: ___% (target: >60%)
- [ ] Password reset completion: ___% (target: >70%)
- [ ] Email delivery rate: ___% (target: >95%)
- [ ] Critical bugs: ___ (target: 0)
- [ ] User complaints: ___ (target: <5)

### Month 1 KPIs
- [ ] Email verification rate: ___% (target: >80%)
- [ ] Support ticket reduction: ___% (target: >30%)
- [ ] User satisfaction: ___/10 (target: >8)
- [ ] Average verification time: ___ hours (target: <1)

### Month 3 Goals
- [ ] All new users verified within 48 hours
- [ ] Password reset NPS: >8/10
- [ ] Zero critical security incidents

---

## 🐛 KNOWN ISSUES & FIXES

### Issue Tracker
- [ ] Issue #1: ___________________
  - Status: [ ] Open [ ] In Progress [ ] Resolved
  - Priority: [ ] Critical [ ] High [ ] Medium [ ] Low
  - Assigned to: ___________________
  - Fix: ___________________

- [ ] Issue #2: ___________________
  - Status: [ ] Open [ ] In Progress [ ] Resolved
  - Priority: [ ] Critical [ ] High [ ] Medium [ ] Low
  - Assigned to: ___________________
  - Fix: ___________________

---

## 🔄 ROLLBACK PLAN

### If Critical Issues Occur

**Step 1: Stop Deployment**
- [ ] Stop frontend deployment
- [ ] Notify team immediately

**Step 2: Rollback Frontend**
```bash
docker-compose down
docker run -d soundpub-dashboard:v1.0.0
```

**Step 3: Rollback Backend Functions (if needed)**
```bash
# Re-deploy previous versions
supabase functions deploy send-app-email --project-ref prod
```

**Step 4: Rollback Database (if needed - EXTREME)**
```bash
# Only if database corruption occurs
pg_restore -d soundpub backups/backup_YYYYMMDD_HHMMSS.sql
```

**Step 5: Verify System Stable**
- [ ] Test critical paths working
- [ ] Check error logs cleared
- [ ] Notify users of resolution

**Step 6: Post-Mortem**
- [ ] Document what went wrong
- [ ] Plan fixes
- [ ] Schedule re-deployment

---

## ✅ FINAL SIGN-OFF

### Stakeholder Approval
- [ ] Tech Lead: _______________________ Date: __________
- [ ] Security Officer: _________________ Date: __________
- [ ] Product Manager: __________________ Date: __________
- [ ] DevOps Lead: ______________________ Date: __________

### Implementation Complete
- [ ] All phases completed
- [ ] All tests passing
- [ ] Production deployed successfully
- [ ] Monitoring active
- [ ] Documentation complete
- [ ] Team trained
- [ ] Users notified

**Completion Date:** __________  
**Deployed By:** __________  
**Version:** v2.0.0

---

🎉 **Congratulations! Auth Verification System is now live!** 🎉

🎵 **SoundPub - Empowering Musicians, Securing Accounts** 🎵
