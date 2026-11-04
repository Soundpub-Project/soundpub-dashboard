# Phase 3A authorization matrix

Current DB roles and status decide access on each request. `GET /api/v1/me`, own profile GET/PATCH and admin list/status/roles are routes. `O` means own profile; `T` means ordinary other target. All deny cases return 401 for missing/unknown identity, 403 for known forbidden actor/target, or 400/409 for malformed/conflicting changes.

| Actor | `/me` | Profile GET/PATCH | Admin list | T status | T roles | Self/privileged target change |
| --- | --- | --- | --- | --- | --- | --- |
| Anonymous / invalid / unknown binding | DENY 401 | DENY 401 | DENY 401 | DENY 401 | DENY 401 | DENY |
| Active user | ALLOW | O only | DENY | DENY | DENY | DENY |
| Active artist | ALLOW | O only | DENY | DENY | DENY | DENY |
| Active label | ALLOW | O only | DENY | DENY | DENY | DENY |
| Active copyright / whitelabel | ALLOW | O only | DENY | DENY | DENY | DENY |
| Active admin | ALLOW | O only | ALLOW | ALLOW ordinary T | ALLOW ordinary T without promotion to admin/superadmin | DENY |
| Active superadmin | ALLOW | O only | ALLOW | ALLOW T except superadmin | ALLOW T except superadmin | DENY self/superadmin |
| Inactive / suspended any role | DENY 403 | DENY 403 | DENY 403 | DENY 403 | DENY 403 | DENY |

No route edits another user's profile. PATCH rejects protected fields (email, id, roles, balance, status, parent), unsafe media URL, empty changes, invalid lengths. Admin hierarchy is rechecked inside transactions with locked current roles; role/status mutations audit actor and target. Relationship-dependent role removal and label transfer return conflict. Forged frontend IDs, roles and user metadata do not grant access. Covered by `backend/test/{auth-bridge,authorization,users,api-users}.test.ts`; see test report for limits.
