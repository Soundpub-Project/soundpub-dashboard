# Supabase to Backend Capability Matrix

Snapshot: 2026-11-05. Baseline commit: `f275d74`.

Dokumen ini adalah evidence tracker Phase 0. Status berubah hanya setelah source, contract, dan test evidence tersedia.

Status: `UNMAPPED`, `MAPPED`, `PARTIAL`, `IMPLEMENTED`, `VERIFIED`, `DEFERRED`, `REJECTED`.

## Identity, role, dan user lifecycle

| Capability | Supabase reference | Backend target/current | Frontend state | Status | Next evidence/work |
| --- | --- | --- | --- | --- | --- |
| Login utama | Supabase Auth session | local auth tersedia; generic bearer provider production belum tersedia | Backend auth aktif pada dev | PARTIAL | Production local-session verification dan lifecycle gate |
| Partner SSO | `sso-login` | Keycloak-compatible OIDC/JWKS bearer adapter validates RS256, issuer, audience, expiry, nbf, and key rotation | Frontend partner login cutover belum penuh | IMPLEMENTED | Configure real realm/client and verify browser E2E |
| Create user | `create-user` | `/api/v1/admin/users` | Backend adapter tersedia | IMPLEMENTED | Role matrix compatibility |
| Update role | `update-user-role` | admin user role endpoint | Backend adapter tersedia | IMPLEMENTED | Superadmin hierarchy regression |
| Update status | `update-user-status` | admin user status endpoint | Backend adapter tersedia | IMPLEMENTED | Suspension/session invalidation parity |
| Delete user | `delete-user` | safe lifecycle/archive/delete | Backend adapter tersedia | IMPLEMENTED | Dependency conflict compatibility |
| Change own password | `change-own-password` | local auth password endpoint | Backend adapter tersedia | IMPLEMENTED | Session revocation evidence |
| Admin reset password | `update-user-password`, `set-artist-password` | privileged password endpoint | Backend adapter tersedia | IMPLEMENTED | Target-role matrix test |
| Email verification | verification Edge Functions | local verification workflow | Belum parity penuh | PARTIAL | Delivery, expiry, replay, rate-limit tests |
| Password recovery | reset Edge Functions | local recovery workflow | Belum parity penuh | PARTIAL | Digest token dan atomic consumption evidence |
| Impersonation | `start-user-impersonation` | local privileged session | Belum dipastikan frontend | PARTIAL | Origin, expiry, audit, exit workflow |

## Tenant, label, dan artist

| Capability | Supabase reference | Backend target/current | Frontend state | Status | Next evidence/work |
| --- | --- | --- | --- | --- | --- |
| Label account | profiles/user_roles/managed relationships | labels module | Backend route tersedia | IMPLEMENTED | Production field/default comparison |
| Whitelabel scope | whitelabel profile + artist creation | tenant-scoped labels/users | UI masih punya direct Supabase reads | PARTIAL | Tenant model dan dashboard cutover |
| Artist login | Auth user + artist profile | users/artists | Backend route tersedia | IMPLEMENTED | Profile field parity |
| Managed artist | legacy managed artist conventions | label-custom unit artist | Backend UI tersedia | VERIFIED | Pertahankan no-login invariant |
| Label Custom PIC | Tidak ada role canonical lama | label-custom module | Backend UI tersedia | VERIFIED | Compatibility hanya untuk shared resource behavior |
| Parent assignment | `create-user`, whitelabel function | server-derived parent scope | Backend guard tersedia | IMPLEMENTED | Cross-tenant negative matrix |
| Transfer artist | `transfer-artist-label` | ownership workflow | Belum dinyatakan parity | PARTIAL | Historical ownership contract dan tests |
| Remove artist | `remove-artist-from-label` | archive/unlink workflow | Belum dinyatakan parity | PARTIAL | Release/royalty dependency rules |
| Orphan audit/repair | orphan RPCs | orphan repair service/CLI | Backend page tersedia | IMPLEMENTED | Read-only plan and apply authorization evidence |

## Release, track, submission, dan media

