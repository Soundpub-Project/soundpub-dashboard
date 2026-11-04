# Phase 3E Admission — Population Counts

Agent D, Historical Reconciliation. Reviewed 2026-10-30, Asia/Bangkok. **Local enumeration complete for the files listed below; current production population UNKNOWN; historical record-level dry run NOT EXECUTED; admission BLOCKED.**

## Scope and reviewed task

Only this report and `PHASE3E_ADMISSION_PROVENANCE_LEDGER.md`, `PHASE3E_ADMISSION_HISTORICAL_RECONCILIATION.md`, `PHASE3E_ADMISSION_OPENING_BALANCES.md` are written. Existing dirty worktree is preserved. No SSH, production query, provider request, secret discovery, application status/RPC call, fixture execution, import, posting, repair, deployment or traffic change occurred in this assignment. CSV reads, report/source inspection, local assertions and hashes are the only checks performed.

Full supplied task read from `C:/Users/bimok/.codex/attachments/6d88eb07-6586-4834-a5f6-e178acd9e4c1/Pasted text.txt`, including sections 16–39. Section compliance and actual evidence gaps are recorded in the historical reconciliation report. Parent-provided Agent B final handoff **was received** and its production read log/snapshot were read: SSH works, DB is restarting without a container IP, Compose configuration has I/O errors and the existing SQL client failed `EAI_AGAIN` before BEGIN. No transaction started; mutations 0. **No production SQL is permitted or attempted.** No credentials or alternative access paths were sought by Agent D.

Authority: latest `PHASE3E_FINAL_CLOSEOUT_REPORT.md` and `PHASE3E_FINAL_INDEPENDENT_QA.md`, with final provenance/historical/opening reports and existing closeout reconciliation/balance contracts. Older broad synthetic PASS or `MIGRATED` statements do not supersede their BLOCKED financial acceptance decision.

## Inherited historical DB population

Source: `PHASE1F_DATABASE_SCOPE.md`, **2026-10-27T13:31:07.912225 UTC**, reported single REPEATABLE READ READ ONLY financial transaction ending ROLLBACK. Counts are inherited exact observations at that instant, not current production counts, approved imports or a cutover freeze.

| Soundpub population | Inherited rows | Known subsets / limits |
| --- | ---: | --- |
| `royalties` | 14,474 | All reference existing uploads; all 14,474 lack `source_row_number`. Allocation conservation reported PASS. |
| `royalty_uploads` | 10 | All 10 successful; all 10 lack replay keys; all 10 inserted-count mismatches. Same upload population, not 20 uploads. |
| `profiles` balance comparisons | 182 | Zero arithmetic differences / negative balances; formula includes unapproved adjustments. Not 182 approved opening balances. |
| `balance_adjustments` | 33 | Older Phase 1B evidence calls all 33 `migration_opening_balance`; zero independent justifications/approvals supplied. |
| `payout_requests` | 3 | 2 locally paid; remaining 1 not paid, exact state not supplied here. Both paid have proof paths; proof bytes/finality unverified. |
| `payout_balance_reservations` | 5 | All 5 on pending/approved/paid requests; amount/link checks pass. Not 5 independent payouts. |
| `release_payments` | 9 | 4 locally paid, 5 not paid; all 9 have stored provider ID/URL. Detailed nonpaid state partition unavailable. |
| Paid release invoice artifacts | 4 paid records | 2 have invoice number/PDF path; same other 2 lack both. Existing bytes unverified. |
| Invoices, as an independently enumerated business population | UNKNOWN | Nine release-payment and two copyright-payment rows are not an authenticated invoice population; stored references cannot supply extra invoice records. |
| Payout proofs / provider references | 2 paid payout proof-path values; provider-reference presence on 9 release and 2 copyright payments | Distinct proof objects/provider transactions and object metadata existence UNKNOWN; reference columns are not additional economic records. |
| `copyright_registration_payments` | 2 | Both expired; 0 paid; both have stored provider ID/URL. |
| `composer_royalties` | 0 | Empty population; no composer earning lifecycle proven. |
| Provider refunds / reversals | UNKNOWN | Complete independent population not supplied. Never report zero. |
| Historical callback receipts / immutable financial effects | UNKNOWN | No complete enumerated production population supplied. |
| Historical corrections/reversals / financial audit subset | UNKNOWN / UNKNOWN | Earlier 33-table inventory has 0 archived royalties and 18,307 whole-application audit rows; neither is a complete financial correction/audit denominator. |
| Distinct affected beneficiaries / approved residual schedule | UNKNOWN | Adjustment, profile and allocation counts cannot supply these totals. |

These are related entity tables and subsets, not disjoint economic events. No combined business-record grand total is claimed.

Agent B's inherited **33-table** Soundpub inventory is a planning allowlist only, from the separate **2026-10-27T13:18:50.116086 UTC** catalog/table-count capture. It is not fresh schema verification, current population completeness or an approved extraction set. Current status/currency/period/provider/mapping/reconciliation-state denominators and unknown/unclassified totals remain **UNKNOWN**, not 0. No shared Auth/Storage or other-project data was enumerated here.

## Required denominator and dimensions — sections 18, 19 and 28

| Denominator field | Current historical result |
| --- | --- |
| Total in-scope rows | UNKNOWN; full historical scope not proven complete. |
| Classified rows | UNKNOWN; no full-population record-level dry run executed. Aggregate deficiencies and review proposals are not counted as completed classifications. |
| Unclassified rows | UNKNOWN, not 0; required target 0 is not achieved/proven. |
| Full in-scope population enumerated | NO / PARTIAL. |

