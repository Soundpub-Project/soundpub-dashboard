# 📋 Roadmap Selanjutnya - Soundpub Copyright Publishing Service

## Status Saat Ini ✅

**Commit:** 7a2d7d7 - feat: implement notification and email system for copyright publishing
**Branch:** eature/copyright-admin-review
**Progress:** Tahap 5 (Dashboard) + Tahap 5.5 (Notifications) ✅ SELESAI

### Yang Sudah Dikerjakan:
- ✅ Database schema & migrations
- ✅ Frontend user registration form
- ✅ Frontend admin review dashboard
- ✅ PDF service integration
- ✅ User copyright dashboard
- ✅ Notification & email system (infrastructure)
- ✅ Real-time notification UI component

---

## 🎯 Langkah Selanjutnya: Tahap 6 - Upload Royalti Hak Cipta

### Deskripsi
Fitur untuk admin upload CSV berisi data royalti komposer per periode, kemudian user dapat lihat royalti mereka di dashboard.

### Database Preparation

**Existing Table:** soundpub.composer_royalties
`sql
CREATE TABLE soundpub.composer_royalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  composer_id text NOT NULL,  -- Composer code (e.g., SPC00001)
  composer_name text NOT NULL,
  total_net_royalti numeric(18,2) NOT NULL,
  period text NOT NULL,  -- Format: YYYY-MM
  upload_id uuid REFERENCES soundpub.csv_uploads(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`

### CSV Upload Schema

**Filename Format:** oyalties-{YYYY-MM}.csv (optional, untuk clarity)

**CSV Columns:**
`csv
composer_code,composer_name,total_net_royalti,period
SPC00001,John Doe Composer,1500000,2026-07
SPC00002,Jane Smith Music,2000000,2026-07
SPC00001,John Doe Composer,1800000,2026-08
`

**Validation Rules:**
- ✓ composer_code harus ada di soundpub.profiles (field composer_code)
- ✓ total_net_royalti must be numeric > 0
- ✓ period format YYYY-MM valid
- ✓ composer_name optional (warning jika berbeda dengan database)
- ✓ Duplicate row dalam batch harus error
- ⚠️ Composer yang tidak ditemukan di database: warning, lanjut ke row berikutnya
- ⚠️ Period sudah ada: option untuk replace atau skip

### Work Breakdown

#### 6.1 - Database & RPC Functions

**Files to Create:**
- supabase/migrations/20260722000000_copyright_royalties_upload.sql

**Functions Needed:**
`sql
-- Parse & validate CSV
soundpub.validate_royalty_csv(_csv_content text)
RETURNS TABLE(
  row_number int,
  composer_code text,
  composer_name text,
  total_net_royalti numeric,
  period text,
  is_valid boolean,
  error_message text
)

-- Bulk insert royalties
soundpub.import_composer_royalties(
  _csv_data jsonb,  -- validated rows
  _period text,
  _admin_user_id uuid
)
RETURNS jsonb

-- Get upload history
soundpub.get_royalty_upload_history(_limit int DEFAULT 20)
RETURNS TABLE(...)
`

#### 6.2 - Admin Upload Page

**Route:** /dashboard/royalties/copyright-upload
**File:** src/pages/CopyrightRoyaltyUpload.tsx

**Features:**
- [ ] Drag & drop CSV upload
- [ ] File validation (size, format)
- [ ] Preview table dengan validation errors
- [ ] Batch size warning (max 10,000 rows per upload)
- [ ] Period selection / auto-detect dari CSV
- [ ] Conflict resolution (replace vs skip existing period)
- [ ] Upload confirmation dialog
- [ ] Progress indicator
- [ ] Success/error summary
- [ ] Download error report

**UI Components:**
`	sx
- FileUploadDropzone
- CSVPreviewTable
- ValidationErrorsList
- UploadProgressBar
- ConflictResolutionModal
- UploadHistoryTable
`

#### 6.3 - Upload History Page

**Route:** /dashboard/royalties/copyright-uploads
**File:** src/pages/CopyrightRoyaltyUploadHistory.tsx

**Features:**
- [ ] Table berisi upload history
- [ ] Columns: upload_date, period, total_rows, status, actions
- [ ] Delete upload (soft delete / archive)
- [ ] View upload details (data yang diimport)
- [ ] Download original CSV
- [ ] Download error report (jika ada)

#### 6.4 - User Dashboard Integration

