# Phase 1B off-host recovery verification

Status: **BLOCKED. Database off-host backup: NOT VERIFIED. Storage off-host backup: NOT VERIFIED. Restore from off-host: NOT RUN. Application restore: NOT RUN. Phase 2: NOT READY.**

Agent E observation date: 2026-10-27, Asia/Bangkok. Scope is read-only verification and documentation. The explicit task prohibits production mutations, sensitive-asset transfers, or backup writes until safe encryption, off-host destination, and authorization are proven. Those prerequisites were not established. No archive, key, object body, database dump, or configuration secret was transferred off-host. No backup, extraction, restore target, provider call with side effects, or production service recreation was initiated.

## Evidence provenance

Read the complete Phase 1B request and baseline `PHASE1_FINAL_REPORT.md`, `SUPABASE_MIGRATION_AUDIT.md`, `BACKUP_REPORT.md`, `BACKUP_RESTORE_REPORT.md`, `STORAGE_BACKUP_VERIFICATION.md`, `PHASE1_VERIFICATION_REPORT.md`, `STORAGE_AUDIT.md`, `CUTOVER_REQUIREMENTS.md`, `ROLLBACK_REQUIREMENTS.md`, and `TEST_STRATEGY.md`. Historical isolated restore results are labeled as historical. New auth/storage gaps are recorded in Agent E's companion reports; they do not overwrite the old scoped PASS.

All server inspection began through SSH to `maskhar@20.20.20.3` in `/data/supabase/instances/supabase-01/config`. Compose services were inspected without recreating them. SQL inspection used `BEGIN READ ONLY`, bounded statement timeouts, and `ROLLBACK`; only aggregate status data left the server. Archive checks operate on existing private on-host files and emit only counts/status, never stored or computed digest values or member paths.

## Existing on-host evidence

The baseline's private timestamped backup directory remains on the same host as production. The directory is mode `0700`; the database dumps, storage tar, and object-selection files inspected are mode `0600`. Filesystem permissions are not encryption or immutability. Timestamp is part of the existing backup directory name; no fresh recovery point was captured.

| Artifact/check | Independently observed | What this proves |
|---|---|---|
| Original database archive | Present; 5,413,635 bytes; mode `0600` | Existing on-host file only |
| Post-remediation database archive | Present; 5,413,336 bytes; mode `0600` | Existing later on-host file only, not a current transactional snapshot |
| Original checksum manifest | Both two referenced files matched; zero missing, unsafe, or mismatched paths | Read integrity against adjacent manifest, not trusted off-host provenance |
| Post-remediation checksum manifest | One referenced file matched; zero missing, unsafe, or mismatched paths | Same limitation; no digest values published |
| Storage archive | Present; 9,953,083,392 bytes; mode `0600` | Existing scoped on-host tar |
| Storage checksum manifest | All three referenced files matched; zero missing, unsafe, or mismatched paths | Fresh complete archive/selection integrity check, performed entirely on source host |
| Storage tar inventory | 598 regular members, 9,950,688,219 bytes, exact selection path-set equality, zero duplicate member names | Current archive inventory, not a fresh extraction or application restore |
| Selection lists | Present, mode `0600`; 598 selected physical paths | Private historical allowlist exists |
| Source allowlist stat check | 598 confined regular files; 9,950,688,219 bytes; no symlink components | Current existence and size for original scope; not fresh content equality |
| Storage backup app metadata | Two failed runs, zero uploaded files, zero object-log rows | Application logs supply no successful Drive-backup evidence |

Existing manifests and archives reside together. Even successful checksum comparisons cannot establish resistance to a privileged attacker replacing both. Protected off-host retention and trusted manifest handling remain prerequisites.

The original database archive covers the **shared database**, including other applications' auth and data. A role-global archive is also covered by the original checksum manifest. Its raw content was not inspected or exported. A guessed globals filename was not used to infer absence: only the actual manifest-referenced file's existence/integrity is relevant. An arbitrary workstation directory or available repository artifact area is not an approved destination for this shared sensitive backup.

## Historical restore evidence versus current verification

| Capability | Historical Phase 1 evidence | Agent E result |
|---|---|---|
| Scoped database restore with ACLs | Disposable PostgreSQL 17.6 restore; 33 tables and 34,425 aggregate rows; grant/security subset checked | Read report and rechecked existing archive integrity; did not repeat restore |
| Selected storage byte restore | 598/598 source/restored comparisons; 9,950,688,219 bytes; zero extras; extracted copy removed | Read report and checked source existence/size; did not extract or compare freshly restored bytes |
| Full current storage coverage | External/shared ownership incomplete | Still blocked; current scan adds two local logos and nine current external candidates |
| Off-host retrieval/decryption | No demonstrated off-host encrypted copy | No destination/key/readback evidence established |
| Restore from off-host | Not performed | Not run |
| Core application reads after restore | Not exercised | Not run |

