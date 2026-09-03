# Rancangan Fitur Takedown Soundpub Music

## 1. Tujuan

Fitur ini mengelola permohonan penurunan lagu atau rilis dari DSP secara terdokumentasi, terverifikasi, dan dapat ditelusuri.

Fitur tidak menghapus histori katalog, royalti, ISRC, UPC, atau data audit. Sistem hanya mencatat proses takedown dan status distribusi.

## 2. Scope Pengguna

Fitur khusus katalog di bawah label **SOUNDPUB MUSIC**.

### Label
- Mengajukan takedown untuk rilis milik label.
- Mengajukan takedown untuk artis di bawah label.
- Memilih seluruh release, sebagian track, atau DSP tertentu.
- Melihat status dan histori request.

### Artis/User di bawah label
- Mengajukan takedown untuk rilis miliknya.
- Melihat riwayat request miliknya.
- Mengunggah dokumen pendukung.

Artis/user tidak dapat mengajukan takedown untuk katalog di luar relasinya.

### Admin/Superadmin
- Melihat semua request scope SOUNDPUB MUSIC.
- Memverifikasi pemohon dan katalog.
- Meminta dokumen tambahan.
- Menyetujui atau menolak request.
- Menandai request sudah dikirim ke DSP.
- Memperbarui status proses DSP.

### Di luar scope
Label lain, whitelabel lain, dan artis di bawah label lain tidak melihat menu, route, atau data takedown SOUNDPUB MUSIC. Akses langsung melalui API juga harus ditolak.

## 3. Jenis Takedown

- **Standard**: request normal tanpa urgensi khusus.
- **Partial**: DSP tertentu atau track tertentu dalam release.
- **Urgent**: distribusi tanpa izin, copyright, sengketa master, fraud, perintah hukum, atau pelanggaran berat DSP.

Urgent hanya mempercepat review internal. Tidak otomatis berarti langsung hilang dari DSP.

## 4. Alasan Takedown

Permintaan pemilik karya; salah audio; salah artis; salah judul; salah artwork; salah versi lagu; rilis duplikat; kesalahan metadata; pindah distributor; hak distribusi berakhir; sengketa master, komposisi, lirik, sample, beat, featuring, atau nama artis; pelanggaran copyright; streaming manipulation; fraud; unauthorized upload; pelanggaran kebijakan DSP; perintah hukum; lainnya.

Field alasan detail wajib diisi.

## 5. Data Form

- Identitas: nama lengkap, nama artis/label, email akun Soundpub, nomor kontak, peran pemohon.
- Release: judul, artis, jenis rilis, UPC/EAN, tanggal rilis, link rilis, release ID.
- Track: judul, ISRC, track ID, track target.
- DSP: semua DSP, Spotify, Apple Music, YouTube Music, Meta, TikTok, Deezer, Amazon Music, Tidal, lainnya.
- Dokumen: identitas, bukti kepemilikan master, surat pernyataan, perjanjian artis-label, surat kuasa, lisensi, bukti copyright, dokumen sengketa, perintah hukum, dokumen lain.

Pemohon wajib menyetujui pernyataan kewenangan, kebenaran data, perbedaan waktu proses DSP, kemungkinan request tidak dapat dibatalkan, dan tanggung jawab hukum.

## 6. Validasi Scope

Server wajib memeriksa user login, user termasuk scope SOUNDPUB MUSIC, release berada di katalog SOUNDPUB MUSIC, user punya hubungan sah dengan release, target DSP valid, pernyataan disetujui, dan tidak ada request aktif yang sama.

Pembatasan diterapkan di UI, RLS, dan validasi server.

## 7. Alur Proses

```text
USER REQUEST
    ↓
SCOPE VALIDATION
    ↓
VERIFY OWNERSHIP
    ↓
VERIFY RELEASE / TRACK / ISRC / UPC
    ↓
REQUEST DOCUMENT jika diperlukan
    ↓
ADMIN APPROVAL
    ↓
SUBMIT TO DSP
    ↓
DSP PROCESSING
    ↓
MONITORING
    ↓
COMPLETED
```

## 8. Status

`SUBMITTED`, `UNDER_REVIEW`, `NEED_DOCUMENT`, `APPROVED`, `SENT_TO_DSP`, `PROCESSING_DSP`, `PARTIALLY_COMPLETED`, `COMPLETED`, `REJECTED`, `CANCEL_REQUESTED`, `CANCELLED`.

`CANCELLED` hanya tersedia sebelum request dikirim ke DSP. Setelah `SENT_TO_DSP`, pembatalan tidak dijamin.

## 9. Database

- `takedown_requests`: data pemohon, jenis, alasan, status, reviewer, catatan, timestamp.
- `takedown_request_items`: target release/track dan snapshot judul, artis, UPC, ISRC.
- `takedown_request_targets`: DSP target, status per DSP, referensi eksternal, catatan.
- `takedown_request_documents`: metadata file pendukung.
- `takedown_status_history`: histori perubahan status.
- `takedown_request_messages`: komunikasi user-admin, opsional.

## 10. Halaman UI

- `/dashboard/takedown`: ringkasan, filter, pencarian, tabel request, tombol ajukan.
- `/dashboard/takedown/:id`: detail pemohon, release, track, DSP, dokumen, timeline, status per DSP, catatan admin.
- `/dashboard/takedown/new`: form pengajuan.
- Release Detail: tombol `Ajukan Takedown`, hanya untuk user yang berhak.

## 11. Notifikasi

Notifikasi untuk request baru, review, dokumen tambahan, approval, rejection, pengiriman ke DSP, perubahan status DSP, selesai, dan selesai sebagian.

## 12. Audit dan Keamanan

Catat submit, upload dokumen, setiap perubahan status, approval, rejection, pengiriman ke DSP, perubahan status DSP, dan pembatalan.

Dokumen disimpan di private storage menggunakan signed URL terbatas. Data katalog tidak di-hard-delete.

## 13. Royalti dan Re-release

Takedown tidak menghapus royalti periode sebelumnya, reporting DSP, adjustment, ISRC, UPC, atau histori transaksi.

Re-release setelah takedown hanya menjadi panduan. Penggunaan ISRC lama atau baru mengikuti kondisi recording dan aturan DSP.

## 14. Batas Waktu

Setelah request valid dikirim ke DSP, platform membutuhkan waktu **maksimal 2 bulan** untuk menurunkan rilisan.

Dashboard menampilkan batas waktu proses DSP berdasarkan tanggal `SENT_TO_DSP`. Waktu ini merupakan batas operasional platform, bukan jaminan penghapusan serentak pada semua DSP.

## 15. Tahap Implementasi

1. Migration database, constraint, index, dan RLS.
2. Private storage dan policy dokumen.
3. Form pengajuan user.
4. Dashboard dan detail request.
5. Workflow admin dan status per DSP.
6. Notifikasi, audit log, dan pengujian role.
