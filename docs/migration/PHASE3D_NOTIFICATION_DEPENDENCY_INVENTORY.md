# Phase 3D notification dependency inventory

Baseline October 29, 2026. `src/components/notifications/NotificationBell.tsx` and `NotificationCenter.tsx` query inbox/read state and subscribe to Supabase Realtime; `AnnouncementDialog.tsx` inserts global announcement and triggers email. `src/pages/NotificationManagement.tsx` lists/updates/deletes notifications as admin. These are Phase 3D backend-mode requests. Polling is simpler than re-creating Realtime, but must be tested for adequate UX and cleanup on unmount.

`src/pages/Payouts.tsx` and `src/pages/Takedown.tsx` write notifications inside financial/legal workflows; business actions remain Phase 3E/3F, with eventual server-side enqueue instead of arbitrary browser recipient insertion. Direct notification writes here must not execute in backend mode. Generated `src/integrations/supabase/types.ts` is a legacy type artifact, not active call site.

Baseline query: `rg -n "from\(['\"]notifications['\"]\)|channel\(|mark.*read" src`. Backend API must derive recipient from authenticated principal, not request body, except explicit admin-targeted creation. Broadcast and recipient rows require separate visibility/read-state logic.
