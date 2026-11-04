# Phase 3D storage authorization matrix

Agent C review, 2026-10-29. Scope: local synthetic tests only. No production/server access.

Evidence: `backend/test/phase3d-media-security.test.ts`, `backend/test/media.test.ts`, `backend/test/media-live.test.ts`.

| Boundary | Actor / attack | Required result | Evidence / status |
| --- | --- | --- | --- |
| Upload and signing HTTP | Missing or invalid token | 401; zero storage calls | PASS |
| Upload and signing HTTP | Inactive/suspended account, including admin | 403; zero storage calls | PASS |
| Object download/delete/existence/signing | Stranger; blank identity with admin role | FORBIDDEN; metadata/bytes preserved | PASS, memory adapter |
| Ownership source | Body ownerId/role/roles/visibility; forged identity headers | Extra body fields rejected; headers do not grant access | PASS |
| Stale role | Same token; auth resolver changes admin to user | New signing request denied 403 | PASS, injected auth; DB freshness not proven |
| Stale account | Same token; account suspended/deleted | Signing denied 403/401 | PASS, injected auth; real session revocation not proven |
| Upload validation | Claimed PNG with text bytes; unsupported MIME; malformed/mismatching checksum | INVALID_INPUT before metadata insert | PASS |
| Upload HTTP | Wrong MIME bytes / checksum | 400; valid control returns private owned object | PASS, test adapter bridge |
| Signed completion | Foreign actor | FORBIDDEN before provider byte access | PASS, mocked S3 transport |
| Pending upload | Owner attempts download/signing before completion | NOT_FOUND; no final object | PASS, mocked S3 transport |
| Signed completion integrity | Wrong Content-Type, size or checksum | INVALID_INPUT; no ready flag or final bytes | PASS, mocked S3 transport |
| Signed PUT replay | Invalid staged bytes after successful completion | Rejected; verified final bytes preserved | PASS, mocked S3 transport |
| Artist/label scope | Current label versus reassigned label | Current authoritative roster only | PASS, actual mediaAuthority/repositories with synthetic SQL transport |
| Stale domain authority | Old admin principal with current user role or suspended account | Fresh repository roles/status override stale principal | PASS, synthetic SQL; real DB/concurrency not proven |
| Release write state | Submitted/approved/active or archived release | MEDIA_RESOURCE_LOCKED; nonarchived read allowed | PASS, actual mediaAuthority with synthetic SQL |
| Media input contract | Public visibility, spoofed owner, wrong resource, bad checksum/path/size | Reject before service mutation | PASS, actual validateUpload |
| Legal attachment creation | COPYRIGHT_DOCUMENT without case authority | MEDIA_CATEGORY_UNSUPPORTED | PASS, actual validateUpload |
| Stale transfer authority | Label transfer/concurrent stale principal reuse | Fresh DB authorization; revoked actor denied | PASS, disposable PostgreSQL lock/barrier test |
| Release/track attachment | Foreign asset, wrong parent/ineligible state | Reject without attachment/mutation | PASS, disposable PostgreSQL service test |
| Public projection | Anonymous full audio access | Deny private bytes and signing; safe public projection only | PASS, real API/catalog test; legal attachments remain unsupported |

Issued signed URLs are bearer capabilities until short expiry. Denying new signing after role removal does not revoke an already issued capability. Disposable RustFS acceptance verifies private bucket behavior, signature tamper/expiry and CORS; it is not production provider evidence.

Run from `backend`: `npx tsx --test test/phase3d-media-security.test.ts test/storage.test.ts test/storage-s3.test.ts`.

## Final settings-media matrix

| Operation | Ordinary user | Admin/superadmin | Anonymous |
| --- | --- | --- | --- |
| Request/finalize branding | 404 fail-closed | PASS on fixed resource and valid variant | 401 |
| Read arbitrary media UUID | 404/401 without authority | Existing resource policy | 401 |
| Read branding key | N/A | N/A | PASS only for three allowlisted keys; arbitrary key 400/404 |
| Replace branding | Denied | PASS; previous metadata REPLACED after new verification | Receives current active binding only |
| Forge settings media UUID | Denied | `MEDIA_REFERENCE_INVALID` | No arbitrary object lookup |