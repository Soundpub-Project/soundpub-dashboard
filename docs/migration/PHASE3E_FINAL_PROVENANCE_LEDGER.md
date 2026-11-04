# Phase 3E Final Historical Provenance Ledger

Review: 2026-10-30 (Asia/Bangkok). Agent C — Historical Provenance.

**Historical linkage: PARTIAL. Production settlement: UNRESOLVED. Historical record-level reconciliation: NOT RUN. Provenance gate: BLOCKED.** No reviewed historical record qualifies as `RECONCILED_SETTLEMENT` on available evidence. This describes evidence completeness, not whether money actually moved. No approved `HISTORICAL_EXCEPTION` was supplied or found in reviewed Phase 3E evidence.

## Scope and fresh production availability

Only this ledger is edited. Existing reports, scripts, source, schema, secrets and production configuration remain untouched. No production/provider mutation, deployment, invoice creation, callback invocation, refund, payout, import, repair, traffic switch or remote file write occurred. SSH used existing noninteractive authentication; credentials and secret values were neither requested nor printed. No provider API, dashboard, financial status endpoint or document URL was accessed.

All remote commands used direct target `maskhar@20.20.20.3`, first changing to `/data/supabase/instances/supabase-01/config`. Fresh observations in this review:

| Attempt | Result | Evidence boundary |
| --- | --- | --- |
| `pwd` followed by `docker compose ps --services --status running` | Required directory confirmed; Compose failed with `stat /data/supabase/instances/supabase-01/config/.env: input/output error` | SSH works. Compose could not load configuration. No `.env` contents or rendered Compose environment printed. Failure cause not diagnosed. |
| `docker ps --format "{{.Names}} {{.Image}} {{.Status}}"` from required directory | Container metadata available; `supabase-db` listed image `supabase/postgres:17.6.1.136`, status `Restarting (1)` | Runtime inventory only. Image/status do not establish SQL availability, database contents, mounted source equality or provider health. |
| SQL over SSH stdin to `docker exec -i supabase-db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -At` | Docker rejected execution because container was restarting | `psql` did not start; no SQL result or fresh financial snapshot obtained. |

