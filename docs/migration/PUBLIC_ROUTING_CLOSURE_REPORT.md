# Public Routing Closure — Agent C

Observed 2026-10-27, approximately 08:37–08:40 ICT (01:37–01:40 UTC). **PUBLIC ROUTING = BLOCKED; public create-user authorization = FAIL verification gate.** Phase 2 remains blocked. Baseline: `PHASE1B_FINAL_REPORT.md`, `PUBLIC_ROUTING_REPORT.md`, `PUBLIC_ROUTING_MAP.md`; prior reports preserved.

## Change lock

Coordinator explicitly prohibits routing mutations, Edge Function deployment and service recreation until Agent B supplies the credential dependency/rollback checkpoint and coordinator explicitly releases the lock. No upload, configuration write, restart, DNS change, token issuance or account creation occurred. Only this agent's two closure reports were created. Existing staged handler changes were inspected, not overwritten.

## Trace and ownership

| Hop | Current evidence | Remaining gap |
| --- | --- | --- |
| DNS `.com` | A records `104.21.5.212`, `172.67.133.219`; authoritative Cloudflare nameservers `sunny.ns.cloudflare.com`, `javon.ns.cloudflare.com` | Proxied records conceal origin; DNS results do not prove account/control-plane ownership |
| Cloudflare `.com` | Public TLS responses advertise Cloudflare; request IDs below | Zone record destination, Worker routes, load balancer, tunnel selection and connector inventory unavailable |
| Reverse proxy / Kong `.com` | `via: 1.1 kong/3.9.1` and `x-kong-request-id` | Actual proxy owner, upstream hostname/port, Kong service/route configuration and rollback snapshot unproven |
| Runtime / network / mount / handler `.com` | Cannot attest from available host | Container identity, runtime version, source mount and checksum UNKNOWN; do not substitute `.space` source |
| Inspected tunnel `.space` | Live management endpoint `172.19.0.8:20241/config`, version 3: only `supabase.carubra.space` routes to `http://supabase-envoy:8000`; fallback `http_status:404` | Does not establish `.com` route |
| Inspected gateway | `supabase-envoy`, image `envoyproxy/envoy:v1.39.0`; no running Kong in inspected Docker inventory | Prior traced route: `/functions/v1/` prefix rewrite `/`, upstream `functions:9000`; config checksums unchanged |
| Inspected runtime | `supabase-edge-functions`, `supabase/edge-runtime:v1.74.0`, network `supabase-network`, IP `172.19.0.10`, alias `functions` | Running source identity only; no compiled-worker memory attestation |
| Source mount | Compose service `functions`: `/data/supabase/instances/supabase-01/config/volumes/functions` binds `/home/deno/functions`, `z`; running mount agrees | Confirmed before any possible future upload; re-inspect immediately before upload after lock release |
| Dispatch / handler | Prior router maps first path segment to mounted handler; current public `.space` calls increase `create-user` dispatch count and return 401 | `.com` requests do not produce corresponding dispatch increments |

SSH inspections used `maskhar@20.20.20.3` from `/data/supabase/instances/supabase-01/config`. Compose output was parsed to emit only function volume mappings; environment/secret values were not emitted. No Cloudflare API credential name was present in this process environment; no control-plane access was inferred from SSH access.

## SHA-256 evidence

| Artifact on inspected origin | SHA-256 |
| --- | --- |
| `volumes/functions/create-user/index.ts` | `079c2d9d06d81e10286060a805fb47a7265a111bb483dd7da73a998e8975584f` |
| `volumes/functions/main/index.ts` | `81e7902f1d281cb6efaa048390a0d7e0dd1f88c8c80ff4ed1ec76d9faeace6c1` |
| `volumes/functions/_shared/cors.ts` | `d0d945158d49295b15c6c4f11e534b2a7a5da17461d57b122b3e5b50a92a8f53` |
| Container `/etc/envoy/lds.yaml` | `4ad377ecce353c4303bbd759f31c2ada228f41902b6ede003c9e453387414919` |
| Container `/etc/envoy/cds.yaml` | `1d7514b891370ed27c25911df008887402e16ab09273e6e433225bb7f09f7905` |

