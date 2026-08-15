# Edge Functions - Best Practices

## Avoid Timeout Issues

### ❌ Don't: Synchronous nested function calls
```typescript
// This will cause timeouts
await supabase.functions.invoke('send-email', { ... })
return response // Waits for email to complete
```

### ✅ Do: Fire-and-forget for non-critical operations
```typescript
// Respond immediately, email sends in background
supabase.functions.invoke('send-email', { ... })
  .catch(err => console.error('Email failed:', err))
return response // Returns immediately
```

## When to Use Each Pattern

### Use `await` (Blocking) When:
- The operation is critical to the response (e.g., database updates)
- You need the result to continue processing
- The operation is fast (< 5 seconds)

### Use Fire-and-Forget When:
- Sending notifications/emails
- Logging non-critical events
- Triggering background jobs
- Any operation that can fail without breaking the main flow

## Modified Functions
The following functions now use fire-and-forget for email:
- ✅ `send-password-reset`
- ✅ `reset-password`
- ✅ `send-verification-email`
- ✅ `xendit-webhook`

## Testing Checklist
- [ ] Password reset emails arrive (check email_send_log)
- [ ] Verification emails arrive
- [ ] Payment notifications work
- [ ] No timeout warnings in logs
- [ ] Response times < 2 seconds

## Monitoring
```sql
-- Check email delivery status
SELECT 
  template_name,
  status,
  COUNT(*) as count,
  MAX(created_at) as last_sent
FROM soundpub.email_send_log
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY template_name, status
ORDER BY last_sent DESC;
```

## Common Patterns

### Pattern 1: Critical then Notify
```typescript
// Do critical work with await
await supabase.from('table').update(data)

// Send notification without blocking
supabase.functions.invoke('send-notification', { ... })
  .catch(err => console.error('Notification failed:', err))

return success_response
```

### Pattern 2: Multiple Non-Blocking Operations
```typescript
// Fire multiple operations in parallel
Promise.all([
  supabase.functions.invoke('send-email', { ... }),
  supabase.functions.invoke('log-event', { ... }),
]).catch(err => console.error('Background tasks failed:', err))

return response // Don't await the Promise.all
```

### Pattern 3: Conditional Email
```typescript
if (shouldNotify) {
  supabase.functions.invoke('send-email', { ... })
    .catch(err => console.error('Email failed:', err))
}
// Continue immediately regardless of email status
```

## Performance Tips
1. **Keep functions lightweight** - Under 10MB bundle size
2. **Minimize dependencies** - Use esm.sh for tree-shaking
3. **Database queries** - Use indexes, limit results
4. **External APIs** - Use timeouts, handle failures gracefully
5. **Logging** - Log errors, not debug info in production

## Debugging Timeout Issues
1. Check Supabase logs for "wall clock duration warning"
2. Look for "early termination" messages
3. Identify slow operations (database queries, external APIs)
4. Add timestamps to log critical checkpoints
5. Consider breaking into smaller functions

## Resources
- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Deno Deploy Limits](https://deno.com/deploy/docs/limits)
- Email delivery logs: `soundpub.email_send_log`
