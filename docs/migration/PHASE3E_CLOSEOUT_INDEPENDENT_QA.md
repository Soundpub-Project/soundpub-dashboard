# Phase 3E Closeout — Independent QA

Date: 2026-10-29, Asia/Bangkok. Reviewer: Agent G. **Independent QA: FAIL. Phase 3E closeout: BLOCKED.**

Final current decision: **FAIL / BLOCKED for whole-phase closeout; targeted runtime corrections, current final regression and positive browser PASS.** G1/G3, original G2 counterexamples, G6, G7 and payout availability masking are corrected. Latest independent focused execution: 7 PASS, 0 FAIL, 0 SKIP; backend typecheck PASS. Independent real-DB G6 probe reconciles signed `refund:undefined` correctly, with exact one-time effects and replay safety. Final post-G6 full acceptance log independently inspected: 209 PASS, 0 FAIL, 0 SKIP plus static gates. Final post-G6 positive browser artifact independently inspected: 9 PASS, 0 FAIL, zero unexpected/financial egress and 12 SQL snapshots. Composer financial mapping, historical approval/provenance and comprehensive negative-browser gates remain open; no whole-phase PASS is supported.

Only this repository document was written by this reviewer. Source and other reports were not changed. Test evidence was generated outside the repository under `I:/DevData/TEMP`. No production SSH, provider API, production credentials, shared Supabase mutation, financial import from production, real money or traffic switch was used.

## Final G6 verification — current disposition

Date: 2026-10-29, Asia/Bangkok. Verified final guard in `backend/src/payments/index.ts:80` requires a real persisted `manualRefund` before comparing `refund:<idempotency_key>`. Absent receipt can no longer match the literal event ID `refund:undefined`. Exact-key linkage remains enforced for actual manual refunds; callback linkage remains the alternative for provider callback effects.

**G6: PASS, fixed.** Independently exercised actual disposable PostgreSQL with restricted runtime role: create synthetic invoice, sign/apply PAID callback, sign/apply REFUNDED callback with event ID `refund:undefined`, then read status and global reconciliation. Observed REFUNDED, `issues=[]`, `reconciled=true` for both invoice and global comparison, and zero `payment_refunds` rows. Exact replay of both callbacks returned `duplicate`; SQL confirmed precisely one PAYMENT_CHARGE and one PAYMENT_REFUND. Fixture removed in `finally`. This directly replaces the earlier actual-DB failure and function-level crash reproduction; those historical reproductions are no longer expected to fail on current source.

New `backend/test/payments.test.ts:136` covers the signed callback path on disposable DB and asserts status reconciliation succeeds. Independently reran:

```powershell
node --import ./backend/node_modules/tsx/dist/loader.mjs --test --test-concurrency=1 backend/test/payments.test.ts backend/test/submissions.test.ts backend/test/submission-provider.test.ts backend/test/payouts.test.ts backend/test/phase3e-integration.test.ts
npm --prefix backend run typecheck
```

Result: **7 PASS, 0 FAIL, 0 cancelled, 0 SKIP**, exit 0; log `I:/DevData/TEMP/phase3e-independent-qa-g6-final.log`. Typecheck exit 0. Independent DB probe output is preserved in this review's tool transcript and includes terminal state, empty issue list, no manual receipt, duplicate replay and per-kind effect counts. No production SSH, provider calls, shared mutations or real money used; only this report edited.

| Gate | Final current decision |
| --- | --- |
| G1 unsupported callback classification | PASS, fixed; prior independent verification retained. |
| Original G2 ledger/effect/audit/receipt counterexamples | PASS within tested correction scope; focused payment lifecycle remains green. |
| G3 dispatch capability | PASS, fixed; focused submission rejection/positive dispatch tests pass. |
| G6 callback-ID crash | PASS, fixed; independent signed real-DB lifecycle and replay verification above. |
| G7 stale provider fixtures | PASS, fixed; corrected integration passes in latest focused run. |
| Unreconciled payout availability masking | PASS; latest focused payout/integration assertions pass. |
| Full regression | PASS on current final post-G6 revision: 209 PASS, 0 FAIL, 0 cancelled, 0 SKIP; subsequent client/roster and Phase 3C/3E static/import gates PASS. Coordinator execution independently verified from final log. |
| Positive browser | PASS for final post-G6 supplied rerun: 9 PASS, 0 FAIL, zero unexpected/financial egress, 12 SQL snapshots. Coordinator execution independently inspected; not a second reviewer browser execution. |
| Composer financial posting | FAIL / BLOCKED; missing approved identity/work mapping and economic/correction contract. Safe preview is not financial implementation. |
| Historical provenance / approved settlement dispositions | PARTIAL / BLOCKED; no new authenticated record-level evidence, approved exceptions or migration disposition supplied. |
| Comprehensive negative browser / production parity classification | PARTIAL; missing coverage/classification identified earlier has not been independently closed. |
| Production isolation | PASS for all reviewer executions. |
| Whole-phase independent QA / Phase 3E closeout | FAIL / BLOCKED on remaining acceptance gates, not on the corrected G1/G2/G3/G6/G7 counterexamples. |

Final audited SHA-256 values superseding earlier payment rows:

| File | SHA-256 |
| --- | --- |
| `backend/src/payments/index.ts` | `FCE5BCBB2153B1365F1C1B1750C8A92150DC1805824FBE3AC2F3479EB5D593E6` |
| `backend/test/payments.test.ts` | `EBB1552311740DC053F6942787D7D8329E4FDC460038DE8E583E3D1532F4C9D6` |

Final full-run evidence: `I:/website-devops/soundpub-project/soundpub-dashboard/.tmp/phase3e-closeout-evidence/final-regression-g6.log`, command `node scripts/phase3e-closeout-regression.cjs`. Reviewer independently inspected completed output: 209 tests, 149 top-level tests, zero failures/cancellations/skips, approximately 94 seconds, followed by passing client/roster checks, Phase 3C/3E static inventory and financial API import graph. Payment source and payment test hashes rechecked and match the final audited values above. This is coordinator-run final acceptance verified by reviewer, distinct from the reviewer's independent focused execution.

Final browser evidence: `I:/website-devops/soundpub-project/soundpub-dashboard/.tmp/phase3e-closeout-evidence/final-browser-rerun/results.json`. Reviewer independently parsed all nine PASS events across mobile/tablet/desktop, 177 API responses, 12 persisted SQL snapshots, 15 screenshots, zero unexpected/financial egress and 105 aborted Google Fonts presentation requests. This supplied rerun covers the final product revision after G6. Reviewer verified payment source still matches `FCE5BCBB2153B1365F1C1B1750C8A92150DC1805824FBE3AC2F3479EB5D593E6`.

Harness refinement reviewed at `docs/migration/phase3e-closeout-browser.ts:234`: payment audit action names are sorted before comparison against the exact three expected actions. This checks the action multiset, preserving cardinality and duplicate detection; it is not a deduplicating set that could hide extra events. Per-row actor, amount, currency and idempotency assertions remain. `ORDER BY created_at` alone does not define order for equal timestamps, so removing that incidental order expectation is justified. Coordinator reports the first rerun encountered an equal-timestamp ordering failure; reviewer does not infer a product-state defect from it. Final success supersedes that attempt. The refinement changes only test assertion ordering; it does not prove chronological audit ordering, nor expand negative-browser coverage.

Final browser harness SHA-256: `DA9AB6EF63C5E76EAC5F424349BCCF8973520E0B6983FCED8D9647E0FE27C40B`. Final browser `results.json` SHA-256: `2DF40BCE6C8C5A8B5D757036AE9878442D3033FF16E40DC6A81A201A103F7A51`. These supersede previous browser artifact/harness identities for current acceptance.

Earlier sections retain dated evidence and source identities. Their open-G6, failing-G7, pre-G6-only regression/browser and broad executable-reconciliation FAIL statements are superseded by this section and final evidence. Historical financial approval, composer and coverage limitations remain current. Overall FAIL / BLOCKED is unchanged.

## Prior payout masking and browser evidence review — superseded where noted above

Date: 2026-10-29, Asia/Bangkok. Reviewed the narrow follow-up without modifying source or other documentation.

**Unreconciled payout availability masking: PASS.** `backend/src/payouts/index.ts:63` now returns `available=null` when reconciliation is false while retaining `eligible=false` and reconciliation reasons. Internal exact-money balances remain strings; the public request path rejects ineligible/null availability before money comparison or reservation. `src/api/payouts.ts:9` represents `available` as `string | null`. `BackendPayouts.tsx:51` displays `Saldo belum tersedia hingga rekonsiliasi selesai.` for null instead of a spendable-sounding number. The eligibility route returns the service result directly; no separate route serializer restores the raw amount.

Independent command: `node --import ./backend/node_modules/tsx/dist/loader.mjs --test --test-concurrency=1 backend/test/payouts.test.ts backend/test/phase3e-integration.test.ts`. Result: **3 PASS, 0 FAIL, 0 cancelled, 0 SKIP**, exit 0; log `I:/DevData/TEMP/phase3e-independent-qa-masking.log`. Assertions exercise null availability for an unreconciled policy and an actual imported unreconciled royalty batch; payout requests remain denied. Existing positive reservation/settlement, replay and authority checks also execute. Independent backend typecheck, financial static inventory and import graph reruns all exit 0. Frontend build PASS is coordinator-reported; reviewer did not independently rebuild or run a browser specifically against the new null branch.

This closes the payout eligibility/UI presentation portion of initial G5. Raw ledger earnings are still posted before approved reconciliation; masking is not an approved royalty reconciliation transition, settlement evidence or composer mapping. Earlier documentation that unreconciled imports never credit raw ledger availability remains inaccurate unless scoped to public masked availability and denied payout eligibility.

**Post-reconciliation positive browser evidence: PASS for supplied run.** Independently inspected `I:/website-devops/soundpub-project/soundpub-dashboard/.tmp/phase3e-closeout-evidence/post-fix-positive/results.json`: 9 events, all PASS; 177 browser API responses; 12 persisted SQL snapshots; 0 financial egress; 0 unexpected external requests; 105 blocked Google Fonts presentation requests. This is coordinator-generated evidence, not a new reviewer browser execution. It supports positive payout/payment and API-refund-plus-browser-observation at mobile/tablet/desktop after reconciliation corrections. It does not cover G6 or missing mandatory negative-browser scenarios.

