# Phase 1B Financial and Payment Report

**Financial integrity: FAIL. Xendit idempotency: FAIL. Agent F status: BLOCKED. Phase 2: NOT READY within this workstream.**

Observed 2026-10-27, Asia/Bangkok. Main live reconciliation snapshot: 2026-10-27 04:54:36 Asia/Bangkok (2026-10-26 21:54:36 UTC). Additional metadata checks continued through 05:02 Asia/Bangkok. These are point-in-time findings; concurrent remediation by other agents requires a fresh independent check.

## Scope and evidence boundary

Read the full Phase 1B attachment, `PHASE1_FINAL_REPORT.md`, `SUPABASE_MIGRATION_AUDIT.md`, financial baseline, compatibility matrix, source baseline, security findings, auth matrix, verification/restore reports, test strategy, canonical DDL, financial migrations/assertions, frontend callers, and payment handlers. Existing Phase 1 findings remain historical evidence. This report does not recalculate overall readiness.

Production inspection used SSH `maskhar@20.20.20.3`, starting in `/data/supabase/instances/supabase-01/config`, and `docker compose exec -T db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1`. Every production SQL batch explicitly used READ ONLY transactions. Published results contain counts, metadata and synthetic fixtures only. No production financial RPC, payment/provider API, webhook endpoint, email, balance mutation, upload, deployment or configuration change was performed.

Isolated tests used a separate `postgres:17-alpine` container, `soundpub-phase1b-agentf-20261027`, with `--network none`, no published ports, no production bind mounts or data. The `postgres` database held the existing minimal financial smoke fixture; `agentf_authz` held `CANONICAL_SCHEMA.sql` plus synthetic users/data. `auth.uid()` was a test-only setting adapter, not GoTrue or a real JWT. Additional canonical mutation scenarios used rollback; existing smoke scripts mutated only disposable fixtures. The container and its disposable volume were removed after testing. Only the two assigned Phase 1B reports were written to the repository.

Live versus isolated canonical evidence matched:

| Compared metadata | Both sides |
| --- | --- |
| 78 application policies, command/roles/USING/WITH CHECK | MD5 `a187f37a3bf1a000dc7894e9db1c0bb5` |
| 47 non-internal trigger definitions | MD5 `39d2f7bf14b5ffab31424eeb60954990` |
| Client table grants, anon/authenticated | MD5 `46ce73fc195c672bb24edeeff0fe1569` |
| Constraints on profiles/releases/tracks/payments/registrations/payouts/reservations | MD5 `3d06827a5f36c35d9cb580424b2b7cec` |
| Seven selected financial/guard bodies, CR removed and outer whitespace trimmed | All seven matched; hashes below |

MD5 is an accidental-difference check, not a security or full-schema reproducibility claim. The seven bodies are `commit_royalty_upload` (`63674d2fa7c3accfd85c541ccf34e84d`), `delete_release_with_refund` (`fd1b9d9eb0cb9d7ba14cb154ee7036c9`), `guard_profile_sensitive_update` (`574e023228ad840129bac158371b4120`), `rebuild_royalty_balances` (`652072281af1c69808925eaa1aede080`), `request_payout` (`c4ea8431cc21b3a0041e235b8b5dc489`), `reverse_royalty_upload` (`5c7b01a67704b44ddc8420ae091fe5c4`), `update_payout_status` (`38d097324f15354214f3dbd25afd5a22`). Canonical identity constants are parameterized; this is not a blank-stack/auth migration certification.

## Mandatory financial criteria

FAIL with “not verified” means the required acceptance evidence is absent, not that historical loss was proved.

