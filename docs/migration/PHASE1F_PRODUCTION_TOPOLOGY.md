# Phase 1F Production Topology — Agent B

Observation window: **2026-10-27 13:17:12–13:20:46 UTC** / **20:17:12–20:20:46 Asia/Bangkok (UTC+07:00)**. Report written after this window. Workspace HEAD: `48222ffb9c9e60da82d224e1e8aaccd4dd597442`; existing dirty worktree preserved.

**Result: topology partially verified; production routing/security acceptance remains BLOCKED.** Fresh evidence locates the `.com` tunnel destination previously unknown in Phase 1–1E, and identifies the dashboard connector and served build. It does not establish `.com` gateway ownership, downstream runtime/source, authorized change control, credential containment, or rollback.

## Scope and safeguards

- Production Docker inspection used only direct SSH `maskhar@20.20.20.3`, with `cd /data/supabase/instances/supabase-01/config` before every remote inspection. No SSH to `20.20.20.173` was attempted.
- Additional read-only inspection used the workstation's existing Docker context `desktop-linux` (`docker-desktop`, Docker Desktop), because the prior frontend report identified a local active-origin candidate. This is a separate Docker engine from the SSH host.
- Compose JSON, Docker inspection JSON, connector configuration, and bounded connector logs were captured privately in process memory. Output used explicit field allowlists. No full interpolated Compose config, environment, command/arguments, token, password, private key, provider secret, or response body was printed or saved.
- HTTP probes used unauthenticated GET only: no Authorization, apikey, cookies, login, provider action, existing business-function invocation, POST, PATCH, PUT, or DELETE. TLS verification remained enabled for HTTPS. The API/public-page batch disabled redirects. Body bytes were used only for lengths, hashes, fixed URL/bundle matches, or SQL-marker booleans.
- No upload, deployment, restart, recreation, database query, data change, route change, credential rotation, cache purge, package install, or temporary file was performed. This report is the only file created or edited by Agent B. Normal request/access logs and runtime handling of probes may occur; no claim is made that read requests generate zero operational telemetry.

## Prior evidence reviewed

Relevant text in `PHASE1_SOURCE_BASELINE.md`, `PHASE1_VERIFICATION_REPORT.md`, `PHASE1_FINAL_REPORT.md`, `PHASE1B_FINAL_REPORT.md`, `PHASE1C_FINAL_REPORT.md`, `PHASE1D_FINAL_REPORT.md`, and `PHASE1E_FINAL_REPORT.md` supplied chronology and acceptance constraints. Targeted reports read: `PUBLIC_ROUTING_MAP.md`, `PHASE1D_PUBLIC_ROUTING.md`, `PHASE1E_PUBLIC_ROUTING.md`, `PHASE1E_PUBLIC_BUILD.md`, `PHASE1E_PRIVILEGED_API.md`, `PHASE1E_CREDENTIAL_INCIDENT.md`, and `PHASE1E_INDEPENDENT_QA.md`; relevant routing/build/execution reports were also searched. Historical findings are attributed below rather than treated as fresh authorization tests.

Root `AGENTS.md` and `.agents/skills/supabase/SKILL.md` were read. Supabase changelog index was fetched successfully at session start; this audit changed no Supabase feature, version, or configuration.

## Verified paths

```text
Public dashboard: dashboard.soundpub.xyz
  Cloudflare edge
  workstation Docker Desktop: network-soundpub, live connector config version 40
  ingress service http://soundpub-dashboard (implicit port 80)
  soundpub-network: soundpub-dashboard, image soundpub-dashboard-web
  public bundle assets/index-DBB0wF_R.js
  embedded Supabase URL https://supabase.carubra.space

Inspected backend: supabase.carubra.space
  Cloudflare edge
  SSH host 20.20.20.3: network-supabase, live connector config version 3
  ingress service http://supabase-envoy:8000
  supabase-network: supabase-envoy / Compose api-gw, Envoy v1.39.0
  /functions/v1/ prefix rewritten to /, cluster functions
  functions:9000 / supabase-edge-functions, edge-runtime v1.74.0
  /home/deno/functions bind-mounted from
  /data/supabase/instances/supabase-01/config/volumes/functions

Alternate API: supabase.carubra.com
  Cloudflare edge
  workstation Docker Desktop: network-carubra, live connector config version 164
  ingress service http://20.20.20.173:8000
  destination HTTP gateway advertises Kong 3.9.1
  gateway owner/config, upstream network/runtime, mounted source: UNKNOWN
```

