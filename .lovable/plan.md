# Rancangan: Manual Audio Clip Cutter

## Tujuan

Memungkinkan user membuat **Audio Clip (30–60 detik)** secara otomatis dari file **Full Audio** yang sudah diupload, tanpa perlu memotong manual di software lain. User cukup geser slider kiri/kanan untuk memilih bagian lagu yang ingin dijadikan clip.

## Alur User (UX)

1. User upload **Full Audio** terlebih dahulu (WAV/FLAC/MP3) — alur lama.
2. Di section **Audio Clip**, muncul 2 opsi:
  - **Upload manual** (alur lama, tetap ada sebagai fallback).
  - **Potong dari Full Audio** (tombol baru: "Cut from Full Audio").
3. Saat user klik "Cut from Full Audio", terbuka **Dialog Clip Editor**:
  - Menampilkan **waveform visual** dari full audio.
  - **Dual-handle range slider** di atas waveform → handle kiri (start) & handle kanan (end).
  - **Audio player** dengan tombol Play/Pause untuk preview range yang dipilih.
  - **Label live**: "Start: 0:45 | End: 1:15 | Duration: 30s".
  - **Validasi real-time**: durasi range harus 30–60 detik. Tombol Save disabled kalau di luar rentang, dengan pesan error.
  - Tombol **Save Clip** & **Cancel**.
4. Saat klik **Save Clip**:
  - Audio dipotong di browser (client-side) menggunakan Web Audio API → encode ke MP3.
  - Hasil otomatis di-upload ke bucket `audio-clips` (reuse fungsi `uploadToSupabaseStorage`).
  - Dialog tertutup, `clipUrl` ter-update di form.
5. Jika user re-upload Full Audio baru, clip lama tetap (user bisa potong ulang kapan saja).

## Komponen Baru

### `src/components/releases/AudioClipCutterDialog.tsx`

Dialog modal berisi:

- `WaveformVisualizer` (canvas-based, render peaks dari decoded buffer).
- `RangeSlider` (Radix Slider 2-thumb sudah dipakai project).
- `<audio>` element + custom play/pause logic untuk loop dalam range.
- State: `startTime`, `endTime`, `isPlaying`, `isProcessing`.
- Props: `audioUrl`, `open`, `onOpenChange`, `onClipReady(blob: Blob)`.

### Helper: `src/lib/audioClipper.ts`

Fungsi pure untuk:

- `decodeAudio(url)` → `AudioBuffer` via `fetch` + `AudioContext.decodeAudioData`.
- `extractPeaks(buffer, samples)` → `Float32Array` untuk waveform.
- `sliceAudioBuffer(buffer, start, end)` → `AudioBuffer` baru.
- `encodeToWav(buffer)` → `Blob` (WAV PCM, simple & no extra deps).
  - Catatan: encode ke **WAV** dipilih karena tidak butuh library MP3 encoder eksternal. Ukuran lebih besar tapi clip cuma 30-60 detik (~5-10MB), masih dalam limit `MAX_SIZE_MAP.clip` (20MB).

### Modifikasi: `src/components/releases/MediaUploadSection.tsx`

- Tambah tombol **"Cut from Full Audio"** di section Audio Clip, hanya aktif jika `audioUrl` sudah ada.
- Saat clip dihasilkan dari cutter, gunakan flow upload yang sama (`uploadToSupabaseStorage` dengan File yang dikonstruksi dari Blob).

## Detail Teknis

```text
+-- AudioClipCutterDialog --------------------+
| Track: [Song Title]                         |
|                                             |
|  ████░░░░██████░░░░░░██░░░░░░██████         |  <- waveform canvas
|       ^                  ^                  |
|       |---- selected ----|                  |  <- range slider (Radix)
|                                             |
|  Start: 0:45   End: 1:15   Duration: 30s    |
|  [▶ Play Selection]   [⏹ Stop]              |
|                                             |
|  [Cancel]              [Save Clip]          |
+---------------------------------------------+
```

**Validasi:**

- `endTime - startTime >= 30 && <= 60` → enable Save.
- Di luar range → Save disabled + warning text merah.
- Step slider: 0.1 detik untuk presisi.

**Preview playback:**

- Saat play, set `audio.currentTime = startTime`.
- `timeupdate` listener → kalau `currentTime >= endTime`, pause + reset ke startTime.

**Waveform rendering:**

- Decode sekali di mount, simpan `AudioBuffer` di ref.
- Hitung peaks (~500-1000 sampel sesuai lebar canvas) dan render via `<canvas>`.
- Highlight area selected dengan warna primary, area unselected lebih redup.

**Akses Full Audio:**

- `audioUrl` adalah signed URL dari bucket `track-audio` (sudah disiapkan dengan expiry 1 tahun) → bisa di-`fetch()` langsung dari browser. CORS bucket Supabase Storage by default mengizinkan ini.

## Yang TIDAK diubah

- Flow upload manual audio clip tetap ada (sebagai fallback).
- Tidak menyentuh edge function, database schema, atau bucket policy.
- Tidak menyentuh SSO/keycloak.

## File yang akan dibuat/dimodifikasi

- **Baru**: `src/components/releases/AudioClipCutterDialog.tsx`
- **Baru**: `src/lib/audioClipper.ts`
- **Edit**: `src/components/releases/MediaUploadSection.tsx` (tambah tombol & integrasi dialog)

## Tidak butuh dependency baru

Semua pakai Web Audio API native + komponen Radix yang sudah ada (`Dialog`, `Slider`, `Button`).