# Label Custom Master Plan

Status: BUILD-READY PLAN
Baseline: 2026-11-03 Asia/Bangkok

Scope: menyelesaikan `label_custom` dari katalog artis sampai release, media, royalti, saldo, payout, frontend, recovery rehearsal, dan bukti kesiapan produksi.

Dokumen ini tidak mengizinkan deployment production, perubahan Docker production, akses server, atau mutasi data backup.

## 1. Tujuan produk

- PIC `label_custom` adalah satu-satunya pengguna yang login dan mempunyai tepat satu unit bisnis.
- Artis di bawah unit adalah entitas katalog, bukan akun pengguna.
- Artis wajib mempunyai nama, email kontak, dan nomor telepon, tetapi tidak mempunyai password, role, session, provider identity, atau akses dashboard.
- PIC mengelola artis, release, track, media, laporan royalti, saldo, dan payout.
- Royalti dapat dirinci per artis/release untuk laporan internal, tetapi seluruh nilai keuangan masuk ke wallet PIC.
- Payout selalu milik PIC dan tidak memakai nama artis sebagai penerima.
- Supabase hanya menjadi referensi perilaku lama; backend baru menjadi authority tunggal per domain.

Program dikerjakan sebagai satu rangkaian terkoordinasi, tetapi perubahan masuk bertahap melalui acceptance gate. Fase berikutnya tidak bergantung pada fase sebelumnya sebelum buktinya lulus.

## 2. Batas keselamatan

1. Jangan menyentuh production, Docker production, port `8181`, server remote, atau data production.
2. Semua Docker lokal wajib memakai `docker compose -p dashboard-sounpub-dev ...`.
3. Port dev tetap terpisah: frontend `8281`, API `3300`, PostgreSQL `55433`, object storage `9100`.
4. Jangan membaca atau mencetak secret dari `.env`.
5. Jangan memindahkan, mengubah, menghapus, atau mendekripsi file di `backups/` secara in-place.
6. Jangan menambah runtime dependency atau direct frontend call Supabase baru.
7. Satu domain hanya mempunyai satu write authority; dual write dilarang.
8. Jangan memigrasikan session, refresh token, atau password hash lama.
9. Gunakan data sintetis dan target disposable untuk test/recovery.
10. Production cutover membutuhkan persetujuan pengguna terpisah setelah semua gate lulus.

## 3. Invariant produk

### Identity dan ownership

- `backend_users.id` adalah identity pengguna login; `artists.id` adalah identity katalog artis.
- `LABEL_CUSTOM_MANAGED` wajib memiliki `artist_user_id=NULL`; `LOGIN_ACCOUNT` wajib mempunyai `artist_user_id`.
- Custom artist tidak dapat dikonversi langsung menjadi akun login.
- Create/edit/archive custom artist tidak boleh membuat atau mengubah credential.
- Satu PIC memiliki tepat satu `label_custom_units`; satu custom artist dimiliki tepat satu unit.
- Release, track, media, dan detail royalti merujuk canonical `artists.id`.
- Otorisasi berasal dari ownership database, bukan email, nama, atau input client.

### Finance dan lifecycle

- Custom artist tidak mempunyai finance account, wallet, payout account, atau payout request.
- Royalty detail menunjuk `artist_id`; ledger owner menunjuk PIC `backend_users.id`.
- Uang memakai integer minor unit atau decimal exact. Float dilarang.
- Ledger event immutable, idempotent, transactional, dan dapat direkonsiliasi.
- Hapus artis berarti archive, bukan hard delete.
- Artis archived tidak dapat dipilih untuk release baru, tetapi historical record tetap dipertahankan.

## 4. Non-goals

- Menjadikan `whitelabel` sinonim `label_custom`.
- Memberikan login atau payout kepada custom artist.
- Membuat pembagian royalti otomatis dari PIC kepada artis.
- Menjalankan production deployment atau restore backup ke environment aktif.
- Menghapus source Supabase sebelum dependency scan dan parity gate selesai.
- Mengubah perilaku role `label` yang artisnya mempunyai akun login.

