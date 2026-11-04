# Phase 3E Payment Dependency Inventory — Agent E

Scope: mock-only backend payment slice; synthetic disposable fixtures. No production provider, SSH, source data import, release/frontend edits or route registration.

Read authority: PHASE3D_FINAL_REPORT, PHASE3C_CLOSEOUT_FINAL_REPORT, PHASE3_FINAL_REPORT, PHASE1F_FINAL_REPORT, PHASE1G_DATABASE_EXTRACTION_CONTRACT, PHASE1G_FUNCTION_REPLACEMENT_MAP; canonical finance schema and repository invoice/webhook/pricing callers. Phase1F financial provenance failures remain unresolved production blockers. Supabase skill read; current changelog and securing-your-api documentation fetched. Dedicated backend migrations follow existing backend runner, not Supabase CLI.

| Dependency | Existing evidence | Disposition |
| --- | --- | --- |
| payout_requests | src/pages/Payouts.tsx, AdminPayouts.tsx; canonical schema | Agent D; no Agent E mutation |
| payout_balance_reservations | canonical schema; prior financial RPCs | Agent C/D; cross-domain reconciliation integration pending |
| balance_adjustments | canonical schema; delete_release_with_refund legacy semantics | Agent C; payment refund never silently credits royalty balance |
| release_payments | canonical schema, src/pages/Invoices.tsx, xendit-webhook | Legacy production only; new soundpub.payment_invoices backend contract |
| invoices | create-xendit-invoice, download-release-invoice | BACKEND_API + MOCK_PROVIDER; PDF/numbering not implemented, historical provenance gaps remain |
| callbacks | integrations/webhook.ts Phase 2 HMAC foundation | WEBHOOK; mock-payment raw-body envelope, durable webhook_events + payment_callback_receipts |
| create-xendit-invoice | supabase/functions/create-xendit-invoice/index.ts | MOCK_PROVIDER; no provider URL/network request |
| xendit-webhook | supabase/functions/xendit-webhook/index.ts | MOCK_PROVIDER; no production callback registration |
| create-copyright-invoice | Phase1G replacement map | PHASE3F_COPYRIGHT; legal workflow excluded |
| refund | DeleteReleaseDialog; delete_release_with_refund | Backend full mock refund only, no release deletion, balance credit or partial refund assumption |
| status helpers | frontend payment provider helpers and Invoices/Releases flows | Agent H integration; no frontend changes by Agent E |
| submission readiness | submissions/index.ts SubmissionDependencies.payment | exported paymentSubmissionDependency; coordinator main wiring required |
| pricing | legacy release pricing settings / per-track / category / custom-label | Fail closed: require total_payment_snapshot persisted by trusted backend; no default price or client amount |

## Public service contract

`createPaymentsService(pool, { callbackSecret, provider? })`, default `new MockPaymentProvider()`. Secret minimum 32 characters, server bootstrap only. Service does not read environment files or contact remote services.

- `createInvoice(actor, { release_id, idempotency_key }, requestId)` returns Invoice. Proposed POST `/api/v1/payments/invoices`.
- `status(actor, releaseId)` returns `{ invoice: Invoice|null, reconciliation: { invoice_id, issues, reconciled }|null }`. Proposed GET `/api/v1/payments/releases/:releaseId`.
- `refund(actor, { invoice_id, idempotency_key, reason }, requestId)` returns Invoice. Proposed POST `/api/v1/payments/refunds`.
- `callback({ provider: 'mock-payment', eventId, rawBody, signature, timestamp })` returns `accepted|duplicate`. Proposed POST `/api/v1/payments/callbacks/mock`. Raw body must be retained byte-for-byte; timestamp/event ID bound into HMAC. Route must map authentication/validation failures to controlled responses and bound request size.
- `reconcile(actor)` returns `{ mode: 'DRY_RUN', results, unresolved_callbacks, reconciled }`. Admin only; no repair.

Invoice fields: id, business_type='release', business_id, provider='mock', provider_invoice_id, amount_minor decimal integer string, currency='IDR', precision=2, status=PENDING|PAID|FAILED|REFUNDED, idempotency_key, reconciliation_required, created_at, updated_at. No live checkout URL exists.

Readiness: import `paymentSubmissionDependency` from `backend/src/payments/index.ts`, pass as `payment` to `createSubmissionService`. It uses caller transaction and returns true only for PAID + current price exact match + provider/effect/audit agreement + no manual-review flag. Unknown/zero price blocks. Release payment exemption semantics not invented.

One invoice per release. Same key/business/price replays; changed key or changed price conflicts. Failed/refunded invoice cannot be silently replaced; new payment-attempt policy requires explicit product contract.