| Criterion | Result | Independently observed evidence / remaining blocker |
| --- | --- | --- |
| Current 14,474 royalty rows and allocation identity | PASS, current snapshot | 14,474 rows; zero unmapped recipients; exact net = artist + label + Soundpub mismatch count 0. |
| Royalty upload totals and provenance | FAIL | All 10 total_records match row counts, but all 10 inserted_records are 0, all idempotency keys NULL, all 14,474 source_row_number values NULL. Original source-file totals/bytes were not independently reconciled. |
| Composer royalty flow | FAIL | No composer rows; four reachable frontend RPC names absent across all schemas. Empty population gives no positive compatibility proof. |
| Current computed balance = stored balance | PASS, current snapshot | Zero balance, artist-revenue or label-revenue residuals across 182 profiles; zero negative balances. This includes opening adjustments and is not independent settlement verification. |
| Current payout reservations = expected amount | PASS, current snapshot | Five reservations across three requests; zero active/paid amount mismatches, orphan/nonpositive reservations, paid requests without reservation or proof path. File bytes were not checked. |
| Payout boundary correctness | FAIL | Canonical NUMERIC(18,2) payout accepts 0.001 and stores 0.00 while reservation stores 0.001; exact requested/reserved identity fails. Minimal smoke table has unconstrained numeric and cannot detect this. |
| Historical double decrement resolved | FAIL | Current request/approve/pay debits once in isolated canonical tests. Legacy complete_payout client/service execution is revoked and legacy balance trigger has zero attachments. Historical settlement evidence and 33 opening adjustments remain unapproved. |
| Balance adjustments independently justified | FAIL | All 33 are migration_opening_balance, calculated to preserve prior stored balances; no independent bank/provider reconciliation or signed disposition. |
| Release/copyright payment authenticity | FAIL | Copied production policies/grants/triggers allow authenticated synthetic clients to INSERT paid release and copyright payment rows. Normal non-owner can insert own paid row referencing another release. See authorization report. |
| Paid invoice references/PDFs valid | FAIL | Four paid release rows have provider references; two lack both invoice number and PDF path. Remaining path presence is not byte/readability validation. No provider reconciliation performed. |
| Xendit linkage/reconciliation | FAIL | No current duplicate IDs/cross-table collisions, but no unique release provider-invoice constraint or cross-domain uniqueness. Timestamp-based external IDs, concurrent create and provider-success/save-failure retry create duplicates in mocks. |
| Refund accounting identity | FAIL | One paid payment refunds once into a unique adjustment in canonical test. Two paid rows are accepted; deletion removes both but refunds only one. No multi-paid release currently exists; missing constraint leaves reachable boundary unsafe. |
| Exact source/restore financial row equality | FAIL, not verified | No consistent protected source/target financial snapshot compared by every PK/column in this assignment. Aggregate equality is insufficient. |
| Financial integrity final gate | FAIL | Payment trust, partial settlement, precision/refund boundaries, provenance, invoices, composer functionality and exact restore evidence remain open. |

## Current live counts and exact reconciliation

| Entity/check | Observation |
| --- | ---: |
| Profiles / royalties / uploads | 182 / 14,474 / 10 |
| Composer / archived royalties | 0 / 0 |
| Adjustments / reservation rows | 33 / 5 |
| Payouts approved / paid | 1 / 2 |
| Release payments expired / paid | 5 / 4 |
| Copyright payments expired / paid | 2 / 0 |
| Balance / artist / label residuals | 0 / 0 / 0 |
| Negative profile balances | 0 |
| Active/paid reservation mismatch | 0 |
| Paid payout missing reservation / proof path | 0 / 0 |
| Orphan/nonpositive reservations | 0 |
| Royalty recipient / allocation mismatch | 0 / 0 |
| Upload total_records mismatch / inserted_records mismatch | 0 / 10 |
| Missing source-row keys / upload replay keys | 14,474 / 10 |
| Duplicate release / copyright provider-ID groups | 0 / 0 |
| Cross-domain provider-ID collisions | 0 |
| Paid release missing timestamp / provider reference | 0 / 0 |
| Paid release missing invoice number / PDF path | 2 / 2 |
| Paid copyright still awaiting_payment | 0, empty paid population |
| Multiple paid rows per release | 0 |