These are distinct connector/origin paths. The dashboard's served bundle selects `.space`; this does not inventory every external consumer, callback, dynamically constructed URL, or provider setting that might still use `.com`.

### Important change from Phase 1E

The `.com` origin transport destination is now evidenced by **live** local connector configuration and matching destination/public HTTP fingerprints, rather than inferred from public DNS. `network-carubra` logs independently contained the same ingress at `2026-10-26T12:03:12Z` and `2026-10-27T13:00:32Z`. The connector was started at `2026-10-26T12:03:08.611072199Z`.

The `.space` connector on `20.20.20.3` still contains `.space`, not `.com`. Its sanitized startup-log evidence also showed a final `http_status:404` fallback. No inspected container on that host uses a Kong image. Envoy's network alias `kong` is compatibility naming, not evidence of Kong software. The separate `.com` destination genuinely **advertises** Kong; software identity is based on headers, without process/container attestation at `20.20.20.173`.

## SSH-host Compose and runtime

At `13:17:24Z`, SSH returned the required directory and Docker Compose version **5.5.0**. Sanitized Compose/runtime inspection at `13:17:42–43Z` found Compose project `supabase`, external default network `supabase-network`, and these eleven services. All eleven were running and Docker-healthcheck **healthy** at observation time.

| Compose service | Container | Configured image | Host-published TCP ports |
| --- | --- | --- | --- |
| `api-gw` | `supabase-envoy` | `envoyproxy/envoy:v1.39.0` | `8000` |
| `auth` | `supabase-auth` | `supabase/gotrue:v2.189.0` | None |
| `db` | `supabase-db` | `supabase/postgres:17.6.1.136` | None |
| `functions` | `supabase-edge-functions` | `supabase/edge-runtime:v1.74.0` | None |
| `imgproxy` | `supabase-imgproxy` | `darthsim/imgproxy:v3.30.1` | None |
| `meta` | `supabase-meta` | `supabase/postgres-meta:v0.96.6` | None |
| `realtime` | `realtime-dev.supabase-realtime` | `supabase/realtime:v2.102.3` | None |
| `rest` | `supabase-rest` | `postgrest/postgrest:v14.12` | None |
| `storage` | `supabase-storage` | `supabase/storage-api:v1.60.4` | None |
| `studio` | `supabase-studio` | `supabase/studio:2026.08.03-sha-022b374` | None |
| `supavisor` | `supabase-pooler` | `supabase/supavisor:2.9.5` | `5432`, `6543` |

Published bindings are `0.0.0.0` and `::`. Database host port `5432` belongs to **Supavisor**, not a direct published DB-container binding. Publication does not establish Internet reachability; firewall, NAT, and external port reachability were not tested. Docker image-exposed ports with null bindings are not host publications.

The twelfth running container on this SSH host is `network-supabase`, image `cloudflare/cloudflared:latest`, project `tunnel-cloudflared`, service `cloudflared-supabase`, attached to `supabase-network`, with no published ports and no Docker healthcheck status. Host-wide count at `13:18:09Z`: **34 containers, 12 running, 22 exited**. Exited `supabase-02` and rollback-drill containers are not evidence of an active replacement stack or successful recovery.

Observed restart counters include Auth **10**, Storage **6**, Realtime **9**, connector **1**, Functions **0**. Counters are historical and do not identify causes or prove current instability. Functions start time: `2026-10-27T01:41:54.510600887Z`; running image ID: `sha256:028f109b27ebee0dcd03a242a6ab7d759fff782c2876d5aff2c8a1b596e5e0b4`.

### Persistence and source mounts

Paths below are relative to `/data/supabase/instances/supabase-01/config` unless absolute.

