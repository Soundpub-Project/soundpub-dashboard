# Phase 3B Authorization Matrix

| Actor | Read own artist | Read label roster | Create managed artist | Edit artist | Assign/transfer | Detach | Review deletion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| anonymous/unknown | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| ordinary user | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| artist owner | ALLOW | DENY | DENY | ALLOW | DENY | DENY | DENY |
| other artist | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| label/whitelabel owner | managed roster only | own only | own label | managed artist | DENY except detach | own managed artist | own requests read only |
| unrelated label | DENY | DENY | own label only | DENY | DENY | DENY | DENY |
| admin | ALLOW | ALLOW | ALLOW | non-privileged target | ALLOW | ALLOW | ALLOW |
| superadmin | ALLOW | ALLOW | ALLOW | non-self protected rules | ALLOW | ALLOW | ALLOW |
| inactive/suspended/roleless/unverified | DENY | DENY | DENY | DENY | DENY | DENY | DENY |

Browser owner IDs, roles, verification flags, status, label membership, and actor IDs are never authoritative. Current DB roles/status are re-read in transaction. Expected previous parent prevents stale transfer. Protected admin/superadmin targets cannot be claimed as artists. Reference-only parents grant no access.