Historical storage evidence therefore covers **598 of the expanded 600 current local metadata objects**, plus none of the **407 current GCS/legacy Cloud candidates** or **17 other external references**. Two added local logos total 435,430 metadata bytes. Audit-history retention can add further scope. Historical database row counts and local checksum success cannot make incomplete current recovery PASS.

## Why no off-host write was safe to execute

| Prerequisite | Evidence inspected | State |
|---|---|---|
| Destination controlled by authorized recovery operator | Follow-up authorizes candidate `F:\soundpub-offhost-backups`; healthy local NTFS volume and capacity verified | Path authorized conditionally; recovery-account custody and destination protections not established |
| Authorization for the named Phase 1 package | Follow-up conditionally authorizes assessing and safely copying that package; shared scope disclosed above | Applies to named package after safety conditions pass; no broader tenant export authorized |
| Approved ownership-filtered storage allowlist | Historical 598 selection; expanded current metadata and external references | Incomplete; shared/unknown objects held |
| Encryption method and recipient/key custody | No approved recipient, KMS/key reference, encrypted repository, or recovery-key availability demonstrated | Not established |
| Destination overwrite/retention protection | No immutable/versioned protected destination demonstrated | Not established |
| Restricted restore infrastructure | No approved encrypted isolated recovery target, egress policy, capacity, or key access demonstrated | Not established |
| Off-host readable copy | No remote receipt/list/readback verification | Not established |

This is an evidence boundary, not a claim that no backup system or credential exists anywhere. No broad secret search, credential discovery, repository environment export, or provider-console mutation was attempted. No production backup key was generated or persisted, and no plaintext temporary copy was placed on the workstation.

## Follow-up: Windows DPAPI-protected AES/HMAC candidate

The coordinator proposed streaming the existing production Phase 1 package to `F:\soundpub-offhost-backups` using built-in Windows DPAPI-protected AES/HMAC, with CreateNew, restricted ACLs, clear cleanup, and no duplicated work. **Assessment: technically feasible for the current Windows account, but execution safety conditions are not yet proven; no sensitive transfer was performed.** Absence of `age`, `gpg`, or `7z` is not itself a blocker.

| Independently inspected prerequisite | Result |
|---|---|
| Destination filesystem | Local `F:` is healthy NTFS, 383,276,707,840 bytes free at observation |
| Package inventory | Existing named source directory has 21 regular, non-symlink files totaling 9,964,075,725 bytes; capacity is sufficient |
| Destination activity | Proposed directory does not exist; process metadata showed no matching off-host-destination or DPAPI/HMAC backup activity at observation |
| Concurrent restore work | A separate Phase 1B isolated restore container exists on source; it was neither reused nor altered |
| Native runtime | PowerShell 7.6.5, .NET 10.0.11; Windows `ProtectedData` available; local Docker reports Linux |
| Native encryption composition | In-memory synthetic 1,048,613-byte AES-256-CBC/PKCS7 streaming round trip and DPAPI CurrentUser key round trip PASS |
| Authentication check | Independent HMAC-SHA256 key; authenticated header/IV/wrapped-key/ciphertext composition tested; ciphertext change, header change, and truncation rejected before decrypt in synthetic check |
| Files/assets written by synthetic check | Zero; random keys and payload existed only in memory and key/plaintext arrays were cleared afterward |
| Existing destination ACL / CreateNew / retention | Not exercised; no destination directory or backup file created |
| Full backup writer/standalone recovery reader | Not implemented or tested against the actual package; native primitive tests alone are insufficient |
| Restore-data at-rest protection | BitLocker status unavailable in current context; plaintext restore-volume protection not established |

DPAPI `CurrentUser` protects a random encryption/authentication key against ordinary access by other accounts, but recovery depends on the actual execution account's DPAPI master keys, profile, and usable account credentials/domain recovery. A DPAPI-protected key stored next to ciphertext is not an independently portable recovery key. This session did not establish that the execution account is the approved long-term recovery custodian or that its DPAPI recovery material is backed up and recoverable. Loss/recreation of that Windows profile or some account-reset scenarios can strand the copy even when `F:` survives. `LocalMachine` scope would broaden decryption to other local principals with access to the blob and does not repair host-loss recovery; it was not used.

The successful synthetic check proves usable primitives under the current process identity, not recoverability after profile loss, a safe large-file container format, multi-GiB interrupted-transfer behavior, or a source-independent restore. No encryption keys, wrapped keys, IVs, tags, digests, account names, or SIDs were printed in the synthetic check or saved to repository files.

Before a real stream can be called robust, the implementation must use independent random encryption/MAC keys, a versioned bounded header, authentication of all header/IV/key-envelope/ciphertext bytes, constant-time tag comparison, and rejection of truncation/append/header alteration. It must verify the complete MAC before releasing any plaintext, keep the ciphertext file locked against replacement through verification/decryption, validate SSH exit and source stability, and independently compare recovered content against the source manifests. A hash-only check or authenticating ciphertext while simultaneously extracting unverified plaintext is insufficient.