| Host source | Container target | Observed use |
| --- | --- | --- |
| `volumes/functions` | Functions `/home/deno/functions` | Read/write bind; execution source |
| `volumes/functions` | Studio `/app/edge-functions` | Read-only bind |
| Docker volume `supabase_deno-cache` | Functions `/root/.cache/deno` | Read/write cache |
| `volumes/db/data` | DB `/var/lib/postgresql/data` | Read/write PostgreSQL data |
| Docker volume `supabase_db-config` | DB `/etc/postgresql-custom` | Read/write custom config |
| `volumes/storage` | Storage and imgproxy `/var/lib/storage` | Read/write shared storage |
| `volumes/api/envoy/{envoy.yaml,cds.yaml,lds.template.yaml,docker-entrypoint.sh}` | Corresponding `/etc/envoy/*` and `/docker-entrypoint.sh` | Read-only gateway inputs |
| `volumes/pooler/pooler.exs` | Pooler `/etc/pooler/pooler.exs` | Read-only config |
| `volumes/snippets` | Studio `/app/snippets` | Read/write bind |

DB initialization SQL bind mounts were inventoried by path only; contents were not printed. Existence of persistence mounts does not prove backup or restore completeness.

### Gateway route evidence

At `13:18:46Z`, allowlisted fields were extracted from host `envoy.yaml`, `cds.yaml`, `lds.template.yaml` and container-rendered `/etc/envoy/lds.yaml`. Bootstrap references CDS `/etc/envoy/cds.yaml` and LDS `/etc/envoy/lds.yaml`. Rendered listener binds `0.0.0.0:8000`; admin configuration binds `127.0.0.1:9901` inside the container.

| Rendered route | Cluster destination from CDS | Rewrite |
| --- | --- | --- |
| `/functions/v1/` | `functions:9000` | `/` |
| `/storage/v1/` | `storage:5000` | `/` |
| `/auth/v1/` general route | `auth:9999` | `/` |
| `/rest/v1/` | `rest:3000` | `/` |
| `/graphql/v1` | `rest:3000` | `/rpc/graphql` |
| `/realtime/v1/api` | `realtime-dev.supabase-realtime:4000` | `/api` |
| `/realtime/v1/` WebSocket route | `realtime-dev.supabase-realtime:4000` | `/socket/` |
| `/pg/` | `meta:8080` | `/` |
| `/` fallback | `studio:3000` | No listed rewrite |

Specific Auth callback/verify/authorize/JWKS/SSO routes and MCP routes also exist. This is a topology extract, not a complete authorization-policy audit. An initial structured-YAML attempt could not run because remote Python lacked PyYAML; no dependency was installed. Follow-up used strict scalar-field matching. Rendered files were inspected, not Envoy's active admin config dump; exact loaded-filter/state attestation remains outside this check.

## Source identity: inspected `.space` Functions mount

Remote bind-source hashes at `13:18:46Z` matched running-container hashes at `13:19:13Z` for all six rows below. Workspace hashes were sampled at `13:19:14–16Z`. **37** immediate remote directories contain `index.ts`.

| Relative source | Mounted/running SHA-256 | Workspace comparison |
| --- | --- | --- |
| `main/index.ts` | `81e7902f1d281cb6efaa048390a0d7e0dd1f88c8c80ff4ed1ec76d9faeace6c1` | Remote-only in prior inventory; no fresh workspace comparison |
| `create-user/index.ts` | `079c2d9d06d81e10286060a805fb47a7265a111bb483dd7da73a998e8975584f` | Exact match |
| `send-app-email/index.ts` | `bc51345a1021ec8856c0b8f50fb53a6cb059b83513429c849d50c7d9409ee1ab` | Differs; workspace `95a57892f6a60ce34bd2b86673ce4a0ce9237f5ad0eddb420d9f3674118bcc8e` |
| `backup-storage-to-drive/index.ts` | `6bbfbf3091ada52201dfabb5cec5e502e919b8ec017e1c17cbe79e43ddf07130` | Differs; workspace `d7708c39e063ab30f8161cb84e4352638d90482738248c3500e7c390c796b460` |
| `xendit-webhook/index.ts` | `39fa53bb922f64be772b47f77d9a2891fe5cbe2fe8bd1c8284eb875bf910acbb` | Differs; workspace `e4a36a4675c67c8791891bc8f48bd82168e228658ff57c09c102325d20448970` |
| `_shared/cors.ts` | `d0d945158d49295b15c6c4f11e534b2a7a5da17461d57b122b3e5b50a92a8f53` | Exact match |

