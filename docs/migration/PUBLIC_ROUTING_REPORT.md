# Phase 1B Public Routing and Runtime Report

Observation date: **2026-10-27, Asia/Bangkok**. Live evidence collected approximately **04:53–04:57 ICT** (**2026-10-26 21:53–21:57 UTC**). Agent B scope: public routing and runtime only.

## Decision

**Public `https://supabase.carubra.com/functions/v1/create-user`: BLOCKED / anonymous-denial gate FAIL.** The hostname returns HTTP 400 with `{"success":false,"error":"Failed to create user"}` through a gateway advertising Kong 3.9.1. Its actual origin, upstream container, runtime source and source checksum remain unverified.

**The inspected self-hosted stack serves `https://supabase.carubra.space`, a different hostname.** Its active Cloudflare Tunnel configuration routes `.space` to Envoy and then the patched `create-user` runtime. Public `.space` and direct-origin anonymous requests return HTTP 401 with empty bodies. This resolves the observed hostname/runtime discrepancy but does not close the requested `.com` gate.

**Remote changes: none.** No DNS, Cloudflare ingress, provider callback, proxy, Compose service, function source, secret or production record was changed. No service was restarted or deployed. Changing `.space` or adding a `.com` ingress entry cannot be justified while `.com`'s current destination and rollback remain unknown.

## Inputs and inspection boundaries

Read the complete supplied Phase 1B request, repository `AGENTS.md`, Supabase skill, `SUPABASE_MIGRATION_AUDIT.md`, `PHASE1_FINAL_REPORT.md`, and relevant routing/security sections of `PHASE1_VERIFICATION_REPORT.md`, `EDGE_FUNCTION_MAPPING.md`, `SECURITY_FINDINGS.md`, `PHASE1_SOURCE_BASELINE.md`, `TEST_STRATEGY.md` and compatibility/cutover documentation. Historical reports remain unchanged.

Every remote Supabase inspection used `ssh maskhar@20.20.20.3` and first changed directory to `/data/supabase/instances/supabase-01/config`. Before inspecting Edge Function source, selected Compose metadata confirmed:

```text
service: functions
image: supabase/edge-runtime:v1.74.0
host source: /data/supabase/instances/supabase-01/config/volumes/functions
container destination: /home/deno/functions
command: edge-runtime start --main-service /home/deno/functions/main
published functions ports: none
```

Compose interpolation and container environments were processed in memory with selected metadata output. No deployment upload occurred. One later configuration excerpt violated the intended secret-output boundary; the incident and required follow-up are recorded below without values.

## DNS and public edge evidence

Queries used the workstation resolver; `.com` A answers were independently checked against `1.1.1.1`. These are Cloudflare anycast addresses, not proven origin addresses. Proxied DNS did not reveal an origin CNAME or tunnel UUID.

| Hostname | A answers | AAAA answers | Public HTTP evidence |
|---|---|---|---|
| `supabase.carubra.com` | `104.21.5.212`, `172.67.133.219` | `2606:4700:3037::6815:5d4`, `2606:4700:3031::ac43:85db` | `Server: cloudflare`; function POST advertises `via: 1.1 kong/3.9.1` and `x-kong-*` headers |
| `supabase.carubra.space` | `104.21.66.100`, `172.67.158.197` | `2606:4700:3035::6815:4264`, `2606:4700:3033::ac43:9ec5` | `Server: cloudflare`; function POST includes `x-envoy-upstream-service-time` |

`carubra.com` nameservers: `javon.ns.cloudflare.com` and `sunny.ns.cloudflare.com`. Initial DNS TTL was 300 seconds; later cached answers had lower remaining TTL. No DNS writes occurred.

Anonymous `HEAD https://supabase.carubra.com/` returned 401 with `WWW-Authenticate: Basic realm="service"` and a Kong request ID. That root-route response does not establish function authorization.

Function probes used unique query markers and, on repeated `.com` requests, `Cache-Control: no-cache`. Responses consistently reported `cf-cache-status: DYNAMIC`. This weighs against a simple Cloudflare response-cache explanation; it does not independently prove every intermediate cache or upstream configuration.

## Proven and unresolved request paths

### Requested `.com` hostname

