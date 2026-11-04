# Phase 1C independent adversarial QA

Assessment: 2026-10-27, approximately 08:42–08:47 Asia/Bangkok. Agent I owns only this report.

**INDEPENDENT QA = FAIL. PHASE 1C = BLOCKED. PHASE 2 = NOT READY.** Mandatory failed or unknown gates override readiness. No score of 85/100 or zero-critical finding state is independently established. Prior readiness 50/100 is a coordinator baseline, not a recalculated QA result.

## Method and evidence boundaries

Implementation reports were treated as leads, never acceptance evidence. Independent checks used current source, isolated local tests, public HTTP responses, and direct SSH to `maskhar@20.20.20.3`. Every remote Compose/database operation began in `/data/supabase/instances/supabase-01/config`. Production SQL used explicit READ ONLY transactions and bounded statement timeouts. No deployment, restart, credential rotation, production SQL write, account creation, provider callback or payment request was performed. No secret values or secret fingerprints appear here.

**Safety exception:** six public function GET requests used synthetic invalid Bearer credentials. This incorrectly assumed GET was safe for unknown deployed handlers. `backup-storage-to-drive` returned 200 on both hosts. A subsequent read-only query found one backup run started `2026-10-27 01:44:13.435483+00`, status `failed`, within the probe window. Without a before-count or request-level correlation, attribution and external transfer effects are UNKNOWN. The request may have triggered backup processing, contrary to this assignment's restriction. All further public function probes stopped. Do not repeat GET against these handlers; require source-confirmed no-side-effect paths or isolated fixtures. This report does not claim production remained unchanged by HTTP probes.

## Independent mandatory-gate assessment

| Gate | QA result | Independent evidence or exact missing proof |
|---|---|---|
| Credential incident closed | FAIL | Two current configured privileged credentials still occur in retained transcript; comparison below. |
| Credential rotation / old revocation | FAIL / UNKNOWN | Same configured values remain; no independent replacement-success/old-rejection evidence. No stolen credential sent to any public host. |
| Public `.com` ownership/routing | UNKNOWN | `.com` advertises Kong 3.9.1; `.space` does not. No independently verified Cloudflare account, upstream, runtime/mount mapping or rollback for `.com`. |
| Public create-user authorization | UNKNOWN | Invalid-token GET returns 400 on `.com`, 405 on `.space`; neither proves required POST role authorization. No creation payload sent. |
| Privileged email authorization | FAIL verification gate | Invalid-token GET returns 500 on both hosts; no intended caller integration proof. Deployed source differs from local secured source. |
| Privileged backup authorization | FAIL | Invalid-token GET returns 200 on both hosts; recent failed run requires incident review. Deployed source differs from local secured source. |
| Contracts workflow | FAIL | Live bucket private, zero objects, zero object policies mentioning contracts. Real owner/admin/reviewer access, lifecycle and genuine signed URL expiry/tamper untested. |
| SECURITY DEFINER | FAIL | Production catalog assertions fail five gates, including client-executable maintenance and anonymous metadata helpers. |
| Tenant isolation | FAIL | Live private-media SELECT policy restricts bucket only, with no object/tenant ownership predicate. Isolated baseline disclosure reproduced. Full real-role database matrix remains unverified. |
| Clean database reproducibility | FAIL | First fresh limited application baseline matches live; second runner iteration fails connecting to PostgreSQL socket. Genuine Auth/Storage platform not initialized by runner. |
| Missing active RPCs | FAIL | All-schema production search independently finds four absent names listed below. |
| Auth ownership / feasibility | UNKNOWN / FAIL verification gate | 211 auth users, 182 profiles, 19 profile-less audit targets independently counted. Exclusive/shared identity disposition, provider linking, password target and session recovery unverified. |
| External storage recovery | UNKNOWN | Manifest inventory has 407 current external identities and 12 history-only identities; no independent recovered-byte/disposition proof. |
| Storage ownership | UNKNOWN | 1,533 observation rows are not a final approved ownership/content-checksum manifest. Full source coverage, extra logos, legal retention and required bytes unverified. |
| Off-host DB/storage backup | UNKNOWN | No independently accessible approved encrypted destination, custody, retention or authenticated readback established. Same-host archives do not satisfy gate. |
| Restore from off-host / application restore | UNKNOWN | No independent off-host source retrieval or isolated full application E2E restore was available. |
| Financial integrity | FAIL | Read-only reconciliation returns 15 passing and five failing checks; exact counts below. |
| Xendit idempotency/recovery | FAIL verification gate | Local webhook mock 41/41; mounted source differs from current workspace. No real DB/sandbox durable recovery proof; invoice-creation failures remain reported, not independently rerun here. |
| Real-role authorization matrix | UNKNOWN | Isolated contracts adapter is not GoTrue/JWT/Storage HTTP integration; full resource/operation/status matrix absent. |
| Public frontend cleanup | FAIL | Actual `dashboard.soundpub.xyz` still serves real debug pages and schema export. |
| Readiness / zero critical / independent QA | NOT ESTABLISHED / NOT ESTABLISHED / FAIL | Exposed privileged credentials and mandatory failures prevent closure regardless of arithmetic score. |

