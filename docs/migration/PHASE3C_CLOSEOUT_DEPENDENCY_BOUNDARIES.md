# Phase 3C closeout dependency boundaries

Implementation: `backend/src/submissions/index.ts`. No real integrations, provider activation, refunds, shared Supabase access, production credentials or imported data.

| Blocker code | Exactly one owner |
| --- | --- |
| RELEASE_STATE_INVALID | PHASE3C |
| RELEASE_METADATA_REQUIRED | PHASE3C |
| TRACKS_REQUIRED | PHASE3C |
| TRACK_METADATA_REQUIRED | PHASE3C |
| OWNERSHIP_REQUIRED | PHASE3C |
| COVER_REQUIRED | PHASE3D_STORAGE |
| AUDIO_REQUIRED | PHASE3D_STORAGE |
| MEDIA_UNAVAILABLE | PHASE3D_STORAGE |
| PAYMENT_REQUIRED | PHASE3E_PAYMENT |
| PAYMENT_UNAVAILABLE | PHASE3E_PAYMENT |
| PROVIDER_METADATA_REQUIRED | LATER_PROVIDER |
| PROVIDER_UNAVAILABLE | LATER_PROVIDER |

All dependencies receive `SubmissionContext { db, release, tracks }`, sourced by backend under transaction locks. Implementations are trusted server code, never request input. They must inspect authoritative, transaction-consistent state; no HTTP, upload, charge, activation or other external effect inside this transaction. They must not mutate context or DB. Missing adapter, thrown error, malformed response or any result other than explicit `true` fails closed. Internal adapter exception text is not returned.

## Phase 3D Storage

`media.check(context): Promise<{ cover: boolean; audio: boolean }>`

`cover` confirms an owned, attached, durable, validated and submission-eligible cover for this Release. `audio` confirms equivalent verified media for every supplied Track. URLs alone do not prove existence, ownership or validation. Lifecycle changes must participate in Release parent locking/version discipline. Upload, signing, playback, scanning and cleanup remain deferred.

## Phase 3E Payment

`payment.isReleasePaymentSatisfied(context): Promise<boolean>`

True requires verified server payment state or authoritative exemption under future payment policy. Never trust browser state or generic webhook acknowledgement. Settlement/amount/currency verification, invoice, callback, refund and accounting remain deferred. Positive readiness does not mark payment confirmed, create an invoice, charge money or advance to `pending_paid`. Refund owner: PHASE3E_PAYMENT.

## Later provider

`provider.providerReady(context): Promise<boolean>`

True means provider-required submission metadata is valid for this exact locked aggregate. Missing adapter is unavailable. False means metadata readiness failed. Adapter performs no activation or distribution. Provider-specific error detail can be added when actual provider contract is accepted. Activation owner: LATER_PROVIDER.

## Test adapters and runtime

Synthetic adapters exist only in `backend/test/submissions.test.ts`, injected directly into service constructor. Runtime `createSubmissionService(pool)` supplies none and therefore yields MEDIA_UNAVAILABLE, PAYMENT_UNAVAILABLE and PROVIDER_UNAVAILABLE for an otherwise valid draft. No environment/header/body switch can enable fixtures.

These boundaries represent deferred work explicitly; they do not claim full Storage/payment/provider parity. Generic Release PATCH submission bypass is closed; it now returns 409. Restore also fails closed until its full dependency contract exists.

## Executed fixture evidence

Recorded 2026-10-28 (Asia/Bangkok): `npm run typecheck` exited 0; `npx tsx --test test/submissions.test.ts` exited 0 with **1 passed, 0 failed, 0 skipped**. Test source: `backend/test/submissions.test.ts`. Disposable database helper: `backend/test/support/concurrency-postgres.ts`; it verifies local Docker Desktop, binds PostgreSQL to loopback, asserts runtime role `soundpub_app`, applies migrations and removes its container after testing.

| Injected fixture | Expected and asserted outcome |
| --- | --- |
| No adapters | MEDIA_UNAVAILABLE, PAYMENT_UNAVAILABLE, PROVIDER_UNAVAILABLE; default HTTP submit blocked |
| Media cover false / audio true | COVER_REQUIRED; submit blocked |
| Media cover true / audio false | AUDIO_REQUIRED; submit blocked |
| Payment false | PAYMENT_REQUIRED; submit blocked |
| Provider false | PROVIDER_METADATA_REQUIRED; submit blocked |
| Media/payment/provider throws, tested separately | MEDIA_UNAVAILABLE / PAYMENT_UNAVAILABLE / PROVIDER_UNAVAILABLE; submit blocked |
| All synthetic adapter results true | Ready; exactly one concurrent draft submission commits to pending; rejected revision submits successfully |

Owner mapping is asserted for default unavailable blockers against `blockerOwners`. Strict request-body rejection proves browser payment assertions cannot substitute for adapters. Malformed adapter return handling is implemented by explicit true checks and exception handling; malformed-return cases were not independently exercised by this recorded test. No production credentials, data, traffic, provider endpoint or shared Supabase mutation participates in these fixtures.
