# Phase 3A Users parity matrix

`LOCAL PASS` means synthetic or disposable-DB behavior verified, not real production parity. `DEFERRED` cannot be counted as migrated.

| Operation | Legacy behavior | API behavior / authority / validation / side effects | UI / parity / reason |
| --- | --- | --- | --- |
| Current user/session | Supabase Auth session plus profile | `GET /me`: verified token mapped to local user and current DB roles/status | LOCAL PASS; real session mapping unproven |
| Own profile read | profiles + user_roles | `GET /profile`: own DB projection, nullable/display fields, safe decimals and label name | LOCAL PASS; legacy real-data differential absent |
| Own profile edit | PostgREST profiles update | `PATCH /profile`: allowlist, nullable fields, transactional audit | LOCAL PASS; upload media deferred |
| User listing | unbounded profile/role join | `GET /admin/users`: admin-only, 100/page, bound cursor with search/status/role filters | LOCAL PASS; browser fixture only, real data shape/tenant parity unproven |
| Role update | Edge function and optional artist/label writes | `PUT /admin/users/:id/roles`: locked current roles, hierarchy, audit, local dependency conflict | LOCAL PASS for simple roles; transfer DEFERRED PHASE3B |
| Status/deactivation | Edge function and possibly provider effects | `PATCH /admin/users/:id/status`: local active/inactive/suspended, locked hierarchy, audit | LOCAL PASS for app access; no provider token revocation |
| Signup / invite / delete identity / password / verification / SSO | Legacy Auth and functions | No Phase 3A replacement | DEFERRED PHASE4_AUTH; controls hidden/disabled in backend Users mode |
| Impersonation | Legacy Edge flow | No backend contract active | DEFERRED PHASE4_AUTH, explicit actor/subject/expiry/audit required |
| Artist-label transfer / roster / deletion request | Legacy multi-domain writes | API refuses relationship change/unsafe role removal | DEFERRED PHASE3B_ARTISTS_LABELS; preserve historical royalty ownership |
| Avatar/logo upload | Supabase Storage followed by profile write | Disabled in backend Users mode | DEFERRED LATER_STORAGE; prevents mixed writes |

Admin detail is displayed through list row/actions; there is no standalone admin detail route in current Users UI. Browser mock verifies request submission, not persisted parity or cross-system identity. See `PHASE3A_FRONTEND_REGRESSION.md`.
