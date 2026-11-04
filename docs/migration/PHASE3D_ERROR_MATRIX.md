# Phase3D API / live storage error matrix

## Final corrected contract (2026-10-29)

The two defects described under "Source defects found" are historical: `backend/src/api/media.ts` now uses Zod input-mode schema for optional upload defaults and documents HTTP 413/415. Updated `backend/test/phase3d-error-matrix.test.ts` asserts HTTP 200 with omitted defaults and both OpenAPI responses. Additional real PostgreSQL/RustFS test proves admin-only branding intent, anonymous allowlisted media redirect, signed byte retrieval, settings binding, replacement, forged-reference denial, and arbitrary-key denial. Focused matrix: **8 passed, 0 failed, 0 skipped**. Full backend fixture: **168 passed, 0 failed, 0 skipped, 0 TODO**. Initial characterization below remains provenance, not current defect state.

Run from repository root (Node 22–24, installed backend dependencies, local Docker Desktop Linux engine):

```powershell
Push-Location backend
npx tsx --test test/phase3d-error-matrix.test.ts
Pop-Location
```

No environment variables or existing services required. Test refuses a Docker context without a local named-pipe endpoint. It creates UUID-named PostgreSQL 17 and RustFS 1.0.4 containers, ephemeral loopback ports, synthetic identities and credentials, migrates a fresh database, and uses the restricted runtime DB role. Cleanup hooks close API/clients/pools and remove only those containers and their volumes. No production, SSH, Supabase, repository configuration, or application source changes.

Requests use real loopback HTTP through `buildApp`, media routes, service, PostgreSQL, and RustFS. Authentication is a synthetic dependency, not a JWT/identity-provider integration test. Controlled 500 replaces only the object-store verification boundary; all other storage calls use live RustFS.

| Trigger | Expected result | Invariant / recovery |
| --- | --- | --- |
| Malformed resource UUID | 400 `BAD_REQUEST` | No media row inserted |
| Missing bearer / invalid token | 401 `UNAUTHORIZED` | Valid body used to reach authentication; no media row |
| Suspended authenticated principal | 403 `FORBIDDEN` | No media row |
| Unknown object UUID | 404 `NOT_FOUND` | Safe API envelope |
| Declared avatar size over 5 MiB | 400 `MEDIA_SIZE_LIMIT` | Domain size limit, not transport 413 |
| Disallowed MIME / extension pairing | 400 `MEDIA_MIME_INVALID` | Domain MIME check, not transport 415 |
| JSON body over 1 MiB | 413 `BAD_REQUEST` | Fastify transport limit |
| `application/octet-stream` API request body | 415 `BAD_REQUEST` | Fastify unsupported content type |
| Complete intent without uploaded object | 409 `MEDIA_BYTES_MISSING` | Pending; retry possible |
| Controlled provider exception during completion | 500 `INTERNAL_ERROR` | Synthetic private error text absent; row pending and profile unbound |
| Complete expired DB intent | 409 `MEDIA_UPLOAD_EXPIRED` | No activation |
| Interrupt signed PUT after 8 of 24 declared bytes | Client disconnect; staging HEAD returns 404 | Completion returns 409; row pending; full PUT retry activates |
| Repeat successful completion | 200 | Idempotent completion |
| Tamper signed download signature | RustFS 403 | Provider response, not API JSON envelope |
| Validly sign download with past signing time / one-second TTL | RustFS 403 | Real expiry verification, not forged timestamp |
| Reuse signed download | 200 twice, original bytes | Capabilities are bearer URLs, not single-use tokens |
| Reuse staging PUT after completion | Successful PUT | Download still serves verified immutable final snapshot |
| API listener closed | `fetch` rejects with `TypeError` within bounded deadline | Network failure has no HTTP status or API error envelope |

Every asserted API error checks code, nonempty safe message, and matching body/header request ID. Provider expiry/tamper checks assert HTTP 403 separately. Interrupted upload uses an actual partially written HTTP request, not a mocked abort. Synthetic PNG contains only the signature/header required by current media validation; decoder correctness is outside this matrix.

## Source defects found (source unchanged)

1. **Upload defaults differ between HTTP and service.** `src/media/contracts.ts` gives `variant` and `visibility` defaults. `src/api/media.ts` generates request JSON Schema using Zod output semantics, making those properties required; `src/api/index.ts` disables AJV default insertion. Omitting both passes `validateUpload` but real HTTP returns 400 before authentication/service. Matrix includes an explicitly named characterization test. Source fix should generate input-mode schema or otherwise align HTTP defaults; then replace the 400 characterization with a successful request assertion.
2. **Media OpenAPI omits transport errors.** `src/api/media.ts` advertises 400/401/403/404/409/429/500/503 but not 413/415. Both occur on its upload route and retain safe API envelopes. Matrix characterizes the missing response entries; add documented responses in source and update those assertions when fixed.

Reusable capabilities are observed contract behavior, not reported as a defect. No single-use guarantee exists in current signed URL implementation. Replay checks cover identical signed content and immutable final reads, not arbitrary checksum bypass. Network case covers API connection failure; provider outage/retry policy and real browser cancellation behavior remain outside this file.

## Verification

2026-10-29: standalone command passed on local Docker Desktop with disposable PostgreSQL/RustFS. All six child cases passed (seven test-runner entries including parent), no skips. Only the two assigned test/document files changed by this task. Known-defect assertions deliberately describe current behavior and must change with their eventual source fixes.
