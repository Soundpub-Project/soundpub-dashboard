# Phase 3E admission — Composer posting contract

Date: 2026-10-30 (Asia/Bangkok). Agent C. **Posting BLOCKED. Approved economic/posting contract: NOT ESTABLISHED.**

This document records executable limits and required admission evidence; it does not approve new identity mappings, share formulas, migration exceptions or financial behavior. Exact unresolved gate count: **7 (C01–C07)**. Findings, authority, export handles and fingerprints: [composer evidence closure](PHASE3E_ADMISSION_COMPOSER_CLOSURE.md). All five codes/six rows remain blocked; approved backend beneficiary mappings: **0**.

## Existing implementation

`backend/src/composer-royalties/contracts.ts:6` exports `composerStatement`; `:18` exports `previewComposerStatement(input)`. It uses installed Zod and existing exact-money helpers. It has no actor, database connection, identity resolver, work/rights resolver, durable batch, ledger, audit, outbox, provider or network effect. It is not composed in `backend/src/main.ts` or exposed by `backend/src/api/financial.ts`. Migrations through `0018` contain no composer financial batch/entitlement lifecycle. Composer text and copyright role/profile fields alone provide no such support.

| Boundary | Current exact behavior | Posting implication |
| --- | --- | --- |
| Envelope | Strict object: `source`, `source_batch`, `period`, `currency`, `rows`; unknown keys reject | No caller can add approval, beneficiary, replace or correction authority. |
| Text | Source, batch, code and name: strings trimmed at edges, length 1–200; remaining ASCII control characters reject; case preserved | Preview normalization is not approved registry normalization. Code limit differs from backend profile's 100-character ceiling. Names are display only. |
| Period/currency | `YYYY-MM` with month 01–12; literal `IDR` | Syntax and synthetic accounting convention only. Legacy nullable text period and absence of currency do not prove historical semantics. |
| Rows | 1–1000 strict objects with `composer_code`, `composer_name`, `total_net_royalti` | Work, recording, share, source-event and beneficiary fields are unsupported. |
| Amount input | Nonnegative decimal string; 1–16 integral digits; at most two fractional digits; no excess leading zeros, exponent, number, commas, whitespace or sign | Supplied total is validated, not recalculated or economically verified. Negative corrections cannot enter this path. |
| Amount output | Row amounts and sum serialized to two decimals using bigint minor units; no rounding | Aggregate may exceed single-event ceiling. Zero is valid preview input but ledger rejects zero events. |
| Duplicate code | Duplicate trimmed case-sensitive code throws `ApiError(400, 'DUPLICATE_COMPOSER')`, irrespective of name | No same-code event aggregation or cross-batch duplicate detection. Case variants are distinct preview strings, not verified distinct people. |
| Result | Always `status: 'UNRECONCILED'`, `posting_allowed: false`, blockers `COMPOSER_IDENTITY_MAPPING_REQUIRED`, `WORK_ALLOCATION_CONTRACT_REQUIRED` | No accepted input enables posting. Two coarse blocker strings do not replace seven admission gates. |
| Replay/correction | Repeated preview is deterministic and input stays unchanged; replacement/correction fields and negative amounts reject | No durable import idempotency, financial reversal or historical disposition implemented. |

Rejecting every share field proves strict input handling, not valid fractional-share allocation or share conservation. Handling totals as supplied does not prove the source already allocated them correctly. `source_batch` string presence does not prove source authenticity or unique economic events.

## Identity, work and share decisions still required

C01 requires reviewed source/code/legacy-user/backend-user identity with verification provenance, current authority, normalization and reassignment/shared-code rules. Exact SQL code equality, UUID shape, display name, email, copyright role, existing profile match and the historical Supabase ID map do not authorize a beneficiary. Backend `external_identities` can hold verified bindings but no approved composer binding was supplied.

