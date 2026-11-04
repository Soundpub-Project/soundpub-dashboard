# Storage design

Status: Phase 2 isolated RustFS/S3-compatible object storage implemented and locally verified with synthetic bytes only. PostgreSQL stores durable private metadata; direct and signed staging uploads enforce declared size/checksum plus PNG/JPEG/PDF signatures or strict UTF-8 text without NUL. Signature checks are not full format decoders.

## Boundary and object identity

Storage service owns metadata, logical resource links and access policy. Provider interface owns object I/O: `putObject`, `getObject`, `deleteObject`, `objectExists`, `getMetadata`, `createSignedDownloadUrl`, `createSignedUploadUrl`, or explicitly documented equivalent methods. HTTP routes must not accept arbitrary provider endpoints, bucket names, owner UUIDs or object keys as authority.

Canonical identity is provider/bucket/object key, with separate application asset UUID and logical record links. Signed URLs are short-lived output, never permanent DB identity. Database [storage design mapping](DATABASE_DESIGN.md) uses physical `soundpub.storage_assets`; the spec's `storage_objects` is an illustrative alternative name. Store MIME, byte size, checksum algorithm/value, visibility, owner/typed reference, validation state and timestamps through the DB/adapter mapping. Multiple business references must not overwrite each other.

RustFS/S3-compatible object storage buckets stay private and dedicated to development. Object visibility is `PRIVATE` by default, with explicit `PUBLIC` and `ADMIN_ONLY` policy concepts. A `PUBLIC` metadata value alone does not change bucket ACLs or publish bytes. Public delivery requires an intentionally implemented, tested safe projection. Legal documents, payment proofs, invoices and unpublished/full media remain private.

## Upload and download lifecycle

1. Authenticate, require active local membership and authorize the target resource. Validate declared MIME/size and generate a server-owned key and asset identity.
2. Upload through the storage service or a bounded signed-upload capability. A signed PUT alone does not prove MIME, maximum size or checksum compliance; choose constrained upload policy/proxy or verify uploaded bytes before finalization.
3. Inspect object existence, actual size, allowed type and checksum. Keep pending/unverified objects inaccessible. Client MIME and checksum are claims until validated; do not treat multipart ETag as SHA-256.
4. Commit verified metadata/resource link and audit as appropriate. Handle object-written/DB-failed cases with explicit cleanup/reconciliation; PostgreSQL and object storage do not share a transaction.
5. On download, load current resource, status and access policy. Issue a short-lived signed URL only after owner/admin/visibility authorization. URL possession is a bearer capability until expiry.
6. On deletion, authorize, preserve required shared logical links/retention, coordinate object deletion with durable metadata state, and make retry/missing-object outcomes safe.

Current API factory conditionally registers `POST /api/v1/storage/objects` for Base64 JSON upload and `GET /api/v1/storage/objects/{objectId}/url` for a 300-second download URL when a Storage dependency is injected. Registration alone does not prove metadata persistence, status authorization, rate limiting or generated OpenAPI coverage. Acceptance requires the complete representative flow.

Current service interface uses `upload`, `download`, `delete` and `signedUrl`. `S3DevObjectStorage` adds `getObject`, `signedDownloadUrl`, `signedUploadUrl` and `completeUpload`; its `MetadataRepository` is injected. Signed uploads write a staging key, verify size/type/checksum on completion, and copy validated bytes into a download key. Signing lifetime accepts integer 1–3600 seconds. The initial metadata shape is private-only; status and provider fields from the database need explicit composition rather than assuming an in-memory metadata repository persists through restart.

## Security rules

- Bound MIME allowlist and byte limit are server configuration; reject unknown values, excess content and unsafe filenames. Detect/validate content where MIME matters.
- Opaque generated keys avoid traversal, absolute paths and user-selected tenant prefixes. Normalize accepted legacy keys only through reviewed field-specific migration rules later.
- Require current active owner, explicit owner-or-admin policy, or narrowly defined admin-only capability. Typed historical owner references cannot authenticate or claim files.
- Signed upload/download TTL is short and bounded. Test actual expiry/tampering against local S3-compatible object storage, not only a URL expiry parameter.
- Do not log signed query strings, private filenames, file bodies, credentials or provider internals. No runtime object-store root credential when scoped application access is practical.
- Local API and container-internal object endpoints may differ; ensure generated URLs are reachable by their intended local client without publishing production hosts.
- Avoid fetching remote URLs supplied by clients. No URL-import endpoint or legacy-provider credential is needed for foundation.

## Phase1G compatibility and exclusions

Pinned scope selects 582 local object identities and 408 external reference identities for possible later migration, not Phase 2 import. It excludes 108 and defers 1,807; 25 bucket metadata rows never authorize whole-bucket copying. Digests in the inventory identify objects, not content checksums. UUID prefixes, uploader, profile presence, filename, matching key or backup bucket list do not expand scope.

Gallery is disabled. Eighteen `.com` gallery candidates stay deferred among 1,609 deferred local objects; `.com` must not alias `.space`. Original source provider/host/key and record edge remain restricted provenance on unchanged source until separately authorized custody. No raw source reference extraction is needed here. Later activation/transfer requires origin attestation, owner approval and refreshed exact manifest.

Future transformation strips transient query/fragment, distinguishes provider/host, decodes according to the known field convention and preserves logical edges. Ambiguity is an explicit unresolved migration error, never guessed bucket/key or a whole-bucket sweep. Source Storage policies and shared mounts are replaced, not copied.

## Verification

Test upload/download/delete, missing object, MIME and byte limits, checksum persistence, owner allow, unrelated owner deny, explicit admin allow, inactive/suspended deny, private bucket behavior, signed URL expiry/tampering, pending-object denial, DB failure cleanup and retry-safe deletion. Use dedicated S3-compatible object storage and PostgreSQL with synthetic bytes. Interface mocks alone do not pass Storage runtime acceptance.

See [authorization](AUTHORIZATION_MODEL.md), [test strategy](PHASE2_TEST_STRATEGY.md), and [Storage inclusion contract](../migration/PHASE1G_STORAGE_INCLUSION_CONTRACT.md).