Evidence timing matters: browser result file was written at 18:47:03, final full runner log at 18:52:57, and masking source was modified at 18:52:26 (local Asia/Bangkok timestamps). Per coordinator, full runner began before masking; file timestamps alone cannot establish which revision each child process loaded. Preserve that 209/0/0 execution as pre-masking evidence, with independent focused post-masking checks above. Do not claim full regression or positive browser rerun on the final masked source.

Latest SHA-256 values superseding prior rows for these files:

| File | SHA-256 |
| --- | --- |
| `backend/src/payouts/index.ts` | `7233CD831371034B2656E2C44051052E575E521490433BAAF2479F9E4B332A46` |
| `src/api/payouts.ts` | `EFD8C78E36F89939E8108ABCA7C8FA81A73D49E356564853BACE1AD223746EC5` |
| `src/components/finance/BackendPayouts.tsx` | `2A85AB189425C8B4749A8D06130145F2667DD06DE92427CD4115F440DCFF03A4` |
| `backend/test/payouts.test.ts` | `98050CE26F6FC1B89D9A0565C4273FFC8C700659336D6CE13EB77C81B4BEEA6F` |
| `backend/test/phase3e-integration.test.ts` | `B7F6F8B72A9F94B22640C92075E1F7D3BAEF901A0F5A66A80A66B2833B84AB70` |
| `.tmp/phase3e-closeout-evidence/post-fix-positive/results.json` | `9FD41F9F26FBAB0AB3044AB8FBDE64BBC93B56731781AA1D1C1A21179B4857AA` |

Payment source remains `3EC8F5BBC0BED53960999E91CF58F1C4A4FB974633BA0248AF4B39615E47B8A0`; G6 remains open. Overall independent QA stays **FAIL / BLOCKED**. No production access, provider API call, shared mutation or real money used in this follow-up.

## Review after final runner — superseded by latest masking/evidence scope above

Date: 2026-10-29, Asia/Bangkok. Inspected both legacy fixture corrections: `backend/test/phase3d-concurrency.test.ts:125` and `backend/test/phase3e-integration.test.ts:87` now provide `new MockSubmissionProvider()` rather than readiness-only fakes. Correct fail-closed runtime submission checks remain intact; main mock composition remains intact. No source or other report modified by this reviewer.

| Gate | Latest decision | Evidence |
| --- | --- | --- |
| G7 stale integration fixture | PASS, fixed | Independent rerun of both changed files: 7 PASS, 0 FAIL, 0 cancelled, 0 SKIP, exit 0. Positive integration and media/submission race now execute successfully. |
| Final regression / required skips | PASS | Coordinator-started final runner log independently inspected after completion: 209 PASS, 0 FAIL, 0 cancelled, 0 SKIP, 149 top-level tests, approximately 106 seconds. Client/roster, Phase 3C/3E static and financial import gates also pass. |
| Backend typecheck | PASS | Independently rerun on latest tree, exit 0. |
| G6 callback-ID crash | FAIL, still open | Independent inline reproducer still throws for `refund:undefined`; payment source hash unchanged from actual DB reproduction. No new regression assertion for this case was supplied. |
| G1 / original G2 / G3 | PASS within prior tested correction scope | Their corrected runtime source is unchanged from preceding follow-up. This does not close G6 or authenticate historical settlement. |
| Positive browser | PASS from earlier execution; latest rerun not claimed | Latest changes are fixture-only. This review did not rerun browser acceptance or extend negative-browser coverage. |
| Composer / historical approval / full negative browser | FAIL / PARTIAL / PARTIAL | Unresolved evidence and acceptance boundaries retained. |
| Overall independent QA / Phase 3E | FAIL / BLOCKED | G6 plus unresolved financial and browser gates remain. A green regression does not cover the independently demonstrated callback edge case. |

Independent focused command:

```powershell
node --import ./backend/node_modules/tsx/dist/loader.mjs --test --test-concurrency=1 backend/test/phase3d-concurrency.test.ts backend/test/phase3e-integration.test.ts
npm --prefix backend run typecheck
```

Focused evidence: `I:/DevData/TEMP/phase3e-independent-qa-fixture-final.log` (7/7). Final runner command: `node scripts/phase3e-closeout-regression.cjs`; evidence: `I:/website-devops/soundpub-project/soundpub-dashboard/.tmp/phase3e-closeout-evidence/post-fix-regression-final.log`. This final runner was started by coordinator; reviewer inspected its live process, actual command/output destination and completed output rather than presenting it as a second independent full execution. The child runner process finished, TAP summary shows no failures/skips, and all subsequent static gate outputs are present. Earlier independent 209-test execution remains separately recorded below.

Latest SHA-256 values, captured while reviewing the final run:

| File | SHA-256 |
| --- | --- |
| `backend/test/phase3d-concurrency.test.ts` | `85A1D8745F47CD0D0E50545123FD4B5971C00BCE05D84E2EACFD3C16E458477C` |
| `backend/test/phase3e-integration.test.ts` | `593542814CAB7C7181E4CA8AAA78549FA3DD8F0EAED7808B1F3302B9B3AE0E6C` |
| `backend/src/payments/index.ts` | `3EC8F5BBC0BED53960999E91CF58F1C4A4FB974633BA0248AF4B39615E47B8A0` |
| `backend/src/submissions/index.ts` | `A445EC22622ABDE38D709B943FCB1F34EBED4952DF57F75BB0AB640F55133B43` |
| `scripts/phase3e-closeout-regression.cjs` | `AA69F754A710FA42C4C68C2973F117A44206D2CBA88B3E437DF1FF93878464ED` |

