ALTER DEFAULT PRIVILEGES IN SCHEMA soundpub REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM soundpub_app;
REVOKE ALL ON ALL TABLES IN SCHEMA soundpub FROM soundpub_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  soundpub.backend_users,
  soundpub.external_identities,
  soundpub.identity_references,
  soundpub.user_roles,
  soundpub.storage_assets,
  soundpub.outbox_events,
  soundpub.idempotency_keys,
  soundpub.integration_effects,
  soundpub.webhook_events
TO soundpub_app;
GRANT SELECT ON soundpub.roles TO soundpub_app;
GRANT SELECT, INSERT ON soundpub.audit_logs TO soundpub_app;
