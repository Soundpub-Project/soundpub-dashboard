# Phase 1B Authorization Matrix

**Authorization matrix: FAIL. Agent F status: BLOCKED. Full real-user integration criterion: FAIL (not completed).**

Observed 2026-10-27, Asia/Bangkok. Production catalog checks ran approximately 04:54–05:02 Asia/Bangkok. Results apply to the captured state; concurrent agent fixes require retesting. Financial consequences and webhook checks appear in `PHASE1B_FINANCIAL_PAYMENT_REPORT.md`.

## Evidence, isolation and acceptance rules

Read the full attached request and Phase 1 baseline artifacts relevant to authorization, finances, API compatibility, source/runtime, schema and previous QA. Production access was READ ONLY SSH from the required Supabase Docker directory. No real payment/webhook, email, backup endpoint, provider, production identity or business mutation was exercised.

A separate `postgres:17-alpine` container, `soundpub-phase1b-agentf-20261027`, used `--network none`, no ports and no production mounts/data. Database `agentf_authz` loaded `docs/migration/CANONICAL_SCHEMA.sql`, minimal platform prerequisites and 11 synthetic identities. Transactions used `SET LOCAL ROLE authenticated` or `anon` and a test-only `auth.uid()` adapter. This exercises actual PostgreSQL grants/RLS/triggers/definers, not GoTrue, JWT verification, PostgREST, Storage HTTP, browser login or public Edge routing.

Exact parity with production was checked for 78 policies, 47 application triggers, anon/authenticated table grants, selected financial constraints and seven financial/guard function bodies. Hashes and caveats appear in the financial report. This supports isolated SQL findings without treating the canonical dump as a complete restore/auth stack.

All mutation probes used their own rollback boundaries or caught subtransactions; no provider could be reached. Container and disposable volume were removed after checks. Only this report and the assigned financial report were written by Agent F; concurrent worktree changes by other agents were preserved.

Result rules:

- PASS means the explicitly named check executed and matched its oracle at the stated layer.
- FAIL means unexpected access succeeded, a security requirement failed, or mandatory integration evidence remains unverified.
- “Not exercised” is a coverage gap and cannot be promoted to PASS.
- Ownership is a relationship, not an application role. Generic `user` fixtures include owner and other-owner variants.
- Inactive/suspended accounts should not retain sensitive business actions. Profile/account recovery reads may be deliberately allowed, but that needs a documented contract. Fresh token revocation/refresh behavior remains untested.

## Synthetic actors

All UUIDs in runnable fixtures are synthetic; no production identity rows are included.

| Actor | Synthetic ID suffix | Assigned role / state |
| --- | ---: | --- |
| Anonymous | None | anon, no UID |
| Normal | 001 | user, active, no owned business fixture |
| Artist | 002 | artist, active, child of label 004 |
| Owner | 003 | user, active; creator of owned release, owner of registration/payment/contracts |
| Label | 004 | label, active; owns release and managed artist |
| Other owner | 005 | user, active; owns separate release/track |
| Admin | 006 | admin, active |
| Superadmin | 007 | superadmin, active |
| Inactive | 008 | artist, inactive |
| Suspended | 009 | label, suspended |
| Copyright | 010 | copyright, active, matching synthetic composer code |
| Whitelabel | 011 | whitelabel, active |

Artist 002 and other owner 005 intentionally share `full_name = 'Shared Fixture'`. Only 005 owns the corresponding release/track; 002 has no explicit relationship to those rows. This adversarial fixture tests identity-based isolation.

## Mandatory gates

