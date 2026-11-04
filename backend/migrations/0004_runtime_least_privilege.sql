REVOKE ALL ON ALL TABLES IN SCHEMA soundpub FROM soundpub_app;
GRANT SELECT, UPDATE ON soundpub.backend_users TO soundpub_app;
GRANT SELECT ON soundpub.external_identities, soundpub.identity_references, soundpub.user_roles, soundpub.roles TO soundpub_app;
GRANT SELECT, INSERT, UPDATE ON soundpub.storage_assets, soundpub.outbox_events, soundpub.idempotency_keys, soundpub.webhook_events TO soundpub_app;
GRANT SELECT, INSERT ON soundpub.integration_effects, soundpub.audit_logs TO soundpub_app;
