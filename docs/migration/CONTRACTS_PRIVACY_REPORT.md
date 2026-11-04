# Phase 1B contracts privacy

Status: **FAIL overall; live bucket now private, owner/admin access rollout staged only.** Observed 2026-10-27 (Asia/Bangkok).

## Verified state

- Read-only PostgreSQL probe from the configured Docker directory: `storage.buckets.id='contracts'` had `public=true` before the private flag update; zero `storage.objects` in the bucket; zero `soundpub.copyright_contracts` rows and stamped document URLs. Four copyright registrations exist; only counts were returned.
- Existing `storage.objects` policies do not include the `contracts` bucket. Public bucket configuration would expose any newly written object to anonymous public download irrespective of owner-specific SELECT policy.
- `src/pages/CopyrightRegistrationReview.tsx` created permanent public stamped-document URLs. `src/pages/CopyrightDashboard.tsx` opened those URLs directly. A private bucket flip without a coordinated frontend rollout and verified owner/admin access could break newly uploaded contracts. The bucket public flag was changed to false after an atomic precondition check confirmed zero bucket objects and zero contract records. No object or document URL was changed.

## Staged minimum fix

- `supabase/migrations/20261026215612_make_contracts_private.sql` sets the bucket private; authenticated owners read paths under their own registration ID, authorized administrators review/manage objects, service role retains backend access. Anonymous/other-user paths receive no contracts policy. Owner role relies on `soundpub.copyright_registrations.user_id` and the registration UUID as the second object-path segment. Admin role relies on live `soundpub.is_admin(auth.uid())`. Other generic `storage.objects` policies must be checked for OR-policy widening during isolated role tests.
- Admin upload now stores object path, not a permanent URL. Owner/admin UI requests a 300-second signed download on demand; private signed URLs are never copied into persistent records.
- Full project build PASS; changed-file ESLint: zero errors, one pre-existing hooks warning. Typecheck blocked by six existing parse errors in `src/integrations/supabase/types.ts`. No role-specific owner/admin/anonymous signed-URL test identities or isolated Storage service stack were available; tampered and expired URL tests not run.

## Safe release and rollback

1. Prove intended bucket ownership and perform isolated real Storage API role tests including anonymous, other owner, owner, administrator, expired and modified signed URLs. Inspect every applicable `storage.objects` policy to exclude a broader permissive grant.
2. Establish and verify frontend deployment destination/rollback. Coordinate client release with private-bucket migration; retain a DB before-image of `storage.buckets.public` plus previous Storage policies, verify no new objects or legacy document links appeared, apply remaining policy migration, verify private flag stays false, test via public hostname and private client, and keep rollback available. Existing signed URLs may remain valid until expiry if issued before rollback.
3. If ownership or release mechanism remains unproven, keep bucket private and privacy gate FAIL; do not revert private-by-default without explicit incident assessment. Do not mislabel code-only remediation PASS.

Live production change: bucket metadata flag only (`public=false`), committed after zero-object/zero-contract precondition and verified by SELECT. First SQL attempt failed within an aborted transaction before any UPDATE; second succeeded. Rollback statement retained outside the repository in the workstation temporary directory. No policy migration, frontend release, file upload or download occurred. Phase 2 remains blocked.

