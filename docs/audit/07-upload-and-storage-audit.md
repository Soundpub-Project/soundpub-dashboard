# 07 — Upload and Storage Audit

Status: **DUAL-MODE STORAGE — BACKEND CAPABILITIES PRESENT, LEGACY TUS/SUPABASE STILL ACTIVE**

## Legacy upload/storage

- TUS resumable audio upload dependency at `src/components/releases/MediaUploadSection.tsx:22`.
- Buckets `track-audio` and `audio-clips` at `src/components/releases/MediaUploadSection.tsx:41-45`.
- TUS endpoint derives from `VITE_SUPABASE_URL`; 6 MiB chunks and bearer/apikey headers at `src/components/releases/MediaUploadSection.tsx:133-174`.
- Resume and public/signed URL behavior at `src/components/releases/MediaUploadSection.tsx:196-217`.
- Object path construction at `src/lib/storagePaths.ts:27-63`.
- Fresh signed URL for clipped audio at `src/lib/audioClipper.ts:13-27`.
- Media library list, signed/public URL, and delete/remove at `src/pages/MediaLibrary.tsx:85-138,308-363`.
- Other direct uploads include takedown documents (`src/pages/Takedown.tsx:152`), payout proofs (`src/pages/AdminPayouts.tsx:149-152`), and contracts (`src/pages/CopyrightRegistrationReview.tsx:330,387-394`).

Risk: browser clients write directly to storage and then update database references. The previous audit notes that DB historically stored full/signed URLs and upload/DB updates were not atomic (`SUPABASE_MIGRATION_AUDIT.md:78`). Current helper paths at `src/lib/storagePaths.ts:27-30` reduce URL drift but do not solve atomicity by themselves.

## Backend storage capabilities

- Generic storage routes include base64 upload, signed PUT request, signed PUT completion, and 300-second signed download (`backend/src/api/index.ts:215-251`; OpenAPI metadata at `:267-276`).
- Storage interface requires trusted actor-derived access and private metadata only (`backend/src/storage/index.ts:1-41`); owner-or-admin authorization at `:68-81`.
- S3 dev adapter options are development/test-only and reject production (`backend/src/storage/s3.ts:10-24,54-57`).
- Bucket policy is deleted to preserve private access (`backend/src/storage/s3.ts:80-90`).
- Object ownership checks are at `backend/src/storage/s3.ts:114-121`.
- Signed download checks ownership and object existence before presigning `GetObject` (`backend/src/storage/s3.ts:195-208`).
- Signed PUT stores upload intent and requires `content-type`, `content-length`, and SHA-256 checksum headers; completion copies verified staging bytes to final object (`backend/src/storage/s3.ts:210-240`).
- Capability lifetime is constrained to 1–3600 seconds (`backend/src/storage/s3.ts:40-43`).

## Backend media flow

- Media store allows only local/dev endpoints (`backend/src/media/store.ts:35-50`).
- Signed PUT lifetime is 300 seconds (`backend/src/media/store.ts:101`), multipart part URLs are at `:120-124`, and signed download is 60 seconds (`:179`).
- Media download authorizes active referenced objects before issuing signed URL (`backend/src/media/index.ts:219-227`).
- Stable DB references, not signed URLs, are persisted (`backend/src/media/index.ts:186-190`).
- Frontend media adapter uses `/api/v1/storage/uploads`, multipart, complete, download, and remove (`src/api/media.ts:7-15`).
- Frontend capability URL validation and multipart upload with `credentials: 'omit', redirect: 'error'` appear at `src/services/media.ts:5-13,34-80`.
- Standard backend upload path has a 24 MiB multipart threshold (`src/services/media.ts:6,91`).
- Reusable backend upload control: `src/components/settings/BackendMediaUpload.tsx:8,44`.
- Backend release form bindings: `src/components/releases/BackendReleaseForm.tsx:132,146-147`.

## Royalty file storage

- Royalty files allow only local/dev endpoints, `text/csv`, and 100 MiB (`backend/src/royalties/store.ts:45-60`).
- 300-second signed PUT is at `backend/src/royalties/store.ts:70-72`.
- Verification rejects size/MIME/UTF-8/checksum drift at `:73-108`.
- Signed download is 60 seconds at `:110-114`.

## Risks and gates

- Backend object storage is not production-ready; S3 and media endpoints explicitly reject nonlocal/production configuration.
- Legacy and backend upload paths can create different object keys, metadata, authorization assumptions, and failure semantics.
- Signed URLs shorten credential exposure but require strict ownership checks, short lifetimes, and stable DB references; backend code implements these, but production-equivalent storage is not configured.
- Storage object metadata from the backup is filtered and must be verified before any migration; see `04-database-and-backup-audit.md`.

## Finding

Upload/storage cutover is **blocked** until production object storage design, private bucket policy, capability issuance, ownership checks, and frontend default routing are validated end-to-end. Legacy TUS/Supabase Storage must be disabled only after parity and rollback tests pass.
