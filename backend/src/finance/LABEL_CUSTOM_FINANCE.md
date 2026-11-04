# Label Custom finance gates

Migration ordering: 0023, concurrent release/track migration 0024, then 0025.

Royalty attribution derives canonical artist and financial owner from persisted release/track identity. Optional beneficiary_id and artist_id are assertions. Forged assertions and financial_owner_user_id input are rejected. Corrections reverse the immutable original owner, without catalog re-resolution. Existing checksum shape stays compatible. Import/correction audit and outbox share the ledger transaction, including zero-value batches.

PIC account scope excludes roster accounts even with overlapping label roles. Active PIC and unit are required. Foreign historical allocations fail closed. Strict payout DTO rejects artist/owner/recipient fields.

## Reconciliation remains closed

Custom balance returns RECONCILIATION_REQUIRED and available=null. Custom eligibility returns RECONCILIATION_REQUIRED; payout request fails PAYOUT_INELIGIBLE even with an injected permissive policy. Existing batches permit only immutable UNRECONCILED status. Durable independent approval and verified destination ownership workflow are absent. Opening payout requires reviewed evidence binding owner/currency, complete source/ledger scope, correction state, audit/outbox integrity and verified PIC destination. Never infer approval from no errors or trust browser account_holder_name.

Historical financial owner preserves original beneficiary. Artist backfill uses only matching login-artist release/track FKs. Unresolved historical artist_id remains NULL; unresolved new imports are rejected. Standalone historical login identities without canonical catalog mapping need explicit catalog reconciliation. No identities are fabricated.

PIC-only breakdown routes support artist, release and YYYY-MM period; filter ownership is checked. Stored financial owner scopes history. Breakdown is internal reporting, not spendable balance.

## Evidence

Docker-free focused command from backend:

    node --import tsx --test test/royalties.test.ts test/label-custom-finance.test.ts

Result: 18 passing tests. Backend typecheck and root frontend build passed (existing bundle-size warning).

Full npm test was not run: unconditional Docker helpers violate requested boundary. An attempted test-name filter unexpectedly executed those helpers, launching and cleaning disposable Docker containers. This execution mistake was reported; PostgreSQL checks passed but do not count as Docker-free evidence. Do not repeat that command. No remote server, backup or environment-file access occurred.

Remaining evidence: custom SQL guard negative tests, existing-data upgrade/reconciliation fixtures, actual multi-artist custom posting-to-breakdown equality, verified destination and independent approval workflow. No production-readiness claim.
## 0026 readiness opening (2026-11-03)

Additive migration 0026 introduces append-only PIC destination versions, independent admin verification, reconciliation approval snapshots, and separate revocations. Latest destination update is pending until verified; prior verification never transfers. Admin evidence reference attests PIC bank ownership and account-holder identity; browser holder text alone grants no readiness.

GET/PUT /api/v1/payouts/destination reads/submits own destination. POST /api/v1/admin/payouts/readiness/:id reviews PIC identified by path id. Strict action variants: verify_destination (destination_id, evidence), approve_reconciliation (evidence), revoke_destination (destination_id, reason), revoke_reconciliation (approval_id, reason). Review requires independent active admin. Mutation audit/outbox share transaction and omit bank fields/evidence.

Approval binds owner, IDR and complete immutable royalty batch/correction set plus non-payout ledger event set. Expected batch earnings/reversals must exactly match account ledger; manual adjustments require separate reconciliation support and currently fail closed. Every finance event must have exact audit states and matching outbox topic/payload/key. New imports or corrections change snapshot and require fresh approval. Reservations/releases/settlements do not stale approval but their audit/outbox integrity is checked. Revoked approval cannot reactivate. Request requires exact match to latest verified server destination and inserts server fields. PIC allocations remain PIC-only; legacy label policy remains unchanged.

Docker-free validation: 22 focused tests (royalties, label-custom-finance, label-custom-payout-readiness) passed; backend typecheck passed. Full suite and existing payouts.test.ts include unconditional Docker helpers and were deliberately not executed. PostgreSQL migration/upgrade, database race/constraint execution remain unverified. No production readiness claim.
Frontend production build also passed via Vite API with envFile:false and build.write:false: no environment files loaded and no build artifacts written.