Remote `_shared/privileged-api.ts` was absent; workspace file exists, SHA-256 `3c8a599959c29b0be91056333c27087a1c74edf047d4edb17fdf23ac24188d1f`. This corroborates Phase 1E deployment drift. Matching mounted bytes do not prove cached worker code identity, security behavior, or `.com` deployment identity. No business handlers were invoked to establish authorization.

## DNS and safe endpoint evidence

Workstation DNS observations: `13:18:46–47Z`, system resolver, `Resolve-DnsName -DnsOnly`, A and AAAA. Addresses are Cloudflare edge answers, not origin addresses.

| Hostname | A | AAAA |
| --- | --- | --- |
| `supabase.carubra.com` | `172.67.133.219`, `104.21.5.212` | `2606:4700:3031::ac43:85db`, `2606:4700:3037::6815:5d4` |
| `supabase.carubra.space` | `104.21.66.100`, `172.67.158.197` | `2606:4700:3035::6815:4264`, `2606:4700:3033::ac43:9ec5` |
| `dashboard.soundpub.xyz` | `172.67.132.98`, `104.21.4.199` | `2606:4700:3030::6815:4c7`, `2606:4700:3035::ac43:8462` |

API results below are unauthenticated GET, body discarded after hashing. Public requests started `13:18:46–47Z`; direct `.space` origin checks ran `13:19:13Z` through SSH; `.com` destination checks ran `13:19:48Z` from workstation without HTTP proxy.

| Path | Public `.com` status / bytes | Public `.space` status / bytes | SSH host `127.0.0.1:8000` status / bytes |
| --- | --- | --- | --- |
| `/auth/v1/health` | `401 / 96` JSON | `401 / 12` text | `401 / 12` text |
| `/rest/v1/` | `401 / 96` JSON | `401 / 12` text | `401 / 12` text |
| `/storage/v1/status` | `200 / 0`, `Via: 1.1 kong/3.9.1` | `200 / 0` | `200 / 0` |
| `/functions/v1/phase1f-topology-nonexistent-20261027` | `500 / 121`, Kong Via | `500 / 121` | `500 / 121` |

The nonce function path does not exist in the inspected function mount. It exercises unknown-function routing, not an existing email/backup/payment/user-creation handler. Its identical error fingerprints across both public hosts do **not** prove a shared origin. No unknown-function directory was created.

Direct `http://20.20.20.173:8000/auth/v1/health` returned `401 / 96`, `Server: kong/3.9.1`; `/storage/v1/status` returned `200 / 0`, with both Server and Via advertising Kong 3.9.1. This supports the live `.com` connector destination. No credentials, admin API, storage objects, table data, or existing function were requested there.

Public `.space` and direct Envoy auth/REST denials have SHA-256 `d089c8a9fc28e4e50223eb38c9409e362521be9380a37341304fbac7a4cd9e5f`. Empty status body has SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. Unknown-function body has SHA-256 `d0f9f9429fbfc4e7c34da56a606cfaae1bf16c16d3f945ad6bb571fb11f59c54`. `.com` auth/REST denial body hashes varied; request-specific bodies were not interpreted or printed.

Public responses advertised `Server: cloudflare`; API observations had `CF-Cache-Status: DYNAMIC`. Status and header fingerprints establish reachability and route differences, not successful authenticated behavior or security acceptance. Phase 1E's `create-user` GET findings were not replayed against existing handlers during this stricter read-only audit.

## Public frontend identity and exposed artifacts

At `13:19:48Z`, live `network-soundpub` configuration version **40** mapped `dashboard.soundpub.xyz` to `http://soundpub-dashboard`. Both containers share `soundpub-network`. Dashboard container is running, image ID `sha256:3abdff95ff26936c06e9479a77f3d770312dd439f437a2bc68fd046643ed5de7`, started `2026-10-26T05:33:27.52940303Z`, host binding `8181:80` on IPv4 and IPv6, with no mounts. Its Compose labels identify project `soundpub-dashboard`, service `web`, and this workspace's `docker-compose.yml`. Tunnel Compose labels identify `I:\website-devops\docker\docker\cloudflared\tunnel-carubra-network\docker-compose.yml`; that file was not opened or changed.

