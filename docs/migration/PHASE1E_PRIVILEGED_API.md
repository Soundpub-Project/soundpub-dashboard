# Phase 1E Privileged API

## Status

**Privileged APIs = FAIL.**

## Source and deployment evidence

| Handler | Local source test | Mounted source | Public actual path |
| --- | --- | --- | --- |
| `create-user` | Mock authorization PASS | SHA-256 matches workspace | `.com` runtime remains unattested |
| `send-app-email` | Privileged API mock PASS | Differs from workspace secured candidate | Not verified |
| `backup-storage-to-drive` | Privileged API mock PASS | Differs from workspace secured candidate | Not verified |
| `xendit-webhook` | 41/41 local callback tests PASS | Deployed source differs from current workspace | `.com` route and real provider behavior unverified |

The deployed mount lacks the current `_shared/privileged-api.ts` helper. Only `_shared/cors.ts` matched.

## Required matrix

Anonymous, ordinary user, unauthorized role, invalid service identity, revoked credential, admin escalation, legitimate superadmin, and scheduler/service cases were not all verified against the deployed `.com` path. Zero-side-effect denials cannot be claimed.

## Deployment decision

No source upload or Functions restart occurred. Production change sequence is blocked at credential containment/rotation, and `.com` routing ownership is unknown.

## Exact blockers

1. Credential incident remains open; revoked-credential testing is impossible before rotation.
2. `.com` runtime/source identity remains unknown.
3. Mounted email and backup handlers are stale.
4. Legitimate scheduler identity for backup is not established.
5. Real authorized positive and unauthorized negative integration tests remain absent.

**Gate: FAIL.**