C02 requires actual applicant/represented-writer/payee authority. Personal, representative and company registrations cannot all be treated as one natural-person payee model without evidence. Contract status or registration fee payment alone proves no earning entitlement.

C03 requires source-event-to-work and applicable recording/rights-period linkage. Canonical work `registration_id` FK establishes declaration ownership only; optional ISRC/UPC and track contributor/composer text do not establish an earning relation. Missing identifiers and collisions need approved disposition; title/name matching or substituting artist owner is not supported.

C04 requires approval of whether source totals are already allocated or must be calculated. Known work percentage has two-decimal storage, per-row 0–100 check and default 100; it supplies no approved earning-share precision, cross-writer total, currency/deductions, effective period or rounding remainder rule. Do not infer 100%, equal split, 70/30, 9%, or reuse artist splits. Any future approved calculation must conserve exact source totals under its explicitly approved rounding rule. Existing general finance rounding utility is capability, not composer economic policy.

C05 requires immutable source evidence and stable event identity across batches, with replay/overlap and correction disposition. UUID row IDs or manufactured upload references cannot decide whether export rows 1–2 are duplicate economics. Six exported rows versus zero rows in the dated snapshot requires explained, approved lineage; absence is not permission to restore or discard.

## Required posting admission

These are constraints inherited from Phase 3E invariants, not implemented routes or approved schemas. Posting stays disabled while any C01–C07 evidence or required implementation remains open.

| Gate | Minimum evidence and enforcement before admission | Current disposition |
| --- | --- | --- |
| C01–C02: beneficiary and authority | Approved binding/representation evidence; current persisted active principal and authorized import/read scope; unknown, shared, reassigned or ambiguous identities blocked | OPEN; no approved mapping or composer financial authorization service. |
| C03: work/rights | Approved event/work/recording linkage and entitlement effective for earning period; absent/colliding links blocked | OPEN; declarations exist, posting linkage absent. |
| C04: amount/share | Approved total/allocation meaning and source currency/deductions; exact decimal/integer accounting, event limits, conservation and approved rounding/remainder semantics | OPEN; no approved economic contract. |
| C05: provenance/replay | Retained source artifact/hash, source event/row keys and reviewed population disposition; durable exact replay with changed-payload conflict; duplicate/overlap quarantine | OPEN; preview is stateless and exports lack upload references. |
| C06: executable lifecycle | Durable approved mapping/source/batch history and authorized reads/import; revalidation under current authority locks; sorted financial account locks; source/domain record locking under reviewed cross-domain protocol; immutable ledger effect plus matching domain state/audit/outbox in one READ COMMITTED transaction; all-or-nothing failure | NOT IMPLEMENTED for composer. Existing ledger primitives alone do not grant rights or reconcile a source. |
| C04–C06: correction | Approved original-event/economic linkage; new audited immutable offset with durable replay/conflict behavior; original retained; insufficient unspent value/reservations handled by approved manual review without hidden debt | OPEN; no destructive delete, replace, balance rewrite or composer correction implementation approved. |
| C07: payout | Explicit approved composer role/beneficiary policy, verified destination, threshold, reconciled eligible earnings, locked available funds and trusted settlement evidence | OPEN; current request role gate allows label/whitelabel, not copyright alone. |

Import approval, economic reconciliation and payout eligibility must have independently verifiable evidence. No browser amount, code, role metadata, `posting_allowed` field or client-provided approval can become authority. Read access must isolate unrelated principals; mutation authority must use current persisted status/roles, including removal/suspension races.

`backend/src/royalties/index.ts:40` binds artist royalties to persisted track/release **artist** owner. Its commit posts raw ledger earnings while batch remains `UNRECONCILED`; payout/public-availability quarantine is a separate layer. Thus older blanket claims that unreconciled imports never credit raw ledger availability are not a safe composer implementation precedent. Do not send composer totals to artist import or expose them through artist balances as a substitute for missing composer reconciliation.