G7 and its preceding regression-failure decision below are historical and superseded. G6's reproduction and required disposition remain current. No production SSH, provider call, shared Supabase mutation, production credential or financial data used in this follow-up.

## Prior post-fix review — superseded by latest result where noted

Follow-up performed 2026-10-29, Asia/Bangkok, after the coordinator's final refund-key refinement. Reviewed current source directly because backend files remain untracked and ordinary `git diff` does not show their edits. Checked against the earlier source hashes, inspected changed assertions and ran independent probes. Only this report was edited; no source/test corrections or other report updates were made.

| Item | Post-fix decision | Evidence |
| --- | --- | --- |
| G1 unsupported callback omission | PASS, fixed | Disposable DB: signed unknown-state callback persists as `unsupported`, appears in `unresolved_callbacks`, and global `reconciled=false`. |
| G2 original ledger/effect mismatch | PASS for original counterexamples | Consistent PAID/manual-refund query-double baselines reconcile; 14 independent adversarial variants reject. Owner, currency, kind, amount and evidence matching are now explicit. |
| G2 final refund-key/receipt refinement | PASS for tested linkage; executable reconciliation remains FAIL overall | Exact persisted refund key determines manual-refund identity; wrong/missing key, wrong refund actor, missing/invalid callback receipt and audit tampering reject. New missing-record edge case G6 remains. |
| G3 missing dispatch capability | PASS, fixed | Readiness-only provider produces `PROVIDER_UNAVAILABLE`; submit also independently requires dispatch before state change. Updated submissions suite executes missing-dispatch rejection; main retains `MockSubmissionProvider`. |
| Focused payment/submission suites | PASS | 4 PASS, 0 FAIL, 0 SKIP for payments, submissions and submission-provider files. |
| Focused run including required Phase 3E integration | FAIL | 4 PASS, 1 FAIL, 0 SKIP; `phase3e-integration.test.ts:89` expects readiness true while supplying provider without dispatch. G7. |
| Backend typecheck | PASS | Rerun after final refinement, exit 0. |
| Full regression / positive browser after fixes | PARTIAL, not rerun | Earlier executions retained below. New required integration failure prevents carrying forward the earlier full-regression PASS. No current positive-browser failure was demonstrated. |
| Composer / historical evidence / full negative browser | FAIL / PARTIAL / PARTIAL | No new evidence supplied or independently established to close these gates. |
| Production isolation | PASS, review scope | Local disposable PostgreSQL, synthetic signatures and mock provider only; no SSH, real provider calls or shared mutation. |

Current executable reconciliation remains FAIL because G6 is reproduced, not because G1 or the old mismatched-ledger acceptance still reproduce. Submission dispatch contract is corrected; G7 is an obsolete required test fixture, not a reason to restore unsafe readiness-only submission.

### G6 — P2: absent manual refund matches literal `refund:undefined` and crashes

Final `backend/src/payments/index.ts:81` defines:

```ts
const isManualRefund = (reference: string) => reference === `refund:${manualRefund?.idempotency_key}`;
```

With no `payment_refunds` row, that expression matches literal `refund:undefined`. That is a valid webhook event ID under `receiveWebhook`'s `[a-zA-Z0-9_:-]{1,200}` validation. A signed REFUNDED callback with this ID succeeds and commits the refund effect. Subsequent status reconciliation interprets it as a manual refund and dereferences `manualRefund!.idempotency_key` at line 102. Observed result:

```text
TypeError: Cannot read properties of undefined (reading 'idempotency_key')
```

Independently reproduced on actual disposable PostgreSQL through `createInvoice`, signed PAID/REFUNDED callbacks and `service.status`. A control using signed refund event ID `refund:real-callback` reconciled correctly on the same latest implementation, demonstrating the general prefix ambiguity is fixed. The `refund:undefined` callback committed successfully; the later status/readiness/reconciliation path fails. No production/provider exploit or incorrect balance movement was demonstrated.

Required disposition: require an actual persisted manual refund before matching its exact key; add regression covering valid signed `refund:undefined` callback with no manual refund receipt. Do not reject otherwise-valid provider IDs merely to hide the ambiguous sentinel comparison.

Runnable function-level reproducer for the same crash (the DB lifecycle was independently exercised separately):

```powershell
@'
import assert from 'node:assert/strict';
import { reconcileInvoice } from './backend/src/payments/index.ts';
const invoice = { id: 'invoice', business_id: 'release', provider_invoice_id: 'provider',
  amount_minor: '100', currency: 'IDR', status: 'REFUNDED', idempotency_key: 'create',
  reconciliation_required: false };
const db = { async query(sql) {
  if (sql.includes('FROM soundpub.payment_effects')) return { rows: [
    { kind: 'PAYMENT_REFUND', amount_minor: '100', currency: 'IDR', reference: 'refund:undefined' }] };
  if (sql.includes('FROM soundpub.releases')) return { rows: [
    { total: '1.00', price: '1.00', tracks: 1, owner_id: 'owner' }] };
  return { rows: [] };
} };
await assert.rejects(reconcileInvoice(db, invoice, { async status() {
  return { status: 'REFUNDED', amount_minor: '100', currency: 'IDR' };
} }), /Cannot read properties of undefined/);
console.log('G6 crash reproduced');
'@ | node --import ./backend/node_modules/tsx/dist/loader.mjs --input-type=module
```

