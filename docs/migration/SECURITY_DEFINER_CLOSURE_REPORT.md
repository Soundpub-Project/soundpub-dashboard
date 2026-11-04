# SECURITY DEFINER closure — Phase 1C Agent D

Observed 2026-10-27, Asia/Bangkok. **SECURITY DEFINER = FAIL / BLOCKED.** Local maintenance remediation verified; no production mutation or deployment performed. Credential-incident closure and routing stability have not been agreed with the coordinator in this workstream.

## Read-only production inventory

SSH used `maskhar@20.20.20.3`, working directory `/data/supabase/instances/supabase-01/config`, then `docker compose exec -T db psql -X -U postgres -d postgres`. Queries ran in READ ONLY transactions with 30-second statement timeouts. No live application function was invoked. No secrets or identity rows were collected.

The existing `SECURITY_DEFINER_AUDIT.md` contains all 51 function signatures, owners, purposes, callers, grants, search paths and per-function risks. Phase 1C independently confirms 51 definers, 34 effectively executable by anon, and two without fixed search_path. The 949-record normalized application catalog fingerprint remains `d64856ee63d5743a9e559b07b8dc7fc2d93849c1a7f4d7de05d80938d47ace4c`, matching the audited Phase 1B baseline. This establishes unchanged inventoried application definitions, not authorization correctness or external-platform parity.

Live `scripts/phase1b-definer-assertions.sql` exits **3**, reporting five failed assertions:

- Definer missing fixed search_path.
- Ungated orphan scan executable by client roles.
- Ungated token cleanup executable by client roles.
- Ungated profile name lookup executable by anon.
- Active copyright RPC contract missing.

## Small staged migration

`supabase/migrations/20261027013740_phase1c_restrict_maintenance_definers.sql` changes only `cleanup_expired_tokens()` and `cleanup_rate_limits()`: fixes search_path to `pg_catalog, pg_temp`, revokes PUBLIC/anon/authenticated EXECUTE, and grants service_role EXECUTE. Both bodies already qualify target tables with `soundpub`; business operations remain unchanged. Repository searches found no frontend or Edge caller for either cleanup routine. External schedulers/manual consumers remain unverified. Lock timeout is five seconds; statement timeout is 30 seconds; DDL runs in one transaction.

This intentionally does not globally rewrite search paths: royalty import uses temporary working tables. It does not broadly revoke helper execution needed by policies, or remove frontend audit calls. Authorization defects require caller-aware changes.

## Isolated verification and rollback proof

Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/phase1c-database-reproduction.ps1` from the repository. Two separate PostgreSQL 17.6 containers use fresh tmpfs data, `--network none`, no ports, no production mounts and synthetic prerequisites. Both are removed in `finally`.

Both runs load the current canonical baseline, reproduce its 949-record fingerprint, apply the migration, then run `scripts/phase1c-maintenance-definer.test.sql`. Both cleanup ACLs and paths match expectations; anonymous token cleanup and authenticated rate-limit cleanup raise insufficient_privilege; service_role can invoke both on the empty isolated baseline. Fixture transactions roll back.

Both runs then restore the observed original search-path/ACL state inside the disposable container. The entire normalized catalog returns to the exact original fingerprint. The rollback SQL is embedded only in the isolated runner: RESET search_path on both functions and restore PUBLIC/anon/authenticated EXECUTE for token cleanup; original service/owner grants remain unchanged. This is rollback proof against the captured baseline, **not authorization to restore unsafe grants in production**. A production deployment must capture and compare current ACL/config checkpoints immediately before execution and obtain coordinator agreement on credential/routing dependencies and rollback handling.

## Remaining HIGH blockers

| Surface | Remaining evidence / required work |
| --- | --- |
| Metadata | Anonymous and unrelated authenticated identities still retrieve a synthetic private profile name via `get_user_full_name(uuid)` in the canonical SQL fixture. Fix owner/admin/helper semantics without breaking policies and prove positive/negative access. |
| Orphan scan | Ungated client EXECUTE remains. Determine legitimate admin/service callers and enforce actor authorization; preserve admin tooling. |
| Audit spoofing | `record_auth_audit` accepts arbitrary action/target. Active login/logout/SSO callers exist. Restrict allowed event/target semantics and treat forwarded headers as untrusted; do not remove legitimate callers blindly. |
| Role / financial operations | Existing audit lists caller-controlled identity helpers and sensitive royalty/payout/refund operations. Atomic accounting and real-role deny/allow coverage remain required. Maintenance tests do not approve these functions. |
| Trigger / tenant effects | Shared auth trigger and signup label configuration require cross-application ownership agreement. Direct EXECUTE revocation does not stop bound triggers. |
| Defaults / remaining paths | Explicit future-function default privileges and per-body path review remain pending; no global default ACL mutation was attempted. |
| Production acceptance | Migration undeployed; live catalog still fails five gates. Independent real-role/public-path QA remains absent. |

No SECURITY DEFINER gate points earned from staged changes. Phase 2 remains NOT READY.