```text
HTTPS supabase.carubra.com:443
  Cloudflare DNS / public edge: proven
  Cloudflare origin, tunnel, worker or load-balancer selection: UNKNOWN
  gateway advertising Kong 3.9.1: observed response headers
  reverse proxy destination / functions upstream / container / port: UNKNOWN
  mounted source / executing source / SHA-256 / origin request log: UNKNOWN
  observed result: HTTP 400, generic user-creation failure
```

Gateway headers are observations, not a substitute for inspecting the actual gateway. No Kong container runs among the inspected host's running containers. This does not rule out an external Kong proxy, another connector/host, a Worker, or another route in front of this host. The `.com` destination must be obtained from its actual control plane rather than inferred from the expected origin's files.

### Inspected `.space` hostname

| Hop | Proven destination / behavior | Evidence |
|---|---|---|
| Public hostname | `supabase.carubra.space:443` | DNS and public HTTPS 401 response |
| Cloudflare Tunnel | container `network-supabase`, IP `172.19.0.8`, network `supabase-network` | Running container inspection; Cloudflare connector registration logs |
| Active tunnel ingress | hostname `supabase.carubra.space`; service `http://supabase-envoy:8000`; final fallback `http_status:404` | Read-only connector management API `http://172.19.0.8:20241/config`, version **3**; current-startup configuration log at `2026-10-26T14:14:42Z` |
| Connector readiness | `/ready` HTTP 200 | Same local management listener; no management port published on host |
| Reverse proxy / Supabase gateway | Compose service `api-gw`, container `supabase-envoy`, ID `cb77d9afe0f1`, image `envoyproxy/envoy:v1.39.0`, IP `172.19.0.7`, listener 8000 | Compose and running-container inspection; listener config |
| Gateway route | `functions-v1-all`; prefix `/functions/v1/`; cluster `functions`; rewrite prefix `/`; timeout 150s | Container `/etc/envoy/lds.yaml` |
| Upstream | DNS name `functions`, TCP port **9000**, `STRICT_DNS` cluster | Container `/etc/envoy/cds.yaml` |
| Runtime container | `supabase-edge-functions`, ID `06448e034403`, IP `172.19.0.10`, network alias `functions` | Running-container network metadata |
| Runtime | `supabase/edge-runtime:v1.74.0`; main service `/home/deno/functions/main` | Container command and source |
| Router dispatch | Rewritten `/create-user`; first pathname segment selects `/home/deno/functions/create-user` | `main/index.ts` and observed dispatch log |
| Mounted handler | Host `.../config/volumes/functions/create-user/index.ts` to `/home/deno/functions/create-user/index.ts` | Compose bind mapping, running-container mount, exact-byte hashes |
| Handler rejection | Missing Bearer token returns 401 before auth lookup, payload processing or account creation | Reviewed source and anonymous public/direct HTTP tests |

No additional local nginx, Caddy or Kong hop was observed on this path. The host publishes gateway port 8000; functions port 9000 stays on the Docker network. The tunnel connects directly to the Envoy container.

The connector's Compose metadata points to `/data/docker/cloudflared-tunnel/docker-compose.yml`, service `cloudflared-supabase`. Its runtime uses a remotely managed tunnel token; no token is reproduced. Supabase's Compose service name is `api-gw`, despite its compatibility network alias `kong`; that alias does not make the container a Kong runtime.

## Runtime identity and source checksums

Exact-byte SHA-256 comparisons were performed on local source, mounted source and files read inside the running container. Handler checksum remained unchanged at the final check.

| Artifact | SHA-256 | Comparison |
|---|---|---|
| `create-user/index.ts` | `079c2d9d06d81e10286060a805fb47a7265a111bb483dd7da73a998e8975584f` | Repository = host mount = running container |
| `main/index.ts` | `81e7902f1d281cb6efaa048390a0d7e0dd1f88c8c80ff4ed1ec76d9faeace6c1` | Host mount = running container |
| `_shared/cors.ts` | `d0d945158d49295b15c6c4f11e534b2a7a5da17461d57b122b3e5b50a92a8f53` | Host mount = running container |
| Container `/etc/envoy/lds.yaml` | `4ad377ecce353c4303bbd759f31c2ada228f41902b6ede003c9e453387414919` | Generated gateway routing config; values not reproduced |
| Container `/etc/envoy/cds.yaml` | `1d7514b891370ed27c25911df008887402e16ab09273e6e433225bb7f09f7905` | Gateway upstream config |

