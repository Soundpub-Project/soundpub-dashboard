# Phase 3E Final Historical Reconciliation — Agent D

Reviewed 2026-10-30, Asia/Bangkok. **Historical reconciliation: PARTIAL / BLOCKED. Historical dry run: NOT RUN. Production settlement: UNRESOLVED.** Local synthetic comparison passes; no historical acceptance or exception approval follows from that result.

## Scope and evidence boundary

Only this report and `PHASE3E_FINAL_OPENING_BALANCE_REPORT.md` were authored. Existing worktree changes belong to other work. No SSH, shared Supabase/database access, provider API, financial status endpoint, repair, deployment, historical import, opening posting, production mutation or traffic change occurred. No credentials or private financial identifiers were collected.

Executed checks used source inspection and disposable local PostgreSQL only. Fixture setup writes synthetic users/events, runs backend migrations, and removes its own container in `finally`; these are local test writes, not historical repair. `reconcileAccount` comparisons leave ledger/audit/outbox unchanged. Existing service reconciliation is not a production read-only collector: authorization/account/invoice paths acquire locks and can initialize account rows. Do not call status/reconciliation endpoints to gather historical proof.

Reviewed inputs: `PHASE3E_CLOSEOUT_RECONCILIATION_CONTRACT.md`, `PHASE3E_CLOSEOUT_HISTORICAL_BALANCE_CONTRACT.md`, `PHASE3E_CLOSEOUT_PROVENANCE.md`, `PHASE3E_RECONCILIATION_REPORT.md`, `PHASE3E_CLOSEOUT_FINAL_REPORT.md`, `PHASE3E_CLOSEOUT_INDEPENDENT_QA.md`; historical evidence in `PHASE1F_DATABASE_SCOPE.md` and `PHASE1B_FINANCIAL_PAYMENT_REPORT.md`; existing scripts and finance/payment/payout/royalty source plus relevant legacy migrations.

Latest historical evidence reviewed is the **2026-10-27T13:31:07.912225 UTC** REPEATABLE READ READ ONLY snapshot documented in `PHASE1F_DATABASE_SCOPE.md`. Counts below are inherited observations from that report, not fresh production results or an approved cutover snapshot. Its SQL retained the repository script's 20 predicates, wrapped aggregate output, changed the ending to `ROLLBACK`, and added 21 checks in the same transaction. Older U01–U10, I01/I02 and A01–A33 handles are report-local; no stable cross-snapshot primary-key mapping was supplied.

## Historical counts and failures

| Population / check | Inherited count | Evidence and limit |
| --- | ---: | --- |
| Royalty rows | 14,474 | All linked to existing uploads; all lack source-row numbers. Allocation arithmetic passes; original statements/row identity remain unverified. |
| Uploads / successful uploads | 10 / 10 | All lack replay keys; all 10 fail inserted-record-count equality. |
| Profile balance comparisons | 182 | Zero stored arithmetic discrepancies and zero negative balances; formula includes unapproved adjustments. |
| Balance adjustments | 33 | Older report identifies all as `migration_opening_balance`; independent justification/approval absent. See opening report. |
| Payout requests / paid requests | 3 / 2 | Five reservations; reservation amount/link checks pass. Both paid rows have proof paths, not verified proof bytes or external settlement. |
| Release payments / paid payments | 9 / 4 | All nine have stored provider IDs/URLs. Same two paid rows lack invoice number and PDF path; other two paid rows have both paths/numbers. No provider or document-byte verification. |
| Copyright payments / paid payments | 2 / 0 | Both expired. Empty paid population proves no paid lifecycle. |
| Composer royalty rows | 0 | Orphan check is vacuous; no composer ownership/mapping acceptance. |
| Historical refunds | UNKNOWN | No enumerated trusted refund population supplied; absence of evidence is not zero refunds. |

