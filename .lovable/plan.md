## Rencana Perbaikan: SSO Auto-Redirect + UX Audio Clip Cutter

### Bagian 1 — Hilangkan Auto-Redirect ke ICCN SSO

**Masalah:** Saat user membuka `/` atau `/auth`, kode di `SsoAuthContext.tsx` secara otomatis memanggil `initSsoPromptNone(...)` setelah silent check gagal. Ini menyebabkan halaman tiba-tiba redirect penuh ke ICCN SSO meski user belum klik apa-apa.

**Perubahan minimal (1 file, tanpa menyentuh logika exchange code yang sudah fix):**

`src/context/SsoAuthContext.tsx`
- Hapus blok yang memanggil `initSsoPromptNone(...)` secara otomatis pada saat silent check gagal.
- Tetap pertahankan:
  - `initKeycloakSilent()` (silent iframe check, tidak melakukan redirect)
  - `triggerSsoLogin()` (hanya jalan saat user klik tombol Login via SSO)
  - Seluruh flow callback (`isSsoCallback`, `consumeStoredPkceState`, `exchangeToken`, `SSO_EXCHANGE_KEY` guard) — TIDAK DIUBAH.
- Hapus juga blok `VITE_SSO_AUTO_REDIRECT` agar tidak ada kemungkinan redirect otomatis.

Dampak: user hanya akan ke ICCN SSO ketika ia secara eksplisit menekan tombol Login via SSO. Silent SSO tetap bekerja (mendeteksi sesi aktif tanpa pindah halaman). Logika fix kemarin tidak tersentuh.

---

### Bagian 2 — Perbaikan UX Audio Clip Cutter

**Masalah saat ini:**
- Thumb slider kecil (20px) → susah digeser dengan presisi.
- Slider hanya muncul di bawah waveform, terpisah dari area waveform sehingga tidak intuitif.
- Tidak ada handle visual di waveform itu sendiri.

**Perubahan (1 file): `src/components/releases/AudioClipCutterDialog.tsx`**

1. **Drag langsung di atas waveform**
   - Bungkus `<canvas>` waveform dengan container `relative` setinggi ~120px.
   - Tambahkan dua "handle bar" overlay (div absolut) di atas waveform — satu untuk start, satu untuk end. Posisi dihitung dari `(range[i] / duration) * 100%`.
   - Tambahkan area highlight (overlay semi-transparan primary) di antara dua handle agar terlihat bagian terpilih.
   - Setiap handle:
     - Lebar 12px, tinggi penuh waveform, warna primary, cursor `ew-resize`, ada grip kecil di tengah.
     - Hit area diperluar dengan padding tak terlihat (`::before` atau wrapper 24px).
     - `onPointerDown` → `setPointerCapture` → handler `pointermove` global mengkonversi `clientX` ke detik berdasarkan `getBoundingClientRect()` container, lalu memanggil `handleRangeChange([newStart, end])` atau `[start, newEnd]`. `pointerup` melepaskan capture.
   - Klik di area waveform di luar handle akan memindahkan playhead ke posisi tersebut (tanpa memengaruhi range).

2. **Slider bawah tetap ada sebagai fallback, tapi diperbesar**
   - `SliderPrimitive.Thumb`: ubah `h-5 w-5` → `h-7 w-7`, tambahkan `shadow-md` dan `cursor-grab active:cursor-grabbing`.
   - Track tetap, agar terlihat ringan.

3. **Penanda angka di handle**
   - Setiap handle menampilkan label kecil di atasnya (`Start 0:45`, `End 1:15`) yang ikut bergerak. Label memakai `text-xs` di chip background.

4. **Logika `handleRangeChange` tidak berubah** — tetap clamp 30–60 detik. Pointer handlers di waveform memanggil fungsi yang sama agar konsisten.

5. **Aksesibilitas**
   - Handle div di waveform dapat fokus (`tabIndex=0`) dan menerima `ArrowLeft/ArrowRight` untuk geser ±0.5 detik (Shift untuk ±2 detik).

6. **Touch friendly**
   - `touch-action: none` pada container waveform agar drag tidak men-scroll halaman.

**Tidak diubah:** `src/lib/audioClipper.ts`, integrasi di `MediaUploadSection.tsx`, edge functions, schema database.

---

### File yang akan disentuh
1. `src/context/SsoAuthContext.tsx` — hapus auto prompt=none + auto-redirect.
2. `src/components/releases/AudioClipCutterDialog.tsx` — handle drag langsung di waveform + slider lebih besar.

### Yang TIDAK akan disentuh (sesuai pesan user)
- `src/lib/keycloak.ts` (tidak ada perubahan logic)
- Edge function `sso-login`
- Logika exchange code, PKCE, `SSO_EXCHANGE_KEY` guard
- `src/lib/audioClipper.ts`
