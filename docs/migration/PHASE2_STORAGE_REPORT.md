# Phase 2 storage report

Evidence: 2026-10-28, approximately 02:00–02:03 UTC. Status: scoped self-checks PASS; live storage acceptance NOT ESTABLISHED by this update. This supersedes stale implementation descriptions in the previous report. Author implemented MIME validation; these MIME checks are author self-verification, not independent QA. Synthetic fixtures and local Docker inspection only; no production endpoints contacted.

## Current implementation

- Runtime uses PostgreSQL metadata and a development-only S3-compatible adapter. Compose selects `rustfs/rustfs:1.0.4`; adapter comments retain MinIO terminology. Initialization removes the dedicated bucket's policy and must succeed before serving requests.
- Authenticated API exposes direct upload, signed-upload intent, completion and signed download. Trusted token mapping and current local membership supply actor identity. Storage permits owner or explicit admin; runtime maps superadmin to storage admin. Caller cannot select owner, bucket or object key.
- Direct upload validates MIME allowlist, configured maximum size, SHA-256 and MIME bytes before object/metadata writes. Object write precedes metadata insertion and ready transition; metadata failure attempts object deletion.
- Signed upload persists pending metadata and signs a generated staging key. Content-Type, Content-Length and SHA-256 checksum header are signed. Completion checks stored type, exact size, bounded read, SHA-256 and MIME bytes before writing final key, deleting staging and marking ready. Replayed staging PUT cannot directly overwrite final download key.
- Signed download checks ownership and final-key existence. HTTP capabilities use 300 seconds; adapter accepts integer TTL 1–3600 seconds. Metadata lookup accepts pending and ready rows. Final-key existence, rather than an independent persisted-ready predicate, gates signing/download.
- Runtime size limit defaults to 10 MiB. Direct Base64 JSON upload also has API's 1 MiB request envelope; signed upload avoids that envelope. HTTP rejects empty uploads; service-level text validation accepts empty UTF-8 data. Delete exists at adapter level; no HTTP delete route is registered.

## MIME signature ceiling

| MIME | Byte rule |
| --- | --- |
| image/png | Exact first eight bytes: 89 50 4e 47 0d 0a 1a 0a |
| image/jpeg | First three bytes: ff d8 ff |
| application/pdf | Starts with ASCII %PDF- |
| text/plain | Strict UTF-8 decoding; no NUL byte |

Signatures identify formats, not complete file structure. Header-only PNG/JPEG/PDF can pass. Malformed bodies, polyglots, malware and active PDF content are not excluded. Valid UTF-8 may contain markup or control characters other than NUL. No decoder, sanitizer or malware scanner is implemented. Structural validation and safe delivery controls remain necessary when those guarantees are required.

## Checks and reproduction

Run from `backend/`:

```powershell
node --import tsx --test test/storage.test.ts test/storage-s3.test.ts test/auth.test.ts test/authorization.test.ts test/config.test.ts test/observability.test.ts
node --import tsx --test test/api.test.ts test/api-slices.test.ts test/webhook.test.ts
npm run typecheck
```

First command: 21 passed, zero failures/skips. Second: 6 passed, zero failures/skips. Full backend typecheck exited 0. Eight storage tests are included in first command. MIME table covers valid headers, truncated/altered/spoofed headers with correct checksums, UTF-8/BOM/empty text, malformed UTF-8, NUL and unsupported MIME. Memory and mocked S3 reject invalid direct uploads before insertion/readiness; invalid completion creates no final object or ready transition. AWS presigner runs locally; S3 transport is mocked. API tests use injected dependencies, not Docker HTTP.

## Limits and pending acceptance

No fresh real signed PUT/GET, expiry/tamper, live owner matrix, restart persistence or failure reconciliation probes were run for this update. Previous live claims are not current evidence. Coordinator rebuilt local Docker images after final code changes; PostgreSQL, RustFS, API and worker reported healthy. No production source/image parity claim follows.

PostgreSQL and object writes are not transactional. Completion can leave final bytes accessible before ready transition if staging deletion or DB update fails. Failed MIME completion retains pending metadata/staging bytes; no automatic expiry cleanup is evident. Direct-upload compensation is best effort, not full reconciliation. Development object credentials are shared service credentials, not demonstrated scoped runtime IAM. Signed URLs remain bearer capabilities until expiry. Global API rate limiting now covers storage routes but does not govern direct signed S3 traffic. Real provider acceptance and independent QA remain separate gates.

