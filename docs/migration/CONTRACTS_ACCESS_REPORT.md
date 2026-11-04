# Phase 1C contracts access — Agent H

Observed 2026-10-27, Asia/Bangkok. **Gate: BLOCKED.** Production acceptance has not passed.

## Scope and safety

Read Phase 1C, root AGENTS.md, Supabase skill and Phase 1B privacy/authorization evidence. Incident lock remains in force: no release was supplied to this agent. Production activity was read-only SSH from `/data/supabase/instances/supabase-01/config`, explicit `BEGIN READ ONLY`, and non-mutating HTTP GETs. No production uploads, identities, policies, deployments, payment/email calls or business writes. Other agents' source files and migrations were inspected, not edited.

## Current policy inventory

Live `contracts` bucket: `public=false`, zero objects, zero `soundpub.copyright_contracts` rows, zero contracts-specific `storage.objects` policies. Private metadata prevents permanent public serving but does not supply owner/admin access. Empty data cannot prove existing-object denial or authorized downloads.

All eight live Storage policies are PERMISSIVE and combine applicable grants with OR:

| Policy | Operation / scope | Contracts consequence |
| --- | --- | --- |
| SoundPub authenticated read private buckets | SELECT release-covers, track-audio, track-video for every authenticated identity | Broad cross-owner/cross-app grant, but excludes contracts |
| SoundPub public read public buckets | SELECT avatars, label-logos, iccn-gallery, audio-clips for anon/authenticated | Excludes contracts |
| SoundPub authenticated upload buckets | INSERT seven media buckets, UID path prefix OR is_admin | Excludes contracts |
| SoundPub authenticated update buckets | UPDATE same seven buckets, UID prefix OR is_admin, matching WITH CHECK | Excludes contracts |
| SoundPub authenticated delete buckets | DELETE same seven buckets, UID prefix OR is_admin | Excludes contracts |
| SoundPub service role manage buckets | ALL same seven buckets | Excludes contracts; service-role bypass is separately privileged |
| Read scoped takedown storage files | SELECT takedown-documents, admin OR UID prefix OR linked label | Excludes contracts |
| Upload own takedown storage files | INSERT takedown-documents, UID prefix | Excludes contracts |

No current Storage OR grant includes contracts. Re-inventory immediately before deployment because concurrent work can change this finding. Database contract policies separately permit authenticated SELECT for registration owner OR is_admin, and ALL for is_admin. Live is_admin delegates to admin OR superadmin role membership; it does not check active/suspended status. Registration INSERT checks only user_id, preserving the earlier untrusted-approval finding until fixed and retested by its owner.

## Staged workflow and gaps

Existing staged migration `20261026215612_make_contracts_private.sql` adds owner/admin SELECT by registration UUID in object-path segment two, admin INSERT/UPDATE with allowed prefix and existing registration, admin DELETE, and service-role ALL. Owner writes are intentionally absent. Reviewer/copyright membership alone has no grant; required reviewer scope needs an explicit business rule.

Existing staged UI stores stamped object paths, then requests 300-second signed URLs in CopyrightDashboard and CopyrightRegistrationReview. Preview HTML, draft PDF and generated PDF still open supplied URLs directly; only stamped rows carry the private flag. Their service/URL privacy remains unverified. Draft generation POST has no Authorization header in this client; the PDF service's actual authorization boundary must be established without calling a real provider. Upload uses timestamp plus original filename and upsert; a failed subsequent RPC can orphan the uploaded file. No secure replacement cleanup or delete UI was verified. No source/runtime deployment is evidenced here.

## Executed checks

- `node scripts/phase1b-contracts-security.test.cjs`: 2/2 source-pattern checks pass; no runtime acceptance implied.
- `node scripts/phase1c-contracts-roles.test.cjs`: isolated PostgreSQL 17, network disabled, no ports/mounts/production data; disposable container and volume removed. Applies the actual staged contracts migration to reduced platform tables and synthetic identity adapters. Checks private flag, anonymous and ten identity SELECTs, owner INSERT denial, admin/superadmin INSERT + UPDATE + DELETE with rollback. All diagnostic assertions pass.
- Observed SELECT counts: user/artist/label/other-owner/copyright=0; owner=1; admin/superadmin=3; inactive/suspended owners=1 each; anonymous=0. Inactive/suspended reads are an explicit unresolved status-policy question, not a security PASS. Reduced fixture does not reproduce registration RLS, full live OR policies, GoTrue, JWT, HTTP Storage or session validation.
- Public `.com` and `.space` GETs for `agenth-nonexistent.pdf`: public and authenticated object routes without credentials returned 400; same routes with an intentionally invalid bearer returned 400; sign route with `token=invalid` and invalid bearer returned 400. Ten GETs total; no bytes requested from an existing contract. These are controlled negative responses only. Invalid token on nonexistent path is not tampering with a valid signed URL.

## Exact blockers

1. Coordinator incident-lock release and verified rollback/deployment ownership.
2. Actual safe integration identities for required roles, including account statuses and authorized reviewer scope; complete isolated GoTrue/PostgREST/Storage stack or coordinator-approved fixtures.
3. Real-object upload/download/replacement/delete tests, foreign-owner and anonymous denial, valid signed URL success followed by signature/path tamper rejection and expiry rejection. None can be inferred from SQL or nonexistent objects.
4. Resolve account-status authorization contract and remaining draft/generated/PDF-service privacy boundaries.
5. Deploy reviewed policy/client changes only after lock release; verify public serving runtime and independent QA. Until then contracts gate remains BLOCKED and Phase 2 is not ready.
