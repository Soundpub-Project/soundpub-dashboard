# Phase 3E Security Report — Agent E

Payment service/security slice: PASS for checked synthetic backend behavior. Phase-wide security acceptance: PARTIAL; HTTP/main/frontend integration and independent QA pending.

Current DB user status/verified roles reloaded under usersRepository transaction locks. Active artist owns release via current artist_user_id, or current admin/superadmin authorized. Historical created_by/label_id never grants authority. Conservative label refusal is deliberate until coordinator supplies explicit current membership policy. Refund/reconciliation admin only. Removed roles and suspended actors reject even with stale Principal object.

Strict input schemas reject forged amount/status/owner fields. Invoice price comes exclusively from persisted release snapshot. Missing/zero/invalid price rejects; no legacy defaults copied. UUIDs and keys validated. All SQL values parameterized. Full refund only; one refund and one refund effect per invoice; duplicate with changed reason/key conflicts. No client balance or payment authority.

Callback uses Phase 2 HMAC SHA-256 verifier, timing-safe comparison, signed timestamp+event ID+exact raw bytes, 300-second freshness window, 1 MiB body ceiling. provider must be mock-payment. Adapter pins private schema for Phase 2 unqualified webhook SQL. Persisted event digest rejects same ID/different bytes. Authenticated unsupported/unknown events persist without effects. Callback secret is injected, never persisted, logged or returned. HTTP layer must preserve raw bytes and map verifier exceptions to safe responses; route rate limiting remains coordinator integration responsibility.

Financial mutation + audit + effects + mock provider state commit atomically on one PostgreSQL connection. SQL unique constraints protect business invoice/key, provider reference, effect(invoice,kind), event ID, refund invoice/key. Invoice row lock serializes callback/refund; advisory locks serialize cross-business idempotency keys. Immutable payment effects/receipts/refunds cannot UPDATE/DELETE as runtime. No SECURITY DEFINER functions or public grants added; private soundpub schema, no PostgREST/public-schema exposure. RLS not used as substitute for service authorization on private backend schema.

Exported submission dependency grants readiness only after price/state/provider/effect/audit agreement. Mismatch flags persist and fail closed. There is no automatic reconciliation repair, clearing quarantine, payment exemption, partial refund, invoice replacement, copyright/legal mutation, real payout or real refund.

Executed checks: backend typecheck PASS; payments.test.ts 2/2 PASS including real disposable PostgreSQL soundpub_app checks. Coverage includes unrelated owner denial, forged amount denial, non-admin refund denial, stale status/role denial, callback signature/body/timestamp denial, altered-event replay denial, exactly-once charge/refund, audit failure rollback, append-only grants and deterministic invoice-lock contention.

Limits: no HTTP/browser test or deployment claim. Pricing snapshot producer and release/main routes remain coordinator-owned. Production historical provenance gaps from Phase1F/1G remain unresolved. No SSH, no production secrets, no real provider, no production financial rows, no shared infrastructure mutation.

## Coordinator closeout ? 2026-10-29

HTTP/backend-mode integration, browser fail-closed paths and full regression suite were subsequently executed. Browser matrix: 12 PASS, 0 FAIL, zero financial Supabase egress. Backend: 180 PASS, 0 FAIL, 4 environment-dependent SKIP. Standalone track count edits now reject priced releases; invoice creation rejects missing unit price or stale track count. Phase-wide security remains PARTIAL only because real settlement/provenance and approved reconciliation flows are absent, not because an unsafe browser settlement path remains.
