# Supabase to Backend Capability Matrix

Snapshot: 2026-11-04. Baseline commit: `42dff07`.

Dokumen ini adalah evidence tracker Phase 0. Status berubah hanya setelah source, contract, dan test evidence tersedia.

Status: `UNMAPPED`, `MAPPED`, `PARTIAL`, `IMPLEMENTED`, `VERIFIED`, `DEFERRED`, `REJECTED`.

## Identity, role, dan user lifecycle

| Capability | Supabase reference | Backend target/current | Frontend state | Status | Next evidence/work |
| --- | --- | --- | --- | --- | --- |
| Login utama | Supabase Auth session | local auth tersedia; generic bearer provider production belum tersedia | Backend auth aktif pada dev | PARTIAL | Production local-session verification dan lifecycle gate |
| Partner SSO | `sso-login` | Keycloak/OIDC production adapter belum tersedia | Belum full cutover | MISSING | Bind `(issuer, subject)`, JWKS, issuer/audience, verified claims, E2E |
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
| CSV parsing | `UploadRoyalty.tsx` browser parser | backend streaming parser | Legacy UI parses browser-side | MAPPED | Pindahkan parser ke backend worker |
| Required columns | period, isrc, platform, country, sales_unit, net_revenue | current backend requires canonical IDs and amount triplet | Kontrak berbeda | PARTIAL | Canonical CSV adapter compatibility |
| Optional enrichment | UPC/title/artist/label/sales type | canonical lookup/matcher | Legacy browser DB lookups | MAPPED | Server-side matcher |
| ISRC matching | tracks primary match | current import requires track UUID | Backend JSON UI manual | PARTIAL | ISRC lookup plus ambiguity handling |
| UPC/release matching | releases lookup | current import requires release UUID | Backend JSON UI manual | PARTIAL | UPC lookup and release/track consistency |
| Artist attribution | artist relation/history migration | beneficiary/artist validation | Backend supports explicit ID | PARTIAL | Historical resolver from period snapshot |
| Label attribution | release/artist label snapshots | financial owner resolution | Label Custom supported | PARTIAL | Label/whitelabel production rule extraction |
| Preview | browser validation and split preview | `/royalties/imports/preview` | Backend JSON preview | IMPLEMENTED | CSV errors/warnings compatibility |
| File upload | Edge Function receives parsed records | no private royalty file lifecycle | No backend file UI | MISSING | Import session + private upload intent |
| Async parse | Edge Function synchronous | no parser worker | Tidak tersedia | MISSING | Worker job, progress, retry, resume |
| Import history | `royalty_uploads` | import batches/history | Backend history tersedia | IMPLEMENTED | DTO and state compatibility |
| Delete upload | `delete-royalty-upload` + balance rebuild | immutable correction endpoint | Legacy delete UI; backend correction API | PARTIAL | UI language and reversal/reconciliation parity |
| Duplicate file | upload/source semantics | checksum replay protection | Backend checksum tersedia | IMPLEMENTED | Source-file checksum and provider-period key |
| Duplicate row | source row key | source/period/source_row uniqueness | Backend tersedia | IMPLEMENTED | CSV row fingerprint compatibility |
| Large file | browser memory + Edge Function | current max 1000 JSON rows | Tidak parity | MISSING | Streaming 100k-row target |

## Royalty calculation dan ownership

| Capability | Supabase reference | Backend target/current | Frontend state | Status | Next evidence/work |
| --- | --- | --- | --- | --- | --- |
| Net revenue source | CSV `net_revenue` | gross/deduction/net invariant | Kontrak berbeda | PARTIAL | Map source amount semantics |
| SoundPub share | 9% dari `net_revenue`, dibulatkan per row ke 2 desimal | no generic policy engine | Legacy preview calculates | MAPPED | Versioned policy engine dan golden fixtures |
| Label share | Sisa row setelah SoundPub 9% dan artist 70%; efektif sekitar 21% | Label Custom PIC posting only | Legacy preview calculates | PARTIAL | Versioned policy engine |
| Artist share | 70% dari `net_revenue`, dibulatkan per row ke 2 desimal | owner posting, reporting attribution | Legacy preview calculates | PARTIAL | Contract-specific split policy |
| Composer share | composer royalty module | separate composer path | UI/module tersedia | PARTIAL | Integrate calculation and ledger attribution |
| Rounding | SoundPub dan artist dibulatkan half-up per row; label menerima remainder row | integer minor units | Backend arithmetic safe | MAPPED | Golden production fixtures |
| Policy effective date | implicit settings/current data | no generic versioned policy | Tidak terlihat | MISSING | Calculation policy schema |
| Historical owner snapshot | royalty history guard migration | artist/beneficiary snapshot fields | Partial | PARTIAL | Label/contract snapshot migration |
| Artist moves label | history guard/repair migrations | historical ownership tests | Backend tests tersedia | IMPLEMENTED | Compare exact production semantics |
| Label Custom aggregation | new backend behavior | PIC financial owner | Backend UI/API tersedia | VERIFIED | Maintain artist-only reporting dimension |
| Reversal/recalculation | replace/delete upload functions | immutable correction | Backend correction tersedia | IMPLEMENTED | Ledger reversal after reconciliation |

