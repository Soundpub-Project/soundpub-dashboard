# 🔄 Xendit Webhook Flow Diagram

## Normal Flow (When Everything Works)

```
┌─────────────┐
│   USER      │
│ Bayar via   │
│ Xendit      │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│                  XENDIT                             │
│  • Payment processed                                │
│  • Invoice status: PENDING → PAID                   │
└──────┬──────────────────────────────────────────────┘
       │
       │ HTTP POST
       │ Header: x-callback-token
       │ Body: { id, status: "PAID" }
       ▼
┌─────────────────────────────────────────────────────┐
│         WEBHOOK ENDPOINT                            │
│  https://api.yourdomain.com/functions/v1/           │
│  xendit-webhook                                     │
└──────┬──────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│    EDGE FUNCTION: xendit-webhook                    │
│                                                     │
│  1. ✅ Validate x-callback-token header             │
│  2. ✅ Find payment by xendit_invoice_id            │
│  3. ✅ Update release_payments.status = 'paid'      │
│  4. ✅ Update releases.status = 'pending_paid'      │
│  5. ✅ Create notifications (user + admins)         │
│  6. ✅ Send emails (via send-app-email + Resend)    │
│                                                     │
└──────┬──────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│               DATABASE UPDATED                      │
│                                                     │
│  release_payments:                                  │
│    status: pending → paid ✅                        │
│    paid_at: <timestamp> ✅                          │
│                                                     │
│  releases:                                          │
│    status: draft → pending_paid ✅                  │
│                                                     │
│  notifications:                                     │
│    + User: "Pembayaran Berhasil" ✅                 │
│    + Admins: "Release Baru Dibayar" ✅              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Problem Flow (Current Issue)

```
┌─────────────┐
│   USER      │
│ Bayar via   │
│ Xendit      │ ✅ SUCCESS
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│                  XENDIT                             │
│  • Payment processed ✅                             │
│  • Invoice status: PAID ✅                          │
│  • Trying to send webhook... ⏳                     │
└──────┬──────────────────────────────────────────────┘
       │
       │ ❌ WEBHOOK NOT RECEIVED
       │ 
       ✖ (Possible reasons below)
       
┌─────────────────────────────────────────────────────┐
│               DATABASE STUCK                        │
│                                                     │
│  release_payments:                                  │
│    status: pending ❌ (should be 'paid')            │
│    paid_at: NULL ❌ (should have timestamp)         │
│                                                     │
│  releases:                                          │
│    status: draft ❌ (should be 'pending_paid')      │
│                                                     │
│  notifications: NONE ❌                             │
│  emails: NOT SENT ❌                                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Possible Failure Points

```
XENDIT → YOUR SERVER
   │
   ├─❌ 1. Webhook URL not registered in Xendit Dashboard
   │      └─ Solution: Register webhook + custom header
   │
   ├─❌ 2. Webhook URL not accessible from internet
   │      └─ Solution: Check firewall, DNS, SSL certificate
   │
   ├─❌ 3. Custom header x-callback-token missing/wrong
   │      └─ Solution: Add header in Xendit webhook settings
   │
   ├─❌ 4. XENDIT_WEBHOOK_TOKEN not set in server .env
   │      └─ Solution: Add to .env and restart functions service
   │
   ├─❌ 5. Edge Function not deployed or crashed
   │      └─ Solution: Check docker compose ps and logs
   │
   └─❌ 6. Payment record not found in database
          └─ Solution: Check create-xendit-invoice function
```

---

## Diagnostic Decision Tree

```
START: Webhook not received
│
├─ Test endpoint accessible?
│  │
│  ├─ NO → Fix firewall/DNS/SSL
│  │       Run: .\test-webhook-endpoint.ps1
│  │
│  └─ YES
│     │
│     └─ Check Xendit Dashboard webhook logs
│        │
│        ├─ NO LOGS → Webhook URL not registered
│        │             Solution: Register in Xendit Dashboard
│        │
│        ├─ 403 Forbidden → Token mismatch
│        │                  Solution: Check x-callback-token header
│        │
│        ├─ 404 Not Found → Payment record missing
│        │                  Solution: Check database + create-invoice function
│        │
│        ├─ 500 Error → Edge Function error
│        │              Solution: Check Edge Function logs
│        │
│        └─ 200 Success → Webhook received but logic error
│                         Solution: Check Edge Function logs for processing errors
```

