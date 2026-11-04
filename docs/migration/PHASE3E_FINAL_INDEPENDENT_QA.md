# Phase 3E Final Independent QA — Agent F

Reviewed 2026-10-30; final artifact consistency update after sorted refund actor/beneficiary authority fix (Asia/Bangkok). Working-tree HEAD: `48222ffb9c9e60da82d224e1e8aaccd4dd597442`; substantial uncommitted/untracked implementation exists, so hashes below identify reviewed bytes.

**Decision: both requested concurrency barriers PASS; F-01 and F-05 CLOSED. Latest final regression: PASS (209 passed, 0 failed, 0 skipped). Latest focused negative browser: PASS (69 passed, 0 failed, 0 skipped). Whole Phase 3E remains BLOCKED / NOT DECOUPLED by composer, historical financial approval and complete browser evidence.**

## Latest artifact refresh

Independent read-only refresh after final composer RPC reclassification, expanded negative-browser harness and Phase 3D test-harness stabilization confirms the whole-phase decision remains **FAIL / BLOCKED**. Five composer RPCs now correctly belong to `PHASE3E_FINANCIAL`; zero are financially migrated. Historical record-level reconciliation remains NOT RUN, 33 opening adjustments remain unapproved, and provider settlement/refund evidence remains unresolved. Browser evidence increased to 69 focused passes, but eligible payout retry/race, provider failure, terminal-state conflict, committed-import quarantine and session-expiry scenarios remain incomplete. No production mutation, provider operation, posting, deployment or traffic switch was observed.

The final regression log at `.tmp/phase3e-final-regression-fixed-20261030.log` records 209/0/0. `backend/test/phase3d-error-matrix.test.ts` now verifies the oversized 413 envelope through `app.inject`; the 415 path remains real HTTP. This stabilizes the harness but does not prove oversized-request socket behavior.

## Scope and evidence boundary

Prior update independently reran actual refund/admin-readiness overlap, first-account PAID callback/readiness overlap, full regression and backend typecheck/isolation scan. Both barriers assert zero query errors/deadlocks and pass. Refund check also verifies REFUNDED reconciliation, exactly one refund event and missing-invoice 403/404 authority precedence. This update inspected final coordinator reports and checked current selected hashes only; no tests, SQL or browser flows reran. Prior frontend/reconciliation/browser observations remain attributed below.

Only this report was authored by this QA. No runtime/test/script edit, SSH, production/shared database access, real provider call, deployment, historical import, opening credit, financial repair or traffic change. Synthetic writes used fresh loopback-only disposable PostgreSQL with local mock providers. No browser rerun or new browser evidence files were created.

## Findings ordered by severity

### F-02 — P1 acceptance blocker: composer, historical provenance and settlement gates remain open

Final composer reports correctly distinguish proven SQL aliasing from verified beneficiary/work entitlement. Current `backend/src/composer-royalties/contracts.ts:30` always returns `posting_allowed:false`; no composer financial HTTP service, durable import, approved allocation, correction or payout lifecycle exists. Nine composer tests are preview/boundary tests, not posting acceptance. Reported local CSV population is six rows/five codes, one repeated code-period group, zero approved backend mappings; this QA did not re-enumerate personal CSV data.

Final historical/provenance/opening reports retain unresolved source identities for 14,474 historical royalties, missing replay keys/count mismatches for 10 uploads, 33 unapproved opening adjustments, four locally paid release payments and two locally paid payouts without independent settlement proof. Those are inherited 2026-10-27 snapshot counts, not fresh QA queries. Historical record-level dry run remains NOT RUN; no approved exceptions, cutover schedule or opening residuals were supplied.

Source agrees with the stated ceiling: imports post raw ledger earnings while batches stay UNRECONCILED; public availability/payout policy quarantines unresolved imports. There is no approved reconciliation transition. `backend/src/payouts/policy.ts:15` still supplies `destinationReady:true`, not independently verified destination evidence. Mock provider state changes in the callback transaction, so it cannot establish independent external settlement. These facts block whole-phase financial acceptance, even with 209 passing synthetic tests.

### F-03 — P2 acceptance gap: browser and decoupling coverage remains bounded

Earlier negative-browser JSON independently checked: 42 PASS, 14 per viewport; 276 API attempts, 261 responses; unexpected external attempts 0; financial Supabase attempts 0; 135 separately blocked font requests; all 10 recorded financial table counts zero. Latest 69-pass results were independently reviewed in the artifact refresh above. Neither review is a fresh Agent F browser execution.