| Capability | Supabase reference | Backend target/current | Frontend state | Status | Next evidence/work |
| --- | --- | --- | --- | --- | --- |
| Release CRUD | `soundpub.releases` policies/triggers | releases module | Backend adapter tersedia | IMPLEMENTED | Field/default/state parity matrix |
| Track CRUD | `soundpub.tracks` policies/triggers | tracks module | Backend adapter tersedia | IMPLEMENTED | ISRC uniqueness and archive parity |
| Release aggregate write | frontend multi-table writes | aggregate backend endpoint | Backend adapter tersedia | IMPLEMENTED | Transaction/failure compatibility |
| Submission readiness | release validation/functions | submissions module | Backend adapter tersedia | IMPLEMENTED | Production rule comparison |
| Submission provider | external/manual workflow | provider adapter | Mock/dev implementation | PARTIAL | Provider contract and failure lifecycle |
| Artwork upload | Supabase Storage | media upload intent | Backend adapter tersedia | IMPLEMENTED | MIME/checksum/replacement parity |
| Master audio upload | Supabase Storage | private media capability | Backend adapter tersedia | IMPLEMENTED | Full browser and cleanup tests |
| Catalog projection | `get-catalog-tracks` | public catalog module | Backend adapter tersedia | IMPLEMENTED | DTO parity; master URL intentionally REJECTED |
| Invoice PDF/download | storage/function | authorized storage adapter | Belum dinyatakan parity | PARTIAL | Consumer and authorization test |

## Royalty upload dan ingestion

| Capability | Supabase reference | Backend target/current | Frontend state | Status | Next evidence/work |
| --- | --- | --- | --- | --- | --- |
| CSV parsing | `UploadRoyalty.tsx` browser parser | inline strict parser plus private-file streaming RFC-style parser and chunk matcher | Backend-mode UI uses private file sessions | VERIFIED | Preserve provider fixtures as parser formats expand |
| Required columns | period, isrc, platform, country, sales_unit, net_revenue | legacy CSV adapter preserves required/optional columns | Legacy UI compatible | VERIFIED | Keep golden fixtures as format evolves |
| Optional enrichment | UPC/title/artist/label/sales type | canonical lookup/matcher | Legacy browser DB lookups | MAPPED | Server-side matcher |
| ISRC matching | tracks primary match | normalized server lookup, ambiguity fail-closed, transfer-safe release ownership | Backend CSV API available | VERIFIED | Decide future recipient-pair versus exact-track ambiguity policy |
| UPC/release matching | releases lookup | UPC assertion/narrowing plus release-track consistency | Backend CSV API available | VERIFIED | Add provider-specific UPC normalization only with evidence |
| Artist attribution | artist relation/history migration | stable artist ID, historical ISRC conflict guard, allocation snapshot | Backend CSV API available | VERIFIED | Add manual review workflow for legacy unresolved identities |
| Label attribution | release label snapshot | immutable `label_owner_user_id`; ordinary, Whitelabel, and Label Custom scope verified | Backend role-scoped report | VERIFIED | Preserve historical label snapshot during future tenant expansion |
| Preview | browser validation and split preview | inline preview plus durable chunk staging, capped diagnostics, exact progress, and compatible checksum | Backend-mode CSV preview cut over | VERIFIED | Add staged-row pagination and review UI |
| File upload | Edge Function receives parsed records | private RustFS upload intent, verified UTF-8/checksum snapshot, admin status/download API | Backend-mode signed upload uses chunked browser SHA-256 without buffering the full file | VERIFIED | Preserve checksum compatibility across supported browsers |
| Async parse | Edge Function synchronous | streaming object reader, 1.000-row matcher/staging chunks, lease heartbeat, exact progress, bounded diagnostics/retry, and authority revocation | Frontend polls session status | VERIFIED | Add manual retry/takeover UI and long-running dual-worker QA |
| File retention | implicit function/storage lifecycle | leased CLEANING state removes final and staging objects for expired pending/failed sessions; committed/preview originals retained | No destructive frontend action | VERIFIED | Add configurable long-term archive policy for committed statements |
| Import history | `royalty_uploads` | import batches/history and immutable detail with correction/replacement provenance | Backend-mode history/detail cut over | VERIFIED | Add cursor pagination for large history |
| Delete upload | `delete-royalty-upload` + balance rebuild | immutable correction plus atomic CSV replacement; old batch retained and offset | Backend history uses requester-bound private replacement file sessions and immutable provenance | VERIFIED | Add superadmin takeover workflow for abandoned sessions |
| Duplicate file | upload/source semantics | checksum replay protection | Backend checksum tersedia | IMPLEMENTED | Source-file checksum and provider-period key |
| Duplicate row | source row key | source/period/source_row uniqueness | Backend tersedia | IMPLEMENTED | CSV row fingerprint compatibility |
| Large file | browser memory + Edge Function | private upload/preview accept up to 100 MB/100.000 rows; checksum-bound staging, current-owner revalidation, set-based entries/allocations, ledger, audit, outbox, and session finalization share one transaction | UI hashes 4 MB slices and pages immutable batch detail 100 rows at a time | VERIFIED | Add long-running browser E2E on minimum supported devices |

