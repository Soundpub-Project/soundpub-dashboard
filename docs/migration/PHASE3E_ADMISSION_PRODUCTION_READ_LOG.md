# Phase 3E Admission Production Read Log

Agent B — Production Access Recovery. Review date: 2026-10-30. **Access BLOCKED; SSH PASS; fresh database snapshot NOT OBTAINED.**

## Scope and controls

Authorization: pasted admission task sections 9–19 and 55–57; direct user restriction is strictly read-only production, no restart, no secrets, and only these two admission production reports may be written locally. Read `.agents/skills/supabase/SKILL.md`, prior Phase 3E final/closeout, composer, provenance, reconciliation, opening-balance and QA evidence, and the relevant Phase 1F database inventory. Existing dirty worktree was preserved. No production files were written.

All SSH inspections targeted `maskhar@20.20.20.3`. Every remote inspection first changed to `/data/supabase/instances/supabase-01/config`; metadata discovery used Docker directly rather than rendering Compose or loading `.env`. Initial container status listing included shared container names/status only; subsequent inspection was limited to database, pooler, REST and metadata containers. No unrelated application rows were queried.

Container inspection was parsed server-side. Only selected connection metadata, environment variable names, selected Compose labels, mount metadata and state crossed SSH. Passwords, tokens, connection URI credentials and secret configuration values were withheld. Database logs were captured only into process memory and reduced to category counts; raw logs were never printed or retained in repository. No provider endpoint, application financial status/reconciliation endpoint or arbitrary database function was invoked.

## Executed access audit

Times are UTC. First status inspection occurred immediately before the first server timestamp below; no exact timestamp was captured for that initial command.

| Timestamp | Predicate / operation ID | Read-only method and result | Rows examined / transaction / rollback |
| --- | --- | --- | --- |
| Immediately before 11:35:49 | S01: runtime status | SSH `pwd` and Docker container names/image/status/ports. Required directory confirmed. `supabase-db` restarting; pooler and REST unhealthy. | Container metadata only; database rows 0; no SQL transaction. |
| 11:35:49 | S02: connection/service metadata | Server-side allowlisted parsing of `docker inspect` for `supabase-db`, `supabase-pooler`, `supabase-rest`, `supabase-meta`. Compose project `supabase`, database service `db`, database image `supabase/postgres:17.6.1.136`; restart count 3270. | Four container metadata objects; database rows 0; no SQL transaction. |
| 11:35:49 | S03: configuration metadata | First `stat('.env')` failed with errno 5, `Input/output error`; this metadata-discovery process exited 1. No contents read. | File metadata attempt only; no SQL transaction. |
| 11:36:22 | S04: bounded filesystem/log diagnosis | Independent `stat` checks confirmed `.env` and `docker-compose.yml` both return errno 5. Data directory metadata readable, contents not readable by SSH user. Docker-managed config path inaccessible to that user. Last 100 DB log lines reduced to 17 `FATAL` and 17 I/O-error matches. These counts can overlap within lines. | No database rows or file contents emitted; no SQL transaction. Root cause not established. |
| 11:36:22 batch | S05: endpoint probe | Unauthenticated TCP connection probes to server loopback 5432 and 6543 failed with errno 5. No database authentication or query occurred. | Database rows 0; no SQL transaction. |
| Between 11:36:22 and 11:36:45 | S06: existing SQL client | `docker exec -i supabase-meta node --input-type=module` used its already-installed `pg` module and existing `PG_META_DB_*` environment internally. Connection target `db:5432/postgres`; user `postgres`; application name `phase3e-agent-b-readonly`; startup options `default_transaction_read_only=on`, `statement_timeout=45000`; 8-second connection timeout. Failed with `EAI_AGAIN`, client exit 21. Outer transport exited 0; that does not mean SQL succeeded. | Database rows 0. Connection failed before BEGIN; planned queries never executed. Rollback **not applicable**, not confirmed/executed. Client closed. |
| 11:36:45 | S07: alternate-route verification | Allowlisted endpoint and network metadata: DB aliases `db` / `supabase-db` on `supabase-network`, but no assigned DB IP while restarting. Metadata client and REST both target same DB; pooler metadata points to `db:5432/_supabase`. No independent database route found. | Metadata only; no direct-IP SQL attempt possible; no transaction. |

S04 is an isolated filesystem metadata confirmation after S03, not an attempt to read or source `.env`. No further configuration-file retries, connection retries, restart, repair, filesystem traversal or alternate-host investigation followed S07. Existing Docker automatic restart loop was observed, not initiated by this review.

## SQL session controls and execution result

The connection attempt configured session read-only defaults before any statement. Its intended statement sequence was:

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '45s';
-- Reviewed metadata SELECT statements only.
ROLLBACK;
```

**None of this sequence executed.** No database transaction timestamp, isolation assertion, table result or successful rollback exists for this review. The prepared probe was never server-parsed; corrected, locally checked recovery predicates are supplied in the companion snapshot. Those are a future plan, not an execution claim.

The in-memory client runner rejected mutation keywords, COMMIT, multiple statements in review queries, comments, locking clauses and functions outside a small built-in allowlist. Transaction controls were fixed strings. No application routines, SECURITY DEFINER routines, provider APIs or financial services were called. Because authentication failed first, no server-side query validation occurred.

Recovery predicates Q01–Q03, hashes, transaction wrapper and a runnable local safety check are in [PHASE3E_ADMISSION_PRODUCTION_SNAPSHOT.md](PHASE3E_ADMISSION_PRODUCTION_SNAPSHOT.md). They were **not executed against production**. The existing `scripts/payment_reconciliation_readonly.sql` was read locally only; its 20 historical predicates were not rerun.

## Parent / Agent D handoff

**No verified working SQL access method is currently available.** Read-only discovery found an existing client route through `supabase-meta` and the established prior `psql` route through `supabase-db`; both depend on the same unavailable database. No independently scoped read-only database role was discovered. `postgres` is privileged: schema scoping and explicit read-only transaction controls are mandatory, and a successful connection alone must not be called least-privilege access.

Once infrastructure owner restores database availability outside this task, use direct SSH from the required directory and the existing container client. Prior successful method was `docker exec -i supabase-db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1`; no fresh successful invocation is claimed. Start with Q01–Q03 inside one REPEATABLE READ READ ONLY transaction, then explicitly ROLLBACK. Do not restart services or load `.env` to make Compose convenient. Do not use another Supabase host, another instance, application endpoints or RPCs as substitute evidence.

Agent D may use the companion report's **inherited** `soundpub` inventory as a planning allowlist. It cannot serve as today's population denominator. Refund/correction/provider-event populations, financial audit subset, row-level approvals and proof metadata are not freshly enumerated. Historical reconciliation remains NOT RUN; population completeness remains UNPROVEN.

Blocker was reported in live commentary immediately upon observing restarting database, then updated with I/O failure, failed existing client and no alternate route. Dedicated parent-message tool was unavailable; handoff was delivered in this chat and these two files.

## Isolation result

| Control | This agent's observed actions |
| --- | --- |
| Production INSERT / UPDATE / DELETE / DDL | 0 / 0 / 0 / 0 |
| Production SQL statements executed | 0 |
| Production business rows examined | 0 |
| Successful SQL transactions / confirmed rollbacks | 0 / 0; no transaction started |
| Provider mutation / real money processed | 0 / 0 |
| Service restart/recreate / remote file writes | 0 / 0 |
| Traffic switched / shared Supabase mutated | NO / NO |
| Mutation count | **0** |

These attest this review's actions, not absence of changes by other operators. Access gate remains BLOCKED; production isolation boundary was preserved.
