# UI/UX Responsive Audit — SoundPub Dashboard

Tanggal audit: 2026-07-16

## Tujuan

Audit ini dibuat sebelum perbaikan UI/UX responsif untuk memastikan perubahan dilakukan bertahap, tidak merusak role logic, dan tetap mengikuti prinsip `ui-ux-pro-max`:

- accessibility first
- touch target minimal 44px
- mobile-first layout
- semantic theme tokens
- predictable navigation
- no accidental horizontal overflow

## Temuan Awal

### 1. Layout Global

File utama:
- `src/components/layout/DashboardLayout.tsx`
- `src/components/layout/AppSidebar.tsx`
- `src/components/ui/sidebar.tsx`

Temuan:
- Layout sudah memakai `SidebarProvider`, tetapi pengalaman mobile perlu diuji dan dipoles.
- Main content memakai padding responsif `p-3 sm:p-4 lg:p-6 xl:p-8`, tetapi beberapa halaman tetap terasa padat di HP karena isi page terlalu lebar.
- Header menyembunyikan user info di mobile, sehingga konteks akun/balance hilang.

Risiko:
- Pengguna HP sulit mengenali akun aktif dan role context.
- Sidebar/action header bisa terasa terlalu kecil atau terlalu tersembunyi.

### 2. Tabel Lebar

Halaman rawan:
- `/dashboard/releases`
- `/dashboard/royalties`
- `/dashboard/royalty-summary`
- `/dashboard/all-royalties`
- `/dashboard/payouts`
- `/dashboard/users`

Temuan:
- Banyak tabel memakai struktur desktop-first.
- Sebagian sudah memakai overflow wrapper, tetapi belum semua punya alternatif card view mobile.

Risiko:
- Horizontal scroll tidak jelas.
- Action icon terlalu kecil di HP.
- Kolom penting terpotong.

### 3. Form Besar dan Dialog

Komponen rawan:
- `ReleaseFormDialog`
- `ReleaseFormPage`
- `ArtistReleaseFormDialog`
- `ArtistOnboardingDialog`
- `ComposerRoyaltyUpload`
- `AudioClipCutterDialog`

Temuan:
- Form grid `md:grid-cols-2` cukup aman, tetapi perlu dicek spacing mobile.
- Dialog besar memakai max height 90vh; perlu memastikan tombol action tidak tersembunyi di layar kecil.

Risiko:
- Scroll panjang tanpa sticky action.
- Tombol submit sulit ditemukan.
- Upload area terlalu lebar atau terlalu tinggi di HP.

## Prioritas Perbaikan

### P0 — Global Mobile Shell

- Perbaiki header mobile.
- Pastikan sidebar trigger jelas dan touch-friendly.
- Tambahkan safe spacing untuk main content.
- Pastikan tidak ada horizontal overflow dari container utama.

### P1 — Release Create Wizard

- Finalisasi responsive layout dua kolom menjadi single-column di HP.
- Pastikan stepper berubah menjadi compact progress di mobile.
- Pastikan daftar track step 2 mudah dipakai di HP.

### P2 — Data Table Mobile Pattern

- Tambahkan mobile card list untuk halaman paling sering dipakai.
- Minimal: releases dan royalty summary.

### P3 — Dialog/Form Polish

- Audit semua dialog besar.
- Tambahkan sticky footer action jika perlu.
- Pastikan upload area dan form fields tetap nyaman di layar kecil.

## Tahapan Selanjutnya

1. Perbaiki `DashboardLayout` dan shell mobile.
2. Poles responsive `ReleaseCreate` sebagai page contoh baru.
3. Terapkan pola yang sama ke halaman data utama.
4. Build, test, dan audit manual di breakpoint mobile/tablet/desktop.