Final matrix explicitly leaves eligible payout rejection/retry/double-click, expired-session refresh, real provider failure, stale PAID/refunded state, committed-import quarantine and ambiguous POST completion unexercised in browsers. Inactive and suspended payout-user denials now pass in all three viewports; backend coverage does not substitute for the remaining browser flows.

Static financial scan passes 10 backend-only files and 24 caller guard-name checks. Egress scanner traverses five API-import files, but only scans finance component source text and does not traverse their shared UI/auth imports or dynamic imports. Zero forbidden references in that scope does not prove complete runtime decoupling. The matrix's PARTIAL comprehensive-browser verdict remains appropriate.

Final execution, financial-invariants, parity, test and closeout reports agree on the evidence ceiling: 209/0/0 deterministic regression, 69 focused browser passes, zero required automated skips, historical record-level dry run NOT RUN, unapproved opening balances and unproven provider settlement. Inventory classification PASS is not production parity; synthetic invariant PASS is not financial posting approval. Original `PHASE3E_FINAL_REPORT.md` remains byte-identical to the execution log's recorded fingerprint; the newer `PHASE3E_FINAL_CLOSEOUT_REPORT.md` carries the current BLOCKED / NOT DECOUPLED decision.

## Closed findings and changed-code audit

- **F-05 CLOSED for exact refund/admin-readiness authority barrier.** `authority` now accepts relatedIds and locks actor plus preread beneficiary together through usersRepository's sorted row/advisory protocol (`backend/src/payments/index.ts:16-17,211-214`). With beneficiary UUID sorting before admin, refund reaches beneficiary KEY SHARE only after holding the complete authority scope. Competing actual admin readiness waits without holding an incompatible partial scope; resuming refund completes both operations. Results: zero query errors/40P01; refund fulfilled, readiness fulfilled; invoice REFUNDED/reconciled; exactly one refund event. Readiness appropriately returns PAYMENT_REQUIRED after refund. Missing invoice still executes admin authority before NOT_FOUND (`:210`); independent artist request returns 403, admin returns 404.
- **F-01 CLOSED for requested first-account PAID callback/readiness barrier.** `lockPaymentRelease` reads owner without a row lock, locks beneficiary backend_users FOR KEY SHARE, then release FOR SHARE, rechecks owner; callback/refund subsequently lock invoice and recheck business_id. Original post-lock effect pause retained, matching effect's second exact release-share SELECT rather than the helper's earlier read. Actual readiness now waits on beneficiary before holding incompatible resources. Result: callback and readiness fulfilled, zero query errors/40P01, readiness true/no blockers, PAID/reconciled, exactly one finance account and one PAYMENT_CHARGE. Initial fixture explicitly had zero finance accounts.
- **Strengthened beneficiary-gate test VERIFIED:** `backend/test/payments.test.ts:88-112` holds beneficiary backend_users FOR UPDATE, starts PENDING callback, observes callback waiting on beneficiary and proves release FOR UPDATE NOWAIT plus invoice FOR UPDATE NOWAIT remain available. Test is inside an existing test, retaining total count 209. This ordering probe and the independent actual PAID-posting barrier complement each other. F-05's separate actual refund/admin-readiness barrier now covers its previously missing admin-plus-beneficiary ordering.
- **Original status/callback finding remains CLOSED** on prior direct barrier plus current status NOWAIT regression. The direct status barrier was not rerun this update; current full suite covers its persistent regression probe.
- **F-04 CLOSED:** current provenance ledger now explicitly states composer_id is aliased as composer_code while beneficiary/work mapping remains unproven, consistent with canonical SQL and composer reports.
- **SQL wrapper remains VERIFIED:** terminal ROLLBACK, four statements, 20 predicates, READ ONLY and 45-second timeout were independently checked in prior review; SQL hash unchanged. No historical/production SQL executed.
- Callback/refund owner/release/invoice stability checks retain conservative CONFLICT behavior; no unsafe user-row lock weakening was introduced by this QA. Mock effect/ledger/audit/receipt reconciliation remains synthetic evidence, not external settlement.

## Exact commands and observed results

