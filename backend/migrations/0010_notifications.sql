-- BACKEND_ONLY_RLS_OPTIONAL: private schema; server-resolved, transaction-locked actors.
CREATE TABLE soundpub.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid REFERENCES soundpub.backend_users(id),
  kind text NOT NULL CHECK (kind IN ('USER_NOTIFICATION', 'GLOBAL_ANNOUNCEMENT')),
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('info','success','warning','error','release','announcement','payout')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 10000),
  metadata_safe jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata_safe) = 'object'),
  created_by uuid REFERENCES soundpub.backend_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'GLOBAL_ANNOUNCEMENT' AND recipient_user_id IS NULL AND type = 'announcement')
    OR (kind = 'USER_NOTIFICATION' AND recipient_user_id IS NOT NULL))
);
CREATE INDEX notifications_inbox_idx ON soundpub.notifications(recipient_user_id, created_at DESC, id DESC);
CREATE INDEX notifications_global_idx ON soundpub.notifications(created_at DESC, id DESC) WHERE kind = 'GLOBAL_ANNOUNCEMENT';
-- Broadcast content stored once; only actual readers get a state row.
CREATE TABLE soundpub.notification_reads (
  notification_id uuid NOT NULL REFERENCES soundpub.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES soundpub.backend_users(id),
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON soundpub.notifications TO soundpub_app;
GRANT SELECT, INSERT, DELETE ON soundpub.notification_reads TO soundpub_app;