## Credential evidence

Independent Node process captured only SHA-256 digests of current `api-gw` Compose environment values over SSH into process memory, then hashed candidate strings in retained transcript locally. Only boolean equality results were emitted; neither secrets nor digests were printed or persisted.

Transcript inspected: `C:/Users/bimok/.codex/sessions/2026/10/27/rollout-2026-10-27T04-52-58-01a17a33-d1b1-7fd2-9950-8feae055960a.jsonl`.

| Current configured credential | Exact occurrence in retained transcript |
|---|---|
| `SUPABASE_SECRET_KEY` | true |
| `SERVICE_ROLE_KEY_ASYMMETRIC` | true |

This proves retained current configured material, not successful HTTP authentication or exhaustive exposure scope. Revocation at every verifier, shared signing-key retirement, consumer updates and session recovery remain unverified. Incident cannot be CLOSED.

## Public requests

GET only, header `Authorization: Bearer phase1c-invalid-token`, query `phase1c_probe=independent-agent-i`. No valid production credentials or payloads. HTTP status alone never establishes endpoint authorization or successful side effects.

| Host | Handler | HTTP | CF-RAY | Kong request ID |
|---|---|---:|---|---|
| supabase.carubra.com | create-user | 400 | a50e039ead51fd7d-SIN | 06f76b2db138f00458e3936cbd604f30 |
| supabase.carubra.com | send-app-email | 500 | a50e039fe901fd7d-SIN | 32a11b18a404250daec94d72e484e13e |
| supabase.carubra.com | backup-storage-to-drive | 200 | a50e03a0fbb6fd7d-SIN | a88efd22d5cf8d0cd6fb3c3b26ae106e |
| supabase.carubra.space | create-user | 405 | a50e03a2ea613f8d-SIN | absent |
| supabase.carubra.space | send-app-email | 500 | a50e03a6e888fe09-SIN | absent |
| supabase.carubra.space | backup-storage-to-drive | 200 | a50e03a9bfad3f8d-SIN | absent |

`.com` responses carry `via: 1.1 kong/3.9.1`. These differences do not locate its origin. Public normal-user/artist/label/admin-elevation/privileged-positive/expired-token cases remain UNKNOWN.

Mounted source SHA-256 independently read from controlled server:

| Handler | Mounted source | Current local source |
|---|---|---|
| xendit-webhook | `39fa53bb922f64be772b47f77d9a2891fe5cbe2fe8bd1c8284eb875bf910acbb` | `e4a36a4675c67c8791891bc8f48bd82168e228658ff57c09c102325d20448970` |
| backup-storage-to-drive | `6bbfbf3091ada52201dfabb5cec5e502e919b8ec017e1c17cbe79e43ddf07130` | `d7708c39e063ab30f8161cb84e4352638d90482738248c3500e7c390c796b460` |
| send-app-email | `bc51345a1021ec8856c0b8f50fb53a6cb059b83513429c849d50c7d9409ee1ab` | `95a57892f6a60ce34bd2b86673ce4a0ce9237f5ad0eddb420d9f3674118bcc8e` |

Mount hashes cannot attest worker memory or unknown `.com` deployment. Current local mock results cannot establish these deployed handlers' behavior.

## Database, tenant and reproduction checks

`scripts/phase1b-definer-assertions.sql` piped to SSH/Compose `psql -X -qAt -U postgres -d postgres -v ON_ERROR_STOP=1` returned fingerprint `phase1b_soundpub_catalog_v1|949|d64856ee63d5743a9e559b07b8dc7fc2d93849c1a7f4d7de05d80938d47ace4c`, then a failing assertion and local command exit 1. Five exact failures:

1. `definer missing fixed search_path`
2. `ungated orphan scan executable by client roles`
3. `ungated token cleanup executable by client roles`
4. `ungated profile name lookup executable by anon`
5. `active copyright RPC contract missing`

Catalog shows `cleanup_expired_tokens` callable by anon/authenticated with null `proconfig`; `cleanup_rate_limits` also has null `proconfig` but denies client execution. No destructive function was invoked.

Independent `pg_policies` inspection confirms `SoundPub authenticated read private buckets` SELECT expression is only `bucket_id = ANY (ARRAY['release-covers','track-audio','track-video'])`. No ownership predicate occurs in this permissive policy. An earlier narrow check for literal `qual='true'` returned zero and was insufficient; full policy inspection corrected that false-negative approach.

All-schema missing RPCs: `validate_royalty_csv_row`, `import_composer_royalties`, `get_royalty_upload_history`, `delete_royalty_upload`. `supabase_migrations.schema_migrations` absent.

Independent `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/phase1c-database-reproduction.ps1`: first fresh cluster produced the same 949-record fingerprint; staged maintenance checks and rollback parity passed; baseline private-media exposure reproduced. Second iteration failed `psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: No such file or directory`. Two fresh successes were **not** independently reproduced. Likely readiness race is an inference, not a diagnosed fix. Script uses reduced `auth.users(id)` and claim adapters, so even two successes would not prove full platform initialization.