## Royalty calculation dan ownership

| Capability | Supabase reference | Backend target/current | Frontend state | Status | Next evidence/work |
| --- | --- | --- | --- | --- | --- |
| Net revenue source | CSV `net_revenue` | gross/deduction/net invariant | Kontrak berbeda | PARTIAL | Map source amount semantics |
| SoundPub share | 9% dari `net_revenue`, dibulatkan per row ke 2 desimal | immutable SOUNDPUB allocation, excluded from user wallet | Backend preview displays server total | VERIFIED | Add accounting destination/reporting for retained share |
| Label share | Sisa row setelah SoundPub 9% dan artist 70%; efektif sekitar 21% | immutable LABEL allocation; ordinary label and Label Custom PIC verified | Backend preview displays server total | VERIFIED | Add contract-specific policy variants later |
| Artist share | 70% dari `net_revenue`, dibulatkan per row ke 2 desimal | immutable ARTIST allocation; managed artist aggregates to PIC | Backend preview displays server total | VERIFIED | Add contract-specific policy variants later |
| Composer share | composer royalty module | separate composer path | UI/module tersedia | PARTIAL | Integrate calculation and ledger attribution |
| Rounding | SoundPub dan artist dibulatkan half-up per row; label menerima remainder row | integer minor units | Backend arithmetic safe | MAPPED | Golden production fixtures |
| Policy effective date | implicit settings/current data | no generic versioned policy | Tidak terlihat | MISSING | Calculation policy schema |
| Historical owner snapshot | royalty history guard migration | artist, label, ISRC, UPC, policy and component allocations snapshotted | Backend detail exposes trace | VERIFIED | Manual resolution for pre-snapshot unresolved rows |
| Artist moves label | history guard/repair migrations | historical ownership tests | Backend tests tersedia | IMPLEMENTED | Compare exact production semantics |
| Label Custom aggregation | new backend behavior | PIC financial owner | Backend UI/API tersedia | VERIFIED | Maintain artist-only reporting dimension |
| Reversal/recalculation | replace/delete upload functions | immutable correction reverses exact allocation-owner totals | Backend correction tersedia | VERIFIED | Replacement workflow remains separate |

## Ledger, balance, dan reconciliation

| Capability | Supabase reference | Backend target/current | Frontend state | Status | Next evidence/work |
| --- | --- | --- | --- | --- | --- |
| Balance authority | mutable profile balance + rebuild | immutable finance events | Backend balance API | IMPLEMENTED | Legacy values migrate through reconstructed ledger only |
| Royalty posting | upload inserts + balance rebuild | `ROYALTY_EARNING` event with per-entry allocation, owner-set, finance audit/outbox, and correction-adjustment DB guards | Available only after independent batch reconciliation | VERIFIED | Preserve reviewer separation and immutable evidence |
| Manual adjustment | balance adjustment patterns | immutable adjustment event | Admin UI status unknown | PARTIAL | Approval and UI workflow |
| Reservation | payout reservation tables/RPC | finance reservation events | Backend payout API | IMPLEMENTED | Concurrency test |
| Settlement | payout completion | settlement event + evidence | Backend payout API | IMPLEMENTED | Provider callback parity |
| Batch reconciliation | production replacement validation | append-only server snapshot, mismatch diagnostics, independent reviewer approval through isolated `soundpub_reconciler` DB credential, semantic audit/outbox binding, live integrity recheck, derived `RECONCILED` status | Backend import detail exposes review and approval UI | VERIFIED | Add explicit revocation only if product requires reopening an active batch |
| Global reconciliation | balance rebuild queries | immutable scheduled ledger/domain verification with admin history API | Worker, Docker integration, checksum and drift evidence | VERIFIED | Monitor scale; repair remains separate and approval-gated |
| Repair workflow | production repair functions | plan-first repair commands | Partial | PARTIAL | Dry-run artifact and approval gate |

