# Phase 3A Users dependency inventory

Scope: `src/services/users.ts`, `src/hooks/useAuth.tsx`, `src/pages/{Users,Settings}.tsx`, `src/components/users/*.tsx`, `src/components/settings/LabelLogoSettings.tsx`, and `src/api/{client,routing,users}.ts`. Search also inspected application routes and profile consumers. Counts are scoped literal direct calls, not total Supabase references across the app.

| Dependency | Backend Users mode | Disposition |
| --- | --- | --- |
| Auth login/session/logout/refresh and login/logout audit RPC | Supabase Auth retained; API client forwards access token | PHASE4_AUTH |
| Profile read/write, admin list/status/roles | API service before legacy branches; backend principal resolves verified identity | PHASE3A_BACKEND |
| Legacy service profile/roles/status PostgREST and Edge calls | Executed only with backend domain disabled | LEGACY_ONLY |
| Create account, password, delete identity, impersonation | Controls unavailable on backend Users screen; legacy behavior remains in legacy mode | PHASE4_AUTH / LEGACY_TEMPORARY |
| Artist-label transfer, artist dialogs/roster, deletion requests, composer/artist metadata | Disabled/hidden from backend Users screen; legacy routes remain | PHASE3B_ARTISTS_LABELS / LEGACY_ONLY |
| Avatar and label-logo uploads | Disabled and rejected in backend mode; legacy Storage remains in legacy mode; removal of profile URL uses backend PATCH | LATER_STORAGE / LEGACY_ONLY |

Direct literal calls remain in legacy-only branches; removing them would break current production legacy mode. Runtime backend-mode Users business PostgREST/RPC/Edge/Storage writes expected: **0**; source-wide literal count is not zero. `src/pages/UserOrphanAudit.tsx`, artist/label pages and notification settings remain out of Users backend mode, not silently migrated. The isolated browser acceptance route is development-only (`VITE_SOUNDPUB_BACKEND_DOMAINS=users` and Vite DEV); normal production build cannot enable it.

Static inventory is not a substitute for browser execution or a real legacy Auth session. See independent QA for its independently measured 37 original scope calls and their classification; coordinator added guards after that snapshot.