Commands below ran from `I:/website-devops/soundpub-project/soundpub-dashboard` unless another cwd is shown. Latest full runner, both barriers and backend typecheck/isolation scan exited 0. Barrier exit 0 now asserts successful operations and zero database errors, not reproduction of an expected defect. Node `v24.22.1`. Rows marked prior review were not rerun this update.

| Command | Independent result |
| --- | --- |
| `node scripts/phase3e-closeout-regression.cjs` | 149 top-level tests; **209 tests, 209 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo**; 102,791.756 ms; exit 0. |
| `node scripts/phase3-client.test.cjs` (inside runner) | PASS. |
| `node scripts/phase3b-frontend.test.cjs` (inside runner) | PASS. |
| `node scripts/phase3c-static-scan.cjs` (inside runner) | PASS; unexpected 0. |
| `node scripts/phase3e-static-scan.cjs` (inside runner) | PASS; 10 backend-only files, 24 guarded legacy callers. |
| `node scripts/phase3e-closeout-egress.test.cjs` (inside runner) | PASS; five API-import files, zero forbidden references; finance component sources clean. |
| `npm run typecheck`, cwd `backend` | PASS; `tsc -p tsconfig.json --noEmit`. |
| `npm run security:check`, cwd `backend` | PASS; isolation/secret scan. |
| `node src/components/finance/backend-mode.test.cjs` (prior review; source unchanged) | PASS; zero Supabase accesses in exercised harness. |
| `node src/services/phase3d.test.cjs` (prior review; source unchanged) | PASS; static boundary and frontend contract/lifecycle checks. |
| `node src/services/users.test.cjs` (prior review; source unchanged) | PASS; adapter, API contract, development routing and direct-write guards. |
| `node src/components/releases/backend-mode.test.cjs` (prior review; source unchanged) | PASS; pagination, mount guards and versioned API contracts. |
| `node backend/node_modules/tsx/dist/cli.mjs scripts/phase3e-closeout-reconciliation.ts` (prior review; source unchanged) | PASS; four synthetic comparison scenarios: matched 1, mismatched 1, unresolved 1, ambiguous 1, exceptions 0; duplicate expectation rejected; ledger/audit/outbox unchanged. Historical population NOT_RUN; settlement NOT_TESTED. |
| `@' ... '@ \| node --import tsx --input-type=module`, cwd `backend`; actual callback/readiness harness below | **PASS**, exit 0; two fulfilled, zero query errors/deadlocks, readiness true, PAID reconciled, one new account/charge. |
| Same stdin invocation, refund/admin-readiness barrier below | **PASS**, exit 0; both fulfilled, zero query errors/deadlocks; REFUNDED/reconciled, one refund event; missing-invoice artist 403/admin 404. |
| `@' ... '@ \| node`; local SQL/report/browser assertions (prior review) | PASS; SQL properties/hash and ROLLBACK report consistency; existing browser JSON 42 PASS and zero recorded financial effects. No SQL/provider/browser execution in this assertion check. |

The regression runner validates local Docker Desktop named-pipe context, binds fresh PostgreSQL to `127.0.0.1` random ports, strips inherited database/Supabase/provider URL variables for child tests, assigns disposable DB URLs and removes its owned container in finally. Concurrency fixtures independently verify the local context and use fresh owned containers. Full regression includes ledger rollback/replay/overdraft/terminal-effect checks, royalty/payment/payout tests, Phase 3E integration, closeout races and the four otherwise environment-skipped DB suites. Both independently reproduced deadlock findings are closed for their exact tested interleavings; this does not certify every possible concurrent workflow.

## Actual first-account PAID callback/readiness replay

Run from `backend` through PowerShell stdin. Only the proxy observer was adjusted for the helper's added release reads: pause on the second exact release FOR SHARE query, the original effect pause location. Initial account count and final unique posting are asserted.