## Reporting dan export

| Capability | Supabase reference | Backend target/current | Frontend state | Status | Next evidence/work |
| --- | --- | --- | --- | --- | --- |
| Royalty summary | direct table queries/RPC | `/royalties/summary` plus scoped report summary | Backend report cards use current role scope | VERIFIED | Add retained SoundPub accounting report |
| Breakdown | direct royalties reads | `/royalties/report` and `/royalties/breakdown` | Backend report UI supports period/search/artist/release pagination | VERIFIED | Add cursor pagination for very large history |
| Release detail | release royalty views | `/royalties/releases/:id` | Backend adapter tersedia | IMPLEMENTED | Frontend cutover evidence |
| Track detail | table query | `/royalties/report?track_id=` provides scoped rows | Generic report client supports track filter contract | IMPLEMENTED | Add dedicated aggregate track endpoint if product needs richer metadata |
| Period list | distinct query | `/royalties/periods` role-scoped | Backend period selector cut over | VERIFIED | None |
| CSV export | frontend/legacy export | generic role-scoped report pagination | Backend Royalti exports current filter for all supported roles | VERIFIED | Move very large export to async server file later |
| Whitelabel dashboard | direct royalties query | whitelabel royalty scope verified through immutable label snapshot | Royalti page cut over; standalone WhitelabelDashboard still mixed | PARTIAL | Cut over roster/release widgets on standalone dashboard |

## Payout dan payment

| Capability | Supabase reference | Backend target/current | Frontend state | Status | Next evidence/work |
| --- | --- | --- | --- | --- | --- |
| Payout eligibility | RPC/business rules | eligibility endpoint | Backend adapter tersedia | IMPLEMENTED | Minimum/settings parity |
| Request payout | payout RPC/table writes | atomic reservation | Backend adapter tersedia | IMPLEMENTED | Role compatibility |
| Label Custom payout | N/A legacy | PIC-only wallet | Backend UI/API | VERIFIED | Maintain no artist recipient |
| Admin review | status update workflow | payout transitions | Backend API | IMPLEMENTED | UI and audit evidence |
| Settlement/failure | provider/manual workflow | state machine | Backend API | IMPLEMENTED | Callback/provider adapter |
| Xendit invoice | create invoice functions | payments module | Mock/dev path | PARTIAL | Sandbox provider and idempotency |
| Xendit webhook | Edge Function | dedicated webhook route | Backend implementation | PARTIAL | Signature/raw-body/provider contract |
| Copyright invoice | Edge Function | payment adapter | Not fully mapped | PARTIAL | Consumer and domain ownership |

## Notifications, settings, dan operations

