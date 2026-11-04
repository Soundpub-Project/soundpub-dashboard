# Phase 3C authorization matrix

Date: 2026-10-28. Agent F independent local source review. Concurrent implementation snapshot; not a frozen release. No production access, deployment, provider calls, secrets, database operations, browser execution or runtime tests. PROVEN_SOURCE means inspected code only; BLOCKER means acceptance gap; DEFERRED means separate scope requiring explicit retention, never PASS.

| Actor / operation | Inspected implementation / required boundary | Verdict |
| --- | --- | --- |
| Anonymous / invalid token | API must produce 401; catalog alone may expose explicit public projection | BLOCKER route/runtime evidence absent |
| Suspended / inactive / revoked role | createAuthorizer requires active nonempty recognized roles; services reload actor with usersRepository lock | PROVEN_SOURCE; revocation race unverified |
| Admin / superadmin Release read | Release service allows privileged current actor; nonadmin unrelated resource masked 404 | PROVEN_SOURCE only |
| Artist Release read/write | Release authority resolves Artist profile/current Artist management; creation derives Label from Artist; strict patch excludes ownership | PROVEN_SOURCE; historical transfer behavior requires acceptance decision |
| Label / whitelabel Release read/write | Release list uses current soundpub.artists management and verified Artist role; resource uses canManageArtist | PROVEN_SOURCE; list/detail consistency and transfer tests missing |
| Label / whitelabel Track read/write | canManageTrackParent uses historical release.label_id directly, unlike Release authority; actor reloaded but managed Artist/current parent not checked | BLOCKER: old Label may keep Track access after transfer while new manager has Release access but no Track access; runtime reproduction pending |
| Artist Track read/write | Parent artist_user_id match; writes limited to draft/rejected, including privileged actors | PROVEN_SOURCE; frontend pending editing and active lyrics-only behavior not preserved |
| Generic user / copyright / unrelated tenant | No owner-by-name or client role trust allowed; 404 masking must match list/detail/Track queries | BLOCKER no operation-specific runtime evidence |
| Status / activation | Release service permits constrained graph; active transition deliberately 409; pending_paid cannot be set through graph | PROVEN_SOURCE denial; full activation parity BLOCKER |
| Paid/unpaid delete | Release delete fails 409; Track delete fails 409 without transaction-scoped dependency callback | PROVEN_SOURCE fail-closed; deletion/refund parity BLOCKER |
| Media / invoice | Private object ownership and relationship checks mandatory; public clip/catalog projection explicit | BLOCKER domain asset link/signing proof absent |
| Ownership/version injection | Strict input contracts; database immutable historical owner trigger; stale version 409 in services | PROVEN_SOURCE; malformed JSON, unknown keys and restricted-login execution unverified |

Acceptance fixtures must include Admin, Superadmin, Artist A/B, Label A/B, Whitelabel, ordinary user, copyright, suspended/inactive/revoked actors; transfer and detach while request is in flight; legacy null owner rows. Do not conflate immutable historical release.label_id with current profiles.parent_label_id. Resolve product authorization policy explicitly and use same policy for Release, Tracks, assets and indirect queries.

Migration 0008 private schema does not use Supabase RLS as application authorization. Restricted DB login/grants and service guards must both be exercised; superuser tests cannot prove runtime permissions. No production RLS or Auth state inspected.

Concurrent policy clarification: PHASE3C_DATABASE_MODEL.md explicitly requires historical stored Release ownership for existing-resource authorization, current Artist roster for creation only. Release service current-roster authorization conflicts with that declared contract. Track files changed during review; initial predicate description is snapshot evidence, not a guarantee of latest bytes. F-02 remains open pending aligned implementation and runtime evidence.