Executed the exact first SQL reconciliation block in `FINANCIAL_INTEGRITY_BASELINE.md` without modification, including REPEATABLE READ READ ONLY and a 45-second timeout. Its equations use PostgreSQL NUMERIC and `IS DISTINCT FROM`, not float aggregation or tolerance:

```text
artist_revenue = SUM(royalties.artist_revenue by artist_user_id)
label_revenue  = SUM(royalties.label_revenue by label_user_id)
balance = artist_revenue + label_revenue + SUM(balance_adjustments.amount)
          - SUM(reservations for pending/approved/paid payout_requests)
payout.amount = SUM(reservations for that active/paid payout)
royalty.net_revenue = artist_revenue + label_revenue + soundpub_revenue
```

Additional executed assertions:

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT count(*) AS upload_inserted_count_mismatches
FROM soundpub.royalty_uploads u
LEFT JOIN (
  SELECT upload_id, count(*) n FROM soundpub.royalties GROUP BY upload_id
) r ON r.upload_id=u.id
WHERE u.status='success'
  AND u.inserted_records IS DISTINCT FROM coalesce(r.n,0);

SELECT count(*) AS invalid_reservations
FROM soundpub.payout_balance_reservations r
LEFT JOIN soundpub.profiles p ON p.id=r.profile_id
LEFT JOIN soundpub.payout_requests q ON q.id=r.payout_id
WHERE p.id IS NULL OR q.id IS NULL OR r.amount<=0;

SELECT count(*) AS legacy_trigger_attachments FROM pg_trigger
WHERE tgfoid='soundpub.update_balance_on_payout_status_change()'::regprocedure;

