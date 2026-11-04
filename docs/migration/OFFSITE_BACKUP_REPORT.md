# Phase 1B Offsite Backup Report

Status: **FAIL / NOT VERIFIED.** Detailed evidence: `PHASE1B_OFFHOST_RECOVERY_REPORT.md`.

Database off-host encrypted copy: NOT VERIFIED. Storage off-host encrypted copy: NOT VERIFIED. Protected retention/readback: NOT VERIFIED. Restore from off-host: NOT RUN.

Existing current-state database and 598-object storage archives remain private and checksummed on the production host. Safe export stopped because approved scope, encryption recipient/key custody, overwrite protection, off-host destination authorization and isolated restore containment were not established. Synthetic DPAPI/AES/HMAC checks do not count as a production backup.

## Phase 1C — Agent G assessment, 2026-10-27

**Status: BLOCKED. OFF-HOST BACKUP = NOT VERIFIED. Off-host DB backup = NOT VERIFIED. Off-host storage backup = NOT VERIFIED. No PASS awarded.**

Prior Phase 1B findings above are preserved. Fresh inspection used authenticated SSH to `maskhar@20.20.20.3`, beginning in `/data/supabase/instances/supabase-01/config`. Host time at initial inspection: `2026-10-27T01:38:16Z` (08:38:16 Asia/Bangkok). Only metadata, filtered configuration, archive inventories and aggregate verification results left the host. No archive, object bytes, dump contents, encryption material or secret values were exported. No backup or production configuration was changed.

### Fresh read-only evidence

| Check | Observation | Limit |
| --- | --- | --- |
| Compose services | Eleven running services, including db, auth, storage and functions | Service availability does not establish disaster recovery |
| Source mounts | DB data: `volumes/db/data`; storage: `volumes/storage` mounted at `/var/lib/storage`; functions: `volumes/functions` mounted at `/home/deno/functions` | Production mounts are writable by their services; none was changed |
| Runtime images | `supabase/postgres:17.6.1.136`, `supabase/storage-api:v1.60.4`, `supabase/edge-runtime:v1.74.0` | Runtime inventory only |
| Existing backup directory | `phase1-backups/20261026T200848Z`, mode 0700; database dumps, globals and storage archive mode 0600 | Same host as production; permissions do not provide encryption |
| Original database and globals | 5,413,635-byte dump and 1,843-byte globals archive; both entries in `SHA256SUMS` freshly verified | Shared database includes other tenants; not an ownership-filtered export |
| Later database dump | 5,413,336 bytes; single `POST_REMEDIATION_SHA256SUMS` entry freshly verified | Historical security snapshot, not proof that concurrent Phase 1C changes are captured |
| Storage archive and manifest | 9,953,083,392-byte tar; 598 regular members, 9,950,688,219 member bytes, zero duplicate/special members; exact path-set equality with 598-line `storage-files.list` | Headers and selection checked; archive payload checksum and extraction were not repeated in this assessment |
| Encryption tooling | gpg and openssl available; restic, borg, rclone and age not found on PATH | Tool availability establishes neither recipient approval nor key custody |
| Narrow configuration discovery | No backup/restic/borg/rclone/KMS/age-recipient environment variable names in rendered Compose services; standard SSH-account rclone config and GPG public keyring absent | No broad secret search; other recovery systems may exist outside inspected scope |
| Capacity | Production filesystem free: 905,887,064,064 bytes; candidate F: healthy NTFS, 383,276,707,840 bytes free | Capacity alone does not authorize transfer |
| Candidate workstation destination | `F:\soundpub-offhost-backups` absent; no destination ACL/retention evidence available; BitLocker state unverified | Prior Phase 1B report records conditional authorization for this candidate, not completed safety controls |

### Exact blockers and closure evidence

| ID | Blocker | Required evidence before transfer or PASS |
| --- | --- | --- |
| G-B01 | No verifiably protected destination established | Confirm recovery custodian and authorization for shared-tenant package, non-reparse destination, restricted ACLs, authenticated transfer and independently verifiable access controls |
| G-B02 | Encryption recipient and recoverable key custody unproven | Approved encryption format and recipient/KMS identity; separately protected key custody; authorized recovery operator demonstrates decryption without relying on lost production host or sole workstation profile; no key secrets stored with backup |
| G-B03 | Retention and overwrite resistance unproven | Approved retention period, unique no-overwrite backup identities, protected versioning/immutability where supported, deletion authority and recovery procedure |
| G-B04 | Current source scope incomplete | Reconcile historical 598 objects against ownership report's 600 local objects, including two omitted logos totaling 435,430 metadata bytes; recover or explicitly disposition 407 GCS/legacy Cloud candidates and 17 other external references; classify shared/unknown identities and data |
| G-B05 | No complete current trusted recovery manifest | Restricted object-to-record ownership map, per-object size/hash/version, encrypted DB/globals/settings/runtime inventory, snapshot consistency boundary and current security migration ledger; trusted manifest provenance independent of adjacent on-host checksums |
| G-B06 | No off-host readback or independent recovery evidence | Transfer only encrypted approved assets, verify destination receipt, independently retrieve/decrypt and compare manifest checksums, then complete isolated application drill and independent QA |

Counts for expanded storage scope are inherited from `STORAGE_OWNERSHIP_REPORT.md`, not a new database ownership audit. `EXTERNAL_STORAGE_RECOVERY_REPORT.md` was absent at inspection. No external reference receives an assumed waiver. Historical adjacent checksums prove consistency with those manifests, not resistance to simultaneous archive/manifest replacement.

The Phase 1B DPAPI synthetic result remains primitive-only evidence. No new encryption scheme, key or writer was created: missing custody/destination and scope evidence prevents safe execution. No destination directory, partial ciphertext, run lock or restore resources were created, so this assessment needs no operational rollback. Existing production assets remain untouched.

**Coordinator handoff:** resolve G-B01–G-B05 with destination/data owners and recovery custodian, then execute authenticated encrypted transfer/readback and independent isolated restore. Off-host and application gates remain BLOCKED; Phase 2 must not begin on this evidence.
