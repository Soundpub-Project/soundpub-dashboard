# Phase 3D settings classification

Settings must be placed in exactly one category. Unknown keys default to SECRET_CONFIG (not served or writable through settings API). Legacy `app_settings` rows and values are not imported.

| Category | Keys/surfaces | Rule |
| --- | --- | --- |
| PUBLIC_SETTING | dashboard name/logo and favicon; safe auth notice; public branding and safe feature display | Explicit key/type allowlist only; anonymous read |
| USER_SETTING | UI preferences and email notification preferences in `Settings.tsx` | Actor-derived identity, no selected user ID or role mutation |
| ADMIN_SETTING | validated dashboard branding and non-sensitive operational UI settings in `SuperAdminSettings.tsx`, `AuthNoticeSettings.tsx` | Current admin/superadmin authorization, version check, audit write |
| SECRET_CONFIG | `StorageSettings.tsx` storage credentials; `IccnIntegrationSettings.tsx` keys; SMTP, OAuth, signing keys, payment credentials, service tokens | Backend environment/secret manager only; never return as settings, frontend variables, audit values or export |

`PricingSettings.tsx`, `PayoutSettings.tsx`, `src/pages/PaymentSettings.tsx` and `src/pages/Payouts.tsx` are PHASE3E_FINANCIAL; do not migrate business logic or import existing values. `src/components/analytics/GA4Provider.tsx`, `src/components/layout/AppSidebar.tsx`, `src/pages/Auth.tsx` and `src/components/auth/AuthEnvironmentNotice.tsx` read display values from legacy `app_settings`; backend mode must use public allowlist or explicitly disable. `src/hooks/useExportCsv.ts` exports raw `app_settings`: backend mode must disable this export to avoid secret leakage. Unrecognized historical keys remain legacy-only and never enter backend settings API.

## Final branding mapping

Public branding values are canonical media UUIDs, never provider URLs. Admin uploads use `OTHER/settings` with fixed resource UUID and variants `light`, `dark`, `default`. Public projection returns UUIDs; frontend maps trusted non-null UUIDs to same-origin allowlisted endpoints. Favicon is applied at app startup and immediately after admin replacement. Secret/provider settings remain absent from public and admin DTOs.