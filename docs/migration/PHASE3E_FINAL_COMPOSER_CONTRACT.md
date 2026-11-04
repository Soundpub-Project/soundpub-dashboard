# Phase 3E final composer closeout contract

Date: 2026-10-30 (Asia/Bangkok). Agent B. **Read-only preview verified; financial implementation and posting BLOCKED.**

## Decision and authority

This is evidence-based closeout analysis, not a new economic contract or authorization to migrate data. `PHASE3E_FINAL_COMPOSER_IDENTITY_MAP.md` records schema relationships, five export identities, source-population conflict and blockers C01–C07. None has an approved backend beneficiary/work/allocation mapping. No production/shared Supabase access or mutation, deployment, provider operation or financial posting occurred.

Reviewed original Phase 3E final/QA/model/money/invariant/transaction/payout/RPC/parity/reconciliation documents and current closeout final/QA/composer/provenance reports. Preserve their BLOCKED composer decision. Canonical SQL resolves the old ID/code alias uncertainty and proves a declared work percentage exists; it does not close ownership, allocation, reconciliation or posting gates.

## Existing executable boundary

Actual implementation: `backend/src/composer-royalties/contracts.ts`, exported `composerStatement` and `previewComposerStatement(input)`. Pure function uses installed Zod and exact-money helpers. No database, identity resolver, HTTP route, durable batch, authorization or ledger effect. Backend composition has artist royalty services; composer preview is not registered as a service/route. Backend migrations through `0018` contain no composer royalty or copyright entitlement/batch tables.

| Field / behavior | Current code contract | Financial limit |
| --- | --- | --- |
| `source`, `source_batch` | Required strings; trim outer whitespace; 1–200 characters after trim; embedded control characters reject | Labels only; no immutable source artifact, stable event key, durable uniqueness or provenance approval. |
| `period` | Required `YYYY-MM`, month 01–12 | Legacy nullable/quarterly periods require reviewed classification. Grammar does not prove entitlement dates. |
| `currency` | Literal `IDR` | Synthetic accounting convention; legacy composer table has no currency column. UI IDR formatting does not prove historical currency. |
| `rows` | Strict objects, 1–1000 rows; unknown fields reject | No implicit import of arbitrary CSV fields. |
| `composer_code`, `composer_name` | Required text with same trim/control/length rules; case preserved | Name is display only. Code is not UUID/principal or verified registry lookup. Preview limit 200 differs from backend profile-code limit 100; do not use preview as a persistence validator. |
| Duplicate code | Duplicate trimmed, case-sensitive code rejects with `DUPLICATE_COMPOSER`, regardless of display name | Case variants are not guessed aliases. Multiple same-code earning rows would need an approved source-event/aggregation contract. |
| `total_net_royalti` | Nonnegative decimal string; 1–16 integral digits, at most two fractional digits, no leading zeros except zero itself; rejects number/exponent/negative/whitespace | Exact supplied total, not calculated share. Zero allowed in preview; finance ledger does not accept zero-value posting. |
| Money output | Each amount and batch total serialized with two decimals using bigint minor units | No floating-point conversion or rounding. Aggregate total may exceed one ledger event's ceiling; preview total is not a postable event. |
| Work/track/share | Absent; strict boundary rejects added fields, including `share_percentage` | Rejection of every share is not validation of valid multiwriter allocation, fractional precision or conservation. |
| Replace/correction/reversal | Unsupported fields and negative totals reject | No import replacement, financial correction or durable reversal implemented. |
| Result | Always `status: 'UNRECONCILED'`, `posting_allowed: false`, blockers `COMPOSER_IDENTITY_MAPPING_REQUIRED`, `WORK_ALLOCATION_CONTRACT_REQUIRED` | These are two coarse preview blockers, not the complete C01–C07 closeout list. No code path grants posting. |

Preview replay is deterministic and leaves input unchanged. This proves neither durable import idempotency nor absence of duplicate economic events across batches. Amount syntax success cannot authorize a beneficiary or payout.

## Legacy behavior and proven differences