---

## Quick Fix Workflow

```
┌──────────────────────────────────────────────────────┐
│ STEP 1: Verify Current State                        │
└──────────────────────────────────────────────────────┘
   │
   ├─ Check database for pending payments (SQL query)
   ├─ Get xendit_invoice_id from stuck payments
   └─ Verify invoice status in Xendit (check-xendit-invoice.ps1)

┌──────────────────────────────────────────────────────┐
│ STEP 2: Fix Webhook Registration (if needed)        │
└──────────────────────────────────────────────────────┘
   │
   ├─ Test endpoint: .\test-webhook-endpoint.ps1
   ├─ Login to Xendit Dashboard → Settings → Webhooks
   ├─ Add webhook URL with custom header
   └─ Test webhook from Xendit Dashboard

┌──────────────────────────────────────────────────────┐
│ STEP 3: Fix Server Environment (if needed)          │
└──────────────────────────────────────────────────────┘
   │
   ├─ SSH to server
   ├─ Check XENDIT_WEBHOOK_TOKEN in .env
   ├─ Add if missing, then restart functions service
   └─ Verify logs: docker compose logs functions

┌──────────────────────────────────────────────────────┐
│ STEP 4: Manual Trigger for Stuck Payments           │
└──────────────────────────────────────────────────────┘
   │
   ├─ For each PAID invoice that's stuck:
   │  └─ .\trigger-xendit-webhook.ps1 -InvoiceId "..."
   │
   └─ Verify database updated after each trigger

┌──────────────────────────────────────────────────────┐
│ STEP 5: Monitor Future Payments                     │
└──────────────────────────────────────────────────────┘
   │
   ├─ Test with new payment
   ├─ Monitor webhook logs real-time
   └─ Verify automatic webhook delivery works
```

---

## Testing Checklist

```
PRE-FIX VERIFICATION:
□ Run: .\test-webhook-endpoint.ps1
□ Check Xendit Dashboard webhook registration
□ Verify XENDIT_WEBHOOK_TOKEN in server .env
□ Check Edge Function is running (docker compose ps)

FIX IMPLEMENTATION:
□ Register webhook URL in Xendit Dashboard
□ Add custom header: x-callback-token
□ Enable events: invoice.paid, invoice.expired
□ Add XENDIT_WEBHOOK_TOKEN to server .env (if missing)
□ Restart functions service (if .env changed)

POST-FIX VERIFICATION:
□ Send test webhook from Xendit Dashboard
□ Check Edge Function logs for "Xendit webhook received"
□ Verify test returns 404 (payment not found) - this is OK
□ Create real test payment and verify it updates database
□ Manual trigger stuck payments: .\trigger-xendit-webhook.ps1
□ Verify all stuck payments now show status = 'paid'

ONGOING MONITORING:
□ Check webhook delivery logs in Xendit Dashboard daily
□ Monitor stuck payments with SQL query
□ Set up alert for payments pending > 1 hour
```

---

## Key Files Reference

| File | Purpose | When to Use |
|------|---------|-------------|
| 	est-webhook-endpoint.ps1 | Test if webhook URL accessible | **First step** - verify infrastructure |
| check-xendit-invoice.ps1 | Get invoice status from Xendit | Before manual trigger - verify PAID status |
| 	rigger-xendit-webhook.ps1 | Manual webhook trigger | Fix stuck payments after Xendit confirms PAID |
| WEBHOOK_TROUBLESHOOTING_GUIDE.md | Complete step-by-step guide | Full troubleshooting reference |
| README_WEBHOOK_FIX.md | Quick start guide | **Start here** for overview |

---

**Flow Version**: 1.0
**Last Updated**: 2026-09-03 22:10 WIB
