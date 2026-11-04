# Phase 3B closeout orphan repair contract

Scope: backend maintenance only; synthetic/disposable Artist/Label data. No HTTP endpoint, frontend wiring, Supabase RPC, production migration, deployment or historical-domain mutation.

## Target and operator boundary

The module accepts an explicit database URL; the CLI reads only `ORPHAN_REPAIR_DATABASE_URL`, never the backend `.env` or `DATABASE_URL`. Before connecting, require PostgreSQL protocol, literal loopback IP (`127.0.0.1` or `[::1]`), explicit username/password, database matching `soundpub_test_orphan_[a-z0-9_]+`, and no query string/fragment. DNS names, shared Artist test databases, development databases, `20.20.20.3`, and `20.20.20.173` are rejected. After connecting, require database comment exactly `soundpub synthetic orphan repair` before reading domain tables. This marker is an operator assertion for a separately provisioned disposable database; the tool never creates it. Do not point a local tunnel at a remote server or mark an existing/shared database disposable.

Execution belongs to a trusted maintenance operator with database privileges to read inventory, insert memberships/audit and lock the relevant tables; rollback additionally requires membership DELETE. No runtime grants are expanded. `actor` is a controlled process identity, not a browser-provided user ID. Apply requires nonblank actor (maximum 200 characters) and reason (maximum 2000). No provider or production credentials are needed.

## Detection and decision rules

Current parent means `profiles.parent_label_id`. Current roster means `artists.artist_user_id / label_id`; `artist_profiles.user_id` is the Artist owner binding. Name equality never establishes identity.

| Issue | Detection | Automatic repair | Manual decision | Audit / rollback / migration behavior |
| --- | --- | --- | --- | --- |
| `MISSING_ARTIST_OWNER` | Artist profile owner absent from profiles or backend users | No | Recover authoritative owner UUID | Report only; block apply; migration must resolve |
| `DUPLICATE_ARTIST_OWNER` | Multiple Artist profiles bind same user | No | Resolve duplicate identity | Report only; block apply; preserve rows |
| `MISSING_PROFILE_OWNER` | Profile has no backend user | No | Resolve principal | Report only; block apply |
| `MISSING_LABEL` | Parent or roster label absent from profiles or backend users | No | Resolve intended parent | Report only; block apply; never detach by guess |
| `MEMBERSHIP_MISSING_USER` | Roster points to missing backend user | No | Resolve principal/history | Report only; block apply; never delete dangling rows automatically |
| `RELATION_MISSING_ARTIST` | Roster points to absent profile or Artist profile | No | Resolve artist identity | Report only; block apply |
| `INVALID_CURRENT_PARENT` | Parent disagrees with roster, self-parent, unverified roster, invalid artist/label authority or inactive principal | No | Establish valid current authority | Report only; block apply; no role/status changes |
| `CONFLICTING_CURRENT_OWNERSHIP` | Multiple roster rows bind same artist user | No | Choose authoritative binding | Report only; block apply; no duplicate chosen by order |
| `UNRESOLVED_PARENT_REFERENCE` | Profile has migration-only parent reference | No | Resolve migration provenance | Report only; block apply; reference grants no authority |
| `MISSING_CURRENT_MEMBERSHIP` | Exactly one Artist profile and explicit valid parent UUID, no roster row, no parent reference | Yes: insert roster with existing Artist UUID/parent UUID and Artist profile name | No, provided entire scan has no ambiguous issue | Same-transaction before/after audit; guarded inverse DELETE by repair batch; rerun scans clean |

A valid Artist is active, has a verified global `artist` role, exactly one Artist profile and no verified global admin/superadmin/label/whitelabel role. A valid Label is active, has a profile and verified global label/whitelabel role. Nothing derives ownership from names, historical owners, unverified roles or migration references.

Every unresolved issue returns `AMBIGUOUS_REPAIR`, including missing evidence with no provable outcome. If any ambiguity exists, apply returns that status and writes **zero** repairs and zero success audits, even if other rows have deterministic proposals. The CLI exits 2; this is a safe rejection, not automatic repair success.

## Transaction, audit and rollback

Default scan is a REPEATABLE READ READ ONLY transaction. Output includes detected issues, statuses and deterministic proposals. No audit writes occur on dry run.

Explicit apply uses SERIALIZABLE and SHARE ROW EXCLUSIVE locks over users, profiles, artist profiles, roster, roles and audit. Locks prevent concurrent writes while the inventory is checked and repaired; lock wait is capped at five seconds. No stale dry-run plan is accepted: apply rescans in its own transaction. Serialization/lock/constraint failures propagate and roll back; operators may rerun after investigating.

Each insert records `orphan.membership_restored`, resource type/ID, `metadata.processActor`, reason, batch UUID, old state (`null`) and full inserted state; `audit_logs.created_at` supplies timestamp. Repair and audit commit together. Audit failure rolls back membership insertion. Repeat apply on a repaired dataset does nothing and adds no audit.

`--rollback-batch` loads only audit entries for the specified repair batch. Default remains dry run. Apply compares each current membership's complete JSON state with its audited inserted state before removing it; any drift/missing row rejects with `ROLLBACK_CONFLICT` and rolls back the entire inverse transaction. Each inverse deletion adds `orphan.repair_rolled_back` with actor, reason, old/new state and `rollbackOf`. Repeat completed rollback is a no-op. Unknown batch is rejected. Rollback intentionally restores the original missing-roster condition; it does not resolve the orphan or rewrite its parent. Audit history remains append-only. Subsequent repair can restore that roster again under a new batch.

## Invocation

From `backend`, with a separately provisioned and marked disposable database URL in the environment:

```powershell
npx tsx src/artists/orphan-repair-cli.ts
npx tsx src/artists/orphan-repair-cli.ts --apply --actor synthetic-migration --reason "Restore synthetic current roster"
npx tsx src/artists/orphan-repair-cli.ts --rollback-batch <batch-uuid>
npx tsx src/artists/orphan-repair-cli.ts --rollback-batch <batch-uuid> --apply --actor synthetic-migration --reason "Undo synthetic repair"
npx tsx --test test/orphan-repair.test.ts
```

No migration is required: existing backend tables and audit schema suffice. Production migration adoption requires separately reviewed scope, authority/provenance decisions and complete historical dependency inventory; this tool remains disposable-only. Full table inventory and coarse locks are intended for small synthetic fixtures, not production-scale online repair.