| Legacy surface | Observed behavior | Final interpretation |
| --- | --- | --- |
| `get_my_composer_royalties(_period text DEFAULT NULL)` | Canonical `STABLE SECURITY DEFINER` SQL: admin reads all rows; otherwise copyright role plus nonnull own profile code, exact stored-code equality; optional exact period filter; order period descending nulls last, creation descending. Return `composer_code` is selected `composer_id`. No work/share calculation. | Read behavior and alias proven in source. No uniqueness, current backend binding, registration-active check or earning entitlement is established by this reader. Do not inherit definer privileges or assume role/code means payee. |
| Direct `ComposerRoyaltyUpload.tsx` | Required `composer_id`, name, total; optional period. `parseFloat`, warning for negatives, inserts in batches of 100; partial success possible; no upload ID in insert or durable replay key. | Unsafe legacy behavior is not an approved financial baseline. Its optional-period schema differs from RPC UI and strict preview. |
| `CopyrightRoyaltyUpload.tsx` | Required code/name/total/period CSV; validation RPC; failed validation request continues without row result; batch import sends valid rows, period, filename and replace flag. | Call shape is known; actual validation/import routines are absent in recorded catalog. Do not reproduce dropped-row success or infer replacement accounting. |
| `CopyrightRoyaltyUploadHistory.tsx` | History sends `_limit:100`; delete sends `_upload_id`, expects deleted row count. | Backing composer upload model, ownership, ordering and financial reversal semantics unproven. A caller does not establish an executable contract. |
| Work registration form | Deletes/reinserts work rows; stores percentage, collaboration flag and empty cowriter JSON; optional text ISRC/UPC. | Declaration metadata is not an immutable financial entitlement history. Default 100 does not define a split. No work-to-royalty or work-to-track FK. |
| Backend mode | Composer list/summary/upload/history wrappers return unavailable state; dashboard skips composer royalty RPC, but still reads copyright registration/contract/work tables and can request contract signed URLs. | Financial guard is proven source behavior, not full copyright decoupling. Dashboard empty royalty list is not reconciled zero earnings. |

`src/integrations/supabase/types.ts` exposes composer totals as JS numbers and no relation metadata. Canonical `numeric(18,2)` and SQL constraints remain stronger evidence; generated types do not approve lossy money transport.

## Final RPC ownership and disposition

Classify all five financially relevant composer RPCs as `PHASE3E_FINANCIAL`, correcting the earlier `PHASE3F_COPYRIGHT` assignment in the RPC replacement matrix and closeout contract. Legal copyright registration, ownership and contract lifecycle remain `PHASE3F_COPYRIGHT`. **Composer financial posting, accounting and payout safety remain Phase 3E hard gates; financial parity is NOT PROVEN and posting remains BLOCKED.** Phase assignment does not make these migrated, retired, optional or financially approved. No replacement route names or success behavior are invented here.

| RPC | Legacy implementation evidence | Target domain owner / Phase 3E dependency | Final status and current replacement |
| --- | --- | --- | --- |
| `get_my_composer_royalties` | Present in canonical SQL and recorded Phase 1F catalog; own-code/admin read behavior above | Finance/composer read service; Finance must approve beneficiary scope and exact totals | `PHASE3E_FINANCIAL`; backend read NOT IMPLEMENTED. Pure preview is not an authorized read. |
| `validate_royalty_csv_row` | Absent across schemas in inherited catalog audits; caller sends four text fields | Finance/composer validation; Finance owns allocation/provenance/posting gate | `PHASE3E_FINANCIAL`; legacy BROKEN FEATURE. Preview covers strict synthetic totals only, not RPC parity. |
| `import_composer_royalties` | Absent recorded implementation; caller sends JSON rows, period, filename, replace flag | Finance/composer import service with ledger integration and approved mappings | `PHASE3E_FINANCIAL`; legacy BROKEN FEATURE; backend financial import NOT IMPLEMENTED / BLOCKED. |
| `get_royalty_upload_history` | Absent recorded implementation; admin UI expects provenance/status/errors | Finance/composer batch history; Finance requires immutable source and effect linkage | `PHASE3E_FINANCIAL`; legacy BROKEN FEATURE; durable composer batch model/history NOT IMPLEMENTED. |
| `delete_royalty_upload` | Absent recorded implementation; UI expects destructive deletion count | Finance/composer correction service; Finance owns append-only offset and spent/reserved-fund rules | `PHASE3E_FINANCIAL`; legacy BROKEN FEATURE; backend composer correction NOT IMPLEMENTED / BLOCKED. |

Five enumerated RPCs accounted for; **UNEXPLAINED = 0; MIGRATED_FINANCIAL = 0**. Catalog existence/absence is inherited evidence, not a new server query. Supporting `generate_composer_code`, `admin_review_copyright_registration`, `admin_update_copyright_contract` remain copyright identity/contract lifecycle routines; they are not earning allocation or payment settlement authority. `create-copyright-invoice` is separate copyright payment/provider work; paying registration fees does not prove royalty entitlement.

Underscore RPC `delete_royalty_upload` is distinct from hyphenated Edge Function `delete-royalty-upload`, which uses artist/distribution `reverse_royalty_upload`. Existing artist import/history/correction endpoints do not replace composer RPCs. In particular, `backend/src/royalties/index.ts` verifies beneficiary against persisted track/release **artist** ownership; that predicate cannot choose a composition payee or split. Do not feed composer totals into that service merely because schemas share an amount/period concept.

