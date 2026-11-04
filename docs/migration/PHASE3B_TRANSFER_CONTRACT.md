# Phase 3B transfer contract

Current management differs from historical business ownership. Actor identity and role come from verified backend principal; submitted owner/label/role values are untrusted. Lock actor, artist, old and new labels in deterministic order; re-read status and verified roles inside transaction. Require expected previous parent; stale request returns 409. Missing/inactive/suspended target, unrelated actor, unresolved migration reference, self-parent or ambiguous catalog link fails closed. Audit actor, previous parent and target in same transaction.

Link to label, move between labels, and detach to independent require preserving historical attribution and catalog integrity. No browser dual-write to profiles/artists. Transfer never rewrites releases, tracks, royalties, payouts, completed copyright or takedown owners. Old financial records cannot grant current management permission. Historical tables are not yet extracted; hard delete and ambiguous repair remain blocked until complete dependency checks exist.

Legacy difference: existing transfer Edge updates multiple rows and sometimes matches catalog artists by name. Backend rejects inferred identity and partial transfer. Synthetic fixtures must cover invalid targets, concurrent transfer, rollback, historical ownership, and role removal while transfer. No production transfer attempted.