Public dashboard requests started `13:18:48Z`:

| Public path | HTTP / received bytes | Safe content evidence |
| --- | --- | --- |
| `/` | `200 / 3,128` | References `/assets/index-DBB0wF_R.js` |
| `/cors-test.html` | `200 / 3,031` | Separate HTML response, no application bundle reference |
| `/test-oauth.html` | `200 / 3,820` | Separate HTML response, no application bundle reference |
| `/exports/full-schema.sql` | `200 / 76,769` | SQL DDL marker present; exact container hash match |
| `/silent-check-sso.html` | `200 / 1,412` | Helper response; required by existing SSO integration per prior report |
| `/phase1f-topology-nonexistent-20261027` | `200 / 3,128` | Application bundle reference; SPA fallback behavior |

Public HTML and container HTML differ in length/hash. HTML delivery transformations may explain differences, but their cause was not investigated. Prior-phase HTML byte counts also differ; those counts should not be treated as stable origin identities. The byte-identical SQL export and JavaScript bundle provide stronger artifact evidence:

- `/exports/full-schema.sql`: public/container SHA-256 `2a0535f6ab8cc24b2ef1a837cb49d3594b7f8f045062916dff6cf9574ed4a3d4`, **76,769 bytes**.
- `/assets/index-DBB0wF_R.js`: public/container SHA-256 `3f36f0ec992ac4ca6d91b5f2f9102f380bd222dcf06cfcc7bc1492e6469fcc9b`, **2,195,336 bytes**. Public GET at `13:20:43–46Z` returned `200`, JavaScript, `CF-Cache-Status: MISS`. Fixed-pattern scan found `https://supabase.carubra.space`; no `.com` match for that fixed Supabase-host pattern. This was not a comprehensive secret or configuration scan.

An initial bundle GET using Python's default User-Agent failed with HTTPError; its status was not captured. A follow-up with the audit User-Agent returned the recorded 200. No content, token, SQL source, or full JavaScript was printed or saved. **Public-build hygiene remains FAIL**: schema export and debug artifacts are still served; no cleaned build was deployed.

## Command and evidence ledger

All times below are **2026-10-27 UTC**. Piped scripts ran from memory, not files. Commands involving potentially sensitive structured output were called through Python `subprocess.run(..., capture_output=True)` and filtered before tool output.

| Time | Command or read operation | Recorded evidence |
| --- | --- | --- |
| `13:17:12` onward | `git status --short`, `git rev-parse HEAD`; `rg` and targeted `Get-Content` | Existing changes preserved; reports and instructions reviewed |
| `13:17:24` | `ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes maskhar@20.20.20.3 'cd /data/supabase/instances/supabase-01/config && date -u +%Y-%m-%dT%H:%M:%SZ && pwd && docker compose version --short && docker compose config --services'` | Required directory, UTC time, Compose version, eleven service names |
| `13:17:42–43` | Same SSH target/directory; Python captures `docker compose config --format json`, `docker ps -aq`, `docker inspect <IDs>` | Allowlisted services/images/ports/networks/mounts/state; raw JSON and stderr suppressed |
| `13:18:09` | SSH Python attempts structured YAML parse, reads rendered LDS privately; sanitizes `docker logs --tail 200 network-supabase` | PyYAML unavailable; only two ingress/fallback records printed; host container counts |
| `13:18:09` | Workstation Docker inspect, allowlisted fields only | Dashboard and relevant connectors found on separate engine |
| `13:18:46` | SSH Python reads three host Envoy config files and captures `docker exec supabase-envoy cat /etc/envoy/lds.yaml` | Strict field-name/value matching emits only route/socket scalars |
| `13:18:46` | SSH Python GET `http://172.19.0.8:20241/config` | Live remote tunnel version 3; only allowed hostname/service output |
| `13:18:46` | SSH Python reads selected mounted files and SHA-256; counts immediate `index.ts` entries | Six mounted source hashes, missing helper, 37 entrypoints |
| `13:18:46–47` | `Resolve-DnsName -Name <hostname> -Type A/AAAA -DnsOnly` | Cloudflare A/AAAA answers |
| `13:18:46–49` | Python urllib GET public API health/root/status/nonce paths and dashboard pages | Status, byte count, SHA-256, selected headers and fixed markers; bodies suppressed |
| `13:19:13` | SSH captures `docker exec supabase-edge-functions sha256sum /home/deno/functions/<selected paths>`; urllib GET `http://127.0.0.1:8000/<safe paths>` | Running mount hashes match host; origin response fingerprints |
| `13:19:14–16` | Workstation captures bounded logs for `network-carubra`, `network-soundpub`, `cloudflared-tunnel`; `docker exec soundpub-dashboard cat /usr/share/nginx/html/<selected asset>`; local source hashes | Strict target-host ingress extraction; local asset/build hashes and source drift |
| `13:19:47–48` | Workstation sanitized tunnel-log extraction; `docker exec soundpub-dashboard wget -qO- -T 5 http://network-soundpub:20241/config`; urllib GET two health/status paths at `20.20.20.173:8000` | Dashboard live connector version 40; logged `.com` config timestamps; destination Kong headers |
| `13:20:16–18` | `docker context show`; `docker info --format '{{.Name}} \| {{.OperatingSystem}}'`; `docker exec soundpub-prod wget -qO- -T 5 http://network-carubra:20241/config`, captured privately; selected Compose labels | Docker Desktop distinction; `.com` live config version 164 and origin service; no `soundpub-prod` business endpoint invoked |
| `13:20:43–46` | urllib GET `https://dashboard.soundpub.xyz/assets/index-DBB0wF_R.js`, audit User-Agent | Exact public/container bundle match; fixed `.space` URL match |

