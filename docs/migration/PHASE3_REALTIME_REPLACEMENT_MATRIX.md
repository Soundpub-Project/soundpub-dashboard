# Phase 3 Realtime Replacement Matrix

**Overall replacement status: BLOCKED.**

Evidence date: 2026-10-28. Local source and recorded Phase1 audit evidence only. No production/publication query, Realtime connection or replacement endpoint test performed. See [domain matrix](PHASE3_DOMAIN_MIGRATION_MATRIX.md) for acceptance states.

## Inventory and actual baseline

`src` has **three `.channel(...)` constructions and four `postgres_changes` handlers**. Two profile UPDATE handlers share one channel. No broadcast, presence, server-sent events or WebSocket replacement implementation was found. Auth's `onAuthStateChange` is session lifecycle and belongs to Phase4 Auth inventory, not a PostgreSQL changefeed.

Recorded audit `SUPABASE_MIGRATION_AUDIT.md`, section F, found production Realtime publication with no `soundpub` tables. This is historical evidence, not a fresh check. Current code also has literal schema mismatches: profile handlers and NotificationCenter use `Soundpub`, while catalog contracts name lowercase `soundpub`; NotificationBell uses `public`. Do not silently lowercase strings and claim delivery. Current default client schema is configurable and defaults to `Soundpub`, but that does not rewrite channel filter schema strings.

Initial data fetches do exist; these do not prove live delivery. No successful source change event or frontend realtime parity is evidenced. Replaced **0/4 handlers**, deferred **1/4** (unrendered NotificationCenter), blocked **3/4** (active layout/bell handlers). This is a handler count; channel count is three. No requirement establishes subsecond delivery, so bounded authorized polling is the first proposed replacement for active UI.

## Handler migration matrix

| Channel / caller | Current event, schema, table and filter | Consumer / current behavior | Decision | Proposed replacement / endpoint availability | Migration / test / blocker |
| --- | --- | --- | --- | --- | --- |
| `profile-balance-changes`, `src/components/layout/DashboardLayout.tsx:61,63` | UPDATE, `Soundpub.profiles`, `id=eq.${profile.id}` | Mounted dashboard layout; initial `refreshCurrentBalance`; payload with balance triggers same refresh. Nonlabel uses auth profile balance; label/whitelabel fetches aggregate RPC. Cleanup removes channel. | POLLING_ACCEPTABLE | Shared domain-hook invalidation after successful mutations + bounded visible-tab/focus polling. `GET /api/v1/profile` exists for self balance, but not aggregate label balance. No balance polling adapter implemented. | BLOCKED; no poll lifecycle/visibility/error tests, profile decimal mismatch; source publication/schema delivery unverified. |
| `profile-balance-changes`, DashboardLayout `:77` | UPDATE, `Soundpub.profiles`, `parent_label_id=eq.${profile.id}` | Same channel; child balance changes trigger label aggregate RPC refresh. Listener installed even when caller isn't label; callback recomputes using role. | POLLING_ACCEPTABLE | One authorized balance-summary query per polling tick, not one request per child. Required dashboard aggregate service absent; `/api/v1/me` and self profile are not equivalent. | BLOCKED; no aggregate endpoint or replacement listener; test membership changes, concurrent reservations, hidden tabs, unrelated labels and active-status revocation. |
| `notifications-realtime`, `src/components/notifications/NotificationBell.tsx:41,43` | INSERT, `public.notifications`, no server-side recipient filter; callback accepts own user or `is_global` | Rendered in DashboardLayout `:206`. Initial latest-50 query `:65`; prepend matching inserts; unread count from loaded items; mark one/all uses direct table UPDATE. Cleanup removes channel. | POLLING_ACCEPTABLE | Authorized inbox list + read mutation service; poll while visible/focused, invalidate on local actions, deterministic dedup/order. No inbox/read endpoint exists. Generic `/api/v1/actions/notification` is enqueue-only. | BLOCKED; current schema differs from catalog. Must decide global read-per-user semantics and whether unread means latest 50 or total; no replacement/UI parity proof. Client filtering cannot secure event visibility. |
| `notifications`, `src/components/notifications/NotificationCenter.tsx:32,34` | INSERT, `Soundpub.notifications`, `user_id=eq.${user.id}` | Source component loads latest 20, increments unread and prepends payload; ignores globals. Cleanup `channel.unsubscribe()`. `rg` finds declaration/export only, no import/render consumer. | DEFER | No active replacement UI required until consumer/retirement decision; share future inbox service if activated. No endpoint exists. Do not introduce polling for unmounted component. | DEFERRED / LEGACY_ONLY candidate; not proven safe to delete. Owner verifies dynamic/external use. No event-delivery or render test proof. |

## Replacement contract and checks still needed

| Concern | Required behavior / evidence |
| --- | --- |
| Authorization | Derive current actor and inbox/aggregate scope on server. Deny unrelated owner/label and inactive/suspended users. Polling errors must not retain another identity's data after account/impersonation switch. |
| Balances | Server computes role aggregate and reservations; exact decimals. Child profile UPDATE alone cannot express every membership/payout event. Refetch authoritative state after mutations; never apply a browser delta as financial truth. |
| Poll lifecycle | One cancellable request per resource/key; pause hidden/offline; refetch on focus/reconnect; clean up on unmount/user change. Cadence, maximum acceptable staleness and backoff require product/UX agreement and tests; no fabricated interval acceptance here. |
| Notification visibility | Explicit owned/global projection with private metadata filtering; no unfiltered cross-user changefeed. Source list relies on source authorization; new endpoint must enforce its own visibility. |
| Ordering / duplicates | Stable created-at plus ID order; deduplicate across polling overlap; reconcile deletions/updates/read state. Existing prepend-only INSERT behavior does not prove these cases. |
| Read state | Validate one/all-read target ownership, optimistic rollback and failure display. Global notification read state must not let one user mark all users' copies read. Existing single `is_read` column is not a proven desired global policy. |
| Regression | Desktop/mobile, initial loading, empty/error/offline, unauthorized, read success/failure, navigation, session switch and cleanup. Backend tests alone cannot prove UI freshness. |
| Escalation | REQUIRED_REALTIME, SSE or WEBSOCKET only if measured UX/latency requirements exceed bounded polling. None currently selected or implemented. |

## Related mechanisms excluded from channel totals

`src/hooks/useRoyaltyData.ts` uses React Query with five-minute `staleTime`; that is cache freshness, not periodic polling or Realtime replacement. `src/pages/PaymentCallback.tsx:17` runs a UI countdown and trusts URL status for display; it does not poll authoritative invoice status. Auth/session refresh, email delivery and database outbox polling are separate mechanisms and cannot be counted as replacing these four handlers.

Completion requires implemented and authorized query/mutation contracts, actual frontend hook wiring, removed legacy business subscription for accepted branch, deterministic lifecycle/parity tests, frontend regression and independent QA. Current decision is proposed polling plus explicit defer; **no Realtime replacement is accepted**. The runnable name-coverage check is in the domain matrix.
