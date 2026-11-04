# Phase 3B Parity Matrix

| Operation | Legacy | Backend | Result |
| --- | --- | --- | --- |
| Artist list/detail | direct profiles/artist_profiles | Artist API | PASS |
| Managed artist creation | Auth Edge plus profile writes | business principal only, no login | PASS, intentional Phase 4 difference |
| Artist metadata edit | PostgREST | allowlisted Artist API | PASS |
| Label list/detail | profiles/roles | Label API | PASS |
| Roster list | direct profiles + metadata | UUID roster API | PASS |
| Assign/transfer | Edge plus scattered writes/name sync | single transaction, expected parent, audit | PASS, safer intentional difference |
| Detach from label | Edge | current membership detach; user/history retained | PASS |
| Deletion request/review | PostgREST | backend request/review, no hard delete | PASS |
| Permanent account deletion/password | Auth/Edge | disabled | PHASE4_AUTH |
| Media/Spotify | Storage/Edge | disabled/rejected | PHASE3D_STORAGE / explicit Artist integration follow-up |
| Orphan scan/repair | RPC | unavailable/fail closed | BLOCKED |
| Release/Royalty ownership | legacy tables | unchanged by transfer | PASS non-rewrite; full populated parity deferred |

Backend-mode direct Artist/Label PostgREST: 0. RPC: 0. Edge Function: 0. Unexpected Supabase references: 0. Legacy-only and later-phase branches remain in source under explicit guards.