For safe repeat inspection, keep the private capture/filter boundary. Example Compose projection used by the audit, omitting all environment, command, labels, healthcheck commands and unknown fields:

```python
# Run through direct SSH Python stdin, after cd to the required Docker directory.
import json, subprocess

p = subprocess.run(
    ["docker", "compose", "config", "--format", "json"],
    capture_output=True, text=True,
)
if p.returncode:
    raise SystemExit("Compose inspection failed; stderr suppressed")
for name, service in json.loads(p.stdout)["services"].items():
    print(json.dumps({
        "service": name,
        "image": service.get("image"),
        "ports": service.get("ports", []),
        "networks": list(service.get("networks", {})),
        "mounts": [
            {key: mount[key] for key in ("type", "source", "target", "read_only") if key in mount}
            for mount in service.get("volumes", []) if isinstance(mount, dict)
        ],
    }))
```

Do not replace the projection with raw Compose, inspect, connector-config, or log output: those records can contain interpolated credentials or tunnel registration tokens.

## Remaining limits and gate disposition

- **`.com` routing: PARTIALLY MAPPED / acceptance BLOCKED.** Live connector destination and gateway fingerprint now known. No SSH/container/process inspection at `20.20.20.173`, Kong route/service export, upstream/source attestation, owner identification, account-wide Cloudflare DNS/Workers/load-balancer export, change authority, or tested reversal. Connector management GET is not proof of Cloudflare account control or exclusivity of that route.
- **`.space` stack: observed healthy / security gate unchanged.** Route and selected mounted bytes verified. No authenticated user/service matrix, existing privileged-function probe, scheduler validation, provider callback, or old-credential rejection test. Source drift remains visible. Healthcheck success is not an application/security PASS.
- **Frontend: origin/build strongly evidenced / public-build gate FAIL.** Live connector and two exact artifact hashes connect the public build to the workstation container. Required SSO, user flows, deployment ownership, cache rules, clean-build release, and rollback remain untested. No frontend environment was changed.
- **Credential incident remains OPEN by prior evidence.** No secret values reused, validated, rotated, or printed here; no containment conclusion or new security acceptance granted.
- **Snapshot limits:** observations span several minutes, without a production freeze. No exhaustive request correlation, complete source inventory, external-consumer inventory, database/Auth/Storage content verification, network firewall audit, off-host backup, or restore drill. GET requests can produce logs and unknown-function errors; absence of every possible backend side effect was not independently audited.
- No Phase 2 readiness, cutover, decommissioning, or global production PASS is implied. This report narrows topology uncertainty only. Authorized output: **`docs/migration/PHASE1F_PRODUCTION_TOPOLOGY.md`**.
