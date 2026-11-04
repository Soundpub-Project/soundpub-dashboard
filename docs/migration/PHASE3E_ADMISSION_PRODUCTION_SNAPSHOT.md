# Phase 3E Admission Production Snapshot

Agent B — Production Access Recovery. **BLOCKED: fresh financial database snapshot unavailable.** Fresh host/container metadata exists; inherited database counts below are not current production results.

## Snapshot identity

| Field | Evidence |
| --- | --- |
| Fresh inspection timestamps | 2026-10-30T11:35:49Z, 11:36:22Z and 11:36:45Z; UTC, equivalent to 18:35–18:36 Asia/Bangkok |
| Production host | `maskhar@20.20.20.3` |
| Inspection working directory | `/data/supabase/instances/supabase-01/config` |
| Compose identity from running-container labels | Project `supabase`; database service `db`; Compose file `/data/supabase/instances/supabase-01/config/docker-compose.yml` |
| Environment source | Running container environment; selected metadata only. `.env` stat fails with I/O error; not read or sourced. |
| Database identity | `supabase-db`, image `supabase/postgres:17.6.1.136`; configuration identifies `postgres` database, internal port 5432. Server version and current contents not reverified. |
| Database endpoint | Docker alias `db:5432`; same DB used by metadata and REST. No current DB container IP. Host loopback pooler ports 5432/6543 unusable in probe. |
| Candidate client | Existing `supabase-meta` Node `pg`; configuration user `postgres`, database `postgres`; secrets used internally only. Connection failed `EAI_AGAIN`. |
| Fresh database transaction timestamp | **UNAVAILABLE: connection failed before BEGIN** |
| Fresh table counts / financial population | **UNAVAILABLE**, not zero |
| Application schema boundary | `soundpub`; presence inherited and configured, not freshly SQL-confirmed |
| Latest inherited financial transaction | **2026-10-27T13:31:07.912225 UTC**, REPEATABLE READ READ ONLY, final ROLLBACK, reported in `PHASE1F_DATABASE_SCOPE.md` |
| Inherited main catalog/table-count transaction | **2026-10-27T13:18:50.116086 UTC**; separate from financial transaction |
| Full current historical population | **UNPROVEN / PARTIAL** |

Fresh observations establish operational access blockers only. DB was restarting, restart count 3270 at first detailed inspection; bounded logs contained repeated FATAL/I/O-error categories. `.env` and Compose-file metadata both failed with I/O error. These do not establish storage-failure root cause or justify a shared-service restart.

## Scoped table inventory for Agent D

Inherited `PHASE1F_DATABASE_SCOPE.md` inventory: **33 `soundpub` base tables**, no views, materialized views, foreign or partitioned tables observed then. Canonical local SQL independently declares the same 33 table names; that is not deployed-schema equality. Names below are an allowlist for renewed catalog verification, not permission to read arbitrary payloads.

