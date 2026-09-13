# Troubleshooting Guide - Edge Function Timeouts

## Quick Diagnostics

### 1. Check if timeout is still occurring
```bash
supabase functions logs send-password-reset --tail
```
Look for: "wall clock duration warning" or "early termination"

### 2. Verify email delivery
```sql
-- Check recent emails
SELECT 
  template_name,
  recipient_email,
  status,
  created_at,
  error_message
FROM Soundpub.email_send_log
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### 3. Test response time
```bash
# Using curl with timing
curl -w "\nTime: %{time_total}s\n" \
  -X POST https://your-project.supabase.co/functions/v1/send-password-reset \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```
Expected: < 2 seconds

## Common Issues After Deployment

### Issue 1: Emails not arriving
**Symptoms:** Function responds quickly but no emails received

**Check:**
```sql
SELECT * FROM Soundpub.email_send_log 
WHERE status = 'failed' 
ORDER BY created_at DESC LIMIT 10;
```

**Possible causes:**
- Gmail API credentials expired (check LOVABLE_API_KEY, GOOGLE_MAIL_API_KEY)
- Recipient opted out (check opt-in flags in profiles table)
- Rate limiting triggered

**Solution:**
1. Verify environment variables in Supabase dashboard
2. Check user opt-in status: `SELECT email_opt_in_payout, email_opt_in_release FROM profiles WHERE email = 'user@example.com'`
3. Review rate limit: `SELECT * FROM rate_limits WHERE identifier = 'user@example.com'`

### Issue 2: Function still timing out
**Symptoms:** Still seeing timeout warnings in logs

**Check:**
```bash
# View full function code to verify changes deployed
supabase functions download send-password-reset
cat send-password-reset/index.ts | grep -A 5 "invoke.*send-app-email"
```

**Verify pattern:**
- Should NOT have `await` before `invoke`
- Should have `.catch()` handler

**Solution:**
```bash
# Redeploy the function
supabase functions deploy send-password-reset --no-verify-jwt
```

### Issue 3: High error rate in email_send_log
**Symptoms:** Many failed status entries

**Check:**
```sql
SELECT 
  error_message,
  COUNT(*) as count
FROM Soundpub.email_send_log
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY error_message
ORDER BY count DESC;
```

**Common errors:**
- "LOVABLE_API_KEY not configured" → Set environment variable
- "Gmail API 401" → Refresh API credentials
- "Gmail API 429" → Rate limited, wait and retry

### Issue 4: Duplicate emails
**Symptoms:** Users receiving multiple copies

**Check:**
```sql
SELECT 
  recipient_email,
  template_name,
  idempotency_key,
  COUNT(*) as count
FROM Soundpub.email_send_log
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY recipient_email, template_name, idempotency_key
HAVING COUNT(*) > 1;
```

**Solution:**
- Idempotency keys should prevent this
- Check if function is being called multiple times from frontend
- Verify idempotency_key is set in function calls

## Performance Monitoring

### Response Time Tracking
```sql
-- Track function execution (if you add timing logs)
-- Add this to your functions:
-- console.log('Function duration:', Date.now() - startTime, 'ms')
```

### Email Queue Health
```sql
-- Emails sent in last hour by status
SELECT 
  status,
  COUNT(*) as count,
  ROUND(AVG(EXTRACT(EPOCH FROM (created_at - created_at))), 2) as avg_delay_seconds
FROM Soundpub.email_send_log
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY status;
```

### Rate Limit Status
```sql
SELECT 
  identifier,
  action_type,
  attempt_count,
  window_start,
  blocked_until
FROM Soundpub.rate_limits
WHERE blocked_until > NOW()
ORDER BY blocked_until DESC;
```

## Emergency Rollback

If critical issues occur:

### 1. Immediate rollback via Supabase Dashboard
1. Go to Functions section
2. Click on the function
3. Go to "Deployments" tab
4. Click "Restore" on the previous version

### 2. Or redeploy old code
```bash
# If you have git history
git checkout HEAD~1 -- supabase/functions/send-password-reset
supabase functions deploy send-password-reset
```

### 3. Verify rollback
```bash
supabase functions logs send-password-reset --tail
```

## Health Check Script

Save this as `check-email-health.sql`:
```sql
-- Overall health check
WITH recent_emails AS (
  SELECT 
    status,
    COUNT(*) as count,
    MAX(created_at) as last_sent
  FROM Soundpub.email_send_log
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY status
)
SELECT 
  status,
  count,
  last_sent,
  ROUND(100.0 * count / SUM(count) OVER (), 2) as percentage
FROM recent_emails
ORDER BY count DESC;
```

Run with:
```bash
psql $DATABASE_URL -f check-email-health.sql
```

## Getting Help

1. **Check logs first:**
   ```bash
   supabase functions logs <function-name> --tail
   ```

2. **Review documentation:**
   - TIMEOUT_FIX_SUMMARY.md
   - EDGE_FUNCTION_TIMEOUT_FIX.md
   - README_BEST_PRACTICES.md

3. **Verify environment:**
   - Supabase Dashboard → Settings → API
   - Check all required env vars are set

4. **Test in isolation:**
   - Call `send-app-email` directly to verify it works
   - Call other functions to isolate the issue

## Prevention Checklist

Before adding new Edge Functions:
- [ ] Avoid `await` on non-critical operations
- [ ] Use fire-and-forget for notifications
- [ ] Add error handlers with logging
- [ ] Test response times under load
- [ ] Monitor logs after deployment
- [ ] Set up idempotency keys for safety
- [ ] Document expected behavior

## Contact
For persistent issues, check:
- Supabase Community: https://github.com/supabase/supabase/discussions
- Project logs: Supabase Dashboard → Functions → Logs
