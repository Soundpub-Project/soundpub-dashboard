# Phase 1G Phase 2 Boundary

## Allowed foundation

Build a separate Soundpub backend: dedicated PostgreSQL database and migrations; dedicated backend API, workers and webhook routes; application-only credentials and authorization model; `backend_users` / external identity mapping; dedicated migration/staging schema; scoped storage abstraction and development object store; isolated logs, health checks, access controls and backup/restore practice. Use synthetic or sanitized fixture data only. Provider integration uses sandbox accounts or local mocks, never live callbacks. Implement Soundpub-owned schema/contracts and replacement interfaces from Phase 1G documents; do not treat them as an executable production export plan.

## Explicit gallery exclusion

`iccn-gallery` and the 18 candidate local metadata objects matched only through legacy `.com` configuration URLs are **out of Phase 2 foundation**. Do not import source gallery settings, fetch/mirror gallery bytes, assume `.com` resolves to `.space`, or enable the gallery against production data. Use synthetic placeholders only. Preserve each original `.com` source reference separately as restricted provenance (host/provider/bucket/key and business-record edge); local `.space` object identity is a candidate, not an alias. Later gallery activation or file transfer requires read-only origin attestation, owner approval and a refreshed exact-reference manifest. This explicit build-scope exclusion may defer 18 candidate local objects without declaring their ownership or bytes resolved.

## Hard deny boundary

- No production users, credentials, password hashes, sessions, private media, financial rows or provider tokens in development or new backend.
- No write, DDL, policy/grant change, Auth mutation, object upload/delete/copy, Edge deployment or service restart on shared `20.20.20.3` Supabase; no writes against legacy `20.20.20.173` either.
- No live provider callback registration, production invoice/email/storage action, global Auth configuration change, or shared credential rotation during Phase 2 foundation.
- No wildcard `auth.users`, `storage.objects`, bucket, shared schema, function, role, extension or service-account export. Other-project identities and objects remain outside Soundpub.
- No direct production dependency or live replication in foundation runtime. Read-only evidence checks, if separately needed, must start with SSH `maskhar@20.20.20.3` in `/data/supabase/instances/supabase-01/config`, use bounded explicit read-only transactions, and export only sanitized aggregates/digests.

## Gates after foundation

Approved identity/owner manifest, legal disposition for shared identities/objects, current provider-binding and callback attestation, byte recovery and checksums, isolation tests, financial reconciliation, audited privileged API replacements, scoped encrypted off-host backup and restore, and rollback rehearsal are prerequisites for later production extraction/cutover. Passing Phase 2 does not approve production migration or alter Phase 1F's 52/100 cutover score. Any case without positive Soundpub evidence stays outside executable extraction until independently resolved.