| Original failing predicate | Failures | Blocking register |
| --- | ---: | --- |
| `missing_source_row` | 14,474 | HR-02 |
| `missing_upload_replay_key` | 10 | HR-03 |
| `upload_inserted_count` | 10 | HR-04 |
| `paid_without_invoice_number` | 2 | HR-07 |
| `paid_without_pdf_path` | 2 | HR-07; same two records |

Original assertions: **20 total, 15 PASS, 5 FAIL**. Additional assertions: **21 total, 21 PASS, 0 FAIL**. Combined: **41 predicates, 36 PASS, 5 FAIL**. Counts measure predicates or table populations, not mutually exclusive reconciled business records. Missing replay/source keys make duplicate-key passes vacuous. Do not add overlapping failure counts or infer per-record buckets from them.

Historical `matched`, `mismatched`, `unresolved`, `ambiguous` record totals: **NOT ENUMERATED**. Approved historical exceptions supplied: **0**. This is an evidence count, not proof that no approvals exist elsewhere.

## Fresh safe local checks

Commands ran from `I:/website-devops/soundpub-project/soundpub-dashboard` on 2026-10-30. Node: `v24.22.1`. Commands below exited 0.

| Command | Result / evidence |
| --- | --- |
| `docker --context desktop-linux context inspect desktop-linux --format '{{.Endpoints.docker.Host}}'` | Local Docker Desktop endpoint: `npipe:////./pipe/dockerDesktopLinuxEngine`. Harness independently requires a named-pipe endpoint and creates fresh PostgreSQL 17 Alpine on `127.0.0.1` with a random port; no environment DB URL is used by that harness. |
| `node backend/node_modules/tsx/dist/cli.mjs scripts/phase3e-closeout-reconciliation.ts` | PASS. `DRY_RUN`, `synthetic-local-only`; four independent comparisons over one synthetic source event: matched 1, mismatched 1, unresolved 1, ambiguous 1, historical_exception 0. Duplicate expectation rejected; exact ledger/audit/outbox snapshots unchanged. `historical_population=NOT_RUN`, `settlement_proof=NOT_TESTED`. |
| `node backend/node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 backend/test/finance-ledger.test.ts backend/test/payments.test.ts backend/test/payouts.test.ts backend/test/royalties.test.ts` | **26 PASS, 0 FAIL, 0 SKIP, 0 cancelled, 0 todo**, 22,486.8252 ms. Existing restricted-runtime/local DB fixtures and in-memory royalty tests; no real provider. Covers exact money, replay, reservation terminal exclusivity, rollback, no-repair comparison, signed mock callbacks/refund and authority. |
| `Get-FileHash -Algorithm SHA256 <reviewed files>` | Actual file arguments and SHA-256 values recorded below. Hashes identify reviewed bytes, not financial authenticity. |

Additional executed static check (PowerShell; exact replayable command):

```powershell
@'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sql = fs.readFileSync('scripts/payment_reconciliation_readonly.sql', 'utf8');
const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
assert.equal(statements.length, 4);
assert.match(statements[0], /^BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY$/);
assert.equal(statements[1], "SET LOCAL statement_timeout = '45s'");
assert.match(statements[2], /^WITH allocations AS/);
assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|CALL|COPY|DO)\b/i);
const checks = [...sql.matchAll(/SELECT '([^']+)'/g)].map(m => m[1]);
assert.equal(checks.length, 20);
assert.equal(new Set(checks).size, 20);
assert.equal(statements[3], 'ROLLBACK');
const source = fs.readFileSync('backend/src/finance/index.ts', 'utf8');
const migration = fs.readFileSync('backend/migrations/0014_finance_ledger.sql', 'utf8');
assert.ok(!source.includes('MIGRATION_OPENING_BALANCE'));
assert.ok(!migration.includes('MIGRATION_OPENING_BALANCE'));
console.log(JSON.stringify({scope:'static-local-only', statements:statements.length, predicates:checks.length, read_only:true, statement_timeout:'45s', terminal_statement:statements[3], rollback_contract:'SATISFIED', opening_event_accepted_by_reviewed_finance_contract:false}, null, 2));
'@ | node
```