The last attempt contained only this bounded read-only metadata transaction; it did **not** execute:

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT json_build_object(
  'snapshot_utc', now() AT TIME ZONE 'UTC',
  'transaction_read_only', current_setting('transaction_read_only'),
  'legacy_schema_present', EXISTS (
    SELECT FROM information_schema.schemata WHERE schema_name = 'soundpub'
  )
);
ROLLBACK;
```

No further production attempts followed these failures or the user's instruction to avoid retries involving `.env`. No logs, raw container inspection, environment dump, secret file, alternate host, service restart or repair was used. **Fresh production financial inventory is UNAVAILABLE**, although SSH and limited container metadata are available. All financial counts below remain inherited evidence.

## Evidence authority and dates

| Evidence | What it establishes | Limits |
| --- | --- | --- |
| [Phase 1F database scope](PHASE1F_DATABASE_SCOPE.md), final financial snapshot **2026-10-27T13:31:07.912225 UTC** | Reported populations, 20 original assertions plus 21 additional checks, within one REPEATABLE READ READ ONLY transaction ending in ROLLBACK | Latest supplied production financial snapshot; not re-executed here. Earlier catalog snapshots in that report have different timestamps. No provider/bank settlement or document-byte verification. |
| [Phase 1F final report](PHASE1F_FINAL_REPORT.md) | Authoritative host/environment and outstanding extraction/isolation limitations | Historical report; fresh runtime inventory does not reverify gateway, callback routing, source mounts or isolation. |
| [Phase 1B financial/payment report](PHASE1B_FINANCIAL_PAYMENT_REPORT.md) | Earlier upload/invoice/adjustment handles, residual-opening explanation and synthetic legacy trust/precision/refund counterexamples | Separate evidence scope. `U01–U10`, `I01–I02`, `A01–A33` are report-local ordinals; no private primary-key mapping was supplied. Do not assume stable handles across snapshots. |
| [Phase 1D Xendit report](PHASE1D_XENDIT_REPORT.md) | Reported webhook regression 41/41; invoice regression 1/3 with retry/concurrency duplicate risks | Local regression, not deployed behavior or actual settlement. No real payment event sent. |
| [Original Phase 3E final](PHASE3E_FINAL_REPORT.md), [independent QA](PHASE3E_INDEPENDENT_QA.md), financial model, money rules, invariants, transaction model, payout state machine, RPC replacement, parity matrix and reconciliation report | Required financial contracts and original BLOCKED decision | Synthetic results do not attest historical production parity. Original reports preserved. |
| [Closeout final](PHASE3E_CLOSEOUT_FINAL_REPORT.md), [provenance](PHASE3E_CLOSEOUT_PROVENANCE.md), [reconciliation contract](PHASE3E_CLOSEOUT_RECONCILIATION_CONTRACT.md), [historical balance contract](PHASE3E_CLOSEOUT_HISTORICAL_BALANCE_CONTRACT.md) | Existing evidence classes, read-only reconciliation boundary and unapproved history/cutover restrictions | No approved historic settlement disposition supplied. Contract acceptance is not migration execution. |
| [Closeout independent QA](PHASE3E_CLOSEOUT_INDEPENDENT_QA.md), latest final G6 section | Reported final synthetic 209/0/0 regression, positive browser 9/0 and focused correction checks; whole-phase FAIL/BLOCKED | Inherited test reports, not rerun in this review. Latest disposition supersedes older open-G1/G2/G3/G6/G7 sections. No production settlement proof. |
| [Closeout composer contract](PHASE3E_CLOSEOUT_COMPOSER_ROYALTY_CONTRACT.md), [provider contract](PHASE3E_CLOSEOUT_PROVIDER_CONTRACT.md), [financial invariants](PHASE3E_CLOSEOUT_FINANCIAL_INVARIANTS.md) | Composer posting remains blocked; provider adapters and settlement assertions have synthetic scope | Composer preview and mock provider acceptance cannot establish historical entitlement, distribution activation or bank settlement. |

Repository schema/source describes stored exports and current workspace contracts, **not current production definitions**. Working tree was already dirty with substantial modified/untracked work. Git HEAD at review: `48222ffb9c9e60da82d224e1e8aaccd4dd597442`; hashes below identify selected reviewed files more precisely than HEAD alone.

## Classification rules

Provenance and settlement evidence are separate dimensions. `PROVEN` applies only to an explicitly bounded assertion with complete evidence; a reported synthetic pass stays synthetic. `PARTIAL` means some linkage exists. `UNRESOLVED` means required evidence is missing or contradictory. `NOT_APPLICABLE` means that assertion has no applicable population; it never certifies an unexercised lifecycle. Confidence concerns the observation, not likelihood of actual settlement.

| Settlement evidence class | Required evidence / permitted conclusion |
| --- | --- |
| `LOCAL_STATUS_ONLY` | Stored `paid`/`PAID`, timestamp, local audit or proof-path string. Local observation only; insufficient settlement evidence. |
| `PROVIDER_REFERENCE` | Persisted invoice/transfer identifier. Historical stored IDs are correlation candidates; provider account/environment, ownership and actual existence still require verification. URL presence is not provider authentication. |
| `PROVIDER_PAID_STATE` | Authenticated provider read/export, captured with origin/hash, matching account/environment, business identity, exact amount/currency, beneficiary/destination and documented final-state semantics. Not available here. Invoice paid state does not automatically prove bank transfer settlement. |
| `CALLBACK_EVENT` | Authenticated event identity/body digest and durable receipt linked to invoice, exact amount/currency/state, immutable effects and audit. Synthetic callbacks qualify only within mock scope. No authenticated historical production archive supplied. |
| `RECONCILED_SETTLEMENT` | Independent finality evidence plus complete business/event/effect/audit linkage; exact amount, currency, destination and fee semantics; duplicate/reversal/hold reconciliation; bank evidence and finance approval where required. Not established for historical records. |
| `MANUAL_EXCEPTION` / provenance `HISTORICAL_EXCEPTION` | Explicit named approval with immutable record scope, reason, evidence gaps, financial impact, restrictions, remediation and evidence references. Approved disposition never becomes independently proven settlement. None supplied. |

Do not infer `LOCAL_AHEAD` or `PROVIDER_AHEAD` without comparable trusted provider state. Present historical deficiencies require `MANUAL_REVIEW`; local `PAID` alone cannot select either state. Missing artifacts prove neither failed payment nor successful settlement.

## Historical population ledger

Every count is inherited from the **2026-10-27 financial snapshot** unless explicitly attributed otherwise. Raw business IDs, bank details, provider IDs/URLs, object paths, financial amounts and personal data are omitted. Exact record-level evidence belongs in an access-controlled register; none is invented here.

| Business/source scope | Provider / invoice linkage | Callback / source event | Local financial evidence | Settlement class and provenance | Missing evidence / disposition |
| --- | --- | --- | --- | --- | --- |
| 14,474 `soundpub.royalties` rows | Distributor statement and source bytes unavailable; invoice N/A | All lack `source_row_number`; all reference existing uploads | Artist/label/platform allocation arithmetic passes | Economic source lineage **PARTIAL**; payment settlement assertion N/A to these allocation rows | Recover original statements, hashes, row identity, beneficiary/period mapping and approved posting reconciliation. Stored allocation conservation is insufficient. |
| 10 successful `soundpub.royalty_uploads` | No independently checked source artifact | All 10 replay keys absent; all 10 `inserted_records` counts disagree with linked row counts | 14,474 linked royalties | **PARTIAL** source provenance; approval **UNRESOLVED** | Preserve original metadata. Earlier U01–U10 cannot be privately remapped from published ordinals alone. No fabricated row/replay keys. |
| 182 `soundpub.profiles` balances | Derived snapshot; invoice N/A | Contributing source/adjustment/settlement lineage incomplete | Allocations + adjustments − pending/approved/paid reservations equal stored balances; no negative balances reported | Arithmetic reported PASS; economic provenance **PARTIAL** | Snapshot equality is not an authoritative opening credit or independent settlement reconciliation. |
| 33 `soundpub.balance_adjustments` | No independent economic/settlement source supplied | Earlier Phase 1B reports all as `migration_opening_balance`; no signed approval | Residual amounts preserve prior chosen balances | Justification **UNRESOLVED** | Individually justify each adjustment at approved cutover. A01–A33 need private PK mapping; migration reason text is not approval. |
| 3 `soundpub.payout_requests`, including 2 locally paid | No authenticated provider/bank transaction linkage supplied; invoice N/A | No trusted historical terminal settlement event supplied | Reservation amounts match; both paid rows have nonempty proof paths | Paid subset: `LOCAL_STATUS_ONLY`; local linkage **PARTIAL**, settlement **UNRESOLVED** | Verify original proof bytes/authenticity, destination, exact allocation, transfer finality and one-time terminal effects. Do not treat paths as verified proof. |
| 5 `soundpub.payout_balance_reservations`, all on pending/approved/paid requests | Local hold only | No independently authenticated settlement event | Payout/profile linkage and request sums pass; legacy paid holds remain stored/subtracted | Accounting linkage **PARTIAL**; external settlement **UNRESOLVED** | Reconstruct original owners/allocations and terminal treatment. Do not translate a paid hold into both retained subtraction and a second available-balance debit. |
| 9 `soundpub.release_payments`, including 4 locally paid | All 9 have nonempty stored Xendit ID/URL; all 4 paid have both. Only 2 paid have invoice number/PDF path | No authenticated production callback archive supplied | Local paid timestamps and release/profile links; no complete historical immutable effect chain verified | `PROVIDER_REFERENCE` plus local status; provenance **PARTIAL**, paid settlement **UNRESOLVED** | Obtain authenticated provider identity/state/amount/currency, event and effect/audit linkage, reversal reconciliation and document verification. References alone do not establish finality. |
| Same 2 of 4 paid release payments missing both invoice number and PDF path | Provider references stored; invoice artifacts absent | No independently authenticated event | Local paid rows retained | Artifact provenance **UNRESOLVED**; paid settlement **UNRESOLVED** | Earlier I01/I02 require private remapping. Recover existing documentation under separately authorized work; no replacement payable invoice or inferred refund. |
| 2 `soundpub.copyright_registration_payments`, both expired; 0 paid | Both have stored provider ID/URL; canonical table lacks dedicated release-style invoice-number/PDF columns | No authenticated callback archive supplied | Registration/profile linkage and same-user checks pass | `PROVIDER_REFERENCE`; linkage **PARTIAL**; paid lifecycle **NOT_APPLICABLE** | Empty paid population proves no paid copyright lifecycle. Document availability/content unverified. |
| 0 `soundpub.composer_royalties` | N/A for empty population | No positive historical import lifecycle | Orphan-upload predicate passes vacuously | Historical population **NOT_APPLICABLE**; prospective financial mapping **UNRESOLVED** | Canonical RPC output aliases stored `composer_id` as `composer_code`; no unique backend beneficiary or work entitlement mapping is proven. No posting approval. |
| Historical provider refunds / reversals | No complete enumerated population or authenticated provider refund references supplied | No original-charge-to-refund event chain supplied | Legacy delete/refund helper and local synthetic effects are source/test evidence only | **UNRESOLVED** | Missing population is not zero refunds. Reconcile original charge, full refund, duplicates and finance reversal; never credit withdrawable royalties from invoice effects. |

Reported original checks: **15 PASS / 5 FAIL**. Failing predicates: `missing_source_row=14474`, `missing_upload_replay_key=10`, `upload_inserted_count=10`, `paid_without_invoice_number=2`, `paid_without_pdf_path=2`. Additional checks: **21 PASS / 0 FAIL**. Thus 36/41 predicates passed, while historical financial gate remained FAIL.

Predicate populations overlap; these numbers cannot be summed into affected-record totals or record-level matched/mismatched buckets. Zero duplicate source/replay keys is vacuous when all such keys are absent. Zero paid copyright/composer failures provides no positive lifecycle proof. No record-level historical dry-run summary is claimed.

## Script, schema and current-source contracts

| Reviewed contract | Supported conclusion | Provenance ceiling |
| --- | --- | --- |
| `scripts/payment_reconciliation_readonly.sql` | Existing 20 predicates use explicit REPEATABLE READ READ ONLY and 45-second timeout; file ends with `ROLLBACK`. Phase 1F reports wrapping output and using `ROLLBACK`, plus extra checks | SELECT arithmetic/linkage checks only; no provider authentication, source-byte or legal-document proof. Not executed here. Requires verified legacy schema before use; fresh schema unavailable. |
| `scripts/phase3e-closeout-reconciliation.ts` | Reads show disposable local PostgreSQL setup, synthetic writes before comparison, four comparison scenarios, duplicate-expectation rejection and unchanged ledger/audit/outbox assertion | **Not a production read-only inventory script.** Inherited 1 matched / 1 mismatched / 1 unresolved / 1 ambiguous / 0 exception are scenarios over synthetic evidence, not historical record totals. Not executed here. |
| `docs/migration/CANONICAL_SCHEMA.sql` and legacy financial migrations | Export contains legacy balances/adjustments, reservations, payments and text composer identity. Rebuild can replace cached balances; label payouts span profile allocations; guarded one-off double-debit correction is not a general opening event | Neither export nor local migration order proves deployed schema equality. Do not execute rebuild, correction, delete/refund helper or migration as evidence collection. |
| `backend/migrations/0014_finance_ledger.sql`, `backend/src/finance/index.ts` | Append-only event/audit, replay/business uniqueness, reservation terminal exclusivity and exact-money accounting; `reconcileAccount` reads complete supplied expectations without repair | Nonempty evidence field is not external authentication. Expected records must be independently authoritative and complete; comparing ledger-derived expectations cannot establish source provenance. No production deployment asserted. |
| `backend/migrations/0015_royalties.sql`, `backend/src/royalties/index.ts` | Batch stays `UNRECONCILED`; checksum/source-row identity and immutable corrections exist; commit calls `recordEarnings` | Raw ledger earnings are posted before approved reconciliation. Earlier broad claims that unreconciled imports never credit raw availability are inaccurate. Current payout policy quarantines them; public availability is masked. No approved reconciliation transition shown. |
| `backend/migrations/0016_payouts.sql`, `backend/src/payouts/{index,finance,policy}.ts` | Original source allocations retained; public transition rejects paid; `settleMock` requires trusted capability and nonempty evidence; unreconciled public `available` is null | Mock evidence string is not authenticated settlement. `databasePayoutPolicy` currently returns `destinationReady: true`; this does not verify bank ownership/destination. Historical economic approval remains missing. |
| `backend/migrations/0017_payments.sql`, `backend/src/payments/{contracts,index,provider}.ts` | Mock-only provider contract; current reconciliation matches effect/ledger kind, owner, amount, currency and reference; checks linked receipt/audit; global query includes `unsupported`; manual-refund guard requires persisted receipt | Current source reflects closeout fixes, superseding older claims of missing checks. Provider mirror changes in same callback transaction as local state/effects: it is not independent external evidence. Service reconcile/status paths acquire locks; they are not production SELECT-only inventory interfaces. |
| `supabase/functions/xendit-webhook/index.ts` | Current source checks callback token, amount/currency and local status handling | Source presence cannot authenticate historic events, establish exact deployed revision, prove provider finality or close prior creation-idempotency gaps. No deployed source or callback endpoint queried here. |
| `backend/src/composer-royalties/contracts.ts` and submission provider contract | Pure composer preview refuses posting; submission simulator receipt proves local mock acceptance only | No inferred composer ownership/share entitlement, historic financial posting, distribution activation or bank settlement. |

Money remains exact decimal strings / integer minor accounting units, IDR scale 2 for reviewed backend contracts. Provider precision, gross/net/fee treatment and settlement semantics need explicit verification; do not silently round or reinterpret historic numeric data. Payment charges/refunds remain separate from withdrawable royalty balances.

## Blockers and admissible closure evidence

| Blocker | Required evidence / owner | Current disposition |
| --- | --- | --- |
| B1 — Fresh production financial inventory unavailable | Infrastructure owner restores availability outside this read-only task; then separately collect bounded SELECT-only schema/population evidence in one consistent read-only snapshot | SSH success does not close DB evidence gap. No repair/retry undertaken here. |
| B2 — Royalty source and replay lineage incomplete | Source-data/finance owners supply original statement bytes/hash, private source-row and beneficiary mapping, row-count reconciliation and approved source identity | All inherited 14,474 royalty rows / 10 uploads remain unresolved for approved posting. |
| B3 — Opening balances and allocation translation unapproved | Finance owner supplies per-beneficiary/currency cutover snapshot, independently justified 33 adjustments, historic allocation/terminal reconciliation and signed disposition | No synthetic opening credit, balancing entry, guessed label attribution or double debit permitted. |
| B4 — Paid release/payout settlement unverified | Provider/finance owners supply authenticated account/environment-scoped export/events, exact amount/currency/destination/fee matching, immutable local effects/audit and reversal/duplicate checks; bank finality where required | All 4 locally paid release rows and 2 locally paid payouts remain settlement UNRESOLVED on inherited evidence. No provider query performed. |
| B5 — Financial artifacts unavailable/unverified | Evidence owner privately links original invoice/proof bytes and hashes to exact records, recovers missing artifacts, validates authenticity/content | 2 paid release rows lack invoice number/PDF; other paths and 2 payout proof paths remain byte-unverified. |
| B6 — Composer financial entitlement/corrections undefined | Business/finance owners approve unique identity/work/beneficiary mapping, source-event identity, allocation and immutable correction semantics | Empty historic population and strict preview cannot approve posting. |
| B7 — No approved exception or complete historical disposition | Named authorized reviewer supplies scoped reason, missing evidence, impact, restrictions/remediation and enforceable exclusion from migration, payout eligibility, release readiness and provider replay | No `HISTORICAL_EXCEPTION` assigned. Contract-only opening strategy and synthetic PASS cannot waive this gate. |

No provenance blocker is closed by this review. Existing whole-phase BLOCKED / NOT DECOUPLED decision remains supported; this ledger grants no production cutover, financial operation or Phase 3F acceptance.

## Selected evidence fingerprints and verification

SHA-256 of reviewed workspace bytes; these identify artifacts, not signatures or independent financial truth. Later changes require reevaluation. Other authoritative inputs are named above; this is a selected fingerprint register, not a full repository manifest.

| Repository artifact | SHA-256 |
| --- | --- |
| `docs/migration/PHASE1F_DATABASE_SCOPE.md` | `e83b74eb0d460871a3791ee945d87cd522c2f7351de6fcf61605e2551a364175` |
| `docs/migration/PHASE1B_FINANCIAL_PAYMENT_REPORT.md` | `18920f77d57e94c70339e0d1ee43b58f42f11b2e1dae4f4c11b0d236212e025d` |
| `docs/migration/PHASE1D_XENDIT_REPORT.md` | `f4436f500dfd63b464b31d25ed3f0a771f452bb20fca6c882ed9f7dbd5e331dc` |
| `docs/migration/PHASE3E_CLOSEOUT_PROVENANCE.md` | `79783d016fca159ac2d0d49ef164413b405358e60fa45ed28eca699194cd19f4` |
| `docs/migration/PHASE3E_CLOSEOUT_RECONCILIATION_CONTRACT.md` | `205ca8e7d90aca1aa7945fd8d73a8f09fdd634a14301a6f7163b7879a02426da` |
| `docs/migration/PHASE3E_CLOSEOUT_HISTORICAL_BALANCE_CONTRACT.md` | `5b93902c4e6654fc654dbb2e2f2260f76febd517ad6ffb6c2a5dd4c1868dfa6b` |
| `docs/migration/PHASE3E_CLOSEOUT_INDEPENDENT_QA.md` | `9f197f46a6ec22d4baa0e2a9fe6224d2d6e9c759cf0ed8d45c073e7724642a17` |
| `docs/migration/CANONICAL_SCHEMA.sql` | `786688db5d38b717fa3d3b33860d03c67438a09ca7cd11bc1adfde8d4e8776e8` |
| `scripts/payment_reconciliation_readonly.sql` | `249efcb679fea0a4d7766f4ddfe459437b870815f7fd78a0361fa07e279406b6` |
| `scripts/phase3e-closeout-reconciliation.ts` | `0e78aac25c968f60b6606daf1c7abfcf6d1343a9bc61708e44f38e4898feb687` |
| `backend/migrations/0014_finance_ledger.sql` | `5f8b7c0bd0b021fce3b5dc60655ab5cf50a1b8bb44101c89a4e82486ef42359b` |
| `backend/migrations/0015_royalties.sql` | `611d3c05996a95ebeac43365d28d677015a3e10cd349fdccadb929754ef66409` |
| `backend/migrations/0016_payouts.sql` | `09a2e4d118d2240f69bfdaf16cc4261fdd5f40bf7a5ea315707982f430cde7e9` |
| `backend/migrations/0017_payments.sql` | `eb6dfad6aed0642956dfb150792128bff96fbac41cf4a66abd73bb37cb26fe89` |
| `backend/src/payments/index.ts` | `f2306b05656627002e63aabcab15f6654271d5c92c2714b5c6520147643a6753` |
| `backend/src/payments/provider.ts` | `9506ddd5ab6275bd73a70c730fbd4ee570fdb7bd050f1f16e0db40c403012561` |
| `backend/src/payouts/index.ts` | `7233cd831371034b2656e2c44051052e575e521490433baaf2479f9e4b332a46` |
| `backend/src/payouts/policy.ts` | `447483442d148d7dd8dc981d20e8e0a6bea3704da52cbf699a8e4147efc57b73` |
| `backend/src/royalties/index.ts` | `ad8534dc724d9b81cbc77eaed4c35cc431f6e7d251944af50e90977e299579ca` |
| `backend/src/composer-royalties/contracts.ts` | `54e199418321e6bee8dc5f4af9950108343d1ba4c9135524a197c1a8f1956f67` |
| `supabase/functions/xendit-webhook/index.ts` | `e4a36a4675c67c8791891bc8f48bd82168e228658ff57c09c102325d20448970` |

Validation scope: inspected authoritative reports, reconciliation scripts, schema/migration contracts and current source; captured hashes and checked ledger references/fingerprints locally. No application tests, synthetic DB fixture, production financial query, provider verification or historical reconciliation executed. Earlier test counts remain explicitly inherited. Fresh remote evidence consists only of directory/container metadata and the failed access attempts above.

Changed file: `docs/migration/PHASE3E_FINAL_PROVENANCE_LEDGER.md` only. Blockers B1–B7 remain open.