| Inherited table | Inherited main-inventory rows | Evidence use / predicate boundary |
| --- | ---: | --- |
| `soundpub.app_settings` | 20 | Metadata only; no settings values needed for financial enumeration. |
| `soundpub.archived_royalties` | 0 | Historical/archive/correction candidate; current count unknown. |
| `soundpub.artist_deletion_requests` | 0 | Application inventory only. |
| `soundpub.artist_profiles` | 81 | Identity linkage only if necessary. |
| `soundpub.artists` | 132 | Work/release ownership linkage only if necessary. |
| `soundpub.audit_logs` | 18,307 | Whole application audit table, **not financial audit count**; derive reviewed financial predicate before payload inspection. |
| `soundpub.auth_events` | 0 | Application inventory only. |
| `soundpub.balance_adjustments` | 33 | Opening/manual adjustments; explicit source/reason classification required. |
| `soundpub.composer_royalties` | 0 | Empty inherited population does not dispose six older export rows. |
| `soundpub.copyright_contracts` | 0 | Beneficiary/legal linkage where needed; no contract bytes. |
| `soundpub.copyright_registration_files` | 10 | Linked metadata only where required; no file bytes. |
| `soundpub.copyright_registration_payments` | 2 | Copyright invoices/payment status and provider-reference existence. |
| `soundpub.copyright_registration_works` | 4 | Composition/recording linkage; no invented entitlement mapping. |
| `soundpub.copyright_registrations` | 4 | Composer identity linkage; aggregate/minimal ID evidence only. |
| `soundpub.email_send_log` | 169 | Application inventory only. |
| `soundpub.notifications` | 41 | Application inventory only. |
| `soundpub.payout_balance_reservations` | 5 | Payout/reservation join by `payout_id`; no destination details. |
| `soundpub.payout_requests` | 3 | Status/currency/amount aggregates, proof/reference existence; no bank numbers or raw proof paths. |
| `soundpub.profiles` | 182 | Soundpub identity/balance linkage; no full personal profiles. |
| `soundpub.rate_limits` | 2 | Application inventory only. |
| `soundpub.release_payments` | 9 | Invoice/payment/refund candidates; reference-presence aggregates, no IDs/URLs unless minimally needed. |
| `soundpub.releases` | 292 | Payment/business linkage only. |
| `soundpub.royalties` | 14,474 | Entire Soundpub royalty population for denominator, grouped by reviewed financial fields. |
| `soundpub.royalty_uploads` | 10 | Import/source/period/status and replay-key existence. |
| `soundpub.storage_backup_log` | 0 | Application inventory only. |
| `soundpub.storage_backup_runs` | 3 | Application inventory only. |
| `soundpub.takedown_request_documents` | 0 | Application inventory only. |
| `soundpub.takedown_request_items` | 24 | Application inventory only. |
| `soundpub.takedown_request_targets` | 3 | Application inventory only. |
| `soundpub.takedown_requests` | 3 | Application inventory only. |
| `soundpub.takedown_status_history` | 0 | Application inventory only. |
| `soundpub.tracks` | 431 | Royalty/work/release linkage only. |
| `soundpub.user_roles` | 182 | Soundpub role linkage only; not approved beneficiary mapping. |

No shared Auth or Storage rows were queried. If later required, `auth.users` must join a proven Soundpub identity set; `storage.objects` must match exact reviewed Soundpub business references/buckets. Never enumerate shared users or storage wholesale. No other application schema belongs to this financial population.

## Inherited financial populations and unknowns

These figures come from the separately identified 2026-10-27 financial snapshot and prior Phase 3E reports. They are **not rerun** and must not be combined into a deduplicated business-record total.

| Population / source predicate | Inherited evidence | Current limit |
| --- | --- | --- |
| Royalties: entire `soundpub.royalties` | 14,474; all missing source-row numbers | Source provenance and original statement coverage unverified. |
| Imports: entire `soundpub.royalty_uploads`; `status='success'` | 10 total, 10 successful; all 10 missing replay keys and inserted-count equality | Current status/period/currency population unknown. |
| Corrections/reversals/archive | Main inventory had 0 archived rows | Does not prove absence of reversals/corrections, audit events or deletes. |
| Composer royalties: entire table | 0 | Six older local export rows/five composer codes remain a separate unresolved population. |
| Adjustments: entire `soundpub.balance_adjustments` | 33; earlier reports describe opening-balance reason `migration_opening_balance` | Row-level independent justification/approval absent; fresh reason/currency enumeration unavailable. |
| Payout requests / paid requests | 3 / 2 using `status='paid'` | Local paid is not settlement. |
| Payout reservations | 5; all linked to pending/approved/paid requests in inherited check | Not five additional payouts. |
| Paid payout proof references | 2 nonempty proof paths among 2 paid rows | Object metadata/bytes and external settlement not verified. |
| Release payments / paid | 9 / 4 using `status='paid'` | No independently reconciled provider settlement. |
| Release provider references | 9 nonempty IDs and 9 nonempty URLs; paid subset 4/4 | References are columns on payment rows, not additional invoices. |
| Invoice document metadata fields | 2 release invoice numbers and 2 PDF paths, both on paid rows; same other 2 paid rows missing both | Storage object existence/linkage and original document authenticity unverified. |
| Copyright payments / paid | 2 / 0; both expired; both had provider ID and URL | Empty paid subset proves no paid lifecycle. |
| Refunds/reversals/provider events | **UNKNOWN** | No trusted complete historical population supplied; never report zero. |
| Financial audit rows | **UNKNOWN** | Whole `soundpub.audit_logs` count 18,307 is not a reviewed financial subset. |
| Profile balance checks | 182; inherited arithmetic/negative-balance predicates passed | Includes unapproved adjustments; not independent economic approval. |