Result: PASS for those assertions; four SQL statements, 20 unique predicates, explicit READ ONLY and 45-second timeout, terminal `ROLLBACK`. The closeout contract's no-commit convention is satisfied. Static text checks do not establish deployed schema compatibility or provider settlement. SQL file was inspected, not executed against historical or production data. Its legacy tables/columns cannot be assumed compatible with backend fixtures.

## Current source versus earlier contract notes

`backend/src/finance/index.ts::reconcileAccount` reads events/audit/outbox and compares complete caller-supplied expectations. An empty population proves no lifecycle; expectations reconstructed from the ledger under test prove comparison integrity only. The dedicated dry-run script defines its synthetic source before posting. Its default `withTransaction` uses `BEGIN`/`COMMIT`, not a historical READ ONLY snapshot; unchanged-row assertions supply the no-repair evidence for that test.

The earlier reconciliation contract's payment limitations are partly superseded by current source and final independent QA: `reconcileInvoice` now checks one-to-one effect/finance kind, owner, currency, amount and evidence, validates audit metadata and applied callback linkage, and global `reconcile` includes `unsupported` receipts. Reviewed payment hash matches final QA's hash below. These changes strengthen synthetic integrity; the same mock callback still writes local/provider-mirror state. No independent external settlement or historical record linkage is established. No new claim of whole-phase QA/browser/parity PASS is made.

## Unresolved register: owner and disposition

Owner labels specify **required accountable roles for coordinator routing**, not accepted assignments, signatures or approvals. Named assignees and approval references were not supplied. Coordinator must identify each named owner; until then ownership acceptance remains outstanding. Every row remains open; no exception or waiver is granted here.

| ID | Unresolved scope | Required owner | Disposition / evidence needed to close |
| --- | --- | --- | --- |
| HR-01 | No fresh frozen historical population, fixed approved cutover, or private cross-snapshot mapping | Phase 3E coordinator + data migration lead | Keep historical dry run NOT RUN; obtain approved bounded capture and private business/source mapping before classifying records. Do not treat old U/I/A handles as stable identities. |
| HR-02 | 14,474 royalty source-row identities and independent source statements missing | Royalty data owner + Finance reviewer | Preserve original rows; recover statement bytes/hash, period, beneficiary/work allocation and immutable source identity privately. Keep unverified credits excluded from migration/payout acceptance. |
| HR-03 | 10 missing upload replay keys | Royalty import maintainer + royalty data owner | Reconstruct original business/source identity from evidence; approve replay/exclusion plan. Never fabricate historical keys or resubmit batches to create evidence. |
| HR-04 | 10 successful-upload inserted-count mismatches | Royalty data owner + royalty import maintainer | Explain original counts/replacement history against source and actual linked rows; retain metadata until separately authorized correction. No silent count edit. |
| HR-05 | 33 opening adjustments lack independent justification and sign-off | Finance reviewer + data migration lead | Apply per-adjustment disposition in opening report; preserve legacy entries, block automatic carry-forward and residual posting. No balancing credit. |
| HR-06 | Four paid release payments lack independently reconciled external settlement; other payment states need evidence for full coverage | Payments integration owner + Finance reviewer | Privately match provider account/environment, original invoice/business ID, exact amount/currency/fees, callback/digest, effect/audit and final state. Local paid/ID/URL cannot close gate. |
| HR-07 | Same two paid release rows lack invoice number and PDF path; existing artifact bytes also unverified | Finance document owner + payments integration owner | Recover originals under separately authorized workflow, hash and link verified bytes. Preserve paid rows; no new payable invoice, inferred failure or inferred refund. |
| HR-08 | Two paid payouts, three requests and five holds lack complete historical allocation/destination/terminal-settlement proof | Payout integration owner + Finance reviewer | Reconcile original allocation owners, reservation and exactly one terminal effect with trusted destination/provider/bank evidence. A proof path or mock evidence string is insufficient; no double debit of legacy paid reservations. |
| HR-09 | Historical refund population and fee/tax/net treatment not supplied | Payments integration owner + Finance reviewer | Enumerate independent provider refund/reversal evidence and original charge once; resolve gross/net/fee semantics exactly. Never interpret release deletion or royalty adjustment as provider refund. |
| HR-10 | Zero composer rows and zero paid copyright rows provide no economic lifecycle proof | Copyright/composer data owner + Finance reviewer | Keep composer posting gate blocked pending approved identity/work/share/source/correction contract. Route copyright payment parity to Phase 3F owner; empty populations cannot waive acceptance. |
| HR-11 | No approved transition for UNRECONCILED royalties; trusted destination policy absent; no approved historical exclusions | Royalty/payout backend maintainers + Phase 3E coordinator + Finance reviewer | Keep production eligibility/cutover blocked. Imports post earnings but remain UNRECONCILED; current quarantine is not approval and `destinationReady: true` is not verification. Require enforceable exclusions for future balances, payouts, readiness and replay plus signed scoped disposition. |
| HR-12 | Collection wrapper/schema review outstanding; script ends `ROLLBACK` | Data migration lead + reconciliation script maintainer | Before separately authorized historical collection, review SELECT-only SQL against target schema, bound REPEATABLE READ READ ONLY transaction with timeout, end `ROLLBACK`, emit aggregates. No remote execution in this task. |

