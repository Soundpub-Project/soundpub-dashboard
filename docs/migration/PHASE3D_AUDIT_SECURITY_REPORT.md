# Phase 3D audit security

Read-only admin query/detail API uses fixed allowlisted projection: ID, actor ID, known action/resource labels, UUID resource ID or null, timestamp. No arbitrary SELECT, `metadata`, tokens, provider secrets, password, request payload, raw audit JSON or write/delete route. Filters are explicit, bounded and parameterized. Current admin status/roles checked again against DB, not browser-supplied role claims. Existing internal audit writers continue; settings/notifications/media changes append audit records transactionally where possible.

Secret separation is enforced by strict public/admin schemas and backend-mode frontend guards. Raw `app_settings` CSV fails closed, settings UI uses backend APIs, and browser tests reject unknown secret fields while verifying safe public projection. Audit list/detail expose fixed safe fields only; synthetic secret metadata is absent from UI and detail response. See independent QA and security reports for evidence.
