// Membangun ulang xattr Supabase Storage dari storage.objects.metadata.
// Dijalankan DI DALAM container storage server baru, dari /app —
// modul fs-xattr hanya resolve dari sana.
//
// Masukan: /tmp/xattr.tsv, satu objek per baris, dipisah "|~|":
//   <bucket>/<name>/<version>|~|<mimetype>|~|<cacheControl>
//
// Pemisah "|~|" dipakai, bukan tab, karena psql -F menulis tab sebagai
// dua karakter literal "\t" sehingga baris tak bisa dipecah.

const fs = require('fs');
const x = require('fs-xattr');

const AKAR = '/var/lib/storage/stub/stub/';
const SUMBER = '/tmp/xattr.tsv';

(async () => {
  const baris = fs.readFileSync(SUMBER, 'utf8').split('\n').filter(Boolean);
  let ok = 0;
  let belumAda = 0;
  let gagal = 0;

  for (const b of baris) {
    const f = b.split('|~|');
    const rel = f[0];
    const mime = f[1] || 'application/octet-stream';
    const cc = f[2] || 'max-age=3600';
    const p = AKAR + rel;

    if (!fs.existsSync(p)) {
      belumAda++;
      if (belumAda <= 3) console.log('BELUM ADA', rel);
      continue;
    }

    try {
      await x.set(p, 'user.supabase.content-type', mime);
      await x.set(p, 'user.supabase.cache-control', cc);
      ok++;
    } catch (e) {
      gagal++;
      if (gagal <= 3) console.log('GAGAL', rel, e.message);
    }
  }

  console.log(`xattr: ok=${ok} belum-ada=${belumAda} gagal=${gagal} total=${baris.length}`);
  process.exit(gagal > 0 ? 1 : 0);
})();