Required filesystem/rollback controls are concrete: validate `F:` and every destination ancestor as non-reparse paths; create a restricted directory owned by the approved recovery account with inheritance disabled and only that account plus SYSTEM allowed; acquire an exclusive CreateNew run lock; create uniquely named ciphertext with CreateNew and FileShare.None; flush and verify before no-overwrite final publication. On failure, close processes/handles and remove only this run's proven-contained partial ciphertext and lock. Never overwrite existing backups, clear unrelated directories, or touch source artifacts. Restore plaintext must remain in verified encrypted storage or a demonstrably confined memory-only target. These controls were assessed but not represented as executed.

**Decision:** do not create the destination or start a production transfer until recovery-account/key-custody evidence and a tested authenticated streaming writer/reader plus isolated restore path exist. The named path and sufficient free space do not replace those requirements. This leaves the mandatory off-host and restore gates BLOCKED without inventing an untested cryptographic backup format or consuming another agent's restore target.

## Existing Drive function cannot close the gate

Repository `supabase/functions/backup-storage-to-drive/index.ts` lists whole buckets, includes a bucket outside the documented Soundpub scope, inserts run metadata before its credential checks, and can create folders/upload blobs. Calling it would mutate production backup metadata and potentially transfer shared assets, so it was not invoked.

The inspected functions-container `GOOGLE_DRIVE_API_KEY` is unset/empty; application metadata shows two failed runs and no recorded copied objects. Those observations do not demonstrate a linked, readable destination. Source also limits uploads to 40 files per run, skips files above 200 MiB, omits private legal/payment/takedown buckets from its bucket list, and does not implement a complete database backup, approved per-object ownership filter, demonstrated client-side backup encryption, or an off-host restore drill. Provider-managed encryption, destination ACLs, retention and account control were not independently established. Even an HTTP success or populated credential would not close these gaps.

## Required authorized execution sequence

The following is a closure plan, not evidence that execution occurred. An authorized recovery operator must first establish the missing destination, custody, scope, and isolation evidence. The task's conditional authorization then permits only the specifically demonstrated safe operation; it does not authorize an unbounded shared-tenant export.

1. Approve either a Soundpub-only ownership-filtered recovery set or an explicitly authorized full shared-platform disaster-recovery set. Preserve the correct auth linkage, roles/extensions/prerequisites, bucket/object metadata, byte versions and schema-security state. Resolve whether audit-only references require bytes.
2. Record a destination ownership/region/access/retention decision without publishing sensitive coordinates. Prove encryption recipient or managed-key reference and independent recovery-key custody. Verify write/read permissions using authorized non-sensitive fixtures before any sensitive transfer.
3. Establish a restricted encrypted restore target with no production credentials, network routes, DNS/provider callbacks, SMTP delivery, payment settlement, scheduled jobs, or uncontrolled outbound workers. Prove egress containment before restoring shared data or invoking application flows.
4. Capture a coherent approved database/object-version boundary. Stream encryption before leaving the source or use a verified encrypted backup backend, with no unencrypted workstation/temp staging. Retain timestamps, scope/metadata manifests, per-object content checksums and protected overwrite/retention controls. Preserve existing backups.
5. Independently retrieve the off-host copy, validate encryption/readability and manifests, and restore exclusively from that retrieved copy. Restore ACLs, platform prerequisites and approved auth/storage linkage. Record zero missing, extra, corrupt, unexplained or out-of-scope objects and exact database/financial reconciliation as applicable.
6. With synthetic identities and local provider stubs, test login, profile, role authorization, release/track/audio/cover reads, royalties, read-only payouts, copyright/takedown, notifications/settings/admin reads and private storage downloads. Verify anonymous/other-owner denial and expired/tampered signed URLs. No live emails, payments, callbacks, or identity changes.
7. Measure recovery point/time against approved numeric RPO/RTO, perform independent QA, and record retrieval, decryption, schema/data/byte/privacy/application results separately. Only demonstrated successful end-to-end recovery can receive PASS.

## Exact blockers

| ID | Blocker | Gate affected |
|---|---|---|
| RECOVERY-E1 | Candidate F: path authorized, but approved DPAPI recovery-account/key custody, authenticated streaming recovery tooling, ACL/retention and readback unproven | Database and storage off-host backup |
| RECOVERY-E2 | Named package contains shared-tenant database/roles; authorization remains conditional on the stated safety controls and cannot justify a broader export | Sensitive transfer and disaster-recovery scope |
| RECOVERY-E3 | Ownership manifest incomplete; two local logos omitted, 407 current external candidates unavailable/unverified, other external/history dispositions absent | Complete storage backup/restore |
| RECOVERY-E4 | No verified encrypted isolated restore target or source-independent copy retrieval | Restore from off-host |
| RECOVERY-E5 | No full application/auth/privacy restore test or approved measured RPO/RTO | Full restore validation and application restore |

No new PASS is assigned to off-host recovery. Historical scoped on-host results remain preserved. The coordinator must keep these mandatory gates BLOCKED until the listed evidence is independently produced.
