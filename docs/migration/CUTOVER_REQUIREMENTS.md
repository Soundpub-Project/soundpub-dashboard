# Cutover requirements

Date: 2026-10-27 (Asia/Bangkok). Phase 1 planning artifact; requirements for a separately authorized Phase 2. No cutover, backend implementation, provider callback change or production write is executed by this document. Current decision: BLOCKED pending evidence. All future cutover gates below are UNVERIFIED.

## Sources and authority

Use the full Phase 1 attachment, root `AGENTS.md`, Supabase skill, `SUPABASE_MIGRATION_AUDIT.md`, and this directory's schema, auth, financial and storage evidence. `TEST_STRATEGY.md` defines executable/checkable acceptance oracles; `ROLLBACK_REQUIREMENTS.md` defines recovery requirements. Source is already self-hosted Supabase on a shared host, not Supabase Cloud. Soundpub-only scope is mandatory.

Reported application-DDL restoration with auth stubs and zero financial arithmetic residuals are limited observations, not full restore, historical settlement or independent QA PASS. Storage references with unknown byte checksums and linked profiles without exclusive-ownership approval do not satisfy ownership/backup gates. The original audit's drift count must be rechecked against approved runtime hashes. Missing reports or unresolved findings remain BLOCKED; do not infer successful remediation from concurrent workstream activity.

## Required decision record

Before scheduling, named accountable owners must fill and approve these values in the controlled Phase 2 change record. No default RTO, RPO, outage window or error threshold is invented here.

| Required field | Accountable owner | Acceptance evidence |
| --- | --- | --- |
| Change ID, target release/image/schema hashes, complete source/runtime baseline | Migration coordinator | Immutable artifact manifest and reproducible deployment |
| Soundpub identity/object inclusion and exclusion lists | Data owner and privacy/security | Privately approved mapping; unknown/shared records held |
| Maximum outage/freeze duration, recovery time objective (RTO), recovery point objective (RPO) | Business and operations | Numeric approved limits and measured rehearsals within limits |
| Financial loss/duplication tolerance | Finance | Zero unexplained financial mismatch or duplicate settlement; ledger/reconciliation sign-off |
| Queue retention/capacity, maximum callback age, replay throughput and drain deadline | Provider/operations owner | Measured outage workload and safe retry/replay results |
| Error rate, latency, auth failures, queue age, storage access and payment recovery thresholds | Operations and business owners | Numeric thresholds, baseline, alert evaluation window and rollback action |
| Rollback window, last safe decision time and staffing/on-call contacts | Incident commander | Rehearsal fits RTO and provider retention window |
| Identity/session transition and intended inactive/managed-user behavior | Auth/security and product | Approved contract and security test results |
| Go/no-go and rollback authority | Coordinator, operations, security, finance, independent QA | Named signatories, timestamp and evidence references |

## Mandatory gates

| Gate | Required evidence before GO | Test references |
| --- | --- | --- |
| C01 Phase 1 acceptance | >=85/100 documented score, zero CRITICAL, all attachment mandatory gates PASS, independent QA rerun; every HIGH has approved disposition that does not bypass mandatory security/financial gates | Acceptance section of TEST_STRATEGY |
| C02 Canonical reproduction | Real auth dependencies/signup trigger, approved identity constants supplied securely, roles/memberships, extensions, grants, policies, ACLs and exact schema comparison; versioned migration ledger with checksums; no blind historical replay | STATIC-02, RESTORE-01 |
| C03 Runtime/caller coverage | Fresh Edge repo/runtime/shared-file hashes, resident image/source proof, every active caller and remote-only hook mapped, casing/config/type mismatch resolved, approved target request/error/side-effect contracts | STATIC-03, INT-04 |
| C04 Default-deny security | Endpoint and direct-data regressions pass for role/owner/status matrix; role escalation, rate_limits, definer access/search_path, audit spoofing, payment insertion and contracts privacy closed | AUTHZ-01, SEC-01..09 |
| C05 Identity feasibility | Ownership approved, UUID/provider mappings/conflicts reviewed, password migration feasibility and recovery tested, issuer/subject binding, refresh/revoke/suspension and scoped impersonation proven; no broad shared-host import | SEC-06..08, INT-04, RESTORE-04 |
| C06 File completeness/privacy | Soundpub object ownership resolved, unique objects and bytes hashed including legacy Cloud/GCS, missing/orphan disposition, bucket/ACL restoration and private legal document access proven | RESTORE-02..04 |
| C07 Recoverable backups | Encrypted protected DB/auth linkage/metadata/object bytes/config backups, checksums, off-host copy and key custody; repeat independent full restore with measured RTO/RPO | RESTORE-01..04 |
| C08 Financial exactness | Consistent boundary, zero unexplained row/column/ledger differences, opening-adjustment settlement evidence, single debit/refund, invoice recovery and composer compatibility decision validated | FIN-01..08 |
| C09 Provider safety/reliability | No live side effects during rehearsal; verified callback authentication, durable receipt, deduplication, ordering, crash recovery and reconciliation; sandbox/local doubles | INT-01..03 |
| C10 Compatibility and user experience | All compatibility inventory callers exercised, release/track/auth/royalty/payout/copyright/takedown/export/upload flows pass including pagination and private files; Realtime intended behavior decided and tested | INT-04 |
| C11 Rehearsed rollback | Both no-target-write and post-target-write rollback independently tested including auth, object changes and provider events; threshold/decision timing approved | All R gates in ROLLBACK_REQUIREMENTS |
| C12 Operability | Monitoring, encrypted backups, queue/outbox recovery, capacity and restore ownership, bounded DB/storage permissions, final freeze/replay runbook and staffed observation window | Measured rehearsal and owner sign-off |