```powershell
@'
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { concurrencyPostgres } from './test/support/concurrency-postgres.ts';
import { createPaymentsService, paymentSubmissionDependency } from './src/payments/index.ts';
import { createSubmissionService } from './src/submissions/index.ts';
import { webhookSignature } from './src/integrations/webhook.ts';
const fixture = await concurrencyPostgres();
let resume;
const queryErrors = [];
try {
  const actor = { id: randomUUID(), roles: ['artist'], status: 'active' };
  await fixture.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active')", [actor.id]);
  await fixture.owner.query('INSERT INTO soundpub.profiles(id) VALUES($1)', [actor.id]);
  await fixture.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,'artist',now())", [actor.id]);
  const release = (await fixture.owner.query("INSERT INTO soundpub.releases(label_id,artist_user_id,created_by,title,artist_name,price_per_track_snapshot,total_payment_snapshot) VALUES($1,$1,$1,'Synthetic','Synthetic',100,100) RETURNING id", [actor.id])).rows[0].id;
  await fixture.owner.query("INSERT INTO soundpub.tracks(release_id,title,artist_name,position) VALUES($1,'Synthetic','Synthetic',1)", [release]);
  await fixture.owner.query("UPDATE soundpub.releases SET genre='Pop',release_type='single',release_date='2026-11-01' WHERE id=$1", [release]);
  let reached;
  const atShare = new Promise(resolve => reached = resolve);
  const gate = new Promise(resolve => resume = resolve);
  let callbackPid;
  let releaseShareReads = 0;
  const pool = new Proxy(fixture.runtime, { get(target, key) {
    if (key === 'connect') return async () => {
      const db = await target.connect();
      return new Proxy(db, { get(client, property) {
        if (property === 'query') return async (...args) => {
          if (args[0] === 'SELECT artist_user_id FROM soundpub.releases WHERE id=$1 FOR SHARE' && ++releaseShareReads === 2) {
            callbackPid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
            reached(); await gate;
          }
          try { return await client.query(...args); }
          catch (error) { queryErrors.push({code:error.code,message:error.message}); throw error; }
        };
        const value = Reflect.get(client, property); return typeof value === 'function' ? value.bind(client) : value;
      } });
    };
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } });
  const secret = 'synthetic-independent-qa-secret-32-characters';
  const service = createPaymentsService(pool, { callbackSecret: secret });
  const invoice = await service.createInvoice(actor, { release_id: release, idempotency_key: 'qa-lock-order' }, 'qa');
  assert.equal((await fixture.owner.query('SELECT count(*) FROM soundpub.finance_accounts WHERE owner_id=$1', [actor.id])).rows[0].count, '0');
  const input = { provider: 'mock-payment', eventId: 'qa-paid', timestamp: String(Math.floor(Date.now()/1000)), rawBody: Buffer.from(JSON.stringify({ provider_invoice_id: invoice.provider_invoice_id, status: 'PAID', amount_minor: invoice.amount_minor, currency: 'IDR' })), signature: '' };
  input.signature = webhookSignature(secret, input);
  const callback = service.callback(input); callback.catch(() => undefined);
  await atShare;
  const submissions = createSubmissionService(pool, { payment: paymentSubmissionDependency,
    media: { check: async () => ({ cover: true, audio: true }) },
    provider: { providerReady: async () => true, createSubmission: async () => ({ status: 'ACCEPTED', reference: 'synthetic-only' }) } });
  const status = submissions.readiness(actor, release); status.catch(() => undefined);
  const deadline = Date.now() + 5000;
  for (;;) {
    const blocked = await fixture.owner.query("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))", [callbackPid]);
    if (blocked.rowCount) break;
    assert.ok(Date.now() < deadline, 'Readiness must block on callback-held release or invoice');
    await setTimeout(10);
  }
  resume();
  const results = await Promise.allSettled([callback, status]);
  const summary = results.map((result, index) => ({ operation: index === 0 ? 'callback' : 'readiness', status: result.status, ...(result.status === 'rejected' ? { code: result.reason.code, message: result.reason.message } : {}) }));
  console.log(JSON.stringify(summary));
  console.log(JSON.stringify({queryErrors, readiness: results[1].status === 'fulfilled' ? results[1].value : undefined}));
  assert.equal(queryErrors.filter(error => error.code === '40P01').length, 0, 'No callback/readiness query may deadlock');
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'fulfilled');
  assert.ok(!results[1].value.blockers.some(blocker => blocker.code === 'PAYMENT_UNAVAILABLE'));
  assert.deepEqual(queryErrors, []);
  assert.equal(results[0].value, 'accepted');
  assert.equal(results[1].value.ready, true);
  const finalStatus = await service.status(actor, release);
  assert.equal(finalStatus.invoice.status, 'PAID');
  assert.equal(finalStatus.reconciliation.reconciled, true);
  assert.equal((await fixture.owner.query('SELECT count(*) FROM soundpub.finance_accounts WHERE owner_id=$1', [actor.id])).rows[0].count, '1');
  assert.equal((await fixture.owner.query("SELECT count(*) FROM soundpub.finance_events WHERE owner_id=$1 AND kind='PAYMENT_CHARGE'", [actor.id])).rows[0].count, '1');
  console.log('PASS: first-account PAID callback/readiness barrier; 2 fulfilled, zero query errors, ready true, PAID reconciled, one account/charge');
} finally { resume?.(); await fixture.close(); }
'@ | node --import tsx --input-type=module
```

