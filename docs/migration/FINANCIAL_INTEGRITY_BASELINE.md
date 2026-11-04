# Financial Integrity Baseline

## Status and scope

**BLOCKED for financial migration sign-off.** Current ledger arithmetic passes the measured checks; payment trust boundaries, historical provenance, and behavioral verification remain unresolved.

Audit date: 2026-10-27, Asia/Bangkok. PostgreSQL snapshot timestamp: 2026-10-26 20:08:07 UTC (2026-10-27 03:08:07 Asia/Bangkok). PostgreSQL 17.6, database `postgres`, application schema `soundpub`.

Read full Phase 1 attachment, root `AGENTS.md`, `.agents/skills/supabase/SKILL.md`, and `SUPABASE_MIGRATION_AUDIT.md`. This document covers Workstream H only; no overall Phase 1 score or independent QA PASS is asserted.

All database inspection used explicit READ ONLY transactions over SSH to `maskhar@20.20.20.3`, working from `/data/supabase/instances/supabase-01/config`, with `docker compose exec -T db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1`. Main reconciliation used REPEATABLE READ and a 45-second statement timeout. No financial RPC was executed, no historical assertion script was run, and no production data, configuration, deployment, or secrets were changed. Only this document was written. Counts, metadata, and source definitions were examined; no financial amounts, identity rows, bank details, invoice identifiers, or secret values are published.

Source baseline: branch `main`, HEAD `48222ffb9c9e60da82d224e1e8aaccd4dd597442`. Existing modified financial sources include `src/pages/UploadRoyalty.tsx`, `supabase/functions/process-royalty-upload/index.ts`, and `supabase/functions/delete-royalty-upload/index.ts`. October 23 financial migrations and SQL assertion scripts are untracked at inspection. Existing unrelated changes were preserved. Conclusions use working-tree source, not HEAD alone.

## Aggregate production baseline

| Entity | Rows / state |
| --- | ---: |
| Profiles | 182 |
| Royalties | 14,474 |
| Royalty uploads | 10, all success |
| Composer royalties | 0 |
| Archived royalties | 0 |
| Balance adjustments | 33, all migration_opening_balance |
| Payout reservations | 5 |
| Payout requests | 3: approved 1, paid 2 |
| Release payments | 9: expired 5, paid 4 |
| Copyright registration payments | 2, both expired |

| Read-only check | Observed |
| --- | ---: |
| Profile balance differs from reconstructed ledger | 0 |
| Profile artist revenue differs from royalty allocation | 0 |
| Profile label revenue differs from royalty allocation | 0 |
| Negative profile balances | 0 |
| Active/paid payout reservation sum differs from requested amount | 0 |
| Paid payouts without reservations / proof path | 0 / 0 |
| Reservations outside requester's current label group | 0 |
| Royalties missing artist or label recipient | 0 |
| Net revenue differs from artist + label + Soundpub allocation | 0 |
| Royalties without source row number | 14,474 |
| Uploads without idempotency key | 10 |
| Successful uploads whose inserted_records differs from live rows | 10 |
| Composer uploads orphaned / duplicate composer-period groups | 0 / 0 (empty population) |
| Release payments with missing profile user | 0 |
| Duplicate release / copyright provider invoice groups | 0 / 0 |
| Provider invoice collisions across payment tables | 0 |
| Paid release payments missing paid_at / provider reference | 0 / 0 |
| Paid release payments missing invoice number / PDF path | 2 / 2 |
| Paid copyright registrations still awaiting_payment | 0 (no paid copyright payments) |
| Multiple paid payment rows for same release | 0 |

All 10 upload records have `inserted_records = 0`; their combined `total_records = 14,474`, matching actual royalties, with each upload's total_records matching its own rows. This is legacy metadata inconsistency, not evidence of lost royalty rows. Do not overwrite it during migration without an approved provenance rule. Empty composer and paid-copyright populations provide no positive behavioral coverage. Proof/PDF path presence does not establish object existence or readability.

## Deployed financial SQL and double decrement