## Posting admission and payout eligibility

Current result for every composer preview/export identity: **posting prohibited; no composer-derived available balance or payout authorization established**. Existing ledger primitives can record events but do not verify composition rights. Existing artist import posts earnings while batch is `UNRECONCILED`; payout quarantine/public balance masking is separate. Earlier unqualified statements that unreconciled imports never credit raw ledger availability do not justify reusing that path for composer earnings.

| Gate | Evidence needed | Current disposition |
| --- | --- | --- |
| Identity and authority (C01–C02) | Unique verified backend beneficiary, authoritative code normalization/binding, represented-party authority, current active roles; explicit admin import and unrelated-reader denial | BLOCKED; one candidate legacy profile linkage, no approved backend mapping. |
| Work/recording/rights period (C03) | Approved source-row-to-work and recording links, effective entitlement, collision and missing-link disposition | BLOCKED; work declaration fields exist, posting links absent. |
| Economic amount/share (C04) | Signed-off preallocated-net or calculation model, source currency/deductions, share precision/conservation, deterministic rounding/remainder, exact totals and individual event limits | BLOCKED; work-level 0–100 check and default 100 do not supply allocation contract. No 100%, equal split, 70/30 or 9% rule inferred. |
| Source/replay/history (C05) | Immutable source artifact and event keys, source/batch provenance, overlap and repeated-row decisions, six-versus-zero population disposition | BLOCKED; export upload IDs absent and historical lineage unapproved. |
| Atomic implementation (C06) | Revalidate under current authority/account locks; durable import plus authorized immutable earning/offset, matching audit/outbox and source linkage in one transaction; durable replay/conflict checks | NOT IMPLEMENTED for composer. No preview-to-post promotion or reconciliation transition exists. |
| Correction and spent value (C04–C06) | Approved original-event linkage, audited offset and replay semantics; overspent/reserved correction decision | BLOCKED. No destructive delete, replacement, silent debt or legacy balance rewrite permitted by this analysis. |
| Payout (C07) | Approved composer beneficiary/role model plus verified destination, minimum, reconciled earnings, available funds and trusted settlement evidence | BLOCKED. Current `backend/src/payouts/index.ts` requires label/whitelabel for request; copyright role alone fails. Policy's `destinationReady: true` is not verified destination evidence. Do not grant label role to bypass missing composer policy. |

These are admission evidence requirements derived from existing Phase 3E invariants; unanswered business decisions stay unknown. No new share algorithm, schema, route, automatic mapping, approval or exception is introduced. Read-only preview can continue internally; financial acceptance requires C01–C07 evidence and an independently tested implementation.

## Fresh verification and limits

Executed 2026-10-30 from repository root; no DB URL, server connection, production credential or package installation required:

```powershell
node backend/node_modules/tsx/dist/cli.mjs --test backend/test/composer-royalties.test.ts backend/test/royalties.test.ts
npm --prefix backend run typecheck
```

Observed: **19 passed, 0 failed, 0 skipped**: nine composer boundary tests and ten artist royalty unit tests. Backend typecheck **PASS**. Composer checks cover exact totals, multiple codes without invented shares, duplicate code rejection, unknown identity/missing work quarantine, deterministic no-mutation preview, unsupported shares/corrections/replace and malformed input rejection. Artist tests use a transaction/query double, not a live database; they demonstrate orchestration only. No DB/HTTP/browser composer import, authorized read, valid fractional-share allocation, durable replay, correction, current identity or payout lifecycle was tested or claimed.

Local CSV review additionally confirmed six rows/five codes/one repeated code-period group, one legacy code match and four unmatched codes, absent upload IDs, and same candidate legacy profile ID in two separate profile exports. File hashes and row locators are in the identity map. These are evidence observations, not migration acceptance.

Reviewed executable SHA-256: preview `54E199418321E6BEE8DC5F4AF9950108343D1BA4C9135524A197C1A8F1956F67`; composer tests `83BC9DB432127DA928A4B158645E50AA8FC8569E6C35FBF4869D3EB161AF7BD1`.

## Changed files and remaining work

Agent B created only `docs/migration/PHASE3E_FINAL_COMPOSER_IDENTITY_MAP.md` and `docs/migration/PHASE3E_FINAL_COMPOSER_CONTRACT.md`. Original reports, code, schemas and tests were not edited. Blockers C01–C07 remain open; named RPC classification is complete, financial closeout is not. No Phase 3E PASS, Phase 3F readiness, traffic switch or production action is authorized by this review.