## Ledger, balance, dan reconciliation

| Capability | Supabase reference | Backend target/current | Frontend state | Status | Next evidence/work |
| --- | --- | --- | --- | --- | --- |
| Balance authority | mutable profile balance + rebuild | immutable finance events | Backend balance API | IMPLEMENTED | Legacy values migrate through reconstructed ledger only |
| Royalty posting | upload inserts + balance rebuild | `ROYALTY_EARNING` event | Only after reconciliation | IMPLEMENTED | Verify batch atomicity and exact amounts |
| Manual adjustment | balance adjustment patterns | immutable adjustment event | Admin UI status unknown | PARTIAL | Approval and UI workflow |
| Reservation | payout reservation tables/RPC | finance reservation events | Backend payout API | IMPLEMENTED | Concurrency test |
| Settlement | payout completion | settlement event + evidence | Backend payout API | IMPLEMENTED | Provider callback parity |
| Batch reconciliation | production replacement validation | reconciliation flow | Backend import says unreconciled | IMPLEMENTED | UI progress and failure recovery |
| Global reconciliation | balance rebuild queries | ledger projection verification | CLI/test evidence | PARTIAL | Scheduled read-only reconciliation job |
| Repair workflow | production repair functions | plan-first repair commands | Partial | PARTIAL | Dry-run artifact and approval gate |

## Reporting dan export

| Capability | Supabase reference | Backend target/current | Frontend state | Status | Next evidence/work |
| --- | --- | --- | --- | --- | --- |
| Royalty summary | direct table queries/RPC | `/royalties/summary` | Backend adapter tersedia | IMPLEMENTED | Role totals parity |
| Breakdown | direct royalties reads | `/royalties/breakdown` | Backend adapter tersedia | IMPLEMENTED | Filters and pagination parity |
| Release detail | release royalty views | `/royalties/releases/:id` | Backend adapter tersedia | IMPLEMENTED | Frontend cutover evidence |
| Track detail | table query | target route not present | Tidak tersedia | MISSING | Add scoped track endpoint |
| Period list | distinct query | target route not present | Tidak tersedia | MISSING | Add period endpoint |
| CSV export | frontend/legacy export | Label Custom export exists | Partial | PARTIAL | Generic role-scoped export |
| Whitelabel dashboard | direct royalties query | no complete tenant dashboard adapter | Direct Supabase remains | MISSING | Tenant summary endpoint and UI cutover |

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
| Outbox topic coverage | direct function side effects | producer topic melebihi worker consumer | Dev worker partial | PARTIAL | Registry topic, startup assertion, handler/no-op eksplisit, replay command |
| Production identity provider | Supabase Auth/SSO | hanya mock dan legacy provider untuk generic bearer path | Production belum operasional | MISSING | Local session authority + Keycloak OIDC/JWKS adapter |

## Phase 0 exit blockers

1. Formula production sudah teridentifikasi (70% artist, 9% SoundPub, label menerima remainder), tetapi belum dikunci sebagai golden fixtures dan calculation engine backend.
2. CSV upload contract masih berada di browser dan Edge Function; backend hanya menerima JSON canonical maksimum 1000 row.
3. Historical owner untuk label/whitelabel belum lengkap; Label Custom sudah lebih matang.
4. Whitelabel royalty dashboard masih direct Supabase.
5. Track detail, period list, generic export, file upload lifecycle, async parser, dan large-file handling belum tersedia.
6. Payment/provider dan notification delivery masih partial/dev-oriented.
7. Frontend inventory menemukan sekitar 368 call-chain Supabase; root production build belum mengaktifkan backend domains.
8. Generic production identity provider dan full outbox topic coverage belum tersedia.
9. Copyright, takedown, provider invoice/settlement, dan beberapa release action masih direct atau fail-closed.