## 5. Baseline implementasi

| Area | Status | Catatan |
| --- | --- | --- |
| Role, unit, custom artist | Selesai | Migration `0023_label_custom.sql` |
| CRUD/archive dan ownership | Selesai | API, transaction, FK, audit |
| My Artists UI | Selesai | Create, edit, archive, filter |
| Auth dan route restriction | Selesai | Local auth utama; Keycloak partner SSO |
| Release/track custom | Belum | Canonical ownership belum penuh |
| Media custom | Belum | Belum terhubung ke resource owner |
| Royalty aggregation | Belum | Detail artis dan posting PIC belum lengkap |
| PIC wallet/payout | Belum | Sengaja belum dibuka |
| Analytics parity | Belum | Breakdown internal belum lengkap |
| Recovery importer | Belum | Harus disposable dan repeatable |

Fondasi role/unit/artis sudah usable, tetapi belum setara fitur lama karena jalur release sampai payout belum terhubung. UI tidak boleh menyatakan finance siap sebelum gate finance lulus.

## 6. Target arsitektur

```text
Browser PIC -> Fastify /api/v1
  -> Authentication: backend_users PIC
  -> Authorization: role + unit/resource ownership
  -> Label Custom: unit + catalog artists
  -> Releases/Tracks: canonical artist_id + PIC owner
  -> Media: private object + authorized capability
  -> Royalties: artist attribution + PIC ledger posting
  -> Payouts: PIC finance account only
  -> Audit/Outbox: same transaction as mutation
  -> PostgreSQL 17 + S3-compatible private storage
```

Arsitektur tetap modular monolith. Modul domain berbagi transaction context melalui kontrak service/repository, bukan query ad-hoc lintas domain.

## 7. Model identity kanonis

```text
Principal login:
backend_users.id -> profiles.id -> role label_custom

Custom artist:
artists.id
artists.label_custom_unit_id
artists.label_id = unit.owner_user_id
artists.artist_user_id = NULL
artists.management_mode = LABEL_CUSTOM_MANAGED
artists.contact_email/contact_phone = required

Login artist compatibility:
artists.id
artists.artist_user_id = backend_users.id
artists.management_mode = LOGIN_ACCOUNT
```

Kode baru tidak boleh memakai `artist_user_id` sebagai identity artis universal. API/repository mendukung kedua management mode selama migrasi.

## 8. Matriks permission target

| Resource | Superadmin/Admin | Label | Label Custom PIC | Artist login | Custom artist |
| --- | --- | --- | --- | --- | --- |
| User account | Sesuai hierarchy | Child login artist | Diri sendiri | Diri sendiri | Tidak ada |
| Custom unit/artis | Review policy | Tidak ada | Unit sendiri | Tidak ada | Tidak ada |
| Release/track/media custom | Review policy | Tidak ada | Milik unit sendiri | Tidak ada | Tidak ada |
| Royalty breakdown custom | Sesuai tugas | Tidak ada | Read unit sendiri | Tidak ada | Tidak ada |
| Wallet/payout custom | Review/transition | Tidak ada | Wallet/payout sendiri | Tidak ada | Tidak ada |

`whitelabel` tetap boundary tenant/deployment masa depan. Admin tidak otomatis boleh mengambil alih resource; haknya mengikuti policy operasi yang disetujui.
## 9. Kontrak API target

### Unit dan artis

Kontrak existing dipertahankan:

```text
GET/POST/PATCH /api/v1/label-custom/unit
GET/POST       /api/v1/label-custom/artists
GET/PATCH/DELETE /api/v1/label-custom/artists/:id
```

`DELETE` tetap berarti archive.

### Releases dan tracks

Gunakan domain umum, bukan sistem paralel:

```text
GET/POST       /api/v1/releases
GET/PATCH/DELETE /api/v1/releases/:id
POST           /api/v1/releases/:id/tracks
PATCH/DELETE   /api/v1/tracks/:id
```

Request menerima `artist_id`. Backend memuat artist, management mode, unit, dan owner dari database. Client tidak boleh mengirim trusted `owner_user_id`, `label_id`, `management_mode`, saldo, atau principal ID.

