# Integration contract

Coordinator wiring only:

```ts
import { createAuditSettingsService } from './audit-settings/index.js';
import { registerAuditSettingsRoutes } from './api/audit-settings.js';
const auditSettings = createAuditSettingsService(pool);
registerAuditSettingsRoutes(app, auditSettings, authenticate, paths, errorSchema);
```

Run migration `0011_settings.sql` after `0010_notifications.sql`. Neither bootstrap nor API dependency types are changed by this slice.

| Method | Route | Result |
| --- | --- | --- |
| GET | `/api/v1/settings/public` | `{ settings: PublicSettings }`, anonymous |
| GET/PATCH | `/api/v1/settings/me` | `{ settings: UserSettings, version }`, current active user |
| GET/PATCH | `/api/v1/admin/settings` | `{ settings: AdminSettings, version }`, current active admin/superadmin |
| GET | `/api/v1/admin/audit` | `{ items: AuditEntry[], nextOffset: number \| null }`, current active admin/superadmin |
| GET | `/api/v1/admin/audit/:id` | `AuditEntry`, current active admin/superadmin |

PATCH body is `{ version: integer >= 1, settings: nonempty partial settings }`. Unknown keys, wrong types and empty patches return 400. Concurrent/stale versions return 409. Setting updates and their audit event commit atomically. Protected reads and writes re-resolve verified roles/status with existing user/authority locks; caller-supplied user IDs never select another user's settings.

Audit filters: `actor` (UUID), `action`, `resource` (resource type), `resource_id` (UUID), `from`/`to` (UTC ISO datetimes, inclusive), `limit` (1–100, default 50), `offset` (0–10000, default 0). Results sort by creation time and UUID descending. Offset pagination is bounded but not a snapshot across concurrent inserts. Audit entry fields: `id`, `actor_user_id`, `action`, `resource_type`, `resource_id`, `created_at`. Metadata, request IDs and historical identity references are omitted entirely. Unknown action/resource labels become `other`; non-UUID resource IDs become null. No mutation routes exist.

## Classification and secret boundary

| Category | Explicit keys |
| --- | --- |
| PUBLIC_SETTING | `dashboard_logo_light`, `dashboard_logo_dark`, `favicon`, `auth_notice_config` |
| USER_SETTING | `email_notif_payout`, `email_notif_release`, `email_notif_payment`, `email_notif_announcement` |
| ADMIN_SETTING | `maintenance_enabled` |
| SECRET_CONFIG | SMTP credentials, payment/provider secrets, OAuth secrets, storage keys, service tokens, signing material; no API or table migration/import path |

Public setting edits require admin privilege. Branding values are nullable backend media UUIDs, never raw URLs or provider configuration. Auth notice is a strict bounded object with explicit fields. Public text is intentionally publishable text; administrators must not paste credentials into public copy. Financial pricing/payout configuration, provider switching, analytics configuration and ICCN gallery are out of scope, rejected as unknown keys. No production rows or settings are imported.

Reads independently validate each persisted allowed field and substitute safe defaults for malformed values. Unknown persisted keys never appear, even for admins. Writes persist only the allowed projection and audit field names/version, not setting values. Environment variables are never read by this module. Neither API exposes arbitrary configuration maps.

Tables: `application_settings`, `user_settings`, existing `audit_logs` are BACKEND_ONLY_RLS_OPTIONAL: dedicated trusted server runtime only, explicit runtime grants, no PUBLIC grants on new tables; service authorization is mandatory. RLS is not claimed as a browser security boundary. Audit runtime UPDATE/DELETE remain denied by existing grants.

Frontend compatibility verified against `src/api/settings.ts` and `src/api/audit.ts`: route names, request envelopes and DTOs match. Direct Sagan messaging was unavailable in this tool session.

Check: `npx tsx --test test/audit-settings.test.ts` from backend. Uses disposable loopback-only PostgreSQL through existing concurrency helper; no optional skips or production endpoints.