Catalog bodies were compared directly to repository dollar-quoted function bodies after CRLF normalization and trimming; all six below matched:

| Live function | Matching working-tree SQL |
| --- | --- |
| request_payout | supabase/migrations/20261023041039_harden_royalty_financial_workflows.sql |
| update_payout_status | same |
| rebuild_royalty_balances | same |
| delete_release_with_refund | same |
| reverse_royalty_upload | same |
| commit_royalty_upload | supabase/migrations/20261023055703_royalty_artist_history_guard.sql |

All six are postgres-owned SECURITY DEFINER functions with fixed search_path. They share the transaction advisory lock `soundpub_royalty_financial_mutation`.

- **Request:** authenticated label/whitelabel only; validates positive amount and bank fields, rebuilds balances, locks requester/managed profiles, reserves available funds with matching reservation rows. Insufficient funds raises an exception and rolls back.
- **Approval/payment:** admin predicate and row lock; pending to approved, approved to paid, pending/approved to rejected. Approval/payment checks reservation total; paid requires nonempty proof path. Payment does not decrement balance again. Rejection rebuilds and excludes rejected reservations, releasing funds.
- **Rebuild:** available balance = artist allocation + label allocation + adjustments minus reservations for pending/approved/paid payouts. Paid payouts without reservations block rebuild.
- **Import:** service-role execution only; verifies supplied actor is admin, validates one YYYY-MM period, numeric precision, nonnegative amounts/units, active recipients and roles, catalog ownership and historical artist identity. Prevents adding a second populated period unless exact-filename full-period replacement is requested. Uses upload idempotency, archives replaced rows, calculates rounded artist and Soundpub shares with label as residual, rebuilds, rejects negative balances, and checks per-profile and total deltas.
- **Reversal:** service-role execution only; admin actor, archives royalties, deletes upload/rows, rebuilds, rejects resulting negative balances in the same transaction.
- **Refund:** admin or restricted unpaid owner deletion; paid deletion credits one selected payment through a unique adjustment, deletes release (payments cascade), rebuilds, writes audit evidence.

**Historical double decrement is real in source logic, but not demonstrated as an active client flow or historical monetary loss.** `supabase/migrations/20260904_payout_reserve_and_proof.sql` reserves/decrements at request. `supabase/migrations/20260904_label_aggregate_payouts.sql` defines `complete_payout(uuid)`, which decrements available balances again when completing an approved request. Its live legacy body remains unchanged; EXECUTE is false for anon, authenticated, and service_role. The postgres owner can still execute it. No frontend caller was found; current callers are `src/pages/Payouts.tsx:111` and `src/pages/AdminPayouts.tsx:149`, using request/status RPCs.

Live `update_balance_on_payout_status_change()` also contains paid-transition decrement and reversal increment. Catalog inspection found **zero trigger attachments** to this function. It is callable by anon/authenticated at the privilege level but returns trigger, so it is not an ordinary callable financial RPC. Do not reattach it during schema reproduction. Current payout table triggers are audit and timestamp only. A legacy completion call plus this trigger would introduce further decrement, but that is not the observed deployed trigger configuration.

## Runtime comparison and Xendit

Confirmed functions container mount: `/data/supabase/instances/supabase-01/config/volumes/functions` to `/home/deno/functions`. Inspected mounted source; runtime request execution and provider callbacks were not invoked.

| Function | Repository SHA-256 | Mounted SHA-256 |
| --- | --- | --- |
| process-royalty-upload/index.ts | aff3b88aeb8b43a5f19dca79c670379d05f09c2540fcc7a9ac79539269f974eb | same |
| delete-royalty-upload/index.ts | b888425b64c5f06a50a75e2b7a06ab934f8f49d52725047f823bdd90705cacb4 | same |
| xendit-webhook/index.ts | 686778c57773ccb69b36165c31a6367fbe538f2726a3d3d4f7cd1b8e389ff60d | bbf24972b3fd321cfd35adae65a4dc6da1e81c505111e84681b9dab70efd9014 |