`supabase-edge-functions` started at `2026-10-26T20:33:39.666108887Z`, remained running, and had **zero restarts**. Selected non-secret configuration: `VERIFY_JWT=false`, `DATABASE_SCHEMA=soundpub`, `SUPABASE_URL=http://api-gw:8000`. Handler-level authentication therefore matters; runtime-wide JWT enforcement is disabled.

The main router uses `/home/deno/functions/deno.jsonc` as its import map and creates workers with `noModuleCache=false`. Checksums prove files visible to the running container, not a dump of compiled worker memory. Public 401 behavior and the correlated dispatch log substantiate execution of the expected authentication guard; no claim of compiled-memory SHA attestation is made.

Gateway bind sources were also confirmed: `volumes/api/envoy/envoy.yaml`, `cds.yaml`, `lds.template.yaml` and `docker-entrypoint.sh`. `/etc/envoy/lds.yaml` is generated inside the container, not the directly mounted template.

## Request correlation

Controlled sequence, UTC:

1. At `21:55:48.337`, expected runtime had **14** `create-user` dispatch lines.
2. Public `.com` POST `{}` returned **400**; `CF-RAY: a50cb5156db6fd84-SIN`; `x-kong-request-id: f335b104398a6c7af90ddb653f7fe061`.
3. At `21:55:49.372`, expected runtime still had **14** dispatch lines; latest remained the earlier direct-origin request.
4. Public `.space` POST `{}` returned **401**; `CF-RAY: a50cb51bc8183883-SIN`.
5. At `21:55:50.448`, expected runtime had **15** dispatch lines, including the new request below.

Safe observed log excerpts:

```text
Envoy access event, 2026-10-26 21:55:49 +0000:
172.19.0.8 POST /functions/v1/create-user?phase1b_probe=agent-b-space-correlate-20261026T2156Z HTTP/1.1 401 0

Runtime, 2026-10-26T21:55:49.774488828Z:
serving the request with /home/deno/functions/create-user

Direct-origin access event, 2026-10-26 21:55:16 +0000:
172.19.0.1 POST /functions/v1/create-user?phase1b_probe=agent-b-direct-20261026T2156Z HTTP/1.1 401 0

Runtime, 2026-10-26T21:55:16.516900946Z:
serving the request with /home/deno/functions/create-user
```

The latest 400 Envoy log lines contained four Agent B access events: three public `.space` probes and one direct probe. No matching `.com` correlation marker appeared. Access logs were buffered: Docker log-envelope timestamps appeared several seconds after the embedded request-event timestamp. Log absence alone is not exhaustive proof; the controlled dispatch count, live tunnel ingress, differing gateways and positive `.space` correlation jointly establish the discrepancy.

## Tests and safe limits

All live account-creation probes used POST `{}` without Authorization. No valid account-creation payload was submitted. Publishable/anon API identifiers for the two hosts were read from existing local config only for an additional compatibility probe, verified as publishable/anon, held in process memory and withheld from output. Service credentials were not used as test identities.

| Test | Observed HTTP / behavior | Result |
|---|---|---|
| Public `.com`, anonymous, no apikey | Repeated 400; generic `Failed to create user`; Kong headers; no expected-runtime correlation | **FAIL** required authentication-denial gate; does not prove successful anonymous creation |
| Public `.com`, anonymous, existing publishable/anon apikey only | 400; same generic error; `CF-RAY: a50cb5fcb8455f90-SIN`; Kong request `a1f2fd05e0ea040929a96c37a7ca9601` | **FAIL**; omitting apikey does not explain routing difference |
| Public `.space`, anonymous, no apikey | Repeated 401; zero response-body bytes; Envoy/runtime correlation | **PASS**, anonymous negative test only |
| Public `.space`, anonymous, existing publishable/anon apikey only | 401; zero response-body bytes; `CF-RAY: a50cb5fe4d9a3da1-SIN`; Envoy access log | **PASS**, anonymous negative test only |
| Direct `http://127.0.0.1:8000/functions/v1/create-user`, anonymous | 401; zero response-body bytes; dispatch count 13 to 14 | **PASS**, direct negative test only |
| Ordinary authenticated user | Expected 403; no suitable approved test access found | **NOT RUN**, live gate unverified |
| Artist | Expected 403; no suitable approved test access found | **NOT RUN**, live gate unverified |
| Label attempting unauthorized role/ownership operation | Expected 403; scoped artist creation is allowed by current handler | **NOT RUN**, live gate unverified |
| Unauthorized admin privilege escalation | Expected 403; no suitable approved test access found | **NOT RUN**, live gate unverified |
| Admin creating superadmin | Expected 403 in reviewed handler | **NOT RUN**, live gate unverified |
| Superadmin authorized operation | Expected successful authorized creation, with intended side effects | **NOT RUN**; requires approved isolated test identity and provider-safe environment |
| Existing `node scripts/phase1-edge-security.test.cjs` | PASS; mock Auth/DB, no production calls | Regression evidence only; not a live role-matrix PASS |

