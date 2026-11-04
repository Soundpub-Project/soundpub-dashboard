# Phase 1E Database Reproduction

## Status

**Database reproducible = NO.**

## Verified application-DDL result

Two clean isolated PostgreSQL 17.6 runs completed:

```text
run 1: 949 normalized records
run 2: 949 normalized records
fingerprint 1 = d64856ee63d5743a9e559b07b8dc7fc2d93849c1a7f4d7de05d80938d47ace4c
fingerprint 2 = d64856ee63d5743a9e559b07b8dc7fc2d93849c1a7f4d7de05d80938d47ace4c
live expected application fingerprint = same
```

Maintenance migration and rollback assertions passed in both isolated runs. The baseline also reproduced the known private-media weakness.

## Mandatory gap

The test uses reduced Auth stubs and does not reproduce the full Supabase platform: Auth schema/runtime, Storage schema/runtime and bytes, Realtime, gateway, migration ledger, application settings, provider configuration, or end-to-end application smoke flows. It therefore proves application DDL parity only, not database/platform reproducibility required by Phase 1E.

**Gate: NO.**