Webhook line-by-line comparison via PowerShell Get-Content/Compare-Object showed no changed text lines; differing raw checksums are consistent with line-ending differences. No semantic webhook drift was found in that comparison. This does not verify which worker version is resident in memory.

Both royalty Edge sources validate bearer identity and admin status before invoking privileged import/reversal RPCs with the verified user ID. Their source matches the mounted deployment byte-for-byte.

Webhook evidence in `supabase/functions/xendit-webhook/index.ts:29` onward:

- Missing configured callback token fails closed; mismatched callback token returns 403.
- Maps PAID/SETTLED to paid and EXPIRED/FAILED appropriately. Copyright invoices are looked up first.
- Uses status-conditioned updates to avoid duplicate writes. Already-paid payments return early.
- **Missing amount is accepted** by amountsMatch; currency is checked only when supplied. Present amounts use JavaScript Number equality, unsuitable as a general exact-decimal migration rule.
- Payment update and release/registration update are separate database requests. If payment commits but parent update fails, retry sees paid and exits before repairing parent state. Notifications/invoice generation have similar recovery limits. This is a verified code failure path, not a reproduced production failure.
- Copyright path permits a non-paid refunded/cancelled row to become paid on a later PAID event; no explicit allowed-transition guard exists. Release path guards failed/expired events but permits a later paid event after other non-paid states. Business transition policy needs explicit approval.
- Logs full callback body and legacy email response. Existing production logs were not read because they can contain private payment data.

## Findings and migration blockers

1. **HIGH: client payment insertion can assert financial state.** Live authenticated grants include INSERT for release and copyright payments. Release INSERT policy checks only `user_id = auth.uid()`; copyright INSERT policy checks owner, fixed pricing/emeterai fields and owned registration, but does not constrain payment_status. Neither table has a payment-status validation trigger beyond audit/timestamp. Thus ordinary client inserts are not restricted to pending payment state by these inspected controls; source code alone cannot establish provider-confirmed payment authenticity. No exploit/write test performed. Security agent must verify full API reachability and remediate with independent QA before financial sign-off.
2. **HIGH: opening adjustments encode history, not independent reconciliation.** All 33 adjustments are migration_opening_balance. Creation SQL computes the difference necessary to preserve then-current balance. Current zero balance residuals prove internal arithmetic only; they cannot disprove an earlier double decrement, erroneous initial balance, or unrecorded external settlement. Require authorized provider/bank settlement reconciliation and approval of each opening adjustment privately.
3. **HIGH: webhook partial commits and retry gaps.** Atomic settlement or a durable recovery mechanism must be defined and tested in isolation. Current absence of awaiting-payment mismatches does not prove all notifications, invoices, or parent transitions completed.
4. **HIGH: reproducibility/provenance incomplete.** Matching deployed hardening bodies are held in untracked migrations. Legacy SQL still contains hazardous completion logic and production-specific balance repair in `supabase/migrations/20260907_reconcile_kaditrudit_payout_balance.sql`. Do not blindly replay it. Canonical schema must preserve revocations and unattached trigger state.
5. **MEDIUM: legacy import metadata lacks replay coverage.** All source-row keys and upload idempotency keys are null; partial unique indexes do not protect these historical rows. All inserted_records counters are zero. No duplicate royalty fact proof is claimed: repeated commercial dimensions may be legitimate, and source-file provenance is required to distinguish duplicate facts.
6. **MEDIUM: invoice constraints incomplete.** Copyright invoice ID has a partial unique index; release provider invoice ID does not. Cross-table uniqueness is absent. No collisions currently observed. Release invoice_number has a partial unique index, but two paid rows lack number and PDF path.
7. **MEDIUM: refund ledger trace depends on audit/adjustment preservation.** Release payments cascade on release deletion; adjustment source_id has no payment FK. Refund selects one paid payment without enforcing one paid payment per release. No multi-paid release exists now. Preserve refund adjustments, archived/audit evidence and source relationships; do not infer missing source payment means invalid adjustment.
8. **MEDIUM: exact equality is stricter than import guard.** Deployed import checks `abs(delta difference) > 0.01`, permitting a one-cent difference. Migration acceptance must use exact numeric equality. Reservation amounts are unconstrained numeric; request amount is numeric but payout amount rounds to numeric(18,2), so sub-cent input can create a future reservation/request mismatch. Current reservation checks pass; isolated boundary tests remain required.
9. **BLOCKED composer workflow:** `import_composer_royalties`, `validate_royalty_csv_row`, `delete_royalty_upload`, and `get_royalty_upload_history` were absent from pg_proc across all schemas. Callers exist in `src/pages/CopyrightRoyaltyUpload.tsx:135` and `src/pages/CopyrightRoyaltyUploadHistory.tsx:63`. composer_royalties has only its primary key, without an upload FK or business uniqueness constraint. Empty data cannot establish import/reversal compatibility.
10. **QA pending:** no mutation, financial RPC, external payment, webhook replay, backup restore, or independent behavioral QA was performed in this read-only assignment. No automatic balance correction is justified.

