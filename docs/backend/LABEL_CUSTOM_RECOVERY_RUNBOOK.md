# Label custom recovery importer and synthetic rehearsal

Scope: synthetic fixtures and already-extracted staging only. The explicitly opted-in rehearsal provisions two owned disposable local PostgreSQL fixtures. No backup discovery/access, extraction, decryption, environment-file loading, remote or production operations, credential restore, live domain mutation, or ledger posting. Port 8181 is never bound or contacted.

## Input contract

Call `planRecovery(absoluteStagingDirectory)` from `backend/src/recovery/index.ts`, or `recover(absoluteStagingDirectory)` from `backend/src/recovery/apply.ts`. Default is dry-run; no database connection is created. Caller owns protected report storage. Reports include contact details: do not publish them for real data.

Provide `manifest.json` with this shape:

```json
{
  "version": 1,
  "namespace": "synthetic-v1",
  "files": [
    { "kind": "users", "file": "users.json", "sha256": "<64 lowercase hex characters>", "rows": 1 },
    { "kind": "units", "file": "units.json", "sha256": "<64 lowercase hex characters>", "rows": 1 },
    { "kind": "artists", "file": "artists.json", "sha256": "<64 lowercase hex characters>", "rows": 1 },
    { "kind": "releases", "file": "releases.json", "sha256": "<64 lowercase hex characters>", "rows": 1 },
    { "kind": "tracks", "file": "tracks.json", "sha256": "<64 lowercase hex characters>", "rows": 1 },
    { "kind": "royalties", "file": "royalties.json", "sha256": "<64 lowercase hex characters>", "rows": 1 }
  ]
}
```

Each file contains a JSON array. All six kinds required, exactly once, distinct regular files. SHA-256 covers exact file bytes. Row counts must match. Filenames confined to single lowercase JSON basenames. Backup path components, symlinks/junctions, path traversal and files over 32 MiB rejected. Stage directory must remain private and immutable during planning; concurrent hostile filesystem replacement is outside this foundation's guarantees. Hashes prove consistency against supplied manifest, not source authenticity; caller must establish manifest provenance separately.

Strict row fields:

| Kind | Fields |
| --- | --- |
| users | id, name, email |
| units | id, ownerId (source user ID), name |
| artists | id, unitId (source unit ID), name, email, phone |
| releases | id, artistId (source artist ID), title |
| tracks | id, releaseId (source release ID), title |
| royalties | id, trackId (source track ID), currency, amountMinor |

IDs and namespace use 1–128 ASCII letters, digits, underscores or hyphens. Currency uses three uppercase letters. Money uses signed integer strings, summed with BigInt per currency. No floating-point conversion. Royalties here represent identity and reconciliation data, not authorized earnings or settlement evidence.

Unknown fields rejected, including password hashes, passwords, sessions, refresh tokens, provider credentials and roles. Users carry `requiresReauthentication`; no credential tables touched. Custom artists carry `LABEL_CUSTOM_MANAGED` and `artistUserId: "NULL"` as staging metadata, never login accounts. Domain adapter must convert metadata to actual SQL NULL when separately implemented.

## Mapping and reports

Ordering: users → units → artists → releases → tracks → royalties. Canonical UUID-shaped IDs derive from SHA-256 of namespace, kind and source ID; retain namespace across replay. Never resolve foreign keys by email/name. Duplicate source IDs reject all competing rows. Case-insensitive trimmed duplicate names/emails within users or artists conservatively reject all competing rows; manual resolution required. Multiple units for one PIC rejected. A unit with an unresolved PIC produces `UNRESOLVED_OWNER`; unresolved descendants produce `UNRESOLVED_PARENT`, recursively preventing descendant acceptance. Reports expose kind, row position and reason, without guessing an owner or echoing rejected values.

Report contains manifest hash, accepted canonical records, sanitized rejected/orphan reason codes and row positions, counts, and exact accepted royalty totals per currency. Counts partition all input rows. Financial owner propagates from unit PIC; artist attribution propagates through release/track. No inferred balances, payouts or adjustments.

Run two independent synthetic staging plans and compare reports. Tests create temporary directories outside backups and remove only their own generated fixtures.

## Explicit disposable apply

Only `recover(directory, { apply: true, target: { databaseUrl, confirmDisposableDatabase } })` enables writes. No implicit environment target. Guard requires PostgreSQL URL, loopback host, default port `55433`, dedicated user `soundpub_recovery`, database named `soundpub_recovery_test_<suffix>`, password, no URL options, and confirmation exactly matching database name. A fixture may explicitly provide `expectedPort`, an integer in `32768..65535`; URL port must match it exactly. This avoids the permanent development database port without allowing arbitrary remote or low-port connections. Never put actual credentials in command lines, repository or reports.

Apply refuses rejected/orphan rows before connecting. Transaction checks actual database/user, acquires advisory lock, creates `recovery_foundation.records`, and inserts accepted canonical payloads with parameterized SQL. Same identity/payload replay is no-op; changed existing payload aborts entire transaction. Uniqueness protects canonical IDs. New rows in same namespace are additive; replay does not delete records absent from a later input. A confirmed report is returned only after commit. Client always released and pool closed.

