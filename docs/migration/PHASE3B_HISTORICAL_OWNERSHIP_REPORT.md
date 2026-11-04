# Phase 3B historical ownership protection

Canonical legacy schema stores releases.label_id, releases.artist_user_id, royalties.label_user_id, royalties.artist_user_id, free-text names, balances and provenance. These are historical owner/recipient references, not current profiles.parent_label_id management authority. Catalog artists.id differs from artist_profiles.user_id and login identity. Name equality is never proof of identity.

Phase 3B does not create/import release or royalty tables or production rows. Transfer writes current relationship and audit only. Delete fails closed when historical dependency inventory is absent, ambiguous or nonzero; a missing table must not count as zero references. Phase 3C and financial domain must retain source UUIDs and enforce their own reference constraints before any deletion/repair relaxation. No historical financial attribution rewrite.