Local `create-user/index.ts` matches mounted handler. Runtime start remains `2026-10-26T20:33:39.666108887Z`, restart count zero at inspection. Checksums match prior baseline; they cannot identify unknown `.com` source.

## Public tests and correlation

POST only `/functions/v1/create-user`; body `{}` or deliberately malformed `{`; `Content-Type: application/json`; no apikey or valid credential. Invalid token is synthetic `phase1c-invalid-token`. Responses discarded; selected status and correlation headers retained. No valid creation payload sent.

Probe prefix: `agent-c-1c-20261027T013745Z` in query parameter `phase1c_probe`.

| Host / request | HTTP | CF-RAY | Kong request ID |
| --- | --- | --- | --- |
| `.com` anonymous `{}` | 400 | `a50dfa2568c3c8b5-SIN` | `4e0fae314f48db24fe35432082d6710c` |
| `.com` invalid Bearer `{}` | 400 | `a50dfa28d8cacddd-SIN` | `149ae52c6e8a861a33730b399205922a` |
| `.com` anonymous malformed `{` | 400 | `a50dfa2bdf5a0d78-SIN` | `68c4ef011413e966b35b730327c75762` |
| `.space` anonymous `{}` | 401 | `a50dfa2ec8c2fe21-SIN` | None observed |
| `.space` invalid Bearer `{}` | 401 | `a50dfa330fe0ce2e-SIN` | None observed |
| `.space` anonymous malformed `{` | 401 | `a50dfa35fa18ce83-SIN` | None observed |

Follow-up sequential correlation, using `phase1c_probe=agent-c-sequential-com` then `agent-c-sequential-space`: runtime dispatch count **20 before; 20 after `.com` HTTP 400; 21 after `.space` HTTP 401**. Count method: capture Docker log streams and count exact `serving the request with /home/deno/functions/create-user` lines. This is aggregate temporal correlation, not request-ID propagation into the runtime. Concurrent traffic could affect counts. No matching query marker appeared in the available Envoy log window; absence alone is not proof. Gateway difference, live tunnel configuration and positive `.space` count jointly support the unresolved-origin finding.

HTTP 400 does not prove successful anonymous creation. It fails to establish the required authentication denial at the requested hostname. Malformed `.com` 400 is insufficient to attest controlled handler validation without source/log ownership.

| Required real-role public matrix | Status |
| --- | --- |
| Anonymous / invalid token | FAIL verification gate on `.com`; 401 observed on `.space` |
| Normal user / artist / label / admin elevation denial | NOT RUN: no safe real-role fixtures supplied; label artist creation is an existing permitted workflow, so role denial must specify prohibited action |
| Valid privileged caller ALLOW | NOT RUN: no approved disposable identity and cleanup fixture; no production user created |
| Expired token | NOT RUN with actual expired integration token |
| Independent QA | PENDING |

## Local verification and next checkpoint

`node scripts/phase1-edge-security.test.cjs` PASS: mocked Auth/DB only. Existing source checks active authoritative profile/role and restricts admin-to-superadmin elevation and label/whitelabel creation scope. These are not public integration results.

Blockers: Agent B dependency/rollback checkpoint plus explicit coordinator release; read-only Cloudflare `.com` control-plane export and actual Kong host access; proven route owner/intended destination/blast radius; private current-state snapshot and tested exact rollback; safe real-role identities; independent QA. No routing correction can be specified safely until the unknown current route is identified. After release and ownership proof, upload only intended handler/shared files by scp, reload only `functions` when required, then rerun the full PUBLIC `.com` matrix. Do not count origin checks as closure.