### G7 — P2: required integration test still assumes dispatch-free submission

`backend/test/phase3e-integration.test.ts:87` supplies `provider: { providerReady: async () => true }`. Its line 89 then expects `readiness.ready=true`; current correct fail-closed service returns false. Independent final focused execution fails `false !== true` there, before submission and the remainder of that integration scenario execute. This file is included by the full regression runner, so current zero-failure acceptance is not supported.

Required disposition: use the real mock submission adapter in the positive integration fixture, verify its persisted receipt and rerun that required suite. Retain the separate negative missing-dispatch assertion in `submissions.test.ts`.

### Final-version executions

```powershell
node --import ./backend/node_modules/tsx/dist/loader.mjs --test --test-concurrency=1 backend/test/payments.test.ts backend/test/submissions.test.ts backend/test/submission-provider.test.ts backend/test/phase3e-integration.test.ts
npm --prefix backend run typecheck
```

Focused run: 5 tests, 4 PASS, 1 FAIL, 0 cancelled, 0 SKIP; log `I:/DevData/TEMP/phase3e-independent-qa-postfix-final-focused.log`. Separate three-file run passed 4/4 before the final refund-key refinement; all three files passed again inside the final four-file run. Typecheck rerun after the final refinement exited 0.

Independent G2 function-level probe: two valid baselines and 14 rejected variants. Ledger mutations: kind, owner, currency, amount, evidence. Callback/audit mutations: absent callback, ignored receipt, wrong callback status/provider reference, forged audit actor and wrong audit amount. Manual refund mutations: wrong persisted key, wrong actor, absent receipt. These query doubles isolate verifier behavior; they are not claims those inconsistent states are reachable through normal HTTP writers.

Independent G1 DB probe returned `results=[]`, one unresolved `unsupported` callback and `reconciled=false`. Independent DB callback-edge probe confirmed ordinary `refund:real-callback` works and `refund:undefined` crashes after accepted settlement/refund callbacks. All fixture containers were cleaned in `finally`.

### Current audited hashes

SHA-256 captured after the final refinement and post-fix executions. These supersede the earlier hash table for changed files.

| File | Current SHA-256 |
| --- | --- |
| `backend/src/payments/index.ts` | `3EC8F5BBC0BED53960999E91CF58F1C4A4FB974633BA0248AF4B39615E47B8A0` |
| `backend/src/submissions/index.ts` | `A445EC22622ABDE38D709B943FCB1F34EBED4952DF57F75BB0AB640F55133B43` |
| `backend/src/main.ts` | `8967DB2C723D3829F20DBD9B6F81E2062D585E524658A8A0451AE586D3AD3C7B` |
| `backend/test/payments.test.ts` | `1DBD687FE14EB40A71E3873B58A075E547C6C4A0040DE76C57CA845C139C3FE1` |
| `backend/test/submissions.test.ts` | `3D8DF8B745056B31C5DCD5CBEAE26116687BDDE435A1A0391961F79E386BB460` |
| `backend/test/phase3e-integration.test.ts` | `013E3B2F42F3C710585F586B680438F7088462A7BA60DAE84D03D2E666EB55BB` |

Post-fix disposition: keep **FAIL / BLOCKED** pending G6/G7, required reruns and unresolved financial evidence/coverage gates. G1/G3 and original G2 counterexamples are no longer open in their earlier form. No post-fix full-phase PASS, zero-required-failure regression or fresh browser acceptance is asserted.

## Initial audit record — historical, superseded where noted above

The following gate table, findings, executions, hashes and disposition describe the first audit. Preserve them as evidence of what the fixes addressed; use the post-fix section for current G1–G3 and regression status.

### Initial gate decisions

PASS means proven within the stated local synthetic scope. PARTIAL means some evidence exists but the required gate is incomplete. FAIL means a required behavior is absent or a counterexample contradicts the acceptance rule.