| Required dimension | Available bounded evidence | Current full-population count |
| --- | --- | --- |
| Entity | Inherited table/subset counts and separate local export counts above | UNKNOWN; no deduplicated business denominator. |
| Status | Inherited 10 successful uploads, 4 paid release payments, 2 paid payouts, 2 expired copyright payments; local exports have 9/13 processing uploads | UNKNOWN; remaining statuses and missing populations not freshly enumerated. |
| Currency | Backend IDR accounting contract is known; no complete historical currency grouping supplied | UNKNOWN; do not assign IDR to historical rows from UI/backend conventions. |
| Period | Period columns exist in exports; complete approved source-period lineage/grouped denominator unavailable | UNKNOWN. |
| Provider | Stored Xendit-reference presence on 9 release/2 copyright rows; no authenticated provider inventory | UNKNOWN; reference presence is not provider-state reconciliation. |
| Mapping state | Five local composer codes/six rows have 0 approved backend beneficiary mappings | UNKNOWN across full historical scope. |
| Reconciliation state | Historical dry run NOT EXECUTED; no completed final classifications | UNKNOWN for all required final classes; no false zero-unclassified claim. |

Required financial imports, rows, corrections/reversals, composer records, adjustments/opening adjustments, requests/proofs, payments/invoices, refunds, provider references and financial audits are explicitly included above. Required routing roles for UNKNOWN populations are listed through D-02–D-12 in the historical report; named assignment acceptance remains unproven.

## Inherited predicates

| Group | Predicates | PASS | FAIL |
| --- | ---: | ---: | ---: |
| Original reconciliation SQL | 20 | 15 | 5 |
| Additional Phase 1F assertions | 21 | 21 | 0 |
| Total | 41 | 36 | 5 |

| Failing predicate | Failures | Counting interpretation |
| --- | ---: | --- |
| `missing_source_row` | 14,474 | Royalty rows missing source identity. |
| `missing_upload_replay_key` | 10 | Same ten uploads as following predicate. |
| `upload_inserted_count` | 10 | Deterministic stored-count disagreement, not proof of duplicate credits. |
| `paid_without_invoice_number` | 2 | Same two paid release records as following predicate. |
| `paid_without_pdf_path` | 2 | Missing paths, not independently established payment failure/refund. |

Predicate failure counts overlap. They are not mutually exclusive dry-run buckets. Empty composer/paid-copyright checks and duplicate-source/replay checks with missing keys provide no positive lifecycle or replay proof.

## Fresh local export enumeration

Executed locally using Python standard-library `csv.DictReader`, `utf-8-sig`, `newline=''`, explicit delimiters, row-width assertions and SHA-256. Data rows exclude headers. No raw identity, amount, bank, provider or personal values emitted. Directory/filename labels are not authenticated snapshot timestamps.

E1 means `docs/migration-scripts/exported-data`; E2 means `docs/soundpub-local-migration/exported-data`. These exports are separate evidence populations, not current production and not merged with each other or the inherited DB snapshot.

| Handle | File under export directory | Delimiter | Rows | Fresh aggregate result |
| --- | --- | --- | ---: | --- |
| E1-ROY | E1 `royalties.csv` | comma | 23,934 | 0 missing upload values; 0 references outside E1 upload export; 0 duplicate ID groups. |
| E1-UPL | E1 `royalty_uploads.csv` | comma | 9 | All 9 `processing`; 0 `success`; 0 duplicate ID groups. |
| E1-PAY | E1 `payout_requests.csv` | comma | 0 | Header-only; no payout lifecycle proven. |
| E1-COM | E1 `composer_royalties.csv` | comma | 6 | 5 exact codes; 1 repeated code-period group containing 2 rows; all 6 upload values missing; 0 duplicate ID groups. |
| E1-PRO | E1 `profiles.csv` | comma | 65 | Snapshot fields only; no approved event reconstruction. |
| E2-ROY | E2 `royalties-export-2026-07-11_00-54-50.csv` | semicolon | 28,713 | 0 missing upload values; 0 references outside E2 upload export; 0 duplicate ID groups. |
| E2-UPL | E2 `royalty_uploads_2026-07-10.csv` | comma | 13 | All 13 `processing`; 0 `success`; 0 duplicate ID groups. |
| E2-PAY | E2 `payout_requests_2026-07-10.csv` | comma | 1 | Locally `paid`; no independent settlement proof. |
| E2-PRO | E2 `profiles_2026-07-10.csv` | comma | 104 | Snapshot fields only; no approved event reconstruction. |

Both royalty CSVs omit `source_row_number`, `artist_revenue`, `label_revenue`, `soundpub_revenue`; E1 additionally omits `label_user_id`. Both upload CSVs omit `idempotency_key`. These are **missing export columns**, not fresh evidence that current production column values are null. Successful-upload inserted-count mismatch check has **zero eligible uploads** in both exports; its zero failures are vacuous. Nonmissing upload IDs prove CSV linkage only.

The six-versus-zero composer and 23,934/28,713-versus-14,474 royalty differences need authoritative source/capture/replacement lineage. Snapshot differences alone do not prove deletion, debt, duplicate credit, test data or approved exclusion.

## Exact execution boundary

New production queries: **0**. New provider calls: **0**. New historical record-level reconciliation runs: **0**. Supplied approved historical exceptions: **0**. Supplied signed adjustment approvals: **0**. Accepted opening carry-forwards / opening events posted: **0 / 0**. Historical matched/mismatched/unresolved/ambiguous bucket totals: **NOT ENUMERATED**, not zero.

Fingerprints: companion provenance ledger. Reconciliation blocker IDs and runnable local checks: companion historical reconciliation report. Confirmed production access failure and unproven population/classification/approval evidence prevent current-population acceptance.
