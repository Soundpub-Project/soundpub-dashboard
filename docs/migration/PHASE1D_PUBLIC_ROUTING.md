# Phase 1D Public Routing

## Status

**PUBLIC .COM ROUTING = FAIL.**

## Controlled `.space` path

`supabase.carubra.space` maps through the inspected connector to `supabase-envoy:8000`, Envoy route `/functions/v1/`, upstream `functions:9000`, runtime `supabase/edge-runtime:v1.74.0`, and host source `/data/supabase/instances/supabase-01/config/volumes/functions`.

Fresh source/mount/container hashes matched for `create-user`, `main`, and `_shared/cors.ts`. No public function ports are exposed directly by Compose.

## Unknown `.com` path

`supabase.carubra.com` resolves to Cloudflare edge addresses and previously advertised Kong 3.9.1. The inspected connector has no `.com` ingress and the inspected host has no Kong container. Cloudflare record destination, Workers/load-balancer rules, origin, Kong owner/config, upstream, runtime, source version, and rollback authority remain unknown.

## Rollback gate

No route change occurred. Required before change: authenticated read-only Cloudflare/Kong access, exact before-image, controlled destination, source/image identity, cache plan, callback/auth compatibility, tested reversal, monitoring thresholds, and uncompromised recovery credentials.
