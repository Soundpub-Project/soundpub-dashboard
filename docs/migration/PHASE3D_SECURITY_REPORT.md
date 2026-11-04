# Phase 3D security report

Agent C, 2026-10-29. Requested authorization gates: PASS within execution boundaries below. All three former TODOs replaced by runnable assertions. No source changes.

## Executed evidence

From `backend`:

```
npx tsx --test test/phase3d-media-security.test.ts test/storage.test.ts test/storage-s3.test.ts
npm run typecheck
```

Results: 21 tests pass, 0 fail, 0 skipped, 0 TODO; typecheck passes. Owned security file contributes 13 passing tests. Earlier media TS2345 and audit-settings TS2339 failures are absent in current typecheck.

## Replaced mandatory gates

1. Transfer stale authority concurrency: disposable PostgreSQL runs actual labelsInTransaction.transfer and mediaAuthority with separate connections. Transfer holds user/resource locks; pg_stat_activity and pg_blocking_pids prove media authorization waits on transfer transaction. After commit, in-flight old-label authorization returns 404; reused old-label principal cannot request a track upload. No provider call occurs for denied attempts. New label can request upload. Historical release label remains old label, demonstrating historical ownership does not grant current media authority. Release artist ownership is immutable by DB guard; test uses supported artist-label transfer, not an artificial release-owner update.
2. Foreign resource binding/ineligible state: unrelated artist cannot request upload against foreign track or finalize its intent. Completion rejects pending/processing/active/inactive release states with MEDIA_RESOURCE_LOCKED. Track remains unattached and intent remains PENDING; no verification/provider work occurs. Draft control finalizes successfully. Removing canonical track attachment then denies download of otherwise ACTIVE object. Existing strict-contract tests also reject category/resource-type mismatch and spoofed owner fields.
3. Private media/public catalog: actual buildApp media routes and public catalog service run against disposable PostgreSQL. Anonymous object metadata/download requests return 401; unrelated authenticated artist gets 404. Denied requests never sign bytes. Authorized artist download succeeds with Cache-Control: no-store. Anonymous active-release detail/list return null cover/audio/clip URLs and omit media ID, signed capability, private URLs, lyrics, object keys and checksums. COPYRIGHT_DOCUMENT creation remains fail-closed with MEDIA_CATEGORY_UNSUPPORTED; no legal-document case authority is enabled or claimed.

Other passing evidence: account/status/role denial, stale injected admin grant removal, MIME/checksum validation, pending download denial, signed completion integrity, replay preservation and safe DTO projection.

## Precise limits

- New domain cases use dedicated disposable PostgreSQL through existing concurrencyPostgres helper: Docker Desktop named-pipe context is verified, random containers bind only loopback, migrations run twice, restricted soundpub_app role executes service calls. Containers and pools close after tests. No production or shared DB used.
- Object storage in domain cases is a synthetic MediaObjectStore. Existing foundation S3 tests mock transport while running real presigner. This run does not independently establish real RustFS anonymous GET, signature expiry, bucket privacy or byte decoding. User-reported media-live success is context, not counted as independent execution here.
- Role/status tests include injected auth and repository SQL transport cases. Transfer test establishes actual DB freshness and blocking for supported label transfer; no exhaustive race coverage for every mutation is claimed.
- Format signatures are not full decoding, audio integrity or malware scanning. Previously issued signed URLs remain bearer capabilities until expiry/provider invalidation; denial of new signing does not establish immediate revocation.
- PHASE3D_STORAGE_AUTHORIZATION_MATRIX.md retains earlier draft TODO labels; this updated executed report and owned test supersede those entries. Matrix intentionally untouched in this follow-up's test/report-only scope.

## Failures and containment

No final runtime/test/typecheck failure remains. Initial fixture attempts hit required label/parent constraints and immutable release ownership guard; test fixtures were corrected to real supported transfer contract. No production code was changed to accommodate tests.

Follow-up edits only: backend/test/phase3d-media-security.test.ts and this report. Existing dirty work preserved. No SSH, Supabase service, production endpoint, production credentials or deployment accessed.

## Final closeout security result

PASS. Added real PostgreSQL/RustFS branding authorization/replacement/public-read coverage, full HTTP/storage error matrix, signed URL tamper/expiry checks, six deterministic races, inactive-role revalidation, strict audit detail projection and backend-mode export/Realtime guards. Backend security/isolation scan passes. Storage remains local-only and rejects non-loopback provider endpoints. No shared Supabase/production host or credential used.