SELECT count(*) AS multi_paid_release_groups
FROM (
  SELECT release_id FROM soundpub.release_payments
  WHERE status='paid' GROUP BY release_id HAVING count(*)>1
) t;
COMMIT;
```

Require a protected FULL OUTER JOIN source/restore comparison by PK, zero missing/extra keys, and `to_jsonb(source_row) IS DISTINCT FROM to_jsonb(target_row)` mismatch count 0 on identical structures. Compare every financial table, including uploads, archives, reservations, adjustments and invoice metadata. No such equality PASS is claimed here.

## Individual historical exceptions

Handles below are report-local ordinals, not exported identity/payment IDs. Reproduce ordering privately with `row_number() OVER (ORDER BY created_at,id)`; upload handles cover all uploads, invoice handles filter paid rows missing number/PDF, adjustment handles cover all adjustments. No monetary sums, bank data, provider IDs, filenames or original financial row values are published.

| Upload handle | Royalty rows | total_records equality | inserted_records / replay key / source-row provenance | Disposition |
| --- | ---: | --- | --- | --- |
| U01 | 24 | PASS | FAIL / absent / absent | Preserve legacy metadata; obtain source evidence. |
| U02 | 44 | PASS | FAIL / absent / absent | Preserve legacy metadata; obtain source evidence. |
| U03 | 454 | PASS | FAIL / absent / absent | Preserve legacy metadata; obtain source evidence. |
| U04 | 619 | PASS | FAIL / absent / absent | Preserve legacy metadata; obtain source evidence. |
| U05 | 1,219 | PASS | FAIL / absent / absent | Preserve legacy metadata; obtain source evidence. |
| U06 | 1,802 | PASS | FAIL / absent / absent | Preserve legacy metadata; obtain source evidence. |
| U07 | 1,231 | PASS | FAIL / absent / absent | Preserve legacy metadata; obtain source evidence. |
| U08 | 2,980 | PASS | FAIL / absent / absent | Preserve legacy metadata; obtain source evidence. |
| U09 | 2,746 | PASS | FAIL / absent / absent | Preserve legacy metadata; obtain source evidence. |
| U10 | 3,355 | PASS | FAIL / absent / absent | Preserve legacy metadata; obtain source evidence. |
| I01 | Not applicable | Provider reference present | Invoice number and PDF path absent | FAIL; recover/generate under separately authorized workflow and verify bytes. |
| I02 | Not applicable | Provider reference present | Invoice number and PDF path absent | FAIL; recover/generate under separately authorized workflow and verify bytes. |

Every opening adjustment requires its own private settlement evidence and finance disposition:

| Adjustment handle | Provenance | Result / disposition |
| --- | --- | --- |
| A01 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A02 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A03 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A04 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A05 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A06 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A07 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A08 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A09 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A10 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A11 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A12 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A13 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A14 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A15 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A16 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A17 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A18 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A19 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A20 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A21 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A22 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A23 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A24 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A25 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A26 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A27 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A28 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A29 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A30 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A31 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A32 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |
| A33 | migration_opening_balance | FAIL: independent justification/approval not verified; preserve unchanged. |

These exceptions do not prove lost royalties or fraudulent historical payouts. The opening migration explicitly calculates the difference needed to reproduce stored balances (`20261023041039_harden_royalty_financial_workflows.sql:30`); therefore zero arithmetic residual cannot disprove historical double decrement.

## Xendit production source and replay results

Docker mount inspected before source inspection: `/data/supabase/instances/supabase-01/config/volumes/functions` to `/home/deno/functions`. Repository and mounted source match after removing CR line endings:

| Handler | Normalized SHA-256, both sides |
| --- | --- |
| xendit-webhook/index.ts | `570ed74d5384907b9ad718cda8422badeb16ab22763af5c57e3da51ef4ec4d4b` |
| create-xendit-invoice/index.ts | `43b639a8d4b3d11f01ab199a9fb03921149bbfa5f7c685ca38f95904254cfa6b` |
| create-copyright-invoice/index.ts | `0313441792d0c2e752e917968be44dbe192347362092234aac6d1d317328351f` |

The webhook raw hashes differ: repository `686778c57773ccb69b36165c31a6367fbe538f2726a3d3d4f7cd1b8e389ff60d`, mounted `bbf24972b3fd321cfd35adae65a4dc6da1e81c505111e84681b9dab70efd9014`. Normalized equality establishes tested source equivalence, not public routing, resident worker version, callback-secret configuration or actual provider behavior.

| Mandatory property | Isolated/source result | Production acceptance |
| --- | --- | --- |
| Callback authentication | PASS: missing server token 503, missing/wrong caller token 403, no writes. Shared callback token, not an HMAC body signature. | FAIL: public route/config/provider delivery not tested; no production webhook calls allowed. |
| Serial duplicate safety | PASS: one, two and ten PAID callbacks each leave exactly one payment update and expected parent state, both domains. | Limited to successful sequence. |
| Concurrent duplicate safety | PASS: three mocked callbacks sharing pending snapshot; status CAS permits one payment update. | Real PostgREST/DB concurrency and side effects not verified. |
| Transaction boundaries | FAIL: payment and parent are independent PostgREST requests. | No atomic settlement or durable outbox observed. |
| Retry before payment commit | PASS: injected payment write error 500, retry 200 with one settlement, both domains. | Mock result only. |
| Failure after payment commit | FAIL: parent write error 500; retry 200 duplicate; parent remains awaiting_payment, both domains. | Source-equivalent failure path, not an observed historical production incident. |
| Side-effect recovery | FAIL: user notification insert error ignored; first response 200; replay does not restore notification. | Email/notification/invoice recovery not demonstrated. |
| Out-of-order events | PASS for PAID then EXPIRED; FAIL against explicit no-resurrection oracle for refunded then PAID, both domains. | Refunded becomes paid with 200. Approved provider correction policy remains undefined. |
| Invoice payload verification | PASS supplied amount/currency mismatch rejection 409; FAIL missing amount AND currency accepted 200 and settles. | Exact decimal verification also lacks a defined contract: Number coercion used. |
| Stable external transaction ID | FAIL: both creation handlers use parent ID plus Date.now(). | Retry/concurrent identity is not stable; provider idempotency header absent. |
| Invoice creation retry/concurrency | FAIL: copyright provider-success/DB-save-failure retry creates two invoices with two external IDs; concurrent requests create two. Successful sequential reuse PASS. | Provider was a local fake, no Xendit request. Release equivalent hazard confirmed in source, not mocked end-to-end. |
| Provider reconciliation | FAIL, not verified | Release reuse path performs provider GET, but no complete provider-to-ledger reconciliation/repair was executed or proved. |
| Xendit final gate | FAIL | Successful duplicate suppression does not close partial-commit, invoice-create and out-of-order failures. |

Webhook suite: **23 cases, 16 PASS, 7 FAIL, exit 1**. Invoice creation fixture: **3 scenarios, 1 PASS, 2 FAIL**. Neither executes provider SDK/network or production handlers. Webhook harness replaces client, environment, console and fetch; test tokens/IDs are synthetic.

Code anchors: `supabase/functions/xendit-webhook/index.ts:32` (optional amount), `:55` (full body logging), `:82` and `:117` (already-paid early returns), `:89` and `:148` (separate parent writes), `:162` (unchecked notification result); `supabase/functions/create-xendit-invoice/index.ts:317` and `:377`; `supabase/functions/create-copyright-invoice/index.ts:30`, `:34` and `:38`. Existing provider/body logs were not read because they may contain private financial data.

## SQL regression and accounting boundary tests

Existing scripts were applied ONLY in isolated `postgres`, in this order:

1. `scripts/royalty_financial_smoke.sql`.
2. `20261023041039_harden_royalty_financial_workflows.sql`.
3. `20261023053436_secure_royalty_period_imports_and_recipient_mapping.sql`.
4. `20261023055419_royalty_import_integrity_hotfix.sql`.
5. `20261023055703_royalty_artist_history_guard.sql`.
6. `scripts/royalty_financial_assertions.sql`.
7. `scripts/royalty_import_safety_assertions.sql`.
8. `scripts/royalty_import_adversarial_assertions.sql`.

All completed with ON_ERROR_STOP and exit 0. These scripts are mutation-capable and must not be run against production. Minimal fixture lacks complete production constraints/RLS; the sub-cent discrepancy was subsequently reproduced on canonical DDL.

Canonical synthetic tests separately verified: request 10.00, approve, pay debits group funds once; repeated paid transition raises `Payout must be approved` without another debit; rejection restores available group funds; single-payment refund produces one adjustment and expected balance. FAIL: 0.001 payout precision; FAIL: two paid invoices for one release delete both sources but refund only one. No concurrent financial RPC, provider refund, or historical settlement test was performed.

`node --test scripts/process-royalty-upload.test.cjs scripts/phase1-edge-security.test.cjs`: **2/2 PASS** with mocked Auth/DB. Current live `scripts/database_security_assertions.sql`: **PASS**, BEGIN READ ONLY / DO / ROLLBACK. These limited passes do not override this report's failures. No application source was changed by Agent F; project build/global lint are coordinator checks, not claimed as rerun here.

## Missing RPC classification

All-schema catalog search returned zero rows for all four exact names. Mounted routes in `src/App.tsx:308` and `:316` require admin and point to active upload/history pages.

| RPC | Active caller | Classification | Mandatory closure |
| --- | --- | --- | --- |
| validate_royalty_csv_row | `src/pages/CopyrightRoyaltyUpload.tsx:135` | BROKEN FEATURE, required by reachable validation flow | Classification PASS; behavior FAIL. Errors skip rows and can yield misleading “All 0 rows are valid”. |
| import_composer_royalties | `src/pages/CopyrightRoyaltyUpload.tsx:184` | BROKEN FEATURE, required by reachable composer import | Classification PASS; behavior FAIL. |
| get_royalty_upload_history | `src/pages/CopyrightRoyaltyUploadHistory.tsx:63` | BROKEN FEATURE, required by reachable history page | Classification PASS; behavior FAIL. |
| delete_royalty_upload | `src/pages/CopyrightRoyaltyUploadHistory.tsx:82` | BROKEN FEATURE, required by reachable deletion action | Classification PASS; behavior FAIL. Different from Edge `delete-royalty-upload` using `reverse_royalty_upload`. |

No UNKNOWN remains for these four names. This classifies source reachability and absent implementations; no browser session was used. No new RPC was invented or created.

## Required closure

HIGH sign-off blockers: restrict trusted paid/approved state transitions and ownership changes; make settlement atomic or durably recoverable; enforce safe payout precision; constrain/reconcile multi-paid refunds; give invoice creation durable idempotency and reconciliation; privately justify A01–A33 and recover I01–I02; restore composer contracts; compare exact source/restore financial rows; rerun independent QA.

Preserve historical rows and opening balances. Do not repair production balances merely to satisfy equations. Any controlled late payment/refund correction needs explicit financial policy and audit evidence. No Phase 2 readiness claim follows from current arithmetic.

## Runnable sanitized webhook regression

From repository root, paste the JavaScript below into `node` stdin (PowerShell: `@'`, code, `'@ | node`). Uses installed TypeScript and Node stdlib only; fetch is blocked. Expected current result: 16 PASS, 7 FAIL, exit 1. This is a deliberately failing acceptance check against current source.

```javascript
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = fs.readFileSync('supabase/functions/xendit-webhook/index.ts', 'utf8').replace(/^import .*$/m, '');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function fixture(kind = 'release', failTable = null) {
  const paymentTable = kind === 'release' ? 'release_payments' : 'copyright_registration_payments';
  const parentTable = kind === 'release' ? 'releases' : 'copyright_registrations';
  const statusKey = kind === 'release' ? 'status' : 'payment_status';
  const rows = { release_payments: [], copyright_registration_payments: [], releases: [], copyright_registrations: [], notifications: [], user_roles: [], profiles: [] };
  rows[paymentTable].push({ id: 'payment-fixture', xendit_invoice_id: 'invoice-fixture', release_id: 'release-fixture', registration_id: 'registration-fixture', user_id: 'user-fixture', amount: '100.00', currency: 'IDR', [statusKey]: 'pending', releases: { title: 'Fixture' } });
  rows[parentTable].push({ id: kind === 'release' ? 'release-fixture' : 'registration-fixture', status: 'awaiting_payment' });
  const writes = {}; let failOnce = failTable; let handler;
  const env = { XENDIT_WEBHOOK_TOKEN: 'fixture-token', SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-key', DATABASE_SCHEMA: 'soundpub' };
  function query(table) {
    let filters = [], operation = 'read', values;
    const builder = {
      select() { return this; }, eq(key,value) { filters.push(row => row[key] === value); return this; },
      neq(key,value) { filters.push(row => row[key] !== value); return this; },
      in(key,values) { filters.push(row => values.includes(row[key])); return this; },
      update(value) { operation = 'update'; values = value; return this; },
      insert(value) { operation = 'insert'; values = value; return this; },
      maybeSingle() { return this.run(true); }, single() { return this.run(true); },
      then(resolve,reject) { return this.run(false).then(resolve,reject); },
      async run(single) {
        if (operation !== 'read' && failOnce === table) { failOnce = null; return { data: null, error: { message: 'Injected fixture failure' } }; }
        let matches = rows[table].filter(row => filters.every(filter => filter(row)));
        if (operation === 'update') { for (const row of matches) Object.assign(row,values); writes[table] = (writes[table] || 0) + matches.length; }
        if (operation === 'insert') { matches = Array.isArray(values) ? values : [values]; rows[table].push(...matches); writes[table] = (writes[table] || 0) + matches.length; }
        return { data: structuredClone(single ? matches[0] || null : matches), error: null };
      }
    }; return builder;
  }
  vm.runInNewContext(compiled, {
    Deno: { env: { get: key => env[key] }, serve: callback => { handler = callback; } },
    createClient: () => ({ from: query, functions: { invoke: async () => ({ data: {}, error: null }) } }),
    Response, console: { log() {}, error() {}, warn() {} },
    fetch: () => { throw new Error('Network forbidden'); }, Intl, Date, Number, String
  });
  async function send(body = { id: 'invoice-fixture', status: 'PAID', amount: 100, currency: 'IDR' }, token = 'fixture-token') {
    const response = await handler({ method: 'POST', headers: new Headers(token === null ? {} : { 'x-callback-token': token }), json: async () => body });
    return { status: response.status, body: await response.json() };
  }
  return { rows, writes, env, send, payment: rows[paymentTable][0], parent: rows[parentTable][0], paymentTable };
}
(async () => {
  let pass = 0, fail = 0;
  async function check(name, action) {
    try { await action(); process.stdout.write('PASS ' + name + '\n'); pass++; }
    catch (error) { process.stdout.write('FAIL ' + name + ': ' + error.message + '\n'); fail++; }
  }
  await check('missing configured token rejects', async () => { const state=fixture(); delete state.env.XENDIT_WEBHOOK_TOKEN; assert.equal((await state.send()).status,503); assert.deepEqual(state.writes,{}); });
  await check('missing caller token rejects', async () => { const state=fixture(); assert.equal((await state.send(undefined,null)).status,403); assert.deepEqual(state.writes,{}); });
  await check('wrong caller token rejects', async () => { const state=fixture(); assert.equal((await state.send(undefined,'wrong-fixture')).status,403); assert.deepEqual(state.writes,{}); });
  await check('missing invoice ID rejects', async () => { const state=fixture(); assert.equal((await state.send({status:'PAID'})).status,400); assert.deepEqual(state.writes,{}); });
  for (const kind of ['release','copyright']) {
    await check(kind+' amount mismatch rejects', async () => { const state=fixture(kind); assert.equal((await state.send({id:'invoice-fixture',status:'PAID',amount:99,currency:'IDR'})).status,409); assert.deepEqual(state.writes,{}); });
    await check(kind+' currency mismatch rejects', async () => { const state=fixture(kind); assert.equal((await state.send({id:'invoice-fixture',status:'PAID',amount:100,currency:'USD'})).status,409); assert.deepEqual(state.writes,{}); });
    await check(kind+' once, twice, ten callbacks settle once', async () => {
      const state=fixture(kind); for(let count=0;count<10;count++) { assert.equal((await state.send()).status,200); assert.equal(state.payment[state.paymentTable==='release_payments'?'status':'payment_status'],'paid'); assert.equal(state.parent.status,kind==='release'?'pending_paid':'paid_pending_review'); assert.equal(state.writes[state.paymentTable],1); }
    });
    await check(kind+' missing amount/currency denied', async () => { const state=fixture(kind); assert.equal((await state.send({id:'invoice-fixture',status:'PAID'})).status,400); });
    await check(kind+' payment write failure retries safely', async () => { const state=fixture(kind,kind==='release'?'release_payments':'copyright_registration_payments'); assert.equal((await state.send()).status,500); assert.equal((await state.send()).status,200); assert.equal(state.writes[state.paymentTable],1); assert.equal(state.parent.status,kind==='release'?'pending_paid':'paid_pending_review'); });
    await check(kind+' parent write failure recovers on retry', async () => { const state=fixture(kind,kind==='release'?'releases':'copyright_registrations'); assert.equal((await state.send()).status,500); assert.equal((await state.send()).status,200); assert.equal(state.parent.status,kind==='release'?'pending_paid':'paid_pending_review'); });
    await check(kind+' PAID then EXPIRED preserves paid', async () => { const state=fixture(kind); await state.send(); await state.send({id:'invoice-fixture',status:'EXPIRED',amount:100,currency:'IDR'}); assert.equal(state.payment[kind==='release'?'status':'payment_status'],'paid'); });
    await check(kind+' concurrent same-state callback CAS', async () => { const state=fixture(kind); const replies=await Promise.all([state.send(),state.send(),state.send()]); assert.ok(replies.every(reply=>reply.status===200)); assert.equal(state.writes[state.paymentTable],1); });
  }
  for (const kind of ['release','copyright']) {
    await check(kind+' refunded payment must not resurrect', async () => { const state=fixture(kind); state.payment[kind==='release'?'status':'payment_status']='refunded'; const result=await state.send(); assert.ok(result.status===409 || result.body.ignored===true); assert.equal(state.payment[kind==='release'?'status':'payment_status'],'refunded'); });
  }
  await check('release notification write failure recovered', async () => { const state=fixture('release','notifications'); assert.equal((await state.send()).status,200); await state.send(); assert.equal(state.rows.notifications.length,1); });
  process.stdout.write(JSON.stringify({pass,fail})+'\n');
  process.exitCode = fail ? 1 : 0;
})().catch(error => { process.stderr.write(error.stack); process.exitCode=2; });
```

## Runnable invoice-create regression

Same stdin execution method. Only fake `fetch` returns generated invoices; no network request occurs. Current result: one successful reuse scenario, two duplicate-create failures.

```javascript
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const compiled=ts.transpileModule(fs.readFileSync('supabase/functions/create-copyright-invoice/index.ts','utf8').replace(/^import .*$/m,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function fixture(failWrite=false){
let handler,tick=1000;const invoices=[],payment={id:'payment-fixture',registration_id:'registration-fixture',user_id:'user-fixture',payment_status:'pending',amount:'100000.00',currency:'IDR'};
const registration={id:'registration-fixture',user_id:'user-fixture',status:'awaiting_payment',legal_name:'Fixture',email:'fixture@example.invalid'};
function query(table){let op='select',values;const builder={select(){return this;},eq(){return this;},order(){return this;},limit(){return this;},update(value){op='update';values=value;return this;},async maybeSingle(){return {data:structuredClone(table==='copyright_registrations'?registration:payment),error:null};},then(resolve,reject){return Promise.resolve().then(()=>{if(op==='update'){if(failWrite){failWrite=false;return{error:{message:'Injected fixture save failure'}};}Object.assign(payment,values);}return{error:null};}).then(resolve,reject);}};return builder;}
vm.runInNewContext(compiled,{Deno:{env:{get:key=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',XENDIT_SECRET_KEY:'fixture-provider',DATABASE_SCHEMA:'soundpub'})[key]},serve:callback=>{handler=callback;}},createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'user-fixture'}}})},from:query}),Response,Date:class extends Date{static now(){return tick++;}},btoa,console:{error(){}},fetch:async(url,options)=>{assert.equal(url,'https://api.xendit.co/v2/invoices');const payload=JSON.parse(options.body);const count=invoices.push(payload.external_id);return new Response(JSON.stringify({id:'provider-fixture-'+count,invoice_url:'https://fixture.invalid/invoice/'+count}),{status:200});}});
return{invoices,async send(){return handler({method:'POST',headers:new Headers({Authorization:'Bearer fixture'}),json:async()=>({registration_id:'registration-fixture'})});}};
}
(async()=>{
let failures=0;let state=fixture();assert.equal((await state.send()).status,200);assert.equal((await state.send()).status,200);assert.equal(state.invoices.length,1);console.log('PASS copyright sequential successful invoice reuse: 1 provider creation');
state=fixture(true);assert.equal((await state.send()).status,500);assert.equal((await state.send()).status,200);console.log((state.invoices.length===1?'PASS':'FAIL')+' copyright retry after provider success / DB failure: provider creations='+state.invoices.length+', distinct external IDs='+new Set(state.invoices).size);if(state.invoices.length!==1)failures++;
state=fixture();await Promise.all([state.send(),state.send()]);console.log((state.invoices.length===1?'PASS':'FAIL')+' copyright concurrent invoice creation: provider creations='+state.invoices.length);if(state.invoices.length!==1)failures++;
process.exitCode=failures?1:0;
})().catch(error=>{console.error(error);process.exitCode=2;});
```