| Gate | Decision | Independent basis / remaining blocker |
| --- | --- | --- |
| Composer financial contract | FAIL | Strict preview is safe, but identity/work entitlement, allocation semantics, durable import and correction are absent. Preview always returns `posting_allowed=false`. |
| Composer RPC accounting | PASS | Five named RPCs explicitly classified; none claimed migrated financially. Classification does not waive the composer gate. |
| Historical/provider provenance | PARTIAL | Existing snapshot and missing evidence classified honestly; no record-level authenticated settlement or approved exceptions supplied. No fresh production inspection performed. |
| Reconciliation specification | PASS | Entity requirements, evidence levels, issue mapping, dry-run restrictions and historical approval requirements documented. |
| Executable reconciliation | FAIL | Unsupported callbacks can disappear from global reconciliation; invoice ledger identity checks are incomplete. See findings G1/G2. |
| Synthetic account dry run | PASS | Independent rerun: matched/mismatched/unresolved/ambiguous scenarios and duplicate-expectation rejection; ledger/audit/outbox unchanged. No historical population reconciled. |
| Settlement evidence model | PARTIAL | Definitions distinguish local status, correlation, signed event and reconciled settlement. Mock accounting works; authenticated historical settlement and approved dispositions remain unavailable. Nonempty mock evidence is not real settlement proof. |
| Mock submission adapter | PASS | Durable simulator receipt, business replay, rollback and reconciliation tests pass; main explicitly selects `MockSubmissionProvider`. |
| Submission integration contract | PARTIAL | Readiness-only dependencies still permit submission without provider creation; G3. Browser harness does not exercise actual main composition or provider dispatch. |
| Positive payout browser | PASS | All three viewports: request, reservation, admin approval, backend mock settlement, reload and persisted effects. Direct synthetic ledger fixture supplies opening funds. |
| Positive payment browser | PASS | All three viewports: invoice creation, pending, signed callback through service, PAID/reload and payment-readiness change. Release remains draft. |
| Refund | PASS, UI N/A | Admin API refund/replay plus browser REFUNDED/reload and one reversal at all viewports. Backend finance payment component and API adapter have no refund request control. |
| Full negative browser matrix | PARTIAL | Retained 12 cases pass, but required payment/provider/network failure and stale-state browser interactions remain absent. Backend coverage does not substitute for browser coverage. |
| Historical balance migration contract | PASS, specification only | Cutover snapshot, source reconstruction, approval, immutable residual and replay controls defined; no opening balances posted or approved. |
| Import versus payout race | PASS, tested scope | Lock-observed primitive races cover both orders; actual import/service overlap tested with explicit synthetic policy. Does not prove default policy can approve real imports. |
| Callback versus refund race | PASS, tested scope | Both contenders wait on invoice lock; already-paid invoice ends REFUNDED once. Does not cover first-ever PAID callback racing a refund of an unpaid invoice. |
| Settlement versus cancellation race | PASS, tested scope | Approved payout settles; owner cancellation rejects; ledger release-first terminal exclusion separately covered. State machine does not permit owner cancellation after approval. |
| Financial invariants | PARTIAL overall; PASS exercised accounting | Duplicate effects, overspend, terminal holds, replay and audit rollback pass. Acceptable evidence authenticity and full reconciliation identity are not proven by these tests. |
| Required skipped suites | PASS | Independent acceptance runner: 209 passed, 0 failed, 0 cancelled, 0 skipped. Four URL-dependent suites actually executed. Default test command still has four conditional skip sites. |
| Regression/typecheck/isolation scan | PASS | Independent runner, backend typecheck and isolation scan exited 0. No financial defect found in exercised race/accounting paths. |
| Backend-mode frontend decoupling | PASS, observed paths | Static inventory/import gate passes; positive browser observes zero financial or unexpected external egress. Legacy source remains guarded. No global deletion-of-Supabase claim. |
| Mobile/tablet/desktop | PASS positive scope | 390x844, 768x1024, 1440x900; nine workflow checks, 15 screenshots, 12 persisted SQL snapshots. |
| Production isolation | PASS, audit execution scope | Local named-pipe Docker, loopback disposable DB, restricted runtime role and mock providers. Production/staging config rejected. Historical claims remain inherited evidence. |
| Production parity classification | PARTIAL | Old parity matrix remains qualified/deferred and does not provide the requested exhaustive closeout taxonomy for every legacy workflow. No proof of production data/provider parity. |

## Findings and blockers

### G1 — P1: unsupported signed callbacks omitted from successful reconciliation

`backend/src/payments/index.ts:135` stores unknown status events with disposition `unsupported` before invoice lookup. `backend/src/payments/index.ts:195` queries only `unknown_invoice`, `mismatch` and `invalid_transition`; `unsupported` is absent. No documented adapter rule establishes these unknown events as irrelevant to finance.

Independent disposable-PostgreSQL probe sent a valid signed `SOMETHING_NEW` callback for `mock_qa_unknown`, amount `100`, IDR. Callback returned `accepted`, a durable `unsupported` receipt existed, and admin reconciliation returned:

```json
{"mode":"DRY_RUN","results":[],"unresolved_callbacks":[],"reconciled":true}
```

Thus a nonempty ambiguous event population is reported as fully reconciled. This contradicts the closeout requirement that unknown/ambiguous states remain visible for manual review. Existing payment tests persist unsupported events but only assert the other unresolved callback count, so 209 green tests do not catch this defect. No money movement or external exploit was demonstrated.

Required disposition: include unsupported financial events in unresolved/manual review, or supply an explicit adapter classification proving particular events irrelevant; add a focused assertion that a lone unsupported event cannot silently produce global success.

Runnable independent reproduction from repository root, without writing a test file:

```powershell
@'
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { concurrencyPostgres } from './backend/test/support/concurrency-postgres.ts';
import { createPaymentsService } from './backend/src/payments/index.ts';
import { webhookSignature } from './backend/src/integrations/webhook.ts';
const fixture = await concurrencyPostgres();
try {
  const actor = { id: randomUUID(), status: 'active', roles: ['superadmin'] };
  await fixture.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active')", [actor.id]);
  await fixture.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,'superadmin',now())", [actor.id]);
  const secret = 'synthetic-independent-qa-secret-32-characters';
  const service = createPaymentsService(fixture.runtime, { callbackSecret: secret });
  const input = { provider: 'mock-payment', eventId: 'qa-unsupported',
    timestamp: String(Math.floor(Date.now()/1000)), signature: '',
    rawBody: Buffer.from(JSON.stringify({ provider_invoice_id: 'mock_qa_unknown',
      status: 'SOMETHING_NEW', amount_minor: '100', currency: 'IDR' })) };
  input.signature = webhookSignature(secret, input);
  assert.equal(await service.callback(input), 'accepted');
  const receipt = (await fixture.owner.query('SELECT disposition FROM soundpub.payment_callback_receipts')).rows;
  const result = await service.reconcile(actor);
  assert.equal(receipt[0].disposition, 'unsupported');
  assert.equal(result.reconciled, true);
  console.log(JSON.stringify({ receipt, result }));
} finally { await fixture.close(); }
'@ | node --import ./backend/node_modules/tsx/dist/loader.mjs --input-type=module
```