## Expected invariants and exact migration comparison

For each profile, preserve exact numeric values and require:

```text
artist_revenue = SUM(royalties.artist_revenue for artist_user_id)
label_revenue  = SUM(royalties.label_revenue for label_user_id)
balance = artist_revenue + label_revenue + SUM(balance_adjustments.amount)
          - SUM(reservations.amount for pending/approved/paid payouts)
```

Require reservation sum = requested amount for each active/paid payout, positive reservation amounts, existing profile/payout links, and immutable reservation ownership evidence. Rejected reservations may remain as history and must not reduce available balance. Paid transition must not debit again.

Require each royalty's exact net_revenue = artist_revenue + label_revenue + soundpub_revenue. Preserve all legacy financial columns, not just this equation. Preserve rejected/expired payments, archives, opening adjustments, identifiers, currencies, invoice references, timestamps and statuses. Missing metadata must remain explicit.

Migration acceptance must compare source/restore rows by primary key using `IS DISTINCT FROM` on every financial column, count discrepancies only, and require zero in both directions with a FULL OUTER JOIN. Use PostgreSQL NUMERIC or decimal strings end-to-end; never JavaScript floating-point sums or tolerances. Numeric(18,2) applies to balances, allocations and most payment fields; reservation amount and release pricing snapshots have unconstrained numeric precision. Do not round unconstrained source fields to fit a replacement schema.

Freeze or consistently capture writes for later source/target comparison. This audit is a point-in-time count baseline, not an exported exact-value snapshot or backup. Compare protected source and isolated restore internally; publish only mismatch counts. No monetary sums or unsalted financial row hashes belong in this report.

Required isolated tests: request/approve/pay preserves one reservation debit; rejection releases it once; duplicate and concurrent requests; sub-cent/nonfinite input; unauthorized callers; full-period import/replay/replacement; reversal with paid obligations; refund with multiple payments; Xendit duplicate/out-of-order delivery; failure after payment commit; invoice recovery; composer import/history compatibility. Mock provider/email side effects.

## Reconciliation queries

