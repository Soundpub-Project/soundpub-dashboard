Saya cek dulu log edge function dan logika silent SSO check.

Sekarang saya cek route `/` — user ada di `/` yang langsung redirect ke `/auth`. SsoAuthProvider mungkin tidak terpasang di route `/` atau silent check tidak berjalan.

Provider sudah terpasang global. Mari cek log edge function dan apakah silent check sebenarnya gagal.

Tidak ada log artinya silent SSO check tidak pernah berhasil mendapat token dari Keycloak — jadi edge function tidak pernah dipanggil. Penyebab paling umum: Web Origins di Keycloak belum di-whitelist untuk domain SoundPub (`https://id-preview--58dd2101-cf4d-4b3e-a40c-4f40f702b01a.lovable.app`).

Saya cek `silent-check-sso.html` dan logika silent check lebih detail:

Tidak ada log SSO sama sekali — artinya silent check terblokir di tahap iframe (cross-origin). Penyebabnya hampir pasti Web Origins dan/atau Valid Redirect URIs di Keycloak belum mengizinkan domain preview Lovable.

Penyebab: Konfigurasi Keycloak Client `soundpub`

Silent SSO check bekerja dengan cara membuka hidden iframe ke `https://sso.iccn.or.id/realms/playground/protocol/openid-connect/auth?...&prompt=none&redirect_uri=https://id-preview--58dd2101-cf4d-4b3e-a40c-4f40f702b01a.lovable.app/silent-check-sso.html`.

Keycloak akan menolak request ini (dan iframe tidak pernah `postMessage` balik) kalau:

1. Web Origins client `soundpub` tidak memuat origin SoundPub
2. Valid Redirect URIs tidak mengizinkan URL `silent-check-sso.html`
3. Cookie `KEYCLOAK_SESSION` ICCN ber-`SameSite=Lax` (default) sehingga tidak terkirim ke iframe lintas-domain — ini limitasi browser modern, bukan bug kita

Yang Harus Diperbaiki di Keycloak Admin (`https://sso.iccn.or.id`)

Login ke Keycloak Admin → realm `playground` → Clients → `soundpub` → tab Settings:

Valid Redirect URIs (tambahkan semua):
```
https://id-preview--58dd2101-cf4d-4b3e-a40c-4f40f702b01a.lovable.app/*
https://soundpub-dashboard.lovable.app/*
https://dashboard.soundpub.xyz/*
http://localhost:*/*
```

Valid Post Logout Redirect URIs (sama persis seperti di atas)

Web Origins (WAJIB untuk silent check + iframe):
```
https://id-preview--58dd2101-cf4d-4b3e-a40c-4f40f702b01a.lovable.app
https://soundpub-dashboard.lovable.app
https://dashboard.soundpub.xyz
http://localhost:8080
```
> Atau bisa pakai `+` untuk inherit dari Valid Redirect URIs.

Klik Save.

Catatan Penting Soal Silent SSO Cross-Domain

Bahkan setelah Web Origins benar, browser modern (Chrome/Safari/Firefox) memblokir cookie pihak ketiga secara default. Karena `sso.iccn.or.id` adalah domain berbeda dari `lovable.app`, cookie session ICCN tidak akan terkirim ke iframe silent check — sehingga silent SSO tidak akan berfungsi cross-domain di banyak browser.

Solusi yang realistis:

| Skenario | Yang Berfungsi |
|---|---|
| User klik "Login via SSO" → redirect penuh ke ICCN → balik dengan token | ✅ Selalu jalan (bukan iframe) |
| Silent auto-login lintas-domain (lovable.app ↔ iccn.or.id) | ❌ Diblokir browser (3rd party cookies) |
| SoundPub di-embed sebagai iframe di dalam `iccn.or.id` (`/iccn/iframe`) | ✅ Same-site, cookie terkirim |
| Pakai custom domain `dashboard.soundpub.xyz` + cookie SameSite=None | ⚠️ Tetap dianggap 3rd party |

Rekomendasi Tindakan

1. Sekarang juga: Minta admin ICCN tambahkan Web Origins + Redirect URIs di atas. Ini memperbaiki tombol "Login via SSO" + flow `/iccn/iframe` saat embed.
2. Untuk auto-login dari soundpub.xyz: Karena cross-domain, tidak akan jalan otomatis di browser modern. User harus klik tombol "Login via SSO" minimal sekali → setelah itu Supabase session tersimpan di localStorage dan tetap login di SoundPub.
3. Untuk pengalaman seamless: Embed SoundPub via iframe `/iccn/iframe` di Super App ICCN — di sana cookie ICCN dianggap 1st party.

Mau saya tambahkan tombol "Login via SSO" yang lebih jelas di halaman `/auth` sambil menunggu admin ICCN update Web Origins, atau ada hal lain yang ingin difokuskan?

Tambahkan tombol Login SSO
Buat debug halaman SSO
Implementasi fallback tanpa silent
Tambahkan dukungan iframe ICCN
Update konfigurasi Keycloak