| Mandatory criterion | Result | Evidence / limit |
| --- | --- | --- |
| All requested actor categories represented | PASS in SQL fixtures | Anonymous plus 11 identities include requested categories and additional copyright/whitelabel roles. |
| Real-user end-to-end integration across major resources and operations | FAIL, not verified | Test UID/SQL-role adapter, not real JWT identities/full application stack. Many CRUD/privileged/storage cases remain unexercised. |
| Expected behavior explicit | PASS for measured cases | READ matrix and mutation table below state expected versus actual. |
| Unexpected access fails acceptance | FAIL | Two cross-owner reads; eight sensitive mutation/RPC violations. |
| Role escalation via direct user_roles INSERT/UPDATE/DELETE denied | PASS, SQL layer | 36/36 probes: anonymous and all 11 identities, including admin/superadmin; permission denial. Authorized role changes must use trusted API. |
| Financial profile write protection | PASS, tested case | Normal user's own balance UPDATE raises exact `Financial profile fields cannot be updated directly`; own safe name UPDATE succeeds. |
| Foreign release UPDATE/DELETE denial | PASS, tested cases | Normal user gets zero affected rows for both. No row was removed. |
| Trusted payment/approval transitions | FAIL | Forged paid rows, forged approved registration and owner activation of unpaid release all succeed. |
| Suspended/inactive business denial | FAIL | Inactive artist profile INSERT succeeds; suspended label payout RPC succeeds. |
| Frontend restricted route fails closed | FAIL | Null role permits superadmin-only route; inactive/suspended users pass ordinary ProtectedRoute. |
| Privileged Edge matrix, public route | FAIL, not verified here | Existing create-user mocks pass; no new public/live positive probes. Current working-tree authorization edits elsewhere are not deployment evidence. |
| Storage/contracts ownership + signed URL expiry/tamper matrix | FAIL | Live contracts public at captured snapshot; broad private-media SELECT policy; no Storage HTTP tests. |
| Independent full acceptance | FAIL | Current explicit failures and missing integration coverage block sign-off. |

SQL read suite: **168 probes, 166 matching the stated ownership oracle, 2 unexpected cross-owner reads**. Inactive/suspended rows lacked business ownership in that read suite; zero reads cannot establish status enforcement. SQL mutation suite: **14 probes, 6 PASS, 8 FAIL**, plus a separate failing sub-cent boundary check. Direct role DML: **36/36 PASS**. Frontend component fixture: **10 cases, 7 PASS, 3 FAIL**. Each failing acceptance suite must be treated as failed even if its diagnostic SQL helper itself returns exit 0.

## Observed READ matrix

Numbers are rows visible through actual SELECT; `D` means PostgreSQL permission denial. Column headers refer to actors above. For active owners, expected results are own/managed rows; admin/superadmin may read the synthetic scope. Expected anonymous results are zero or D. Bold entries violate the explicit cross-owner oracle.

| Resource | Anon | Normal | Artist | Owner | Label | Other owner | Admin | Superadmin | Inactive | Suspended | Copyright | Whitelabel |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| profiles | 0 | 1 | 1 | 1 | 2 | 1 | 11 | 11 | 1 | 1 | 1 | 1 |
| user_roles | 0 | 1 | 1 | 1 | 1 | 1 | 11 | 11 | 1 | 1 | 1 | 1 |
| releases | 0 | 0 | **1, expected 0** | 1 | 1 | 1 | 2 | 2 | 0 | 0 | 0 | 0 |
| tracks | 0 | 0 | **1, expected 0** | 1 | 1 | 1 | 2 | 2 | 0 | 0 | 0 | 0 |
| artists | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| artist_profiles | 0 | 0 | 1 | 0 | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| royalties | 0 | 0 | 1 | 0 | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| composer_royalties | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 1 | 0 |
| payout_requests | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| release_payments | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| copyright_registrations | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| copyright_contracts | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| copyright_registration_payments | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| takedown_requests | D | 0 | 0 | 0 | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |

Profile/role own reads for inactive/suspended are observed facts, not a positive suspension gate. No raw auth.users listing was granted/tested as an application API; user-management Edge operations remain separately unverified.

Root cause of the two cross-owner reads: live “Artists can view own releases/tracks” policies compare `artist_name = soundpub.get_user_full_name(auth.uid())`. They use display-name equality instead of stable identity ownership. Policy predicates do not require the artist role. Collision was deliberately synthesized; production name-collision exploitation was not probed.

## Mutation and privileged SQL matrix

All scenarios below ran against the copied canonical schema with production-equivalent relevant policies/grants/triggers. Expected denial means zero affected rows or an explicit authorization/guard exception.