The following main query batch was executed read-only. It returns counts, status groups and schema metadata only. Zero mismatch counts are required, except explicitly documented legacy gaps. Re-run source and restored target in protected sessions; concurrent later writes can change counts.

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='45s';
SELECT now() AS snapshot_utc;
SELECT 'royalties' entity,count(*) FROM soundpub.royalties UNION ALL SELECT 'composer_royalties',count(*) FROM soundpub.composer_royalties UNION ALL SELECT 'royalty_uploads',count(*) FROM soundpub.royalty_uploads UNION ALL SELECT 'archived_royalties',count(*) FROM soundpub.archived_royalties UNION ALL SELECT 'balance_adjustments',count(*) FROM soundpub.balance_adjustments UNION ALL SELECT 'reservations',count(*) FROM soundpub.payout_balance_reservations UNION ALL SELECT 'profiles',count(*) FROM soundpub.profiles;
SELECT 'payout' entity,status,count(*) FROM soundpub.payout_requests GROUP BY status UNION ALL SELECT 'release_payment',status,count(*) FROM soundpub.release_payments GROUP BY status UNION ALL SELECT 'copyright_payment',payment_status,count(*) FROM soundpub.copyright_registration_payments GROUP BY payment_status UNION ALL SELECT 'upload',status,count(*) FROM soundpub.royalty_uploads GROUP BY status;
WITH a AS (SELECT artist_user_id id,artist_revenue amount,artist_revenue ar,0::numeric lr FROM soundpub.royalties WHERE artist_user_id IS NOT NULL UNION ALL SELECT label_user_id,label_revenue,0::numeric,label_revenue FROM soundpub.royalties WHERE label_user_id IS NOT NULL), g AS (SELECT id,sum(amount) amount,sum(ar) ar,sum(lr) lr FROM a GROUP BY id), r AS (SELECT profile_id id,sum(r.amount) amount FROM soundpub.payout_balance_reservations r JOIN soundpub.payout_requests p ON p.id=r.payout_id WHERE p.status IN ('pending','approved','paid') GROUP BY profile_id), j AS (SELECT profile_id id,sum(amount) amount FROM soundpub.balance_adjustments GROUP BY profile_id) SELECT count(*) FILTER (WHERE p.balance IS DISTINCT FROM coalesce(g.amount,0)+coalesce(j.amount,0)-coalesce(r.amount,0)) balance_mismatches,count(*) FILTER (WHERE p.artist_revenue IS DISTINCT FROM coalesce(g.ar,0)) artist_mismatches,count(*) FILTER (WHERE p.label_revenue IS DISTINCT FROM coalesce(g.lr,0)) label_mismatches,count(*) FILTER (WHERE p.balance<0) negative_balances FROM soundpub.profiles p LEFT JOIN g ON g.id=p.id LEFT JOIN r ON r.id=p.id LEFT JOIN j ON j.id=p.id;
SELECT count(*) FILTER (WHERE p.status IN ('pending','approved','paid') AND p.amount IS DISTINCT FROM coalesce(r.amount,0)) reservation_mismatches,count(*) FILTER(WHERE p.status='paid' AND coalesce(r.n,0)=0) paid_without_reservations,count(*) FILTER(WHERE p.status='paid' AND nullif(p.payment_proof_path,'') IS NULL) paid_without_proof FROM soundpub.payout_requests p LEFT JOIN (SELECT payout_id,sum(amount) amount,count(*) n FROM soundpub.payout_balance_reservations GROUP BY payout_id) r ON r.payout_id=p.id;
SELECT count(*) FILTER(WHERE artist_user_id IS NULL OR label_user_id IS NULL) unmapped_royalties,count(*) FILTER(WHERE source_row_number IS NULL) legacy_source_rows,count(*) FILTER(WHERE net_revenue IS DISTINCT FROM coalesce(artist_revenue,0)+coalesce(label_revenue,0)+coalesce(soundpub_revenue,0)) allocation_mismatches FROM soundpub.royalties;
SELECT count(*) orphan_composer_uploads FROM soundpub.composer_royalties c LEFT JOIN soundpub.royalty_uploads u ON u.id=c.upload_id WHERE c.upload_id IS NOT NULL AND u.id IS NULL;
SELECT source_type,count(*) FROM soundpub.balance_adjustments GROUP BY source_type;
SELECT count(*) release_duplicate_invoice_groups FROM (SELECT xendit_invoice_id FROM soundpub.release_payments WHERE xendit_invoice_id IS NOT NULL GROUP BY 1 HAVING count(*)>1) t;
SELECT count(*) copyright_duplicate_invoice_groups FROM (SELECT xendit_invoice_id FROM soundpub.copyright_registration_payments WHERE xendit_invoice_id IS NOT NULL GROUP BY 1 HAVING count(*)>1) t;
SELECT count(*) cross_domain_invoice_collisions FROM soundpub.release_payments r JOIN soundpub.copyright_registration_payments c USING(xendit_invoice_id);
SELECT count(*) FILTER(WHERE status='paid' AND paid_at IS NULL) paid_without_timestamp,count(*) FILTER(WHERE status='paid' AND xendit_invoice_id IS NULL) paid_without_provider_ref,count(*) FILTER(WHERE status='paid' AND invoice_number IS NULL) paid_without_invoice_number,count(*) FILTER(WHERE status='paid' AND invoice_pdf_path IS NULL) paid_without_pdf FROM soundpub.release_payments;
SELECT count(*) paid_registration_still_awaiting FROM soundpub.copyright_registration_payments p JOIN soundpub.copyright_registrations r ON r.id=p.registration_id WHERE p.payment_status='paid' AND r.status='awaiting_payment';
SELECT tablename,indexdef FROM pg_indexes WHERE schemaname='soundpub' AND tablename IN ('royalties','royalty_uploads','release_payments','copyright_registration_payments','balance_adjustments');
SELECT table_name,column_name,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema='soundpub' AND data_type='numeric' ORDER BY 1,2;
COMMIT;
```

Additional executed checks:

```sql
BEGIN READ ONLY;
SELECT count(*) AS uploads_record_count_mismatch
FROM soundpub.royalty_uploads u
LEFT JOIN (
  SELECT upload_id, count(*) n FROM soundpub.royalties GROUP BY upload_id
) r ON r.upload_id = u.id
WHERE u.status = 'success'
  AND u.inserted_records IS DISTINCT FROM coalesce(r.n, 0);