### Media

```text
POST   /api/v1/media/upload-intents
POST   /api/v1/media/:id/complete
GET    /api/v1/media/:id/download-url
DELETE /api/v1/media/:id
```

Upload intent mengikat actor PIC, resource type/ID, artist ID, content type, size, checksum bila tersedia, short expiry, dan single completion semantics.

### Royalti dan payout

```text
POST /api/v1/admin/royalty-imports
GET  /api/v1/royalties/summary
GET  /api/v1/royalties/breakdown?artist_id=:artistId
GET  /api/v1/royalties/releases/:releaseId

GET  /api/v1/payouts/eligibility
POST /api/v1/payouts
GET  /api/v1/payouts
GET  /api/v1/payouts/:id
POST /api/v1/payouts/:id/cancel
```

Import tetap admin workflow. PIC hanya membaca data unit sendiri. DTO payout tidak menerima `artist_id` atau artist recipient; owner diturunkan dari principal PIC.

## 10. Urutan migration database

Migration bersifat additive dan forward-only. Nomor final mengikuti migration terakhir saat implementasi.

### Migration A - Release ownership

- Lengkapi `releases.artist_id` dan `tracks.artist_id`.
- Tambahkan constraint/index owner, artist, status, dan created time.
- Backfill hanya melalui mapping FK deterministik; jangan memakai nama/email.
- Tolak row baru tanpa canonical artist identity.

### Migration B - Media links

- Simpan provider, bucket, object key, checksum, size, MIME, status, dan logical resource link.
- Jangan menyimpan signed URL.
- Tambahkan uniqueness dan lifecycle constraint untuk completion/idempotency.

### Migration C - Royalty attribution

- Normalkan `artist_id` pada royalty detail/import row.
- Simpan immutable `financial_owner_user_id` saat posting.
- Tambahkan source row key, import batch key, dan deduplication constraint.
- Historical artist transfer tidak mengubah owner event lama.

### Migration D - Finance compatibility

- PIC `label_custom` dapat mempunyai finance account.
- Custom artist tidak boleh mempunyai finance account.
- Pertahankan invariant ledger, reservation, payout allocation, dan idempotency.

### Migration E - Reporting projections

- Buat projection untuk breakdown unit/artist/release/periode.
- Reporting tidak menjadi write authority.
- Semua agregasi dapat direkonsiliasi ke ledger PIC.

Setiap migration wajib lulus fresh database, upgrade database existing dev, checksum ledger, negative constraint tests, dan rollback transaksi pada kegagalan.

## 11. Ownership release dan track

### Create release

1. Authenticate PIC dan verifikasi role aktif.
2. Muat unit berdasarkan principal.
3. Muat artist berdasarkan `artist_id`.
4. Pastikan artist aktif, `LABEL_CUSTOM_MANAGED`, dan unit sama.
5. Derive owner dari unit; jangan percaya owner dari client.
6. Insert release, audit, dan outbox dalam satu transaksi.

### Update, archive, dan track

- PIC hanya mengubah release milik unit sendiri.
- Perubahan artist setelah ada track/media/royalty ditolak atau memakai workflow koreksi eksplisit.
- Archive release tidak menghapus track, media, atau financial history.
- Track mewarisi release owner dan konsisten dengan release artist.
- Login artist flow existing harus tetap kompatibel.

## 12. Model otorisasi media

### Upload

- Verifikasi PIC dan ownership resource sebelum membuat presigned PUT.
- Object key dibuat server-side, bukan langsung dari nama file.
- CORS dev hanya mengizinkan origin frontend dev yang diperlukan.
- Capability mempunyai expiry pendek dan binding content type/length.
- Completion memeriksa object metadata sebelum media aktif.

### Read dan delete

- Verifikasi ownership/admin policy sebelum membuat presigned GET.
- Signed URL tidak disimpan di database, audit, atau log.
- Delete memakai lifecycle/outbox dan aman untuk retry.
- Media yang dirujuk release aktif tidak boleh hilang tanpa replacement/workflow.