| Capability | Supabase reference | Backend target/current | Frontend state | Status | Next evidence/work |
| --- | --- | --- | --- | --- | --- |
| App email | `send-app-email` | notifications/outbox | Backend module exists | PARTIAL | Template/delivery parity and provider adapter |
| Royalty notification | Edge Function | outbox event after reconciliation | Belum dibuktikan | PARTIAL | Event contract and retry |
| App settings | table + update function | audit-settings module | Backend settings UI | IMPLEMENTED | Full key/type compatibility |
| Maintenance mode | app setting | backend setting/enforcement | UI tersedia | PARTIAL | Request gate behavior |
| Storage backup | backup Edge Function | scoped worker | Tidak diperlukan frontend | DEFERRED | Recovery design after parity |
| Audit log | table triggers/function logs | backend audit events | Partial admin visibility | PARTIAL | Unified viewer and retention |
| Observability | container/function logs | structured logs/metrics | Dev only | PARTIAL | Import/payout SLO and alert design |
| Outbox topic coverage | direct function side effects | explicit producer/consumer topic registry with startup assertion | Dev worker registered | VERIFIED | Add provider-specific delivery handlers as each provider becomes real |
| Production identity provider | Supabase Auth/SSO | local session remains primary; production OIDC/JWKS bearer adapter available for partner identity | Deployment config belum diaktifkan | IMPLEMENTED | Bind verified external identity and run realm E2E |

## Verification evidence

- 2026-11-04: `npm run typecheck` PASS.
- 2026-11-04: focused royalty and worker tests PASS.
- 2026-11-04: isolated Docker `dashboard-sounpub-dev` rebuilt successfully.
- 2026-11-04: `RUN_DOCKER_TESTS=1 npm test` produced 295 tests, 289 pass, 0 fail, 6 skipped after reporting and retention checkpoints.
- 2026-11-05: backend unit suite produced 274 tests, 230 pass, 0 fail, 44 skipped; frontend TypeScript, chunked SHA-256 contract, finance backend-mode contract, and production build pass.
- 2026-11-05: disposable PostgreSQL verifies cross-entry allocation drift rejection, empty-batch rejection, exact earning-plus-correction enforcement, forged approval rejection, stale evidence payout closure, uploader self-review denial, batch reconciliation replay, balance unlock, correction precedence, and Label Custom batch-plus-owner approval flow.
- Durable PASS includes PostgreSQL concurrency, finance ledger, payout, payment, historical ownership, release/track, RustFS media, Label Custom E2E, and deferred immutable royalty-allocation constraints.
- Royalty entries now carry calculation policy, artist, label, ISRC, UPC, and statement-dimension snapshots. Immutable child allocations support ARTIST, LABEL, SOUNDPUB, COMPOSER, and LEGACY_OWNER components. Existing rows backfill exactly as one LEGACY_OWNER allocation. Ledger, reporting, readiness, balance gates, earnings, and corrections aggregate allocation owners, not mutable current catalog ownership.
- Inline CSV preview/commit now reparses and rematches server-side, verifies expected checksum, blocks active source-period conflicts, writes 70/21/9 allocations atomically, and proves ordinary-label plus Label Custom behavior on disposable PostgreSQL.
- Backend-mode frontend now uploads raw CSV to server preview, displays authoritative diagnostics and 70/21/9 totals, commits with the preview checksum, and reads immutable backend history/detail without Supabase fallback. Frontend TypeScript and production build pass.
- Scoped royalty reporting now provides period discovery, filters, totals, pagination, and CSV export for admin, ordinary label, Whitelabel, artist, and Label Custom PIC. Disposable PostgreSQL proves no cross-owner leakage.

## Remaining blockers

1. Private royalty files, streaming leased preview worker, immutable checksum-bound staging, heartbeat progress, retry state, authority revocation, current-owner revalidation, set-based atomic session commit, chunked browser hashing, paged batch detail, independent reconciliation approval, and frontend signed-upload cutover are verified. Disposable PostgreSQL processes and commits 100.000 rows with 300.000 allocations in 110,5 seconds.
2. Ordinary label, Whitelabel, artist, and Label Custom reporting scopes are verified; standalone WhitelabelDashboard roster/release widgets remain direct Supabase.
3. Dedicated aggregate track endpoint remains optional; generic scoped report already supports `track_id`.
5. Payment provider, payout settlement provider, submission provider, and notification delivery remain partial or mock-oriented.
6. Royalty upload is cut over when backend royalty/release domains are enabled, but frontend inventory still contains about 368 Supabase call chains in other domains; root production build does not enable backend domains.
7. Keycloak adapter is implemented; production realm/client configuration and browser E2E remain.
8. Copyright, takedown, provider invoice/settlement, and several release actions remain direct or fail-closed.
