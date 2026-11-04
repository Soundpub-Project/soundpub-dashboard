# Rollback requirements

Date: 2026-10-27 (Asia/Bangkok). Phase 1 planning only, for a separately authorized Phase 2. No rollback, restore, deployment, backend work or production mutation is executed here. Status: BLOCKED; all rehearsal and operational acceptance below remain UNVERIFIED.

Sources: full Phase 1 attachment, root `AGENTS.md`, Supabase skill, `SUPABASE_MIGRATION_AUDIT.md`, supporting schema/auth/financial/storage artifacts, `TEST_STRATEGY.md` and `CUTOVER_REQUIREMENTS.md`. Existing schema-only restoration and arithmetic observations do not prove reversible production migration.

## Recovery contract

Rollback must restore a coherent Soundpub service, not merely its previous frontend URL. Preserve approved Soundpub UUIDs, auth/provider bindings and security state, all acknowledged business writes, exact money/ledger history, object bytes/versions/privacy, provider events, invoice references and audit provenance. Other applications on the shared host must remain unaffected.

Before Phase 2, business/operations must approve numeric RTO, RPO, maximum freeze, provider queue retention, rollback decision deadline and observation window in the cutover record. Financial acceptance requires zero unexplained lost/duplicated settlement and exact reconciliation. If an RPO allows any nonfinancial loss, define affected data explicitly and obtain data-owner approval; never infer permission to drop acknowledged financial events. Measure RTO from incident declaration through verified recovery and source write reopening; report both total and user-visible outage. A verified backup is necessary but cannot restore post-backup target writes without a journal.

The incident commander may invoke the approved rollback; security and finance can require immediate write containment for privacy, privilege or money failures. Recovery reopening requires operations, security, finance and independent QA sign-off. Thresholds, named people and alternates must exist before cutover. An unfilled field is a blocker.

## Required recovery assets and gates

| Gate | Requirement and checkable acceptance |
| --- | --- |
| R01 Preserved source | Approved source DB, auth, storage, runtime/images/shared files and safe security configuration retained recoverable throughout window; source Soundpub writes fenced after boundary; stale browsers, workers and provider routes cannot bypass fence |
| R02 Restorable snapshot | Checksum-verified encrypted database/auth linkage/metadata and object-byte backups, consistent snapshot/object-version boundary, off-host retrieval and key custody; independent full RESTORE-01..04 PASS within approved RTO/RPO |
| R03 Complete change journal | Every accepted target DB mutation, auth/role/status/reset/linking change, file create/replace/delete and inbound provider event durably captured with stable event ID, origin, schema/version, ordering/dependencies, idempotency key and commit outcome; gap detection and retention exceed rollback window |
| R04 Replay compatibility | Reviewed inverse mapping to source preserves all fields/precision/UUIDs and invariant checks; target-only features disabled during window unless reversible; source constraints/functions/trigger side effects understood; no hand-written production balance correction |
| R05 Provider continuity | Durable callback store/outbox state, queue cursors, settlement references and sent-message receipts retained; one fenced processor; replay duplicates have one financial effect and already-delivered emails/payments are not resent |
| R06 Privacy/security continuity | Retained source contains approved security remediations; private contracts remain private, role and definer fixes stay effective, suspension/revocation is preserved; no return to known-vulnerable code merely to match old release |
| R07 Operational control | Independently tested DB/API/worker/upload fencing, routing/callback/auth settings reversal, monitoring and evidence capture; cached clients/links accounted for; tested queue drain within retention/RTO |
| R08 Independent rehearsal | No-write, post-write, split-brain, replay crash/gap and unreplayable-change drills pass with finance/security/QA evidence before scheduling |

An outbox for outbound messages alone does not satisfy R03: direct browser/API writes, object bytes and identity changes must also be captured. Journal data is sensitive; encrypt and restrict access. No raw payloads, tokens, backup keys or identity maps in repository reports.

## Recovery branches

### Before target accepts writes

Prove no committed target business/auth/object writes and no outbound side effect since the copy boundary; routing state alone is not proof. Inventory journal, DB commit boundary, upload completions, provider receipts and worker delivery ledger. If any such change exists or absence cannot be proved, use the post-write branch.

Future runbook must fence target intake/workers, preserve queued callbacks, verify source boundary/health/security and account for all in-flight source transactions. Apply any durable inbound events to source exactly once using approved path, validate critical schema/financial/private-file/auth smoke tests and restore routing/provider configuration in rehearsed order. Reopen source writes only after proof that target cannot write and source/event state is consistent. Recheck old client routes and monitor the full recovery window.

### After target accepts any writes or external effects

DNS reversal alone is prohibited because it can discard writes, create concurrent writers and repeat provider settlement. Required ordered recovery sequence:

1. Declare incident and stop target mutation intake, direct data/upload routes and all outgoing workers; preserve durable inbound callback capture. Fence source as well until reconciliation completes. Drain or record in-flight transactions, object uploads and jobs; capture incident snapshot and journal high-water mark.
2. Verify journal completeness from cutover boundary through final target commit and object/auth completion. Account for every acknowledged request and provider receipt. Missing ranges, unmapped schema changes or unknown effects block reopening. Preserve failed target and evidence; do not overwrite the only recovery copy.
3. Rehearse reverse replay against a disposable source restore first. Apply approved mapping in dependency order with original IDs, exact decimals, timestamps, row relationships and audit context; transfer object versions before dependent references become readable. Replay deletes/tombstones with approved retention. Test role/auth mapping and revoke stale target sessions. Unsupported password/provider/refresh-state changes require the preapproved safe reauthentication/recovery path rather than invented token copying.
4. Reapply the verified journal to recoverable source under exclusive recovery authority. Suppress replay-triggered outbound delivery and account for source triggers so financial ledger/audit effects do not execute twice. Retain original events and replay checkpoints; retries after a crash must be idempotent. Reconcile invoice/settlement state with authorized provider evidence rather than issuing compensating live charges or refunds automatically.
5. Require FIN-01/02 zero unexplained row/column/ledger differences against final target projection, no missing acknowledged writes, exact object hashes/version/reference agreement, auth/status/role agreement, SEC matrix/privacy PASS and complete provider queue accounting. Missing PDFs or pre-existing provenance gaps remain explicit; do not hide new gaps among legacy exceptions.
6. Reverse frontend/API/provider/auth routing only after signed recovery verification. Prove single writer with target still fenced, then reopen source and one provider/notification worker. Drain queued callbacks idempotently from recorded cursor; monitor thresholds, ledger, private access and queue recovery throughout approved observation window.

If safe reverse replay is unavailable, keep mutation intake fenced, retain/read-serve only if verified safe, preserve callback queues and use the approved forward-repair/manual-reconciliation incident path. State achievable RTO/RPO and obtain incident decisions; do not reopen stale source or silently discard target writes to claim recovery. This fallback is a blocked rollback, not a successful rehearsal.

## Provider, auth and storage constraints

External effects cannot be undone by database restore. Track paid invoices, settlements, notifications, generated documents and provider retry state separately from DB commits. Financial compensation requires authorized business procedure and private reconciliation; this plan authorizes no refund, payout, invoice creation or production callback replay. Changing callback destination must preserve authentication, durable delivery and one processing authority across DNS/config propagation.

Auth recovery must preserve approved role changes, bans/suspensions, reset/verification consumption and issuer/subject links. A source restore must not reactivate revoked sessions, undo a suspension or restore a reusable reset token. Provider allowlists and session-relogin behavior require an explicit rehearsed transition. Password-hash/token portability is UNVERIFIED until supported migration/recovery testing proves it; never copy shared-host users indiscriminately.

Storage recovery includes creates, overwrites, deletions, resumable uploads, bucket config, ACLs and cached/signed links. Retain prior versions/tombstones throughout the window so overwritten/deleted bytes can be reconciled; source metadata alone is insufficient. Protect legal contracts, payout proofs, invoices and takedown documents before public endpoints reopen. Privacy tests include legacy public URLs and cache access; if exposure cannot be closed, remain contained. Unknown/shared objects are not replayed without ownership approval.

## Required isolated rehearsal definitions

Each drill uses synthetic fixtures, local provider stubs, denied external egress and timestamped independent QA evidence per TEST_STRATEGY. No drill below has been executed by this planner.

| ID | Fault and action | Required oracle |
| --- | --- | --- |
| RB-01 | Switch rehearsal routing with zero target writes; invoke no-write recovery | Proven empty committed-change interval, queued callbacks accounted for, source smoke/privacy tests pass, single writer, RTO/RPO met |
| RB-02 | Accept release/track/profile change, royalty import, payout reservation/payment transition, copyright event, takedown, object create/overwrite/delete, role/status change; recover post-write | Every acknowledged effect survives once with original keys and exact financial values; bytes/hash/privacy/auth agreement; FIN-01/02 and matrix PASS; no live provider contact |
| RB-03 | Retry duplicate and out-of-order callback before/during/after reversal; crash after paid commit before parent/PDF update | One settlement/ledger effect, repaired parent/invoice state, durable queue fully accounted, sent notifications not repeated |
| RB-04 | Keep stale client and source worker active while target opens | Fencing rejects their mutations, no dual commit or outbound processing; if fence cannot be proved, cutover gate fails |
| RB-05 | Crash reverse replay mid-batch, restart with same cursor; remove journal segment | Restart creates no duplicate effect; missing segment detected and reopening blocked, not skipped |
| RB-06 | Introduce unmapped target column/unsupported auth change or corrupt object backup | Recovery rejects incomplete mapping/bytes, preserves evidence and exercises containment/forward-repair escalation; this intentional refusal is drill success, not actual rollback PASS |
| RB-07 | Restore snapshot with stale privileged role, old suspension/reset state or public contracts setting | Security reconciliation prevents revival/exposure; SEC-02/06/07/09 and RESTORE-03 pass before service reopening |
| RB-08 | Retrieve off-host backup without source host availability; recover and drain outage-sized event workload | Keys available to authorized operator, full DB+bytes recovery verified, measured RTO/RPO/queue retention within approved limits |

RB-02 must contain nonempty composer and paid-copyright fixtures once their compatibility contract is approved; empty production tables cannot cover them. Split-brain and object/auth mutation coverage cannot be replaced by a payout-only SQL test.

## Closure evidence

Record incident/drill ID, authority, trigger and threshold, declaration/fence/replay/reopen times, source/target release and schema digests, snapshot/WAL/object boundaries, journal cursor/gap counts, event accounting, exact mismatch counts, privacy/role outcomes, achieved RTO/RPO, remaining exceptions and independent sign-offs. Summaries expose counts only; keep detailed maps/logs protected.

Retain source, encrypted backups, journal and object versions for the approved rollback and audit retention periods. After a successful cutover window closes, removal of recovery assets or decommissioning Supabase requires a separate authorized change. This document supplies requirements only and confers no PASS or permission to execute Phase 2.
