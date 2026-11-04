# Module boundaries

Status: Phase 2 design contract. Names below are logical modules, not a claim that every module already has routes or tables.

## Package and dependency rules

`backend/` contains the dedicated API, worker, infrastructure adapters and tests. Keep existing frontend package independent. The spec's `apps/` and `packages/` split is optional; do not create empty packages merely to imitate it.

Dependencies flow from HTTP/worker entrypoints to services, then repositories/provider interfaces. Bootstrap supplies concrete adapters. Domain services must not import Fastify request/reply types, frontend Supabase clients, production configuration, or another module's route handlers. Cross-module operations call exported service functions with explicit inputs and transaction context. No HTTP calls between modules inside this monolith.

| Module | Owns | Boundary |
| --- | --- | --- |
| auth | Identity adapter, verified identity resolution, principal lookup | No shared Supabase sessions or credential implementation |
| users | Application user UUID, local lifecycle/status | Never mutates shared Auth users |
| profiles | Application profile reads/updates | Owner loaded server-side; no role/status mass assignment |
| roles | Local role assignments, hierarchy policies | No role from browser or editable provider metadata |
| artists | Artist identity and approved roster relationships | Managed artist inclusion does not enable interactive login |
| labels | Label membership and artist ownership policies | Default/historical parent is not tenant membership |
| releases | Release lifecycle and future distribution rules | Calls payment/Storage services; no direct provider invocation |
| tracks | Track metadata and release relationships | Private media through Storage service |
| royalties | Future imports, adjustments and provenance | Decimal fidelity, transactions, no production import in Phase 2 |
| payouts | Future reservation and payout lifecycle | No foundation endpoint claiming settlement or double-debit parity |
| copyright | Future registration/work/contract workflow | Missing source RPCs require explicit later behavior design |
| takedown | Future cases, targets, documents and history | Case ownership and reviewer capabilities checked separately |
| notifications | Delivery intents and mock notification handlers | Outbox-driven; no open email relay |
| settings | Allowlisted application configuration | No source secret, host setting or gallery import |
| audit | Append-only security/business events | Server-derived actor; restricted reads |
| storage | Object metadata, logical links, access and provider abstraction | Bucket possession/uploader/path never authorizes access |
| payments | Mock invoices/status, payment operation idempotency | No real Xendit or financial state migration |
| integrations | Provider ports, authenticated webhook ingress | Local fake events; no callback registration |

Infrastructure concerns are database pool/migrations, typed config, observability and shared transport contracts. Keep them small and free of domain ownership decisions. Worker is a runtime, not a second application model.

## Transaction ownership

A public service operation owns the transaction. Collaborating services/repositories receive that transaction; they must not independently commit. Domain state, audit and outbox insertion commit together. No external email/payment/storage call is assumed rollbackable with SQL.

Read policies can share a minimal principal type. Write services recheck status, ownership and hierarchy at the mutation boundary. API-local role arrays must not become a second authorization model inconsistent with the Auth policy layer.

## Phase 2 implementation scope

Required executable slices are current user/profile, a synthetic admin-protected action, isolated object upload/download, and transaction-to-outbox-to-mock-provider delivery. Other modules reserve ownership and compatibility contracts; they need no feature endpoints merely for completeness.

The [37-entrypoint replacement map](../migration/PHASE1G_FUNCTION_REPLACEMENT_MAP.md) remains authoritative. Backend API, worker, Auth, Storage and webhook dispositions are future ownership assignments, not authorization to deploy or invoke existing functions. Shared `main`, `auth-email-hook`, unowned `hello` and diagnostics remain outside automatic copying/removal.

## Standards and change control

- TypeScript strict mode; validate all untrusted values before use.
- SQL in repositories/migrations, parameterized values, allowlisted dynamic identifiers.
- Explicit dependency injection at bootstrap; no service locator or per-module framework.
- Keep schema, OpenAPI, route and policy tests aligned in each code change.
- New dependency needs a concrete gap in Node.js, PostgreSQL, Fastify or installed libraries; commit lockfile changes.
- No production extraction or new identity/object selection without explicit contract review.
- Each implementation owner supplies unit, integration, negative and regression evidence. Independent QA owns acceptance.

See [architecture](ARCHITECTURE.md), [database design](DATABASE_DESIGN.md), and [test strategy](PHASE2_TEST_STRATEGY.md).