| Actor / operation | Expected | Actual | Result |
| --- | --- | --- | --- |
| Owner INSERT own release payment as paid | DENY untrusted settlement | INSERT 1 | FAIL |
| Owner INSERT own copyright payment as paid with permitted fixed pricing | DENY untrusted settlement | INSERT 1 | FAIL |
| Owner INSERT copyright registration already approved with fabricated composer/contract values | DENY admin-only approval | INSERT 1 | FAIL |
| Owner UPDATE unpaid release status to active | DENY trusted publication transition | UPDATE 1 | FAIL |
| Owner UPDATE release label_id to other owner, retaining created_by | DENY unapproved ownership transfer | UPDATE 1 | FAIL |
| Normal INSERT paid payment for another owner's release, setting own user_id | DENY foreign parent/untrusted settlement | INSERT 1 | FAIL |
| Normal UPDATE foreign release title | DENY | UPDATE 0 | PASS |
| Normal DELETE foreign release | DENY | DELETE 0 | PASS |
| Normal UPDATE own safe profile full_name | ALLOW | UPDATE 1 | PASS |
| Normal UPDATE own profile balance | DENY | P0001, exact financial guard error | PASS |
| Normal INSERT own superadmin role | DENY | SQLSTATE 42501 | PASS |
| Normal direct INSERT payout request | DENY; trusted RPC required | SQLSTATE 42501 | PASS |
| Inactive artist INSERT own artist profile | DENY sensitive business write | INSERT 1 | FAIL |
| Suspended label request_payout with synthetic available balance | DENY sensitive financial action | RPC returns a payout ID | FAIL |

The last scenario runs as actual `authenticated` DB role; `request_payout` is SECURITY DEFINER and bypasses table RLS after checking label/whitelabel role, without profile-status enforcement. Canonical financial guard does not prevent authorized definer writes. Inactive profile INSERT similarly lacks active-status predicate.

A separate precision test on canonical NUMERIC(18,2) payout data accepts `0.001` while reservation retains extra precision; not an authorization escalation, but financial FAIL. Existing script's minimal fixture uses unconstrained numeric; its PASS cannot cover this boundary.

Payment INSERT policies validate only own user_id (release) or own registration/fixed price/emeterai (copyright). Payment and registration table triggers are audit/timestamp, with no trusted state gate. Release broad owner/creator FOR ALL permits activation/ownership edits under tested conditions. Findings establish SQL boundary failures; public Data API schema exposure and real JWT path were not exercised, so no production exploitation claim is made.

## Operation contract and untested cells

This table states the minimum security oracle for remaining integration work. It does not confer PASS on unexecuted actions. C/U/D mean CREATE/UPDATE/DELETE; privileged actions include approvals, identity changes, settlement, imports, publication and refunds.

| Resource | READ expected | C/U/D expected | Privileged expected | Executed coverage / gate |
| --- | --- | --- | --- | --- |
| profiles | Self, managed artist scope, admin scope; foreign deny | Safe own fields; trusted identity/financial/ownership changes; foreign deny | Identity/status/balance changes server-controlled | SELECT matrix + safe/balance UPDATE; broad C/D matrix not exercised: FAIL coverage |
| users/auth identities | No unscoped client listing | Trusted account-management API with role/target hierarchy | No non-admin create/admin elevation; superadmin targets protected | Existing create-user mocks only; real users/API matrix FAIL coverage |
| roles | Self/admin scope | Direct client DML denied for all actor roles | Trusted API, no self-escalation/admin-to-superadmin | 36 DML denials PASS; Edge positive/target hierarchy not verified here |
| artists / artist_profiles | Owner/managed/admin scope | Scoped active owner/label/admin only; no foreign reassignment | Approved review/deletion only | READ matrix; inactive INSERT FAIL; remaining C/U/D not exercised |
| releases | Stable owner/artist/label/admin scope | Scoped safe fields; no foreign writes or ownership hijack | Trusted activation, paid deletion/refund | READ leak + activation/transfer FAIL; foreign U/D denial PASS |
| tracks | Stable owner/artist/label/admin scope | Scoped release owner/admin; no foreign parent move | Trusted publication/catalog changes | READ leak FAIL; C/U/D not exercised |
| royalties / uploads | Mapped recipient/label/admin scope | No direct client financial mutation | Authorized transactional import/reverse with replay safety | READ + existing isolated financial assertions PASS; full actor RPC matrix incomplete |
| payouts / reservations / adjustments | Own or approved admin read; internal ledgers private | No direct payout/ledger client DML | Active eligible label request; authorized review; exact reservations | Direct payout INSERT denial PASS; suspended request FAIL; full role/CRUD matrix incomplete |
| copyright registrations/works/files/payments | Owner/admin scope | Owner draft fields only; no trusted-state injection | Admin approval, trusted provider payment | Forged approval/paid INSERT FAIL; files/works C/U/D not exercised |
| contracts | Authorized owner/reviewer/admin only | Trusted workflow; no unscoped public legal access | Short-lived signed download; tampered/expired deny | DB SELECT matrix PASS; bucket public snapshot FAIL; HTTP/signed-link matrix unverified |
| takedown | Requester/label/admin scope | Eligible submitter create; controlled cancel/update; no unauthorized delete | Admin review/dispatch only | READ matrix PASS; C/U/D/transition/file matrix unverified |
| storage | Intentional public assets only; private data scoped | Own/admin paths, no foreign upsert/delete | Private download URL/proxy with expiry/tamper checks | Live policy inspection FAIL; object HTTP integration not exercised |
| admin operations/settings/audit/export | Explicit permitted role; superadmin-only where intended | Server-controlled, audited, hierarchy-scoped | No anonymous/unprivileged/internal credential bypass | Frontend denial checks partial PASS; null-role FAIL; real API matrix unverified |
| privileged Edge Functions | Explicit trusted callers only | Malformed/unauthorized deny without side effects | Internal identity/JWT role, replay/expiry and rate-limit checks | No new public action probes; source review and inherited mocks insufficient: FAIL coverage |