These assertions reproduce current erroneous behavior; corrected acceptance must expect manual review / `reconciled=false`.

### G2 — P2: invoice reconciliation does not establish one-to-one ledger/evidence identity

`backend/src/payments/index.ts:65` selects ledger kind/amount/evidence, but line 71 checks only total row count, matching amount and nonempty evidence. It never pairs charge/refund kinds to effects, compares evidence to effect/callback references, or verifies ledger owner/currency. Lines 72–76 accept audit action presence rather than exact actor, amount, currency and idempotency linkage. `paymentSubmissionDependency` trusts this result.

Independent query-double probe supplied a PAID mock invoice, a valid release price, one `PAYMENT_CHARGE` domain effect, creation/callback action names, but only a `PAYMENT_REFUND` ledger row with unrelated evidence. `reconcileInvoice` returned `issues=[]`, `reconciled=true`.

This proves verifier insufficiency under inconsistent evidence, not that the normal HTTP API or immutable ledger constraints can create that exact state. Ordinary valid browser snapshots have correct charge/refund rows and pass. The stronger closeout claim that readiness verifies complete settlement/effect identity is unsupported until the verifier rejects this counterexample and validates the required linkage. Agent B already documents these inspection limits; independent QA confirms one concretely.

Required disposition: compare each effect against its exact ledger kind, owner, currency, amount, business/event reference and trusted evidence; verify corresponding audit payload and authenticated event linkage. Add adversarial reconciliation tests rather than relying only on correct writers.

### G3 — P2: successful submission still permits a provider with no dispatch operation

`backend/src/submissions/index.ts:27` makes `createSubmission` optional. Readiness accepts `providerReady=true`; lines 111–118 skip creation if missing, update release status and emit `release.submitted` without a provider receipt. Existing `backend/test/submissions.test.ts:14` deliberately constructs that dependency and lines 116/124 assert `pending_paid` and `revision_submitted`. Those tests executed successfully in this independent regression.

Main composition correctly supplies the new mock adapter, so this is a service-contract/composition gap, not a demonstrated bypass of that main HTTP composition. The provider report's unqualified assertion that only an ACCEPTED receipt permits submission is stronger than the implementation. The default with no dependencies remains blocked.

Required disposition: require creation for any submit-capable provider, or explicitly separate readiness-only evaluation from a submit-capable service; retain an executable missing-dispatch rejection test. Mock adapter replay itself is proven.

### G4 — required financial evidence remains unavailable

Composer preview validates syntax and exact totals; rejection of all share fields does not prove valid allocation, fractional-share rules, durable import replay or correction/reversal. No authoritative principal/work mapping or approved economic contract exists. Five RPC classifications are complete but do not close this hard gate.

Historical provenance is an inherited population-level review, not a record-level provider reconciliation. Opening adjustments lack independent approval; paid payout/payment references and proof paths lack authenticated settlement verification. No historical exception approval or enforceable accepted disposition was supplied. The dry-run script tests four comparison scenarios over a synthetic source, not four historical records.

Royalty import still posts earnings while leaving batches UNRECONCILED; policy quarantines payouts but provides no approved reconciliation transition. `backend/src/payouts/policy.ts:15` sets `destinationReady=true` unconditionally. Both remain documented production-readiness blockers. Real provider implementation is outside this requested mock closeout; absence of an approved safe financial disposition is the blocker, not a demand to process real money.

### G5 — unsupported broad acceptance claims and remaining coverage

- Browser positive acceptance is substantiated. It seeds ledger funds directly and invokes callback/settlement through backend services; it does not prove approved royalty ingestion, main composition startup, callback HTTP wiring, actual provider dispatch or remote settlement.
- Refund UI N/A is substantiated; the harness uses the existing authenticated admin refund endpoint via Fastify injection, then real browser HTTP reads the result. Describe this as API acceptance plus browser observation.
- Negative browser rerun covers unreconciled royalty notice, missing payout policy, missing invoice price and unknown import mapping at three viewports. It does not exercise the full required insufficient-balance/duplicate/forged/unauthorized/inactive/payment-failure/provider-failure/network-failure/stale-state browser matrix. Some have backend coverage; browser coverage remains PARTIAL.
- Original financial model, transaction model and final report say unreconciled imports never credit availability. Current `royalties/index.ts:98` posts earnings; raw ledger availability includes them. Balance API masks availability, but payout eligibility returns raw `available` with a reconciliation denial, and `BackendPayouts.tsx:51` still labels it `Saldo tersedia`. No withdrawal bypass demonstrated; the unqualified availability claim and displayed spendable-sounding amount are inaccurate.
- Static checks establish known guards/import boundaries, not exhaustive dynamic path coverage. Positive runtime checks independently support zero financial egress for exercised workflows only.
- Passing invariant tests prove nonempty synthetic settlement evidence and exact accounting. They cannot establish authenticity of historical settlement or approval of composer entitlements.

