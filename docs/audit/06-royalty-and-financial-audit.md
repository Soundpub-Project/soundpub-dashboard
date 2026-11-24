# 06 — Royalty and Financial Audit

Status: **BACKEND AUTHORITATIVE LOGIC PRESENT; LEGACY FRONTEND SPLIT STILL ACTIVE**

## Legacy financial flow

- Admin royalty CSV required/optional columns: `src/pages/UploadRoyalty.tsx:115-126`.
- Quote-aware CSV parser: `src/pages/UploadRoyalty.tsx:128-165`.
- Header, format, ISRC/UPC, and numeric validation: `src/pages/UploadRoyalty.tsx:277-423`.
- Direct legacy lookups in `releases`, `tracks`, and `profiles`: `src/pages/UploadRoyalty.tsx:472-484`.
- Admin-only client redirect: `src/pages/UploadRoyalty.tsx:248-252`.
- Split calculation: admin/SoundPub 9%, artist 70%, label remainder 21% at `src/pages/UploadRoyalty.tsx:426-453`; percentages at `:443-445` and rounding comment at `:449`.
- Preview text repeats 70% Artist / 21% Label / 9% Admin at `src/pages/UploadRoyalty.tsx:1261-1298`; same system-share text appears in `src/pages/RoyaltySummary.tsx:538,590,650`.
- Legacy ingestion invokes Supabase function `process-royalty-upload` with parsed rows and a bearer header at `src/pages/UploadRoyalty.tsx:676-696`; deletion path at `:794`.
- Composer/copyright CSV paths use simpler parsers and direct RPC/insert paths: `src/pages/CopyrightRoyaltyUpload.tsx:86-124,137,186` and `src/components/royalty/ComposerRoyaltyUpload.tsx:78-172,267-275`.

Risk: the browser computes and displays a split before ingestion. Until backend mode is default, users can observe legacy values that may not match backend allocation semantics.

## Backend authoritative financial logic

- Money is IDR-only, two-decimal accounting precision, `BigInt` minor units, and `MAX_MINOR` at `backend/src/finance/money.ts:3-15`.
- Formatting and approved-boundary half-away-from-zero rounding are at `backend/src/finance/money.ts:18-29`.
- Legacy policy constant is `SOUNDPUB_LEGACY_70_21_9`, with `HALF_UP_PER_ROW`, label remainder, version 1, and SHA-256 checksum at `backend/src/royalties/split.ts:4-14`.
- Split and same-owner aggregation are at `backend/src/royalties/split.ts:24-50`.
- Royalty contracts enforce strict IDR rows, month period, max 1000 rows, SHA-256 fingerprint, and minor/decimal conversion at `backend/src/royalties/contracts.ts:6-39`.
- Transactional commit writes audit log, outbox, and ledger posting with `royalty:earning:` / `royalty:correction:` idempotency keys (`backend/src/royalties/index.ts:111-130`).
- Commit/advisory lock/stale-checksum/period-conflict/batch/entries/allocations/earnings/replay checks are at `backend/src/royalties/index.ts:750-802`.
- Reconciliation requires an independent reviewer; the uploader cannot reconcile their own batch (`backend/src/royalties/index.ts:1003-1039`, especially `:1006`).
- Matched audit/outbox/reconciliation records are written at `backend/src/royalties/index.ts:1017-1036`.
- Corrections are append-only full reversals: correction row, reversal ledger event, and `VOIDED_WITH_OFFSET` audit (`backend/src/royalties/index.ts:1041-1062`).
- Reconciliation inspection compares entry count/total, allocation totals, owner expected vs actual ledger minor units, finance audit/outbox integrity, and snapshot checksum (`backend/src/royalties/reconciliation.ts:8-63`).
- Notifications proceed only on `MATCHED`, valid SHA-256 checksum, intact reconciliation, and noncorrected batch (`backend/src/royalties/notification-handler.ts:7-28`).
- Composer royalties use unsigned integer total/amount strings (`backend/src/composer-royalties/contracts.ts:41-63`), verify active `copyright` beneficiaries, store policy/checksum, and post exact minor-unit events (`backend/src/composer-royalties/index.ts:118-139`).
- Composer uploader self-reconciliation is rejected (`backend/src/composer-royalties/index.ts:224-232`) and mapping targets must be active with `copyright` role (`:266-278`).

## Backend frontend adapter

- Royalty adapter covers intent, complete, session polling, approve, commit, preview/commit, and reconciliation (`src/api/royalties.ts:233-294`).
- `BackendRoyaltyImport` performs private upload plus preview (`src/components/finance/BackendRoyaltyImport.tsx:158-184`), approve/commit (`:187-215`), and reconciliation/replacement (`:230-296`).
- Backend mode states the split is read from backend staging rather than browser samples (`src/components/finance/BackendRoyaltyImport.tsx:86`).
- Royalty analytics switch between backend API and legacy Supabase RPCs (`src/hooks/useRoyaltyData.ts:1,10-267`).

## Parity requirements

Before cutover, prove with fixtures and reconciliation reports that:

1. 70/21/9 allocation matches for representative and edge-case rows.
2. Half-up per-row rounding matches old financial expectations or any difference is explicitly approved.
3. Same-owner aggregation does not change payout semantics.
4. Checksum-bound preview and commit prevent stale or modified uploads.
5. Independent reconciliation and append-only corrections are understood by operators.
6. Composer/copyright royalties use the same authoritative beneficiary checks and minor-unit behavior.
7. No legacy write path remains enabled for the same financial domain.

## Finding

Backend financial logic is the strongest part of the replacement and should remain authoritative. The unresolved risk is dual operation: legacy frontend split calculation and Supabase ingestion remain available. Financial cutover must be gated on parity evidence and legacy-path disablement.