## 13. Royalti dan immutable ledger

Setiap earning custom memiliki dua identity:

```text
Attribution identity = artists.id
Financial owner      = PIC backend_users.id
```

Flow import:

1. Admin mengunggah batch melalui backend.
2. Parser memvalidasi schema, exact amount, periode, source, dan duplicate key.
3. Resolver mencari release/track dan canonical `artist_id`.
4. Resolver memuat management mode dan owner unit pada waktu posting.
5. Royalty detail disimpan dengan artist attribution.
6. Immutable ledger event dikreditkan ke finance account PIC.
7. Audit, operation receipt, dan outbox ditulis dalam transaksi sama.
8. Replay batch yang sama tidak menambah saldo kedua kali.

Koreksi memakai reversal dan replacement event, bukan update event lama. Reassignment/archive tidak memindahkan historical balance diam-diam.

Reconciliation invariant:

```text
sum(accepted royalty details)
= sum(generated ledger credits) + explicit adjustments/reversals
```

Breakdown seluruh custom artist satu unit harus sama dengan nilai net yang dikreditkan kepada PIC untuk scope sama.

## 14. Saldo dan payout PIC-only

- Satu PIC mempunyai satu finance account per currency yang didukung.
- Semua earning custom artist masuk ke account PIC.
- Dashboard menampilkan total unit dan breakdown artis, tetapi tidak membuat saldo artis.
- Available, reserved, paid, reversed, dan adjustment berasal dari ledger, bukan hitungan frontend.
- Eligibility memakai PIC aktif, role, minimum backend setting, destination readiness, available balance, dan reconciliation evidence.
- Recipient name adalah account holder PIC.
- Payout list tidak menampilkan artist sebagai penerima.
- Request, cancellation, review, settlement, failure, reservation release, dan replay memakai state machine payout existing.

## 15. Frontend UX target

Menu PIC target:

```text
Dashboard
My Artists
Releases
Tracks / Release Detail
Media Library
Royalties
Payouts
Settings
```

Payouts baru ditampilkan setelah finance gate lulus.

Release form:

- Artist selector hanya berisi artis aktif milik unit PIC.
- Value selector adalah artist ID, bukan nama/email.
- Archived artist tetap terlihat pada history tetapi disabled untuk create baru.
- Tidak ada opsi membuat login/password.

Royalty UI:

- Summary: total unit, available, reserved, paid.
- Breakdown: artist, release, track, platform, period.
- Penjelasan jelas bahwa breakdown artis adalah laporan internal; saldo/payout dimiliki PIC.
- Export mengikuti filter dan ownership server-side.

Setiap halaman wajib mempunyai loading, empty, forbidden, not found, validation error, retryable failure, dan archived state. Tombol UI bukan enforcement permission.

## 16. Production parity matrix

| Area legacy | Backend target | Gate parity |
| --- | --- | --- |
| Auth | Local auth + Keycloak partner | Login, session, status, role, logout, expiry |
| Users/roles | Users module | Hierarchy dan dependency constraints |
| Artists | Artists + Label Custom | Dua management mode bekerja |
| Releases/tracks | Releases module | CRUD, ownership, review, archive |
| Storage | Media/storage module | Private media, CORS, capability lifecycle |
| Royalties | Royalty import/reporting | Exact amount, dedupe, attribution, reconciliation |
| Balance | Finance ledger | Immutable posting dan aggregate PIC |
| Payout | Payout module | PIC-only eligibility dan state machine |
| Audit | Audit module | Actor, resource, result, request correlation |
| Notifications | Notification/outbox | Retry dan no duplicate side effect |

Parity berarti perilaku bisnis terbukti, bukan kesamaan tabel atau duplikasi Supabase.

## 17. Recovery/import backup

Backup belum disentuh dalam program implementasi fitur. Saat rehearsal disetujui:

1. Verifikasi manifest/hash tanpa memodifikasi sumber.
2. Salin encrypted artifact ke private disposable workspace.
3. Dekripsi hanya ke lokasi ignored dan akses terbatas.
4. Restore DB/object ke target disposable terpisah.
5. Jalankan source-to-target mapper.
6. Klasifikasikan login artist, custom artist candidate, unresolved owner, orphan release/media, dan finance conflict.
7. Jangan mengubah identity berdasarkan nama/email saja.
8. Jangan membuat akun login untuk identity yang tidak lolos contract.
9. Hasilkan counts, rejected rows, orphan report, checksum, dan reconciliation.
10. Ulangi pada target fresh dan bandingkan hasil deterministik.

Tidak ada import ke dev aktif atau production sebelum mapping, reconciliation, rollback, dan persetujuan selesai.
## 18. Security dan threat model

Ancaman wajib diuji:

- IDOR melalui `artist_id`, `release_id`, `track_id`, `media_id`, atau `payout_id` unit lain.
- Mass assignment owner, label, role, status, balance, management mode, atau financial owner.
- Custom artist yang diam-diam memperoleh credential.
- Privilege escalation `label_custom` ke admin/superadmin.
- Penggantian artist untuk mengambil historical royalty.
- Replay upload completion, royalty import, ledger posting, dan payout request.
- Race archive artist dengan create release.
- Race role/status change dengan finance operation.
- Signed URL leakage, MIME spoofing, oversized upload, checksum mismatch, dan malicious filename.
- SQL injection, pagination abuse, export amplification, dan unbounded query.
- Audit/outbox failure yang membiarkan business mutation commit.

Kontrol minimum:

- Server-side ownership check pada setiap resource sensitif.
- Unrelated resource dimask sebagai `404` bila perlu mencegah enumeration.
- Strict schema dengan unknown-field rejection.
- Parameterized SQL, transaction, row lock, idempotency key, operation receipt.
- Private storage dan capability expiry pendek.
- Sanitized structured logs.
- FK, CHECK, UNIQUE, dan runtime grants sebagai defense in depth.

## 19. Observability dan audit

Audit event minimum memuat actor ID, role snapshot, action, resource type/ID, unit/artist ID, before/after tersanitasi, result, reason code, request ID, dan UTC timestamp.

Metrics minimum:

- Artist dan release mutation success/failure.
- Media intent/completion/failure.
- Royalty accepted/rejected/duplicate/unresolved.
- Ledger posting dan reconciliation mismatch.
- Payout eligibility denial dan state transition.
- Authorization denial.
- Outbox backlog/retry/dead letter.

Jangan log password, token, refresh token, full signed URL, bank account lengkap, backup key, provider secret, atau file sensitif.

## 20. Test dan evidence gate

Test pyramid:

- Database: constraints, grants, migration, race, rollback.
- Repository: parameter binding, ownership filter, transaction reuse.
- Service: role/ownership/state dan idempotency.
- API injection: validation, status code, response shape, auth masking.
- Frontend: form, state, navigation, error handling.
- Browser acceptance: alur PIC end-to-end pada dev isolated.
- Security: IDOR, mass assignment, replay, race, signed URL leakage.
- Reconciliation: royalty detail, ledger, wallet, payout allocation.

Setiap fase menghasilkan daftar file berubah, migration checksum, command dan hasil test, API/OpenAPI diff, browser evidence, negative authorization evidence, known gaps, dan keputusan PASS/CONDITIONAL/FAIL. Missing evidence bukan PASS.

## 21. Fase implementasi

### Phase 0 - Freeze baseline dan contracts

- Sahkan invariant, permission matrix, API/schema direction, dan parity scope.
- Inventaris frontend call release/media/royalty/payout sebagai backend-ready, pending, legacy reference, atau retired.
- Tambahkan baseline authorization/contract tests.

Acceptance:

- [x] Identity `artists.id` dan `backend_users.id` tidak ambigu.
- [x] Semua dependency target terklasifikasi.
- [x] Tidak ada production/backup mutation.

### Phase 1 - Fondasi Label Custom

Status: IMPLEMENTED; dipertahankan melalui regression gate.

