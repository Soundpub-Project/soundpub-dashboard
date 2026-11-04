# Phase 1E Public Routing

## Status

**Public routing = FAIL.**

## Observed `.com` path

```text
supabase.carubra.com
  -> Cloudflare edge: VERIFIED
  -> Cloudflare record/tunnel/worker/load-balancer rule: UNKNOWN
  -> origin: UNKNOWN
  -> Kong 3.9.1: historically observed, current owner/config UNKNOWN
  -> upstream/network: UNKNOWN
  -> runtime: UNKNOWN
  -> mounted source: UNKNOWN
  -> create-user handler: public GET returns HTTP 400, 49-byte JSON body
```

## Controlled comparison path

```text
supabase.carubra.space
  -> Cloudflare edge/tunnel: previously verified
  -> supabase-envoy:8000
  -> functions:9000
  -> supabase/edge-runtime:v1.74.0
  -> /data/supabase/instances/supabase-01/config/volumes/functions
  -> create-user handler: public GET returns HTTP 405 with empty body
```

The different status/body fingerprints prove `.com` is not the attested `.space` execution path. Direct origin evidence cannot substitute for `.com` ownership.

## Rollback and control

No routing change occurred. Cloudflare control-plane access, exact before-image, Kong ownership, callback compatibility, cache plan, monitoring thresholds, and tested reversal are unavailable. The tunnel token exposed during this phase must also be rotated before route trust can be established.

## Required operator action

Cloudflare owner must rotate the exposed tunnel token, export the active `.com` DNS/tunnel/worker/load-balancer configuration, identify the current Kong origin owner, approve the controlled destination, and perform a monitored cutover with tested rollback.

**Gate: FAIL.**