Required status/currency/period/provider/mapping/reconciliation-state denominators cannot be freshly generated. Historical dry run remains **NOT RUN**. No approvals, mappings, settlement classification or exceptions are created by this report.

## Reviewed recovery predicates and hashes — NOT EXECUTED

Hashes are SHA-256 of UTF-8 SQL exactly inside each code block, excluding trailing newline and semicolon. These corrected recovery predicates supersede the unexecuted client probe. No hash below is proof of production execution.

Q01 — built-in transaction identity/assertion; SHA-256 `880b2978790c877f732b0ac905a3131e4d07b3b9bc5da68a646c61a24ad65012`:

```sql
SELECT CURRENT_TIMESTAMP AS transaction_timestamp, CURRENT_USER AS database_role, pg_catalog.current_database() AS database_name, pg_catalog.current_setting('transaction_isolation') AS isolation, pg_catalog.current_setting('transaction_read_only') AS read_only
```

Q02 — application relation catalog, predicate `n.nspname = 'soundpub'`; SHA-256 `53786c03e8fcf695206e2f889586c56d133c4d210ecd473d647990e88e575213`:

```sql
SELECT n.nspname AS schema_name, c.relname AS relation_name, c.relkind AS relation_kind, c.relrowsecurity AS row_security FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'soundpub' ORDER BY c.relname
```

Q03 — column metadata, predicate `table_schema = 'soundpub'`; SHA-256 `a701dccf2d869319534d15eb9696bc97b567b458cf9e624d3831ca79a55c1968`:

```sql
SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'soundpub' ORDER BY table_name, ordinal_position
```

Run only after availability returns, through existing container client from required Docker directory. Required wrapper is `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;`, then `SET LOCAL statement_timeout = '45s';`, reviewed SELECTs, then `ROLLBACK;` — never COMMIT. Q01 must report database `postgres`, isolation `repeatable read`, read-only `on`. If any query errors, stop and rollback/close; record actual outcome. Metadata inventory must precede constructing aggregate table queries. Restrict direct scans to confirmed base tables; review view bodies/RLS/function behavior before indirect access. No arbitrary or application functions.

Runnable **local-only** validation below checks hashes and exact approved SQL before any future reuse. It performs no connection or file write. It is an exact-query allowlist, not a general SQL parser; future queries require separate review and hashes.

```powershell
@'
from pathlib import Path
import hashlib, re
path = Path('docs/migration/PHASE3E_ADMISSION_PRODUCTION_SNAPSHOT.md')
text = path.read_text(encoding='utf-8')
queries = re.findall(r'```sql\n([^`]+)\n```', text)
expected = [
    '880b2978790c877f732b0ac905a3131e4d07b3b9bc5da68a646c61a24ad65012',
    '53786c03e8fcf695206e2f889586c56d133c4d210ecd473d647990e88e575213',
    'a701dccf2d869319534d15eb9696bc97b567b458cf9e624d3831ca79a55c1968',
]
assert len(queries) == len(expected) == 3
blocked = r'\b(insert|update|delete|merge|truncate|alter|drop|create|grant|revoke|copy|call|do|vacuum|reindex|refresh|commit)\b'
for query, digest in zip(queries, expected):
    assert hashlib.sha256(query.encode()).hexdigest() == digest
    assert query.startswith('SELECT ') and ';' not in query
    assert not re.search(blocked, query, re.I)
    functions = re.findall(r'\b([a-z_][a-z_0-9.]*)\s*\(', query, re.I)
    assert set(functions) <= {'pg_catalog.current_database', 'pg_catalog.current_setting'}
assert "n.nspname = 'soundpub'" in queries[1]
assert "table_schema = 'soundpub'" in queries[2]
print('PASS: 3 exact reviewed read-only metadata queries; no production connection')
'@ | python -
```

## Decision and routing

**Production read-only SQL accessibility: BLOCKED. Fresh historical snapshot: NO. Full current population enumeration: NO.** Infrastructure diagnosis/restoration belongs to shared-platform owner, outside this no-change task. No restart is recommended or authorized by this report. Agent D must not turn inherited counts into a fresh denominator or call historical dry run complete.

This review executed zero SQL statements, processed zero financial rows and initiated zero mutations. See [PHASE3E_ADMISSION_PRODUCTION_READ_LOG.md](PHASE3E_ADMISSION_PRODUCTION_READ_LOG.md) for access attempts and rollback limits. Only these two local documents were authored.