## Frontend and API role mapping

`src/hooks/useAuth.tsx` resolves role priority as superadmin, admin, whitelabel, label, artist, copyright, user; absent role rows fall back to user. Profile status is fetched but `ProtectedRoute` does not use it. `src/components/auth/ProtectedRoute.tsx:82` only rejects a truthy role outside allowedRoles; null passes the restricted route. UI results do not by themselves prove DB access.

| Route family | Declared frontend admission | Backend contract / observed issue |
| --- | --- | --- |
| Dashboard, releases, tracks, royalties, analytics, summary, settings, payment callback | Any authenticated user | Ownership/RLS must restrict data/actions; name-based reads and owner state writes FAIL. |
| Takedown | superadmin/admin/label/artist | SQL eligibility/ownership; user/whitelabel not in route list. Full action matrix unverified. |
| Payouts, my-artists, artist-deletion-requests | label/artist/user/whitelabel; superadmin bypass | request_payout accepts label/whitelabel only. Artist/user route admission is not payout-write permission; document eligibility in UI. |
| Artist profile | artist; superadmin bypass | Owner/managed/admin SQL scope. |
| Whitelabel dashboard | whitelabel or admin/superadmin | Cross-owner and active-state enforcement still required. |
| Copyright dashboard | copyright or admin/superadmin | Composer code mapping; no real-user positive tests. |
| Copyright onboarding/status | All declared roles | Registration/payment trusted fields must remain protected; forged approval/paid INSERT FAIL. |
| Users, upload, admin-payouts, composer-royalties, media, all-royalties, notifications, payment settings/management, invoices, copyright review/uploads/history | admin/superadmin | Backend authorization required; four composer RPCs absent. |
| Audit logs, export | superadmin via allowedRoles | Null-role fixture incorrectly admitted: FAIL. |

Component tests: anonymous redirects `/auth`; normal/artist/label admin-route requests redirect `/dashboard`; admin is allowed; superadmin allowedRoles override works; normal denied superadmin-only. FAIL: null-role restricted route allows content; inactive/suspended ordinary protected routes allow content.

| Edge API | Required authorization / source evidence | Agent F result |
| --- | --- | --- |
| create-user | Verified bearer, active caller, scoped role hierarchy in patched repo | Existing unit/mock suite PASS; current public-route/full identity matrix unverified here. |
| update-user-role | Admin/superadmin, no self-change, no admin grant/change of superadmin | Source check only; no full integration PASS. |
| delete-user / update-user-status / update-user-password | Trusted actor with target/role ownership rules | Source/baseline only; actual target matrix remains unverified. |
| start-user-impersonation / update-app-settings | Superadmin | Source/baseline only; token/revocation/end-to-end matrix remains unverified. |
| create-xendit-invoice | getUser plus admin/creator/label check | Source-equivalent mounted handler; general active-state guard absent; concurrency/recovery financial FAIL. |
| create-copyright-invoice | getUser plus owned registration/payment | Source-equivalent mounted handler; active-state guard absent; mocked duplicate-create FAIL. |
| download-release-invoice | getUser plus admin/superadmin, paid payment | Source confirms admin-only despite owner DB read. Owner download requirement not asserted; policy decision/integration tests remain. |
| process-royalty-upload / delete-royalty-upload | Authenticated admin, service-only commit/reversal RPC | Existing mocked regression PASS; real-user matrix incomplete. |
| xendit-webhook | Server callback credential, trusted settlement | Mock auth rejection PASS; replay/partial recovery FAIL; no live call. |
| send-app-email / backup-storage-to-drive | Authorized internal caller or scoped approved user; rate/replay/malformed controls | Mounted files at captured inspection still used legacy client imports. Other agents were editing working-tree auth helpers; no deployed/public acceptance inferred. No endpoint invocation. |

