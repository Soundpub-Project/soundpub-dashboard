# Phase 1B Application Restore Report

Status: **FAIL / NOT RUN.**

Historical scoped database and 598-object byte restores passed from on-host copies. Phase 1B did not demonstrate a complete application restore from an encrypted off-host copy.

Missing mandatory evidence: real auth linkage/session behavior, storage metadata plus all required external bytes, owner/private access, login/profile/roles/releases/tracks/media/royalties/payout/copyright/takedown/notification/settings/admin reads, provider-safe stubs, public/private routing, and exact financial reconciliation. Existing isolated database containers do not satisfy application restore.

## Phase 1C — Agent G assessment, 2026-10-27

**Status: BLOCKED / NOT RUN. Restore from off-host = NOT RUN. APPLICATION RESTORE = NOT RUN. No PASS awarded.**

Historical Phase 1B text above is preserved. Fresh read-only host checks and blockers are detailed in `OFFSITE_BACKUP_REPORT.md`. Source SSH inspection began at `2026-10-27T01:38:16Z` (08:38:16 Asia/Bangkok). No production bytes were transferred, no target was provisioned and no application drill was started.

### Restore infrastructure assessment

Production-host `docker ps -a` showed no container matching restore, repro, backup or phase1 names. This narrowly establishes that no named historical recovery container was found, not that all possible infrastructure was exhaustively audited. Local Docker responds and lists existing Soundpub frontend containers, but no approved isolated recovery stack was identified. Existing application containers and tunnels are not safe default restore targets and were not reused.

The candidate F: volume has sufficient observed free capacity for historical artifacts, but plaintext restore-volume encryption is unverified. No dedicated private network, tested outbound deny policy, non-production auth settings, local email/payment stubs, protected credential injection or resource-specific cleanup plan is established. No production container, volume, network, routing or provider configuration was modified.

### Required validation ledger

Every row below is **NOT RUN** for Phase 1C; none receives credit from historical on-host SQL or byte checks.

| Validation | Required acceptance |
| --- | --- |
| Off-host source | Retrieve approved encrypted backup and trusted manifests from restricted off-host destination; production host unavailable as primary source |
| Database and settings | Restore approved Soundpub rows, auth dependencies, roles/grants/RLS/functions, storage metadata and required settings; reconcile current security migrations and fingerprint |
| Storage bytes | Restore every required object/version; compare size and checksum and resolve every required DB reference; no unexplained omissions/extras |
| Login and logout | Safe integration identities authenticate and log out; session behavior verified without production OAuth/email calls |
| Profile and roles | Intended reads succeed; other-owner and privilege-elevation attempts denied |
| Artist and label | Required restored records and ownership links readable by intended roles |
| Releases and tracks | Restored relationships and required fields match recovery manifest |
| Cover and audio download | Download restored bytes through isolated application and verify hashes |
| Royalty view and payout read | Exact restored financial values and authorized read paths verified; no settlement or payout calls |
| Copyright record and contract access | Intended owner/reviewer/admin access succeeds; anonymous and other-owner access denied |
| Takedown and notification read | Restored records and attachments readable with intended authorization; no real outbound notifications |
| Admin read | Authorized admin reads succeed and non-admin denial verified |
| Storage private download and signed URL expiry | Authorized private downloads succeed; expired and tampered URLs fail; no permanent public contract access |

### Blockers and safe execution prerequisites

1. Resolve G-B01–G-B06 in `OFFSITE_BACKUP_REPORT.md`; no verified encrypted off-host recovery source or independently recoverable key currently exists in assessed evidence. Current source coverage remains incomplete.
2. Name an authorized recovery operator and dedicated target. Verify encrypted plaintext storage, capacity, resource limits, network boundaries and outbound denial before decrypting sensitive data. Use explicit non-production credentials and provider stubs; prove email/payment/OAuth production endpoints cannot be called, including restored jobs, triggers and Edge Functions.
3. Establish restricted manifests and reproducible infrastructure for database/auth/storage/application settings. Preserve current security remediations rather than blindly reopening a historical privilege snapshot. Obtain approved numeric RPO/RTO and a consistent database/object recovery boundary; current values and measured recovery durations are unestablished.
4. Predefine rollback as disposal of this drill's uniquely named resources only. Record exact container/network/volume and encrypted temporary paths, prove no production mounts or external endpoints attached, verify path/resource ownership before deletion and preserve encrypted backup/evidence. No blanket Docker prune or shared-volume cleanup.
5. Restore from independent off-host retrieval, run every ledger row with safe identities, record counts/checksums/status without secrets, measure RPO/RTO and obtain independent QA evidence. Only complete deployed and independently tested recovery can change this gate to PASS.

Historical evidence remains useful but bounded: prior on-host database ACL/object/count checks and 598/598 byte comparisons are not freshly repeated full recovery, do not cover two added local logos or inaccessible external assets, and do not establish auth/application behavior. No RTO/RPO, provider containment, independent application restore or financial reconciliation PASS is claimed.

**Actions performed:** read-only SSH/Compose/mount/tool/archive inspection, local destination/capacity/encryption-state and Docker availability assessment, and these two report updates. No backup scripts were added because an executable transfer would precede required destination/custody authorization evidence. No operational resources were created; rollback is not applicable to this documentation-only assessment. Phase 2 remains blocked by these recovery gates independently of other agents' outcomes.