SELECT count(*) AS legacy_completion_trigger_attachments
FROM pg_trigger
WHERE tgfoid = 'soundpub.update_balance_on_payout_status_change()'::regprocedure;

SELECT p.proname, pg_get_userbyid(p.proowner) AS owner,
  has_function_privilege('anon', p.oid, 'execute') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') AS authenticated_execute,
  has_function_privilege('service_role', p.oid, 'execute') AS service_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'soundpub'
  AND p.proname IN ('request_payout', 'update_payout_status',
    'complete_payout', 'commit_royalty_upload', 'reverse_royalty_upload',
    'delete_release_with_refund');

SELECT proname FROM pg_proc
WHERE proname IN ('import_composer_royalties', 'validate_royalty_csv_row',
  'delete_royalty_upload', 'get_royalty_upload_history');
COMMIT;
```

Catalog evidence also included pg_get_functiondef, pg_get_triggerdef, pg_constraint, pg_indexes, pg_policies, information_schema.columns and role_table_grants. No business functions were called by these inspections.

## Evidence paths and handoff

- Primary audit: `SUPABASE_MIGRATION_AUDIT.md:48`.
- Current payout/refund/rebuild/reversal definitions: `supabase/migrations/20261023041039_harden_royalty_financial_workflows.sql`.
- Current import definition: `supabase/migrations/20261023055703_royalty_artist_history_guard.sql:2`; prior hardening: `20261023053436_secure_royalty_period_imports_and_recipient_mapping.sql`, `20261023055419_royalty_import_integrity_hotfix.sql` in the same directory.
- Historical reservation/completion definitions: `supabase/migrations/20260904_payout_reserve_and_proof.sql`, `supabase/migrations/20260904_label_aggregate_payouts.sql`.
- Historical source alternatives: `docs/soundpub-local-migration/13-recalculate-royalty-balances.sql`; not treated as canonical.
- Runtime: `/data/supabase/instances/supabase-01/config/volumes/functions/{process-royalty-upload,delete-royalty-upload,xendit-webhook}/index.ts`.
- Unexecuted mutation-capable checks: `scripts/royalty_financial_assertions.sql`, `scripts/royalty_financial_smoke.sql`, `scripts/royalty_import_safety_assertions.sql`, `scripts/royalty_import_adversarial_assertions.sql`.
- Supabase skill documentation checked: https://supabase.com/changelog.md and https://supabase.com/docs/guides/database/functions.md. Live metadata and source determine this audit; no platform update was applied.

Coordinator: retain BLOCKED sign-off until payment insert policies, webhook recovery, opening-balance provenance, composer compatibility, exact restore comparison and independent QA have explicit disposition. Arithmetic checks pass at the recorded snapshot; historical financial correctness remains unproven.