`node scripts/phase1c-contracts-roles.test.cjs` completed with exit 0. Owner reads one fixture; admin/superadmin three; user/artist/label/other-owner/copyright zero; inactive/suspended owners each one. Expected owner-write RLS rejection occurred. Fixtures use reduced schemas and stubbed admin/claim helpers. Status access needs product policy; intended inactive behavior cannot be guessed. Production contracts private flag is true, object count zero, policies mentioning contracts zero.

## Finance and ownership

`scripts/payment_reconciliation_readonly.sql` independently executed against production in READ ONLY transaction. Twenty checks: 15 PASS, five FAIL:

| Check | Failing records |
|---|---:|
| missing_source_row | 14,474 |
| missing_upload_replay_key | 10 |
| paid_without_invoice_number | 2 |
| paid_without_pdf_path | 2 |
| upload_inserted_count | 10 |

Current allocation, artist/label/current balances, reservation amounts, negative balances, duplicate/cross-domain invoice and other passing subsets do not prove historical settlement provenance. Provider/bank evidence, precision, reversal/refund behavior, invoice/proof bytes and full restored financial equivalence remain unverified. Historical adjustment claims in implementation report were not independently reconstructed.

Independent live counts: 211 auth users; 182 Soundpub profiles; 19 distinct profile-less audit targets. These prove scope remains unresolved, not that remaining 29 identities can be excluded. Source independently shows numeric-only expiration predicate, nullable `payload.sub`, and email lookup in `sso-login`; no audience/verified-email check was located by targeted source search. Provider-console ownership, effective deployed claim enforcement, shared-user approval, password path and session revocation require behavioral evidence.

Independent CSV read: 1,533 observations; normalized provider/bucket/key-digest identities total 407 current external and 12 history-only. These are structural inventory counts; object-key digests are not byte checksums. No external byte recovery, accepted disposition, off-host transfer/readback or application restore was performed by QA. Recovery gates therefore remain UNKNOWN, regardless of historical archive checks.

## Actual dashboard public asset cleanup

Host independently verified: `https://dashboard.soundpub.xyz/`, HTTP 200, title `Soundpub Dashboard`. Missing-path control also returns application HTML, so HTTP 200 alone is insufficient. Real debug titles and SQL markers distinguish exposed assets from SPA fallback.

| Path | HTTP | Decoded response bytes | Content evidence | CF-RAY |
|---|---:|---:|---|---|
| `/cors-test.html` | 200 | 2,664 | title `CORS Test` | a50e03ae19ee89b0-SIN |
| `/test-oauth.html` | 200 | 3,453 | title `Test Google OAuth` | a50e03aedaa589b0-SIN |
| `/exports/full-schema.sql` | 200 | 76,769 | SQL CREATE markers | a50e03af7b2689b0-SIN |
| `/silent-check-sso.html` | 200 | 1,045 | retained SSO helper | a50e03b07846a742-SIN |
| `/phase1c-qa-missing-20261027` | 200 | 2,761 | title `Soundpub Dashboard` fallback | a50e03b10c8d89b0-SIN |

SQL export SHA-256: `2a0535f6ab8cc24b2ef1a837cb49d3594b7f8f045062916dff6cf9574ed4a3d4`. Bodies were processed in memory, not copied into report. Full deployed bundle sensitive-value scan was not completed; cleanup gate already fails on verified exposed assets. Differing byte counts from another agent's debug-page report do not erase these direct content findings.

## Safe local checks and final artifact refresh

Independently rerun: `node scripts/phase1-edge-security.test.cjs` PASS; `node scripts/phase1b-privileged-api-security.test.cjs` PASS; `node scripts/phase1b-contracts-security.test.cjs` 2/2 PASS; `node scripts/xendit-idempotency.test.cjs` 41 PASS / 0 FAIL. These use source/mocks and do not count as public integration. Contracts SQL adapter passed; reproduction runner failed on second iteration as above. Combined shell exit success after later tests does not override the earlier runner error.

Before final report, reread current auth, storage ownership, external recovery, financial and Xendit reports. Auth/storage files had modification time approximately 08:43:15 ICT; financial/Xendit 08:44:26 ICT. Newly completed finance report acknowledges a webhook deployment/restart before coordinator lock, later local-only edits, invoice creation 1 PASS / 2 FAIL and missing durable recovery. Independently verified mounted hash mismatch supports deployment divergence; invoice-creation result remains explicitly implementation evidence, not an independent test result. Latest reports do not supply missing ownership, recovery or integration proof.

Required closure remains: contain/rotate/revoke exposed material with tested recovery; prove controlled public routing; deploy and behaviorally test privileged authorization; review possible probe-induced backup run; close contracts/definer/tenant defects; reproduce genuine platform and resolve four RPCs; approve identity/object scope and recover bytes; verify encrypted off-host readback and full isolated restore; resolve finance/provenance and durable payment recovery; complete actual-role matrix; remove exposed assets from actual dashboard host; independently rerun every mandatory gate. No production remediation is authorized or performed by this QA report.
