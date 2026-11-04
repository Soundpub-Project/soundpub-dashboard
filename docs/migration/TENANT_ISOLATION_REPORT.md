# Tenant isolation — Phase 1C Agent D

Observed 2026-10-27, Asia/Bangkok. **TENANT ISOLATION = FAIL / BLOCKED.** Production access was metadata-only READ ONLY SSH from the required Docker directory. No live storage object, identity, application row or privileged function was read/invoked by behavioral probes; no production mutation occurred.

## Verified observations

Live catalog lists eight storage.objects policies. `SoundPub authenticated read private buckets` is a permissive SELECT policy TO authenticated whose complete predicate is:

```sql
bucket_id = ANY (ARRAY['release-covers'::text, 'track-audio'::text, 'track-video'::text])
```

It contains no application membership, owner or tenant predicate. Exact predicate equality was independently checked against pg_policies and matched one row. PostgreSQL role `authenticated` is shared across applications; possessing that role alone is not Soundpub membership. Other policies do not restrict an independently permissive SELECT policy by AND. No restrictive storage policy appeared in the returned inventory.

`scripts/phase1c-tenant-storage.test.sql` reproduces this exact predicate in a minimal isolated storage relation. An authenticated synthetic identity with an auth.users row and **no Soundpub profile** can enumerate another owner's track-audio metadata. The same fixture cannot read a synthetic `other-app-private` bucket under that one policy. That negative control proves only the reduced fixture's bucket boundary, not production-wide other-app isolation or byte-download behavior.

Against the actual canonical Soundpub functions and grants, that unrelated identity retrieves a synthetic private Soundpub profile name through `get_user_full_name(uuid)`. An anon role with an empty UID setting retrieves the same name. These are SQL privilege bypass reproductions; synthetic claims adapters do not verify signed JWTs.

The fixture rolls back all data/schema changes and runs in each of two fresh network-isolated clusters through `scripts/phase1c-database-reproduction.ps1`. A successful runner exit means the **known vulnerability was reproduced**, not that tenant isolation passed.

## Required coverage still open

| Direction / resource | Current result | Required closure |
| --- | --- | --- |
| Non-Soundpub identity → Soundpub private storage | FAIL in exact-policy SQL fixture | Membership plus owner/authorized business relationship; real Storage list/download/upload/update/delete deny and intended allow tests. |
| Non-Soundpub / anonymous → Soundpub privileged SQL | FAIL for metadata lookup | Caller-bound helper design and admin/service boundaries; scan/audit/cleanup/royalty coverage. |
| Soundpub → other-app private objects | Unverified in production | Approved identities/object fixtures and complete policy composition; both listing and bytes. |
| Soundpub → other-app rows / RPCs | Unverified | Other-app schema owner coordination and real cross-application negative cases. |
| Non-Soundpub → Soundpub row mutation | Unverified here | Real SQL/API role tests for INSERT/UPDATE/DELETE, including related rows and definer paths. |
| Soundpub owner → other owner | Existing Phase 1B release/track display-name collision failures remain | Stable identity ownership; regression including identical display names. |
| Shared signup | Shared auth.users trigger remains outside baseline | Approved application membership before profile/role assignment; signup tests in both directions. |
| Storage signed URLs and bytes | Unverified | Public-path signed URL expiry/tamper tests and private byte access with approved fixtures. |

No storage migration was staged: choosing application membership, existing object ownership and shared bucket semantics without the ownership workstream could deny legitimate access or retain cross-tenant access. Coordinator must provide credential/routing clearance, approved tenant identities/object scope and owner mapping before production integration probes or remediation. Existing storage/contracts owner work remains untouched. No production PASS or readiness points claimed.