## Independent executions and evidence

All commands run from `I:/website-devops/soundpub-project/soundpub-dashboard`, against the current working tree. Existing prerequisites were present; no packages installed.

| Command | Observed result |
| --- | --- |
| `node scripts/phase3e-closeout-regression.cjs` | Exit 0; 209 PASS, 0 FAIL, 0 cancelled, 0 SKIP; four formerly skipped database suites executed; client/roster checks, Phase 3C/3E scans and financial import graph passed. |
| `npm --prefix backend run typecheck` | Exit 0. |
| `npm --prefix backend run security:check` | Exit 0; isolation/secret scan passed. |
| `node backend/node_modules/tsx/dist/cli.mjs scripts/phase3e-closeout-reconciliation.ts` | Exit 0; matched 1, mismatched 1, unresolved 1, ambiguous 1, historical exception 0; duplicate expectations rejected; ledger/audit/outbox unchanged during comparison. |
| `node backend/node_modules/tsx/dist/cli.mjs docs/migration/phase3e-closeout-browser.ts I:/DevData/TEMP/phase3e-independent-qa-browser` | Exit 0; 9 PASS, 0 FAIL; 177 browser API responses, 12 SQL snapshots, 15 screenshots; 0 unexpected requests, 0 financial egress; 105 aborted Google Fonts presentation requests. |
| `node backend/node_modules/tsx/dist/cli.mjs docs/migration/phase3e-browser.ts I:/DevData/TEMP/phase3e-independent-qa-negative-browser` | Exit 0; 12 PASS, 0 FAIL; 104 API responses; 60 aborted Google Fonts requests, no non-font or financial external attempts. Request count differs from inherited 102; assertions still pass. |
| G1 inline probe above | Actual local signed callback persisted unsupported event; global reconciliation incorrectly true. |
| G2 inline query-double probe | Wrong ledger kind/unrelated evidence incorrectly reconciled; function-level verifier counterexample, not DB/API exploit proof. |

Independent regression log: `I:/DevData/TEMP/phase3e-independent-qa-regression.log`. Browser logs: `I:/DevData/TEMP/phase3e-independent-qa-browser.log` and `I:/DevData/TEMP/phase3e-independent-qa-negative-browser.log`. Detailed browser evidence lives in each output directory's `results.json`. Probes emitted their results in the QA tool transcript; G1 reproduction is preserved above.

Inspected fresh persisted snapshots: each viewport reserves 800.00 IDR, clears reservation after settlement, retains available 200.00/400.00/600.00 cumulatively and settled 800.00/1600.00/2400.00. Each invoice has charge/refund 5000000 minor units with callback/refund receipts and corresponding audits. Harness assertions validate payout operation keys, audit actors/amount/currency, refund replay and finance audit/outbox linkage. Screenshots visually inspected: mobile paid payout after reload, tablet paid invoice after reload, desktop refunded invoice after reload. These show usable content and the asserted terminal states; this is not a complete accessibility review.

Race inspection confirms actual PostgreSQL wait observation rather than delay-only concurrency assertions. Payment/refund starts already PAID; settlement/cancellation uses approved payout; import/payout service test explicitly bypasses unresolved default-policy quarantine through synthetic policy. Reports accurately disclose those boundaries. No double credit/debit, overspend, double release/refund or missing audit was observed in those tested paths.

## Audited source identity

Key SHA-256 values captured after independent executions, before writing this report. Uncommitted files mean a Git commit alone cannot identify the audited state. Later changes require targeted reevaluation.

| File | SHA-256 |
| --- | --- |
| `backend/src/main.ts` | `8967DB2C723D3829F20DBD9B6F81E2062D585E524658A8A0451AE586D3AD3C7B` |
| `backend/src/payments/index.ts` | `BB759242CF8809FA86D37005E480DB1F798B14F929751C15F90A6FDD495CD3A2` |
| `backend/src/submissions/index.ts` | `EEC5AE9BBC11A2A267207318C77FF12D2E8D13FBBA08CC2A9BCC73C374207FDC` |
| `backend/src/submissions/provider.ts` | `D93FF9FA745F9097FDD6C2134C7F8E139F647584ABB531A57A06D6D2979F54C1` |
| `backend/src/composer-royalties/contracts.ts` | `54E199418321E6BEE8DC5F4AF9950108343D1BA4C9135524A197C1A8F1956F67` |
| `docs/migration/phase3e-closeout-browser.ts` | `ADFFA695BE0B85B6A11AAECBE2AAA8B5B4E5EA23DC232781763CE038E7D8537F` |
| `scripts/phase3e-closeout-regression.cjs` | `AA69F754A710FA42C4C68C2973F117A44206D2CBA88B3E437DF1FF93878464ED` |

## Closeout disposition

Keep Phase 3E **BLOCKED**. Resolve G1/G2 reconciliation failures and G3 contract gap; obtain approved composer mapping/economic semantics and safe historical settlement/reconciliation dispositions; close mandatory negative-browser coverage and complete the requested parity classification. Preserve the independently proven synthetic regression, positive browser and production-isolation results without promoting them into financial approval or production parity.
