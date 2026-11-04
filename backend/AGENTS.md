# SoundPub backend instructions

## Mission

- Replace legacy Supabase runtime dependencies without silently changing product behavior.
- Treat `../supabase/` as read-only reference for schema, policies, functions, triggers, and business rules.
- Keep the existing TypeScript modular monolith using Fastify, PostgreSQL, Zod, and current provider adapters.

## Safety

- Never contact, restart, deploy to, or modify a server unless the user explicitly requests that exact action.
- Never inspect, stop, restart, rebuild, or otherwise touch the currently running production Docker deployment.
- Any Docker deployment on this computer must be isolated under the exact Compose project name `dashboard-sounpub-dev` with separate containers, networks, volumes, ports, environment files, and credentials.
- Before running Docker commands, verify `COMPOSE_PROJECT_NAME=dashboard-sounpub-dev` or pass `docker compose -p dashboard-sounpub-dev`; refuse commands that could target another Compose project.
- Never mutate, decrypt in place, move, rename, or delete files under `../backups/`.
- Never commit secrets, backup keys, decrypted exports, sessions, refresh tokens, signed URLs, or production data.
- Use disposable databases and synthetic fixtures for development and tests.
- Do not add Supabase runtime dependencies or new direct frontend Supabase calls.

## Migration rules

- One domain has one write authority; never keep backend and Supabase writes active for the same domain.
- Preserve behavior through explicit `/api/v1` contracts and compatibility tests.
- Rebuild RLS guarantees as server authorization plus database constraints; frontend checks grant no authority.
- Keep money as integer minor units with idempotency, immutable ledger events, audit records, and transactions.
- Keep storage private and authorize before issuing short-lived capabilities.
- Verify callback raw bodies and enforce replay protection, idempotency, and sanitized logs.
- Extend existing modules before creating parallel abstractions.

## Evidence

- Every behavior change needs a focused test or updated existing test.
- Run `npm run typecheck` and the smallest relevant test first.
- Run `npm test` before declaring a backend slice complete.
- Run the root frontend build after API-contract or frontend-integration changes.
- Report skipped tests and production-only gaps; missing evidence is never PASS.

## Recovery boundary

- The encrypted 2026-10-30 backup is recovery source material, not a live database or atomic snapshot.
- Restore only into an isolated target after defining ordering, identity, validation, reconciliation, and rollback.
- Do not restore legacy sessions or refresh tokens into the new auth system; require deliberate identity migration and reauthentication.