Repository test/fixture references, inspected local configuration names, Docker-directory configuration names and functions-runtime variable names did not provide suitable designated integration identities with usable test access. Prior Phase 1 signed-in results are historical evidence, not re-executed tests in this investigation. No account was created, no password was reset, no session was borrowed and no JWT was fabricated or signed to impersonate production users.

Read-only aggregate checks at `21:55:16`, `21:56:25` and `21:56:51` UTC remained: `auth.users=211`, `soundpub.profiles=182`, `soundpub.user_roles=182`, `soundpub.artist_profiles=81`, `soundpub.artists=132`. These counts concern the inspected `.space` origin; they cannot prove absence of side effects at `.com`'s unknown upstream. No cross-origin mutation-free guarantee is inferred from them.

Project build/typecheck/lint were not rerun for this documentation-only routing assignment. No application code was edited. The existing focused security regression was run once and passed. No unrelated action endpoints, payment callbacks, email delivery or backup endpoints were probed.

## Configuration evidence and correction blocker

Current workstation `.env` and `.env.local` select `https://supabase.carubra.space`. Existing `.env copy` and `.env.example` select `https://supabase.carubra.com`. Only URL fields are recorded here; no credential values are included. This establishes repository/environment hostname drift, not the URL in the deployed browser bundle, and does not authorize changing it.

The inspected connector's live version-3 ingress contains `.space`, not `.com`. Available connector-token configuration is not proof of account-wide DNS, Worker, load-balancer or `.com` tunnel management authority. No suitable Cloudflare management credential or `.com` origin mapping was established from the relevant inspected configuration. Proxied public DNS cannot supply that missing mapping.

The minimum next evidence is read-only `.com` control-plane inspection covering its DNS target, any Worker route or load balancer, selected tunnel and all active connectors, and the currently serving Kong route/service destination. Then inspect that destination's container, port, bind mounts, source SHA-256 and correlated request log. Determine whether `.com` is intended to reach this stack or a distinct shared application before proposing a change.

A routing correction remains blocked until the exact existing configuration can be privately snapshotted, the intended destination and blast radius are verified, and a reload-without-meaningful-downtime plus exact rollback can be demonstrated. No rollback artifact was created because no remote change met these prerequisites. DNS/provider callback changes remain outside authorization. Adding `.com` to the observed `.space` connector alone would neither prove that `.com` selects this tunnel nor establish safe rollback of its current route.

## Secret-output incident

During Envoy configuration review, an overly broad context excerpt included rendered secret-key and service-role JWT values in tool output. This violated the requested no-secret-output boundary. Values are deliberately absent from this report and were not written to repository files or reused for requests. Subsequent inspections emitted only exact routing fields, metadata and checksums.

Treat the affected server credentials as exposed to the chat/tool transcript. The coordinator must arrange rotation through the established secret-management process, assess dependent services/session impact, and restrict or remove exposed transcript material where supported. Agent B did not rotate production credentials: safe coordinated rotation and its rollback were outside the routing correction proven here. This incident is not concealed by the otherwise read-only production work.

## Closure

- Requested `.com` public route: **BLOCKED**; anonymous-denial behavior **FAIL**.
- `.space` route to inspected runtime: **proven**, including active tunnel ingress, proxy, upstream, container, ports, mounted-source SHA and request logs; anonymous rejection **PASS**.
- Complete live role matrix: **NOT RUN / unverified** under the supplied test-identity restriction.
- Remote routing changes, deployments and restarts: **none**.
- Credential-output incident: **requires coordinator follow-up**; no values persisted in this report.
- Only authored repository artifact: `docs/migration/PUBLIC_ROUTING_REPORT.md`.
- Phase 2 readiness is not established by this scoped report.