Closing any item requires actual evidence and named review. A proposed role or remediation is not an approval. `HISTORICAL_EXCEPTION` requires owner, exact scope, reason, evidence deficiency, impact, signed approval/reference and exclusion restrictions; it never means MATCHED or settled. None supplied.

Per-record reporting must preserve all issue codes and source/provider provenance. Once a complete population exists, mutually exclusive bucket precedence is ambiguous, mismatched, unresolved, historical_exception, matched; bucket counts must sum to that population. A contradiction cannot be hidden by exception approval. Until then no invented record totals or settlement disposition.

## Evidence fingerprints

SHA-256, captured during this review. Paths are repository-relative; raw financial row linkage belongs in an access-controlled register.

| File | SHA-256 |
| --- | --- |
| `scripts/phase3e-closeout-reconciliation.ts` | `0E78AAC25C968F60B6606DAF1C7ABFCF6D1343A9BC61708E44F38E4898FEB687` |
| `scripts/payment_reconciliation_readonly.sql` | `249EFCB679FEA0A4D7766F4DDFE459437B870815F7FD78A0361FA07E279406B6` |
| `backend/test/support/concurrency-postgres.ts` | `CC6BC6CEE04F86CB60D801B23F2702A83F1F27B48A517000CE903EA1A03DC3FA` |
| `docs/migration/PHASE1F_DATABASE_SCOPE.md` | `E83B74EB0D460871A3791EE945D87CD522C2F7351DE6FCF61605E2551A364175` |
| `docs/migration/PHASE1B_FINANCIAL_PAYMENT_REPORT.md` | `18920F77D57E94C70339E0D1EE43B58F42F11B2E1DAE4F4C11B0D236212E025D` |
| `docs/migration/PHASE3E_CLOSEOUT_RECONCILIATION_CONTRACT.md` | `205CA8E7D90ACA1AA7945FD8D73A8F09FDD634A14301A6F7163B7879A02426DA` |
| `docs/migration/PHASE3E_CLOSEOUT_HISTORICAL_BALANCE_CONTRACT.md` | `5B93902C4E6654FC654DBB2E2F2260F76FEBD517AD6FFB6C2A5DD4C1868DFA6B` |
| `backend/src/payments/index.ts` | `F2306B05656627002E63AABCAB15F6654271D5C92C2714B5C6520147643A6753` |

Decision: **historical production migration, payout eligibility and settlement acceptance remain BLOCKED**. This report completes Agent D's read-only/local inspection scope; it does not close the financial gate.