Observed: callback fulfilled, readiness fulfilled, queryErrors empty, readiness true/no blockers; final invoice PAID and reconciled; one account and one charge. Exit 0.

## Actual refund/admin-readiness replay

Same actual services, valid owner-before-admin UUID order and proxy pause immediately before beneficiary KEY SHARE as the prior failing diagnostic. Assertions now require both operations fulfilled and zero query errors; post-race state must be REFUNDED/reconciled with one refund event. Missing-invoice authorization precedence is checked afterward in the same disposable fixture.

```powershell
@'
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { concurrencyPostgres } from './test/support/concurrency-postgres.ts';
import { createPaymentsService, paymentSubmissionDependency } from './src/payments/index.ts';
import { createSubmissionService } from './src/submissions/index.ts';
import { webhookSignature } from './src/integrations/webhook.ts';
const fixture = await concurrencyPostgres();
let resume;
const queryErrors = [];
try {
  const artist = {id:'10000000-0000-4000-8000-000000000001',roles:['artist'],status:'active'};
  const admin = {id:'f0000000-0000-4000-8000-000000000002',roles:['admin'],status:'active'};
  assert.ok(artist.id < admin.id);
  for (const actor of [artist,admin]) {
    await fixture.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active')",[actor.id]);
    await fixture.owner.query('INSERT INTO soundpub.profiles(id) VALUES($1)',[actor.id]);
    await fixture.owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,$2,now())',[actor.id,actor.roles[0]]);
  }
  const release = (await fixture.owner.query("INSERT INTO soundpub.releases(label_id,artist_user_id,created_by,title,artist_name,genre,release_type,release_date,price_per_track_snapshot,total_payment_snapshot) VALUES($1,$1,$1,'Synthetic','Synthetic','Pop','single','2026-11-01',100,100) RETURNING id",[artist.id])).rows[0].id;
  await fixture.owner.query("INSERT INTO soundpub.tracks(release_id,title,artist_name,position) VALUES($1,'Synthetic','Synthetic',1)",[release]);
  const secret='synthetic-independent-qa-secret-32-characters';
  const setup=createPaymentsService(fixture.runtime,{callbackSecret:secret});
  const invoice=await setup.createInvoice(artist,{release_id:release,idempotency_key:'qa-refund-owner-order'},'qa');
  const input={provider:'mock-payment',eventId:'qa-paid',timestamp:String(Math.floor(Date.now()/1000)),rawBody:Buffer.from(JSON.stringify({provider_invoice_id:invoice.provider_invoice_id,status:'PAID',amount_minor:invoice.amount_minor,currency:'IDR'})),signature:''};
  input.signature=webhookSignature(secret,input);
  await setup.callback(input);
  let reached, refundPid, readinessPid;
  const atOwner = new Promise(resolve=>reached=resolve);
  const gate = new Promise(resolve=>resume=resolve);
  let pause=true;
  const pool=new Proxy(fixture.runtime,{get(target,key){
    if(key==='connect')return async()=>{
      const db=await target.connect();
      return new Proxy(db,{get(client,property){
        if(property==='query')return async(...args)=>{
          if(pause && args[0]==='SELECT id FROM soundpub.backend_users WHERE id=$1 FOR KEY SHARE'){
            pause=false;refundPid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;reached();await gate;
          }
          try{return await client.query(...args);}catch(error){queryErrors.push({code:error.code,message:error.message,detail:error.detail,where:error.where});throw error;}
        };
        const value=Reflect.get(client,property);return typeof value==='function'?value.bind(client):value;
      }});
    };
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  const service=createPaymentsService(pool,{callbackSecret:secret});
  const submissions=createSubmissionService(pool,{payment:paymentSubmissionDependency,media:{check:async()=>({cover:true,audio:true})},provider:{providerReady:async()=>true,createSubmission:async()=>({status:'ACCEPTED',reference:'synthetic'})}});
  const refund=service.refund(admin,{invoice_id:invoice.id,idempotency_key:'qa-refund',reason:'Synthetic QA'},'qa-refund');
  refund.catch(()=>undefined);await atOwner;
  const readiness=submissions.readiness(admin,release);readiness.catch(()=>undefined);
  const deadline=Date.now()+5000;
  for(;;){
    const blocked=await fixture.owner.query('SELECT pid,query FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))',[refundPid]);
    if(blocked.rowCount){readinessPid=blocked.rows[0].pid;console.log(JSON.stringify({readinessWait:blocked.rows[0].query}));break;}
    assert.ok(Date.now()<deadline,'Readiness must block on refund-held admin row');await setTimeout(10);
  }
  resume();
  const results=await Promise.allSettled([refund,readiness]);
  console.log(JSON.stringify(results.map((r,i)=>({operation:i===0?'refund':'admin-readiness',status:r.status,...(r.status==='rejected'?{code:r.reason.code,message:r.reason.message}:{})}))));
  console.log(JSON.stringify({queryErrors}));
  assert.deepEqual(queryErrors,[]);
  assert.equal(results[0].status,'fulfilled');
  assert.equal(results[1].status,'fulfilled');
  assert.equal(results[0].value.status,'REFUNDED');
  assert.equal(results[1].value.ready,false);
  assert.deepEqual(results[1].value.blockers.map(blocker=>blocker.code),['PAYMENT_REQUIRED']);
  const finalStatus=await service.status(artist,release);
  assert.equal(finalStatus.invoice.status,'REFUNDED');
  assert.equal(finalStatus.reconciliation.reconciled,true);
  assert.equal((await fixture.owner.query("SELECT count(*) FROM soundpub.finance_events WHERE owner_id=$1 AND kind='PAYMENT_REFUND'",[artist.id])).rows[0].count,'1');
  const missing={invoice_id:randomUUID(),idempotency_key:'qa-missing',reason:'Synthetic missing invoice'};
  await assert.rejects(service.refund(artist,missing,'qa-missing'),{statusCode:403,code:'FORBIDDEN'});
  await assert.rejects(service.refund(admin,missing,'qa-missing'),{statusCode:404,code:'NOT_FOUND'});
  console.log('PASS: refund/admin-readiness barrier; 2 fulfilled, zero query errors, REFUNDED reconciled, one refund; missing invoice 403/404 preserved');
}finally{resume?.();await fixture.close();}
'@ | node --import tsx --input-type=module
```

