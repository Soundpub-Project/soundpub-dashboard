ALTER TABLE soundpub.auth_impersonations
  DROP CONSTRAINT auth_impersonations_actor_user_id_fkey,
  DROP CONSTRAINT auth_impersonations_target_user_id_fkey,
  DROP CONSTRAINT auth_impersonations_initiating_session_id_fkey,
  DROP CONSTRAINT auth_impersonations_impersonated_session_id_fkey;

ALTER TABLE soundpub.auth_impersonations
  ADD COLUMN actor_user_id_snapshot uuid,
  ADD COLUMN target_user_id_snapshot uuid;

UPDATE soundpub.auth_impersonations
SET actor_user_id_snapshot=actor_user_id,
    target_user_id_snapshot=target_user_id;

ALTER TABLE soundpub.auth_impersonations
  ALTER COLUMN actor_user_id DROP NOT NULL,
  ALTER COLUMN target_user_id DROP NOT NULL,
  ALTER COLUMN initiating_session_id DROP NOT NULL,
  ALTER COLUMN actor_user_id_snapshot SET NOT NULL,
  ALTER COLUMN target_user_id_snapshot SET NOT NULL,
  ADD CONSTRAINT auth_impersonations_actor_user_id_fkey
    FOREIGN KEY (actor_user_id) REFERENCES soundpub.backend_users(id) ON DELETE SET NULL,
  ADD CONSTRAINT auth_impersonations_target_user_id_fkey
    FOREIGN KEY (target_user_id) REFERENCES soundpub.backend_users(id) ON DELETE SET NULL,
  ADD CONSTRAINT auth_impersonations_initiating_session_id_fkey
    FOREIGN KEY (initiating_session_id) REFERENCES soundpub.auth_sessions(id) ON DELETE SET NULL,
  ADD CONSTRAINT auth_impersonations_impersonated_session_id_fkey
    FOREIGN KEY (impersonated_session_id) REFERENCES soundpub.auth_sessions(id) ON DELETE SET NULL,
  ADD CONSTRAINT auth_impersonations_distinct_identity_snapshot
    CHECK (actor_user_id_snapshot <> target_user_id_snapshot);
