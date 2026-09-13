# Edge Function Timeout Fix

## Issue
Edge Functions were experiencing wall clock duration warnings and early termination:
- send-password-reset
- send-app-email
- eset-password
- send-verification-email
- xendit-webhook

## Root Cause
Synchronous nested function invocations caused timeout issues:
1. Parent function calls send-app-email with wait
2. send-app-email makes Gmail API calls with 300ms throttling
3. Total execution time exceeds Supabase's 60-second timeout
4. Both isolates are terminated early

## Solution
Changed email sending to **fire-and-forget** pattern:
- Removed wait from supabase.functions.invoke('send-app-email', ...)
- Added .catch() handler for error logging without blocking
- Functions now respond immediately without waiting for email delivery

## Changes Made

### 1. send-password-reset/index.ts
**Before:**
`	ypescript
await supabase.functions.invoke('send-app-email', {
  body: { ... }
})
`

**After:**
`	ypescript
supabase.functions.invoke('send-app-email', {
  body: { ... }
}).catch((err) => {
  console.error('Email send failed (non-blocking):', err)
})
`

### 2. reset-password/index.ts
Same pattern applied for password reset confirmation email.

### 3. send-verification-email/index.ts
Same pattern applied for email verification.

### 4. xendit-webhook/index.ts
Applied to both:
- Payment success email via send-app-email
- Admin notification via Resend API

## Benefits
- **No timeouts**: Functions respond within milliseconds
- **Better UX**: Users get immediate feedback
- **Reliability**: Email failures don't block critical operations
- **Scalability**: Can handle concurrent requests without cascading delays

## Email Delivery Guarantee
Emails are still sent reliably:
- send-app-email runs independently after parent responds
- Failures are logged in email_send_log table
- Idempotency keys prevent duplicate sends
- Rate limiting remains in place

## Testing
Test the following scenarios:
1. Password reset request - should respond immediately
2. Email verification - should respond immediately
3. Payment webhook - should process payment and respond quickly
4. Check email_send_log table to verify emails are sent

## Monitoring
Watch for these log patterns:
- Success: No timeout warnings
- Email errors: Email send failed (non-blocking): in logs
- Check email_send_log for delivery status

## Notes
- Supabase Edge Functions have a default 60-second timeout
- Fire-and-forget is appropriate for non-critical notifications
- Critical operations (password updates, payment processing) complete before response
- Email sending happens asynchronously without blocking
