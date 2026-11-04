# Phase 3B Security Report

PASS: strict Zod inputs, UUID validation, mass-assignment rejection, no client roles/owner authority, current-role/status recheck, deterministic row/advisory locks, expected-parent conflict, protected-target denial, reference-only denial, bound SQL, least-privilege runtime login, audit in mutation transaction, no provider credentials, no production connection.

Negative coverage includes anonymous, unrelated user/label, inactive/suspended, forged identity fields, invalid destinations, stale parent, wrong confirmation, duplicate deletion request, privileged target, missing membership, reference-backed parent, audit rollback, restricted runtime DDL and unsafe column writes.

Historical protection: transfer and detach alter only current parent/membership and audit. Services contain no Release/Track/Royalty mutation. Permanent deletion remains unavailable. Remaining security limitation is absence of final populated cross-domain historical tables and full deterministic PostgreSQL concurrency barriers for every requested race.