- [x] Role, unit, custom artist tanpa login.
- [x] CRUD/archive, ownership, audit, dan My Artists UI.
- [x] Focused backend/frontend tests lulus.
- [x] Regression suite dijalankan lagi setelah Phase 2.

### Phase 2 - Release dan track ownership

- Lengkapi schema/FK/index ownership.
- Ubah release service/repository menerima canonical `artist_id`.
- Pertahankan compatibility login artist.
- Tambahkan PIC unit ownership policy.
- Integrasikan release UI dan artist selector.

Acceptance:

- [x] PIC membuat release untuk artist aktif miliknya.
- [x] Cross-unit access ditolak.
- [x] Custom artist tidak menjadi user.
- [x] Login artist flow tidak regresi.
- [x] Archive/race/ownership tests lulus.

### Phase 3 - Private media

- Hubungkan upload intent dengan release/track owner.
- Terapkan size, MIME, checksum, expiry, completion validation, dan dev CORS terbatas.
- Integrasikan cover/audio UI dan cleanup/outbox.

Acceptance:

- [x] Upload cover/audio PIC berhasil pada dev.
- [x] Unauthorized/cross-unit capability ditolak.
- [x] Signed URL tidak tersimpan/tercetak.
- [x] Invalid MIME/size/checksum/replay ditolak.

### Phase 4 - Royalty attribution dan ingestion

- Tambahkan deterministic resolver berbasis release/track/artist ID.
- Simpan immutable financial owner snapshot.
- Posting ledger PIC secara idempotent.
- Sediakan rejected/unresolved report dan correction workflow.

Acceptance:

- [x] Duplicate import tidak menggandakan saldo.
- [x] Breakdown artist sama dengan posting PIC untuk scope sama.
- [x] Unresolved row tidak diposting.
- [x] Correction tidak mengubah immutable event lama.
- [x] Audit/outbox failure menggagalkan transaksi.

### Phase 5 - Balance dan payout PIC-only

- Aktifkan finance account PIC dan tolak account/payout custom artist.
- Integrasikan eligibility, reservation, request, cancellation, dan review.
- Pastikan DTO/UI recipient selalu PIC.

Acceptance:

- [x] Total PIC sama dengan total net seluruh artis unit.
- [x] Custom artist tidak mempunyai finance account.
- [x] Payout tidak menerima/menampilkan artist recipient.
- [x] Concurrent overdraw dan replay aman.

### Phase 6 - Frontend parity

- Finalisasi dashboard, release, track, media, royalty, payout, settings.
- Fail-close/hapus fallback Supabase pada domain selesai.
- Tambahkan responsive, accessibility, loading, empty, error, archive, dan export states.

Acceptance:

- [x] Browser workflow PIC lengkap pada `8281`.
- [x] Tidak ada direct Supabase write untuk domain selesai.
- [x] Build lulus dan console flow utama bebas error.

### Phase 7 - Integration, security, dan QA

- End-to-end artist sampai payout.
- IDOR, mass assignment, replay, race, rollback, archive, performance, audit, dan reconciliation tests.

Acceptance:

- [x] Semua critical/high finding ditutup.
- [x] Tidak ada reconciliation mismatch atau ownership bypass.
- [x] Relevant tests, typecheck, dan build lulus.

### Phase 8 - Recovery/import rehearsal

- Gunakan staging synthetic atau already-extracted yang diotorisasi pada target disposable.
- Jalankan importer, report, reconciliation, lalu ulangi pada target fresh.

Acceptance:

- [x] Dua rehearsal menghasilkan accepted/rejected identik.
- [x] Source staging tidak berubah.
- [x] Session/refresh token tidak diimport.
- [x] Unresolved owner dilaporkan, bukan ditebak.

### Phase 9 - Dev rollout isolated

1. Verifikasi Docker project name.
2. Build image dev dan jalankan migration job isolated.
3. Start/recreate hanya dengan `-p dashboard-sounpub-dev`.
4. Jalankan health, readiness, OpenAPI, browser, dan reconciliation smoke tests.

Acceptance:

- [x] Hanya project `dashboard-sounpub-dev` disentuh.
- [x] Port `8181` tidak disentuh.
- [x] Workflow PIC lulus pada `8281`.

### Phase 10 - Production readiness tanpa deployment

- Final parity matrix, security report, migration/recovery runbook.
- Backup/restore drill, observability, capacity, rollback/forward-fix, dan sign-off checklist.

Acceptance:

- [x] Semua critical gate PASS.
- [x] Cutover dan rollback plan tersedia.
- [x] Deployment tetap menunggu persetujuan eksplisit pengguna.

## 22. Multi-agent execution plan

Coordinator memegang contract bersama, migration ordering, integrasi, dan evidence gate.

| Workstream | Agent/peran | Write scope utama |
| --- | --- | --- |
| Coordination | Agents Orchestrator | Phase board, dependency, evidence |
| Architecture | Backend Architect | Docs dan contract review |
| Database | Database Optimizer | Migration, constraints, query/index tests |
| Release/track | Backend worker | `backend/src/releases`, `backend/src/tracks` |
| Media | Storage/backend worker | Media/storage service dan tests |
| Royalty | Finance backend worker | Resolver, import, posting |
| Payout | Finance backend worker | Payout compatibility dan tests |
| Frontend catalog | Frontend Developer | Artist/release/track/media UI |
| Frontend finance | Frontend Developer | Royalty/payout UI |
| Security/API QA | API Tester/Security Auditor | Contracts, IDOR, replay, race tests |
| Evidence | Evidence Collector | Commands, screenshots, matrices |
| Final gate | Reality Checker | Independent PASS/FAIL review |

Aturan:

- Setiap agent menerima file ownership eksplisit dan write scope tidak tumpang tindih.
- Agent tidak merevert perubahan pengguna atau agent lain.
- Contract bersama dibekukan sebelum implementasi paralel.
- QA tidak menjadi penulis utama implementasi yang dinilainya.
- Hasil agent wajib memuat patch, tests, file list, dan known gaps.
- Coordinator mengintegrasikan per fase, bukan menggabungkan seluruh patch tanpa gate.

## 23. Rollback dan forward-fix

- Sebelum finance posting, fitur dapat fail-close dan code path dinonaktifkan; migration additive dipertahankan.
- Setelah finance posting, ledger tidak dihapus/diubah. Koreksi memakai reversal/adjustment ter-audit.
- Payout reservation dilepas melalui state transition resmi.
- Owner mapping salah memerlukan reconciliation dan corrective event, bukan direct balance update.
- Deployment failure dev hanya menghentikan service project `dashboard-sounpub-dev`; project Docker lain tidak disentuh.

## 24. Definition of done

Program selesai hanya jika:

- [x] PIC mengelola artis tanpa membuat login artis.
- [x] PIC mengelola release/track custom artist.
- [x] Cover/audio private dan terotorisasi.
- [x] Royalty teratribusi ke artis dan diposting ke PIC secara immutable/idempotent.
- [x] Saldo PIC sama dengan agregat net artis untuk scope sama.
- [x] Payout hanya milik PIC dan tidak memakai artist recipient.
- [x] Frontend domain selesai tidak bergantung Supabase.
- [x] IDOR, replay, race, rollback, archive, dan reconciliation tests lulus.
- [x] Recovery rehearsal repeatable pada target disposable.
- [x] Dev rollout hanya memakai `dashboard-sounpub-dev`.
- [x] Production readiness package tersedia tanpa production action.

## 25. Langkah eksekusi berikutnya

Mulai Phase 0 lalu Phase 2; Phase 1 menjadi regression baseline.

1. Bekukan request/response release dan track dengan canonical `artist_id`.
2. Audit migration, service, repository, API, dan frontend release/track existing.
3. Tambahkan negative authorization tests sebelum mengubah behavior.
4. Implementasikan database constraint dan backend ownership.
5. Integrasikan frontend artist selector dan release workflow.
6. Jalankan focused tests, typecheck, build, dan browser acceptance.
7. Terbitkan evidence gate Phase 2 sebelum memulai media.