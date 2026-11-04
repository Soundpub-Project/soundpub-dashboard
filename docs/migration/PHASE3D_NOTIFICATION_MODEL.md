# Phase 3D notifications model

`soundpub.notifications` stores recipient-specific USER_NOTIFICATION or one GLOBAL_ANNOUNCEMENT row. Each user has independent `notification_reads` keyed by (notification, user); repeated read is idempotent, unread/read-all do not forge recipient identity. Inbox is cursor-paged and selects recipient or broadcast. Admin create/update/delete operations recheck current privileges and emit immutable application audit events inside transaction. Safe response projects `metadata_safe` as empty object; raw provider payloads and secrets excluded.

API: own list, unread count, read/unread, read-all; admin list/create targeted/create announcement/update/delete. No direct Supabase Realtime required; frontend may poll for inbox updates. Existing finance/legal notification producers stay in Phase 3E/3F; they must not insert to backend notification table from browser or silently fall back to legacy in backend mode. No production notification rows imported.