This is a recovery staging importer, not a restore into `backend_users`, units, artists, releases, tracks or finance tables. No target-domain activation exists. Disposable-target URL guard is an operator safeguard, not proof of infrastructure isolation; provisioning must establish that target is disposable and has no access to live data.

Rollback: any failed write rolls back transaction, including initial table creation. After successful staging apply, discard only separately provisioned disposable target through approved tooling. No deletion/reset command provided. Domain recovery and finance correction need separate reviewed adapters and gates.

## Two-target disposable synthetic rehearsal

`rehearseRecovery(directory, [targetA, targetB])` in `backend/src/recovery/rehearsal.ts` receives explicit targets; it never provisions infrastructure or loads environment files. It requires distinct database names, checks both connected database/user identities, and verifies both targets contain no user tables and no recovery namespace before the first write. Populated targets fail closed; nothing is reset or deleted to make a run pass.

For each target, it calls the real importer, compares all persisted canonical IDs and JSON payloads with the source plan, reconciles royalty integer totals through PostgreSQL `numeric`, and repeats apply to prove replay changes neither report nor records. Both target record hashes must match. `snapshotRecoverySource` hashes the manifest and all six input files before/after; these checks do not rely on timestamps. Evidence includes hashes/counts, never URLs, passwords or source contact payloads.

The integration test uses one PIC, two catalog artists, two releases, two tracks and two royalty rows: ten accepted records, no rejects/orphans, IDR `9007199254740900` minor units. Its input exceeds JavaScript's exact integer range and includes a negative royalty; all sums stay exact. Separate temporary source directories hold conflict, missing-owner, session and refresh-token cases, preserving the original clean source throughout the entire run.

Negative cases run against both real targets:

- Replay conflict occurs after inserting an additional user in the same transaction; PostgreSQL rollback removes that partial insert and preserves all original rows.
- Missing PIC produces `UNRESOLVED_OWNER` and nine orphan rows; both apply attempts refuse the entire source.
- `sessions` and `refresh_token` fields are rejected without echoing their synthetic values; both targets remain unchanged. Other credential/unknown-field variants are covered without Docker.
- Persisted payloads must exactly match strict-schema output, users require reauthentication, artists have no login identity, and the only user table is `recovery_foundation.records`. No session, refresh-token, password or provider-identity table/data is restored.

### Fixture isolation and cleanup

The test owns its fixture code in `backend/test/label-custom-recovery-rehearsal.test.ts`. It does not use root/dev Compose files, change shared test support, migrate production/domain schemas, or add dependencies.

- Docker context `desktop-linux` must resolve to a local named pipe or Unix socket; remote endpoints are rejected before any lifecycle command.
- Every lifecycle command uses `docker --context desktop-linux compose -p dashboard-sounpub-dev --env-file NUL -f - ...` on Windows (`/dev/null` elsewhere). Compose receives a single generated service via stdin; no environment file is loaded.
- Each service has a UUID identity, `postgres:17-alpine`, password generated in memory, PostgreSQL data on tmpfs, `network_mode: bridge`, no shared volumes/bind mounts and no Compose-managed network. Existing development services are not in this configuration.
- A free port selected from `56000..65535` binds only `127.0.0.1`; the fixture never probes or binds 55433 or 8181, and rejects 55433 even when explicitly supplied to the fixture builder. Actual own-container labels, mount configuration, network mode and host-port binding are inspected before SQL writes.
- SQL import runs as the nonsuperuser `soundpub_recovery` in its own UUID database. Bootstrap admin is used only inside that new fixture to create this role and transfer database ownership.
- Cleanup runs only `rm --stop --force --volumes <exact-owned-service>`, including startup failures, followed by an exact-service existence check. No project-wide down, orphan removal, prune or permanent-volume operation occurs. Temporary source deletion checks the generated absolute path and basename first. Cleanup failures fail the test.
- Forced termination can prevent cleanup. Diagnose only the exact service identity from the generated test run; never use broad project cleanup. A free-port allocation race fails startup and cleans the owned fixture rather than switching targets.

## Commands and recorded evidence

From backend directory:

```powershell
npm run typecheck
node node_modules/typescript/bin/tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --esModuleInterop --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext test/label-custom-recovery.test.ts test/label-custom-recovery-rehearsal.test.ts
node --import tsx --test test/label-custom-recovery.test.ts test/label-custom-recovery-rehearsal.test.ts
```

The last command skips real PostgreSQL unless explicitly opted in. Run the owned fixtures only with authorization for local disposable Docker work:

```powershell
$recoveryOptInBefore = $env:RUN_RECOVERY_REHEARSAL
$recoveryTestExit = 1
try {
  $env:RUN_RECOVERY_REHEARSAL = '1'
  node --import tsx --test test/label-custom-recovery.test.ts test/label-custom-recovery-rehearsal.test.ts
  $recoveryTestExit = $LASTEXITCODE
} finally {
  if ($null -eq $recoveryOptInBefore) {
    Remove-Item Env:RUN_RECOVERY_REHEARSAL -ErrorAction SilentlyContinue
  } else {
    $env:RUN_RECOVERY_REHEARSAL = $recoveryOptInBefore
  }
}
if ($recoveryTestExit -ne 0) { throw 'Recovery rehearsal failed' }
```

`RUN_RECOVERY_REHEARSAL` is a process flag, not an environment file. It does not opt in other Docker suites. Leave `RUN_DOCKER_TESTS` unset for this task.

Executed 2026-11-04 Asia/Bangkok, repository backend directory, Node v24.22.1:

| Check | Observed result |
| --- | --- |
| Backend typecheck | PASS, exit 0 |
| Explicit strict TypeScript check of both recovery test files | PASS, exit 0 |
| Focused tests without opt-in | 11 passed, 1 skipped, 0 failed; exit 0 |
| Focused tests with local fixture opt-in | 12 passed, 0 skipped, 0 failed; exit 0; includes both real PostgreSQL targets and successful cleanup |
| Full `npm test`, external integration flags/DB URLs removed from child process | 192 passed, 34 skipped, 0 failed; exit 0. Skips are not integration PASS. No other Docker fixture opted in. |

Successful final two-target evidence (run after cleanup-existence checks, independent negative-source fixtures and restricted port allocation were added):

- Target A: `soundpub_recovery_test_76b0181a314d4f3b970a8f2e5cff9310`.
- Target B: `soundpub_recovery_test_706793fea7dc4bab9a64752cf52cf86b`.
- Both restored ten records; both record SHA-256 values: `94f687d4e92c1dc9989374b67bbacadfda9f797722ceec5967d353660987c872`.
- Source manifest SHA-256: `ecf8e32e6e918b1ab589a5aefcabd673d20d7389f6b84f48b96f2bfc78486e49`.
- Deterministic plan SHA-256: `c7e25c77e45574422268351c97fc6867853d15a07954ee68e3c81e5840b0095c`.
- Diagnostic records all seven source hashes, identical target totals/hashes, unchanged source, replay, unresolved owner, blocked credential apply and real rollback. These are assertions from executed tests, not inferred from test existence.

Unchanged source file SHA-256 values, verified again after all negative scenarios:

| File | SHA-256 |
| --- | --- |
| `manifest.json` | `ecf8e32e6e918b1ab589a5aefcabd673d20d7389f6b84f48b96f2bfc78486e49` |
| `users.json` | `996b2bd35def1542159b53b1562dcbee2d4f096be0e5311081c2e8f5ac4a7c13` |
| `units.json` | `423835509c177337ca161f548ce5c953acd12103aadf8f996455edd99fc24c4a` |
| `artists.json` | `547f4bbcdf5a8a80365ef420f441fbb278a92953556d6762b8b134c16370b0b4` |
| `releases.json` | `03766762f2152b844b1098ff0cd8c66075ce8d222f1a31187a9822f920c25f4a` |
| `tracks.json` | `7c392f6259dfc245ae50d20203e514c57ce02f89a7caa231691f5ffb19d3602b` |
| `royalties.json` | `533de03239b43537740d9b7c1c8a15af6ec277cf1702dfbbca79b6af361da9d9` |

An initial fixture assertion incorrectly expected tmpfs to appear in Docker `.Mounts`; Docker Desktop reports the configured mount in `.HostConfig.Tmpfs`. That assertion failed, the owned service was cleaned, and validation was corrected to require the tmpfs configuration and reject any persistent mount. Subsequent real runs passed.

## Gate decision and remaining limits

**PASS — requested two-target synthetic staging rehearsal:** identical independent target results, unchanged original source hashes, no imported sessions/refresh tokens, explicit unresolved-owner report, replay, transaction rollback and scoped cleanup demonstrated.

**NEEDS WORK — full Phase 8/domain recovery and production readiness:** staging records are not activated domain tables. Legacy extraction, approved source-ID crosswalks, login-artist classification, existing-domain identity collision checks, storage/media restore, audit/outbox/domain application, persisted operational run receipts, concurrent-writer recovery tests, and ledger reconciliation remain outside this slice. No backup was accessed; synthetic hashes do not establish backup authenticity or production recoverability. Do not mark the full master-plan recovery gate or production READY from this rehearsal.
## Program interpretation

For the Label Custom implementation program, this runbook closes the authorized **synthetic staging rehearsal** requirement: deterministic two-target import, rejection, rollback, replay, source-integrity, and no-session controls passed. It does not authorize or claim full real-data disaster recovery.

Before any production cutover, a separate human-approved recovery exercise must define and validate real extraction provenance, full domain mapping, media restore, identity collision handling, ledger reconciliation, protected evidence storage, and rollback ownership. Production Docker, remote hosts, and `backups/` remain untouched by this program run.