Baseline HTTP codes in Phase 1 reports are historical only; they are not repeated as fresh Agent F results. No public create-user or privileged endpoint gate is certified here.

## Storage findings at captured snapshot

Live `storage.buckets` reported `contracts.public = true`. Current public object count/bytes were not tested here. Bucket configuration fails private-by-default even with an empty bucket; no legal document was fetched.

Live SELECT policy `SoundPub authenticated read private buckets` allows any authenticated host user for `release-covers`, `track-audio` and `track-video` without object ownership or Soundpub membership. Public media policy allows intended avatar/logo/gallery/audio-clip buckets; public classification still needs ownership review. Upload/update/delete use first path component = UID or admin for the enumerated media buckets. Takedown storage read has requester/path/label/admin scoping. No equivalent contracts owner/admin policy was present in the eight captured policies. Full CRUD, signed URL expiry/tamper, reviewer access and shared-tenant identity behavior remain FAIL for lack of integration proof.

Concurrent working-tree contract signed-URL changes and a new private-bucket migration were visible during audit. They were not authored or deployed by Agent F and cannot retroactively change this snapshot. Retest final deployed state before coordinator sign-off.

## Required closure

HIGH blockers: move artist reads to stable recipient/ownership relationships; prohibit client-chosen financial/approval/publication/ownership state; deny inactive/suspended sensitive actions at authoritative backend boundaries; close null-role UI failure; complete private storage/contract ownership policies and integration; run actual isolated JWT/PostgREST/Storage/Edge actor × operation tests with trusted provider stubs. Preserve explicit positive tests for each permitted workflow, including internal callers.

Current evidence already violates the “unexpected access must fail” gate. More successful negative probes cannot compensate for the observed unexpected successes.

## Runnable frontend regression

Paste into Node stdin from repository root using PowerShell `@'` / `'@ | node`. Transpiles the actual component with installed TypeScript and mocks only imported rendering/auth values. Expected current result: 7 PASS, 3 FAIL, exit 1. No browser/network or file writes.

```javascript
const fs=require('node:fs'), vm=require('node:vm'), ts=require('typescript'), assert=require('node:assert/strict');
let state={}; const exportsObject={};
const source=ts.transpileModule(fs.readFileSync('src/components/auth/ProtectedRoute.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
vm.runInNewContext(source,{exports:exportsObject,require(name){
if(name==='react/jsx-runtime') return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'};
if(name==='react-router-dom') return {Navigate:'Navigate'};
if(name==='@/hooks/useAuth') return {useAuth:()=>state};
if(name==='lucide-react') return {Loader2:'Loader2'};
throw Error('Unexpected import '+name);
}});
let pass=0,fail=0;
function check(name,auth,props,expected){
state={user:{id:'fixture-user'},loading:false,isAdmin:false,isArtist:false,isLabel:false,isCopyright:false,isWhitelabel:false,role:'user',...auth};
const result=exportsObject.ProtectedRoute({children:'content',...props});
const actual=result.type==='Navigate'?result.props.to:'ALLOW';
try{assert.equal(actual,expected); console.log('PASS '+name);pass++;}catch{console.log('FAIL '+name+': expected='+expected+', actual='+actual);fail++;}
}
check('anonymous denied',{user:null},{},'/auth');
check('normal user admin route denied',{}, {requireAdmin:true},'/dashboard');
check('artist admin route denied',{role:'artist',isArtist:true},{requireAdmin:true},'/dashboard');
check('label admin route denied',{role:'label',isLabel:true},{requireAdmin:true},'/dashboard');
check('admin admin route allowed',{role:'admin',isAdmin:true},{requireAdmin:true},'ALLOW');
check('superadmin role-list override',{role:'superadmin',isAdmin:true},{allowedRoles:['label']},'ALLOW');
check('normal superadmin route denied',{}, {allowedRoles:['superadmin']},'/dashboard');
check('null role must deny restricted route',{role:null},{allowedRoles:['superadmin']},'/dashboard');
check('inactive sensitive route denied',{profile:{status:'inactive'}},{},'/dashboard');
check('suspended sensitive route denied',{profile:{status:'suspended'}},{},'/dashboard');
console.log(JSON.stringify({pass,fail})); process.exitCode=fail?1:0;
```

