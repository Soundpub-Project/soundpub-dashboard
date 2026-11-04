# Phase 1B Public Routing Map

Status: **FAIL / BLOCKED.** Detailed evidence: `PUBLIC_ROUTING_REPORT.md`.

```text
supabase.carubra.com
  -> Cloudflare edge: proven
  -> gateway advertising Kong 3.9.1: observed
  -> origin/upstream/container/source/log: UNKNOWN
  -> anonymous create-user: HTTP 400 validation/business failure, gate FAIL

supabase.carubra.space
  -> Cloudflare Tunnel ingress: proven
  -> supabase-envoy:8000
  -> functions:9000
  -> /home/deno/functions/create-user mounted source matches repository
  -> anonymous create-user: HTTP 401, subset PASS
```

No routing, DNS, tunnel, callback or proxy configuration changed. `.com` ownership and rollback must be established before correction.