Observed: refund fulfilled, admin-readiness fulfilled, queryErrors empty. Readiness returns ready false with sole PAYMENT_REQUIRED blocker because the completed refund invalidates payment satisfaction. Final invoice REFUNDED/reconciled; exactly one PAYMENT_REFUND. Missing-invoice artist request returns FORBIDDEN/403; admin returns NOT_FOUND/404. Exit 0.

## Reviewed fingerprints

SHA-256 values below are retained as historical review evidence, not latest-artifact fingerprints. The expanded browser harness, composer/classification reports, coordinator reports and Phase 3D test changed after this table was produced. Latest independent refresh relies on direct file/log review above; do not use this table to assert current-byte equality.

| File | SHA-256 |
| --- | --- |
| `backend/src/payments/index.ts` | `f2306b05656627002e63aabcab15f6654271d5c92c2714b5c6520147643a6753` |
| `backend/test/payments.test.ts` | `7f4ad4b7dd8bdbb147fa2b2a8fa3261ee6f32fbe696a09e16989583ffb4155d9` |
| `backend/src/submissions/index.ts` | `a445ec22622abde38d709b943fcb1f34ebed4952df57f75bb0ab640f55133b43` |
| `backend/src/releases/repository.ts` | `fafcfc838e10280d924d76363402115682591d8a974976461184229d7ac603d0` |
| `backend/src/payouts/policy.ts` | `447483442d148d7dd8dc981d20e8e0a6bea3704da52cbf699a8e4147efc57b73` |
| `backend/src/composer-royalties/contracts.ts` | `54e199418321e6bee8dc5f4af9950108343d1ba4c9135524a197c1a8f1956f67` |
| `scripts/payment_reconciliation_readonly.sql` | `249efcb679fea0a4d7766f4ddfe459437b870815f7fd78a0361fa07e279406b6` |
| `scripts/phase3e-closeout-regression.cjs` | `aa69f754a710fa42c4c68c2973f117a44206d2cba88b3e437df1ff93878464ed` |
| `scripts/phase3e-static-scan.cjs` | `820b923d17cdbf660bd403c37340460e8278fa2c36db98805df1cc7118d0c423` |
| `scripts/phase3e-closeout-egress.test.cjs` | `62c39fe309f7d759fac33fdedbea1b22a70ebffd5503309b3f02923ed664b156` |
| `docs/migration/PHASE3E_FINAL_COMPOSER_IDENTITY_MAP.md` | `0b6b9e7548596e87018551b09c7f0654e163deb379ede826257ec2a4a0d22248` |
| `docs/migration/PHASE3E_FINAL_COMPOSER_CONTRACT.md` | `1177119145bc9faff6c1d4a987c97b4ea50bf45aabe5974d5fe080b7f39ee13c` |
| `docs/migration/PHASE3E_FINAL_PROVENANCE_LEDGER.md` | `66073304fba13efe21b2cb1c58a90af5e7d799dc4f08e033080e43944c5af351` |
| `docs/migration/PHASE3E_FINAL_HISTORICAL_RECONCILIATION.md` | `f29ffd028f1f624a0b2f7aef4246d8365f1fbfbe66a88ce89c0a02b8fd2403e7` |
| `docs/migration/PHASE3E_FINAL_OPENING_BALANCE_REPORT.md` | `bbac1bf6e6b3c98d3780bc8bd4ffd8a9f62d780b1ad6ba0ff7351aecf049050d` |
| `docs/migration/PHASE3E_FINAL_NEGATIVE_BROWSER_MATRIX.md` | `ba5eb4153f66b41896eaa6c6908b45a636360003a7c9c434e7856de892a31f99` |
| `docs/migration/phase3e-browser.ts` | `4d3b9ae288d5ba82fb13fbeaa13e478fdd7db2d3b984b0d2ff7ff22d11883007` |
| `backend/src/users/repository.ts` | `20cd2d244aff46d3f73b8e56d9525cbaf4d1a050e2dfed9278fa02a5d4c00a16` |
| `backend/src/finance/index.ts` | `7272cee67fda504e925571469443c799f56ea05f59366b41ea53e8106810495a` |
| `backend/migrations/0014_finance_ledger.sql` | `5f8b7c0bd0b021fce3b5dc60655ab5cf50a1b8bb44101c89a4e82486ef42359b` |
| `docs/migration/PHASE3E_FINAL_EXECUTION_LOG.md` | `557f7e37e6a4de20494c1ba135503799a4541bbfcca0257cf21b5f25d1d23e56` |
| `docs/migration/PHASE3E_FINAL_FINANCIAL_INVARIANTS.md` | `b2c59b886cfe78eca99bb106456fd2bdb6a9d695bd15d2ac0bc68f193a0dbc26` |
| `docs/migration/PHASE3E_FINAL_PARITY_CLASSIFICATION.md` | `dbc37f1653db50eb6d9c17e7c1d17c76d5c73a9624e2643ac246d8801381757a` |
| `docs/migration/PHASE3E_FINAL_TEST_REPORT.md` | `75e9750483fd65d56d790350092e135284607966661a46cedc8bfca925339e1d` |
| `docs/migration/PHASE3E_FINAL_CLOSEOUT_REPORT.md` | `67c814fb22b0bbb0be454239ca44e83db54fc6be22efaa1c65357cefd098aa77` |
| `docs/migration/PHASE3E_FINAL_REPORT.md` | `60cfa546dff569832f3d36ef4db6c1f70ac8526365aef430b8d54e9992e52190` |

## Final admission

Supportable: final PASS (209 passed, 0 failed, 0 skipped) regression, both actual payment/submission barriers with zero query errors, F-01/F-05 closure, preserved missing-invoice authorization precedence, F-04 provenance correction, bounded static/browser-artifact evidence, synthetic invariants and ROLLBACK wrapper inspection.

No further runtime defect or final-artifact inconsistency found in reviewed scope. This scoped result does not establish every concurrency interleaving or external settlement. Whole Phase 3E PASS remains unsupported while F-02/F-03 stay open: composer financial posting, approved historical balances/settlement and complete browser acceptance remain unproven. Final decision: BLOCKED / NOT DECOUPLED; Phase 3F not ready. No production/provider mutation or runtime/test edit occurred; only this QA report changed.

