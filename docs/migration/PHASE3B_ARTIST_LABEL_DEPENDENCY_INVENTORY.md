# Phase 3B Artist/Label Dependency Inventory

| Dependency | Legacy purpose | Classification | Backend-mode treatment |
| --- | --- | --- | --- |
| `profiles.parent_label_id`, `user_roles` | current artist/label authority | PHASE3B_ARTISTS_LABELS | Local DB, verified roles, transaction locks |
| `artist_profiles` | artist display metadata | PHASE3B_ARTISTS_LABELS | Local DB and Artist API |
| `artists` | UUID roster/catalog binding | PHASE3B_ARTISTS_LABELS | Local DB; no name-derived identity |
| `artist_deletion_requests` | review before permanent deletion | PHASE3B_ARTISTS_LABELS | Backend request/review; no hard delete |
| `transfer-artist-label`, `remove-artist-from-label` Edge calls | transfer/detach | PHASE3B_ARTISTS_LABELS | Replaced by API in backend mode |
| orphan scan/repair RPC | inspect/repair legacy links | PHASE3B_ARTISTS_LABELS | Backend mode disabled; explicit blocker |
| Artist onboarding/profile pages and roster dialogs | metadata, roster, transfer | PHASE3B_ARTISTS_LABELS | Adapter/API or fail-closed controls |
| Releases/Tracks artist selectors | catalog/reference reads | PHASE3C_RELEASE_TRACK | Deferred; no business writes added |
| royalty/copyright/takedown/payout ownership | historical business ownership | LATER_DOMAIN | Never rewritten by Phase 3B transfer |
| avatar/logo/profile image Storage | media | PHASE3D_STORAGE | Backend mode disabled; write field rejected |
| account create/password/delete Edge/Auth | provider lifecycle | PHASE4_AUTH | Backend managed artist has no login; controls disabled |

Relationship classes: user-to-artist and user-to-label are current authority; label-to-artist is current management; release/royalty ownership is historical; catalog names are display only. Remaining legacy source calls are guarded `LEGACY_ONLY`, `PHASE3C_RELEASE_TRACK`, `PHASE3D_STORAGE`, or `PHASE4_AUTH`. Unexpected backend-mode Supabase Artist/Label business calls: 0.