## Runnable SQL counterexamples

Run ONLY inside a disposable PostgreSQL copy with the canonical schema and synthetic seed below. Use `psql -X -v ON_ERROR_STOP=1`. SQL reads/writes here are isolated fixtures, not production-safe assertions. Platform prerequisite roles are anon/authenticated/service_role/authenticator/supabase_auth_admin; auth.users holds synthetic IDs and auth.uid() reads app.test_uid. Apply canonical DDL before seeding, with row_security enabled.

The seed requires the minimal auth prerequisites used in this audit:

```sql
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY, email text,
  raw_user_meta_data jsonb DEFAULT '{}',
  raw_app_meta_data jsonb DEFAULT '{}'
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.test_uid', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT current_user::text
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
```

Load `CANONICAL_SCHEMA.sql` into this fresh isolated database, then execute:

```sql
SET soundpub.migration_signup_label_id='00000000-0000-0000-0000-000000000004';
SET soundpub.migration_reporting_label_id='00000000-0000-0000-0000-000000000004';
INSERT INTO auth.users(id,email)
SELECT ('00000000-0000-0000-0000-' || lpad(identity::text,12,'0'))::uuid, 'fixture' || identity || '@example.invalid'
FROM generate_series(1,11) identity;
INSERT INTO soundpub.profiles(id,email,full_name,status)
SELECT id,email,CASE WHEN right(id::text,1) IN ('2','5') THEN 'Shared Fixture' ELSE 'Fixture ' || id::text END,
CASE WHEN right(id::text,1)='8' THEN 'inactive' WHEN right(id::text,1)='9' THEN 'suspended' ELSE 'active' END
FROM auth.users ORDER BY CASE WHEN id='00000000-0000-0000-0000-000000000004' THEN 0 ELSE 1 END,id;
UPDATE soundpub.profiles SET parent_label_id=NULL;
UPDATE soundpub.profiles SET parent_label_id='00000000-0000-0000-0000-000000000004' WHERE id='00000000-0000-0000-0000-000000000002';
DELETE FROM soundpub.user_roles;
INSERT INTO soundpub.user_roles(user_id,role)
SELECT id, CASE right(id::text,12)::integer WHEN 2 THEN 'artist' WHEN 4 THEN 'label' WHEN 6 THEN 'admin' WHEN 7 THEN 'superadmin' WHEN 8 THEN 'artist' WHEN 9 THEN 'label' WHEN 10 THEN 'copyright' WHEN 11 THEN 'whitelabel' ELSE 'user' END::soundpub.app_role FROM auth.users;
INSERT INTO soundpub.releases(id,title,artist_name,label_id,created_by,status)
VALUES ('10000000-0000-0000-0000-000000000001','Owned Fixture','Owner Fixture','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000003','pending'),
('10000000-0000-0000-0000-000000000002','Other Fixture','Shared Fixture','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000005','pending');
INSERT INTO soundpub.copyright_registrations(id,user_id,legal_name,email)
VALUES ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','Fixture','fixture3@example.invalid');
SELECT 'seed_complete' result;

```

This single counterexample is a runnable assertion with failure on the unexpected success. Current canonical state fails with `Unauthorized paid release payment was accepted`; outer transaction rolls back when the connection closes after ON_ERROR_STOP. The attempted insertion runs under authenticated, not postgres/service_role:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'app.test_uid','00000000-0000-0000-0000-000000000003',true
);
DO $$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    INSERT INTO soundpub.release_payments(
      release_id,user_id,amount,status,xendit_invoice_id
    ) VALUES (
      '10000000-0000-0000-0000-000000000001',
      auth.uid(),100,'paid','forged-fixture'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'Unauthorized paid release payment was accepted';
  END IF;
END $$;
ROLLBACK;
```

To reproduce the name-collision read, use the same seed (release row 002 has artist_name Shared Fixture but belongs to actor 005):

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'app.test_uid','00000000-0000-0000-0000-000000000002',true
);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM soundpub.releases
    WHERE id='10000000-0000-0000-0000-000000000002'
  ) THEN
    RAISE EXCEPTION 'Cross-owner release readable through display name';
  END IF;
END $$;
ROLLBACK;
```

These targeted assertions preserve executable evidence without creating test/code files outside the two assigned reports. They do not replace the full missing integration matrix.