Any FAIL, BLOCKED or UNVERIFIED mandatory gate means NO-GO, regardless of aggregate score. A security defect is not waived because current behavior depended on it. Missing active composer RPCs cannot be silently dropped as unused.

## Required Phase 2 sequence and checkpoints

These are requirements for a future runbook, not execution instructions for this assignment. Phase 2 must supply environment-specific commands, reversals, owners, timing and verifiers and rehearse them on disposable infrastructure.

1. Seal approved artifacts and verify gates C01-C12. Capture current source/target configuration, frontend/API routing, DNS TTL, provider callback settings and auth allowlists securely. Confirm latest backup restoration, queue capacity and rollback last-decision time. Do not deploy from an unidentified dirty tree.
2. Establish a single-writer boundary covering browser direct PostgREST/RPC/Storage, Edge endpoints, jobs, privileged SQL, user administration, OAuth signup/reset, multipart/TUS uploads and provider callbacks. A UI maintenance page is insufficient. Drain or explicitly journal in-flight uploads and transactions; record cutoff snapshot/WAL boundary and object versions. If the shared host cannot isolate Soundpub writes safely, NO-GO; never freeze other applications.
3. Keep provider ingestion durable during the freeze through an authenticated queue or another rehearsed supported provider retry mechanism with sufficient retention. Acknowledge only durable events, deduplicate by provider identity and record cursor. Do not silently discard callbacks or rely on retry duration that was never verified. Outbound provider workers remain single-owner and fenced.
4. Capture final consistent DB delta and versioned object delta with ownership filters. Preserve deletes/tombstones and reference changes, auth state/linkage and ledger history. Validate the copy boundary against source writes; capture after-the-boundary events for deterministic replay. Required final-backup checksums and recovery point must be recorded.
5. Apply final delta in isolated target while source remains fenced; replay captured events exactly once in financial effect. Rerun FIN-01/02, schema/key/FK checks, object hashes/reference resolution, privacy, matrix and critical smoke assertions. Require zero unexplained differences and durable backlog accounting before routing. Record target-write acceptance boundary separately from DNS switch.
6. Only after signed GO, perform the approved routing and callback/auth transition in its rehearsed order. Fence stale clients and old endpoints; DNS cache expiry alone cannot enforce single writer. Test intended session invalidation/relogin, OAuth callback handling and safe old private-link behavior. Enable only one delivery/settlement worker authority.
7. Observe the approved window using thresholded auth/API/DB/storage metrics, ledger residuals, callback backlog/age, settlement reconciliation and invoice/notification recovery. Verify synthetic smoke flows without real payment/email side effects; production financial validation uses authorized read-only reconciliation and controlled business traffic under the Phase 2 change record.
8. Roll back on any mandatory integrity/privacy/security breach or approved threshold trigger, following ROLLBACK_REQUIREMENTS. Otherwise obtain security, finance, operations and QA acceptance before closing the rollback window. Retain recoverable source, backups and journal under approved retention; decommissioning requires its own decision.

## Stop conditions and evidence

Immediate NO-GO/containment: unknown ownership included, missing required object bytes, any financial discrepancy, duplicate settlement, unauthenticated privileged action, cross-owner private data access, unrecoverable queue gap, unsigned artifact drift, untested identity migration, no provable single writer or unavailable rollback mechanism. Operational thresholds must be populated in advance; absence is NO-GO, not unlimited tolerance.

At every checkpoint retain sanitized timestamped gate results, source/target artifact digests, snapshots/cursors, unique object/hash mismatch counts, finance reconciliation result, journal completeness/queue counts and independent verifier sign-off. Keep raw identity/payment/object mappings in restricted encrypted evidence storage. Publication of this plan does not authorize changes to production callbacks, auth users, routing, balances or storage.
