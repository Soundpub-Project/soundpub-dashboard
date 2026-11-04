# Phase 3A account lifecycle and mixed-mutation matrix

| Operation | Owner | Mutation mode and recovery boundary |
| --- | --- | --- |
| Login / logout / token refresh | PHASE4_AUTH | AUTH_ONLY; current Supabase Auth; login/logout audit RPC remains legacy |
| Signup / invitation / account creation | PHASE4_AUTH | DEFER_PHASE4; legacy Edge may create Auth plus profile and roles only while backend Users mode is off; no backend dual-write |
| Email verification / recovery / SSO | PHASE4_AUTH | AUTH_ONLY; no new backend identity enrollment |
| Password reset / change | PHASE4_AUTH | AUTH_ONLY; existing Auth/Edge path; not counted as business-profile migration |
| Own profile read/edit (allowlisted fields) | PHASE3A_BACKEND | BACKEND_ONLY in backend mode; transaction and audit; legacy mode still uses PostgREST |
| Admin user list / role update / status update | PHASE3A_BACKEND | BACKEND_ONLY in backend mode; lock, role/status check, audit; legacy-only functions in legacy mode |
| Account deactivate/suspend | PHASE3A_BACKEND | BACKEND_ONLY local status; does not revoke external sessions or delete external identity |
| Account delete / Auth ban | PHASE4_AUTH | DEFER_PHASE4; backend-mode UI disabled; legacy-only existing flow, no backend mutation |
| Impersonation | PHASE4_AUTH | DEFER_PHASE4; backend-mode UI hidden; future contract requires actor+subject+expiry+audit |
| Artist-label transfer / artist creation / deletion | PHASE3B_ARTISTS_LABELS | BLOCKED in backend Users mode; legacy-only when backend domain off; no pretend historical transfer |
| Avatar/logo upload and URL update | LATER_STORAGE | BLOCKED in backend mode; prevents Storage upload followed by backend profile write without recovery; legacy-only branch retained |
| Avatar/logo URL removal | PHASE3A_BACKEND | BACKEND_ONLY nullable profile patch; object cleanup deferred to storage owner |

No `AUTH_THEN_BACKEND` flow is approved. No production identity migration, automatic email linking, external identity deletion, or mixed Auth/backend write occurs in backend mode. Legacy code remains temporary until each deferred owner delivers transactional or compensating semantics.