**Update:** src/pages/CopyrightDashboard.tsx

**Features:**
- [ ] Tampilkan royalti per periode dalam table
- [ ] Filter by period range
- [ ] Sort by date / amount
- [ ] Download royalty statement PDF (future)
- [ ] Real-time update saat admin upload (via subscription)

#### 6.5 - Admin Menu Integration

**Update:** src/components/layout/AppSidebar.tsx

**Add Menu Items:**
- Admin → Royalti Hak Cipta → Upload CSV
- Admin → Royalti Hak Cipta → Upload History

#### 6.6 - Notifications

**Auto-Trigger When:**
- Admin upload successful → admin dapat success notification
- Admin upload error → admin dapat error notification dengan summary
- New royalti available → user dapat notification "Royalti periode X tersedia"

**Use existing RPC:** soundpub.notify_copyright_event('royalty_available', {...})

---

## 📊 Estimation & Priority

| Tahap | Task | Est. Effort | Priority |
|-------|------|-------------|----------|
| 6.1 | Database & RPC | 2-3 hours | 🔴 High |
| 6.2 | Admin Upload UI | 4-5 hours | 🔴 High |
| 6.3 | Upload History | 1-2 hours | 🟡 Medium |
| 6.4 | Dashboard Integration | 1-2 hours | 🟡 Medium |
| 6.5 | Menu Integration | 30 min | 🟢 Low |
| 6.6 | Notifications | 1 hour | 🟡 Medium |
| **Total** | | **9-13 hours** | |

---

## 🧪 Testing Checklist (Tahap 6)

### CSV Validation
- [ ] Valid CSV dengan 1 row → insert success
- [ ] CSV dengan 100 rows → import success
- [ ] CSV missing required columns → error
- [ ] CSV dengan invalid period format → error per row
- [ ] CSV dengan non-numeric amount → error per row
- [ ] CSV dengan duplicate rows → error
- [ ] CSV dengan composer_code tidak ada di DB → warning, lanjut
- [ ] CSV dengan composer_name berbeda dari DB → warning

### Upload Flow
- [ ] Select file via dialog
- [ ] Drag & drop file
- [ ] Preview sebelum upload
- [ ] Cancel upload
- [ ] Upload success → notification
- [ ] Upload error → error summary
- [ ] Partial success (beberapa error, beberapa sukses)

### Data Integrity
- [ ] Data masuk ke composer_royalties table
- [ ] User bisa lihat di dashboard
- [ ] Real-time update di dashboard saat admin upload
- [ ] Period tracking akurat
- [ ] No duplicate entries jika re-upload same period

### Admin Features
- [ ] View upload history
- [ ] Delete upload (soft delete)
- [ ] View upload details
- [ ] Download original CSV
- [ ] Download error report

---

## 📝 Implementation Order

### Hari 1 (Sekarang):
1. Create migration file dengan table & RPC functions
2. Create admin upload page dengan basic UI
3. Implement CSV parsing & validation

### Hari 2:
4. Implement bulk insert RPC
5. Add upload history page
6. Test end-to-end flow

### Hari 3:
7. Dashboard integration & real-time updates
8. Add notifications
9. Polish UI & error handling

---

## 🔗 Related Files to Reference

- src/pages/UploadRoyalty.tsx - Existing royalty upload (DSP)
- src/pages/ComposerRoyalties.tsx - Existing composer royalties view
- docs/services/copyright-publishing/CURRENT_STATUS.md - Current progress
- supabase/migrations/20260717090000_copyright_publishing_registration.sql - Schema reference

---

## ⚠️ Important Notes

### Email Service (Still Pending)
- Email templates sudah siap di database
- Notifikasi in-app sudah jalan
- Email sending masih pending (requires external service setup)
- This doesn't block Tahap 6 implementation

### Database Constraints
- Semua changes harus di soundpub schema only
- Use RLS policies untuk authorization
- Keep migrations idempotent (IF NOT EXISTS)

### Performance Considerations
- CSV parsing: handle large files (100K+ rows) dengan streaming
- Bulk insert: use batch processing
- Index pada composer_royalties(composer_id, period) untuk query performance

---

## 🚀 Ready to Start?

Struktur sudah siap. Kamu tinggal:
1. Approve approach untuk Tahap 6
2. Minta saya start dengan 6.1 (Database & RPC)

Atau ada yang ingin direvisi/ditambahkan dulu?