`backend/src/payouts/index.ts:101` requires label/whitelabel for request. `backend/src/payouts/policy.ts:15` returns `destinationReady: true`; this does not establish verified composer destination. Existing general payout role/ledger support cannot approve composer policy. Assigning label role as workaround is unsupported. Release payment charges/refunds and copyright registration fees remain distinct from royalty earnings.

## Financial RPC contract accounting

Latest `PHASE3E_FINAL_COMPOSER_CONTRACT.md` and `PHASE3E_FINAL_PARITY_CLASSIFICATION.md` govern classification; older copyright-only placement is superseded for these financial RPCs.

| RPC | Legacy evidence | Current backend support / admission |
| --- | --- | --- |
| `get_my_composer_royalties` | Canonical `STABLE SECURITY DEFINER` reader: admin all rows; otherwise copyright role and own nonnull profile code; exact optional period filter; stored ID aliased as code | `PHASE3E_FINANCIAL`; authorized composer read NOT IMPLEMENTED. Preview is not a reader or identity-isolation proof. |
| `validate_royalty_csv_row` | Caller exists; routine absent in inherited recorded catalog audits | `PHASE3E_FINANCIAL`; strict synthetic preview only, RPC parity NOT PROVEN. |
| `import_composer_royalties` | Caller submits rows/period/filename/replace flag; routine absent in inherited catalog | `PHASE3E_FINANCIAL`; durable financial import NOT IMPLEMENTED / BLOCKED. |
| `get_royalty_upload_history` | History caller exists; routine absent in inherited catalog | `PHASE3E_FINANCIAL`; composer source/batch/effect history NOT IMPLEMENTED. |
| `delete_royalty_upload` | Delete caller exists; routine absent in inherited catalog; caller's deleted-row count supplies no reversal contract | `PHASE3E_FINANCIAL`; immutable composer correction NOT IMPLEMENTED / BLOCKED. |

Enumerated RPCs: **5**. Unexplained: **0**. Financially migrated: **0**. Catalog absence is inherited evidence, not a fresh production query. Underscore RPC `delete_royalty_upload` differs from artist Edge Function `delete-royalty-upload`; no composer parity follows from artist reversal support. `create-copyright-invoice` and legal registration/contract lifecycle remain separate copyright scope.

Backend-mode composer list/upload/history/summary wrappers show unavailable state; upload component also guards mount. Copyright dashboard skips composer royalty RPC in backend finance mode but retains other copyright registration/contract/work reads. Empty composer UI data is unavailable evidence, not reconciled zero earnings or complete copyright decoupling.

## Validation and acceptance ceiling

Fresh synthetic execution on 2026-10-30: `node backend/node_modules/tsx/dist/cli.mjs --test backend/test/composer-royalties.test.ts backend/test/royalties.test.ts` — **19 passed, 0 failed, 0 skipped**. Nine composer checks cover exact supplied totals, multiple codes, duplicate rejection, unsupported shares, unknown identity quarantine, deterministic/no-input-mutation replay, replacement/correction rejection, malformed trust-boundary input and exclusion from artist row schema. Ten artist unit tests use query/transaction doubles; they do not prove composer behavior. Backend typecheck, existing finance guard harness and bounded static scan also passed; commands and limits are in companion closure report.

Before future posting acceptance, synthetic checks must exercise actual composer authorization/read isolation, approved work/effective-rights allocation, supported fractional shares and conservation, unknown/shared/reassigned identities, durable replay/conflicts/overlap, original-linked corrections including spent/reserved funds, outbox/audit rollback, authority races and approved payout policy. No production records may become synthetic fixtures. No such lifecycle is claimed tested here.

No code change warranted: existing preview already prohibits all posting, and missing identity/economic approvals prevent safe financial implementation. Existing runnable composer tests retained unchanged. Only the two requested admission reports authored. **C01–C07 remain OPEN; unresolved unknowns = 7; financial posting and whole-phase acceptance remain BLOCKED.**
