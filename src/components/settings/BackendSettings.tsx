import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import { settingsApi, type AdminSettings, type UserSettings, type VersionedSettings } from '@/api/settings';
import { SoundpubApiError } from '@/api/client';
import { mediaApi } from '@/api/media';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { uploadBackendMedia } from '@/services/media';
import { brandingResourceId, brandingVariants, notifyBrandingUpdated, publicBrandingUrl, type BrandingKey } from '@/services/settings';
import { Check, ImageIcon, Loader2, Megaphone, Moon, RefreshCw, Save, Settings2, Sun, Trash2, Upload, WalletCards } from 'lucide-react';

const moneyInputPattern = /^[1-9][0-9]{0,15}$/;
const moneyStoragePattern = /^[1-9][0-9]{0,15}\.[0-9]{2}$/;
const minimumPayoutInputPattern = /^(?:0|[1-9][0-9]{0,15})$/;
const minimumPayoutStoragePattern = /^(?:0|[1-9][0-9]{0,15})\.[0-9]{2}$/;
export function displayMoneyValue(value: string | null) {
  return value?.endsWith('.00') ? value.slice(0, -3) : value ?? '';
}
export function normalizeMoneyValue(value: string | null) {
  if (value === null) return null;
  if (moneyStoragePattern.test(value)) return value;
  return moneyInputPattern.test(value) ? value + '.00' : undefined;
}
export function normalizeMinimumPayout(value: string | null) {
  if (value === null) return null;
  if (minimumPayoutStoragePattern.test(value)) return value;
  return minimumPayoutInputPattern.test(value) ? value + '.00' : undefined;
}
function errorMessage(error: unknown, fallback: string) {
  if (error instanceof SoundpubApiError && error.status === 409) return 'Pengaturan berubah di sesi lain. Muat ulang, periksa perubahan terbaru, lalu simpan kembali.';
  return fallback;
}

export function BackendUserSettings() {
  const { user } = useAuth();
  return user ? <UserSettingsForm key={user.id} /> : null;
}

function UserSettingsForm() {
  const [row, setRow] = useState<VersionedSettings<UserSettings> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => settingsApi.user().then(value => { setRow(value); setError(''); }).catch(() => setError('Gagal memuat preferensi'));
  useEffect(() => { void load(); }, []);
  const save = async (key: keyof UserSettings, value: boolean) => {
    if (!row || busy) return;
    setBusy(true); setError('');
    try { setRow(await settingsApi.updateUser(row.version, { [key]: value })); }
    catch (caught) { setError(errorMessage(caught, 'Gagal menyimpan preferensi. Muat ulang sebelum mencoba lagi.')); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-lg border p-4"><h2 className="font-semibold">Notifikasi Email</h2>
    {error && <p role="alert">{error} <Button variant="outline" disabled={busy} onClick={() => void load()}>Muat ulang</Button></p>}
    {!row && !error && <p role="status">Memuat...</p>}
    {row && (Object.keys(row.settings) as (keyof UserSettings)[]).map(key => <label key={key} className="flex items-center justify-between gap-4">{({ email_notif_payout: 'Payout', email_notif_release: 'Release', email_notif_payment: 'Pembayaran', email_notif_announcement: 'Pengumuman' })[key]}<Switch checked={row.settings[key]} disabled={busy} onCheckedChange={value => void save(key, value)} /></label>)}
  </section>;
}

export function BackendAdminSettings() {
  const { user, isAdmin, role } = useAuth();
  return user && isAdmin ? <AdminSettingsForm key={user.id} canManageMaintenance={role === 'superadmin'} /> : null;
}

function AdminSettingsForm({ canManageMaintenance }: { canManageMaintenance: boolean }) {
  const [row, setRow] = useState<VersionedSettings<AdminSettings> | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => settingsApi.admin().then(value => { setRow(value); setError(''); setMessage(''); }).catch(() => setError('Gagal memuat pengaturan'));
  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!row || busy) return;
    const minimumPayout = normalizeMinimumPayout(row.settings.min_payout_amount);
    const releasePrice = normalizeMoneyValue(row.settings.release_price_per_track);
    const customLabelPrice = normalizeMoneyValue(row.settings.release_price_custom_label);
    const singlePrice = normalizeMoneyValue(row.settings.release_price_single);
    const epPrice = normalizeMoneyValue(row.settings.release_price_ep);
    const albumPrice = normalizeMoneyValue(row.settings.release_price_album);
    if (minimumPayout === undefined || releasePrice === undefined || customLabelPrice === undefined ||
        singlePrice === undefined || epPrice === undefined || albumPrice === undefined) {
      setError('Nominal hanya boleh berisi angka bulat tanpa Rp, titik, koma, atau spasi. Contoh: 100000.');
      setMessage('');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      const { maintenance_enabled, ...sharedSettings } = row.settings;
      setRow(await settingsApi.updateAdmin(row.version, { ...sharedSettings,
        ...(canManageMaintenance ? { maintenance_enabled } : {}),
        min_payout_amount: minimumPayout, release_pricing_mode: row.settings.release_pricing_mode,
        release_price_per_track: releasePrice, release_price_single: singlePrice, release_price_ep: epPrice,
        release_price_album: albumPrice, release_price_custom_label: customLabelPrice }));
      setMessage('Pengaturan berhasil disimpan.');
    }
    catch (caught) { setError(errorMessage(caught, 'Gagal menyimpan pengaturan. Muat ulang sebelum mencoba lagi.')); }
    finally { setBusy(false); }
  };

  const uploadBranding = async (key: BrandingKey, file: File) => {
    if (!row || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const media = await uploadBackendMedia(file, { category: 'OTHER', resource_type: 'settings', resource_id: brandingResourceId, variant: brandingVariants[key] });
      if (media.status !== 'ACTIVE' || !publicBrandingUrl(key, media.id)) throw new Error('Media belum terverifikasi');
      const refreshed = await settingsApi.admin();
      setRow(current => current ? { version: refreshed.version, settings: { ...current.settings, [key]: refreshed.settings[key] } } : refreshed);
      notifyBrandingUpdated();
      setMessage('Branding berhasil diperbarui.');
    } catch { setError('Gagal menyimpan branding. Muat ulang untuk memeriksa hasil sebelum mencoba lagi.'); }
    finally { setBusy(false); }
  };

  const removeBranding = async (key: BrandingKey) => {
    const mediaId = row?.settings[key];
    if (!row || busy || !mediaId) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await mediaApi.remove(mediaId);
      const refreshed = await settingsApi.admin();
      setRow(current => current ? { version: refreshed.version, settings: { ...current.settings, [key]: refreshed.settings[key] } } : refreshed);
      notifyBrandingUpdated();
      setMessage('Branding berhasil dihapus.');
    } catch (caught) {
      setError(errorMessage(caught, 'Gagal menghapus branding. Muat ulang untuk memeriksa hasil sebelum mencoba lagi.'));
    } finally { setBusy(false); }
  };

  if (!row && !error) {
    return <Card className="bg-card/50 border-border/50"><CardContent className="flex min-h-40 items-center justify-center gap-3 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Memuat pengaturan aplikasi...</CardContent></Card>;
  }

  return <section className="space-y-6">
    {error && <Alert variant="destructive"><AlertTitle>Pengaturan belum tersimpan</AlertTitle><AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void load()}><RefreshCw />Muat ulang</Button></AlertDescription></Alert>}
    {message && <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300"><Check className="h-4 w-4" />{message}</div>}

    {row && <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset className="space-y-6" disabled={busy}>
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><ImageIcon className="h-5 w-5" />Branding Dashboard</CardTitle>
            <CardDescription>Atur logo tema terang, logo tema gelap, dan favicon yang tampil di dashboard.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              {(Object.keys(brandingVariants) as BrandingKey[]).map(key => {
                const meta = {
                  dashboard_logo_light: { label: 'Tema Terang', detail: 'Logo untuk sidebar terang', Icon: Sun, preview: 'bg-white' },
                  dashboard_logo_dark: { label: 'Tema Gelap', detail: 'Logo untuk sidebar gelap', Icon: Moon, preview: 'bg-slate-950' },
                  favicon: { label: 'Favicon', detail: 'Ikon pada tab browser', Icon: ImageIcon, preview: 'bg-muted' },
                }[key];
                const preview = publicBrandingUrl(key, row.settings[key]);
                const inputId = `backend-branding-${key}`;
                return <section key={key} className="flex min-h-72 flex-col rounded-xl border bg-background/60 p-4 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3"><span className="rounded-lg border bg-muted/50 p-2"><meta.Icon className="h-4 w-4" /></span><div><h3 className="font-medium">{meta.label}</h3><p className="text-xs text-muted-foreground">{meta.detail}</p></div></div>
                    {preview && <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400"><Check className="mr-1 h-3 w-3" />Aktif</Badge>}
                  </div>
                  <div className={`mb-4 flex min-h-32 flex-1 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed p-4 ${meta.preview}`}>
                    {preview ? <img src={preview} alt={meta.label} className={key === 'favicon' ? 'h-12 w-12 object-contain' : 'max-h-24 max-w-full object-contain'} /> : <div className="text-center text-muted-foreground"><ImageIcon className="mx-auto mb-2 h-8 w-8 opacity-50" /><p className="text-xs">Belum ada gambar</p></div>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Label htmlFor={inputId} className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                      <Upload className="h-4 w-4" />{preview ? 'Ganti' : 'Upload'}
                      <Input id={inputId} className="sr-only" type="file" accept=".png,.jpg,.jpeg,.webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void uploadBranding(key, file); }} />
                    </Label>
                    {row.settings[key] && <Button type="button" size="sm" variant="destructive" onClick={() => void removeBranding(key)}><Trash2 />Hapus</Button>}
                  </div>
                </section>;
              })}
            </div>
            <div className="rounded-lg bg-muted/50 p-4 text-sm"><p className="font-medium">Ketentuan gambar</p><p className="mt-1 text-muted-foreground">Gunakan PNG, JPG, atau WebP. Logo maksimal 5 MB. Favicon disarankan berbentuk persegi.</p></div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Settings2 className="h-5 w-5" />Pengaturan Aplikasi</CardTitle>
            <CardDescription>Kontrol status layanan dan nilai transaksi dasar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col gap-4 rounded-lg border bg-background/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="flex flex-wrap items-center gap-2"><Label htmlFor="maintenance-mode" className="text-sm font-medium">Mode maintenance</Label><Badge variant="outline" className="text-amber-600 dark:text-amber-400">Khusus Super Admin</Badge></div><p className="mt-1 text-sm text-muted-foreground">Saat aktif, akses API pengguna dibatasi sementara. Admin dan Super Admin tetap dapat masuk untuk pemulihan layanan.</p></div>
              <Switch id="maintenance-mode" checked={row.settings.maintenance_enabled} disabled={!canManageMaintenance} onCheckedChange={value => setRow({ ...row, settings: { ...row.settings, maintenance_enabled: value } })} />
            </div>
            <div className="space-y-2"><Label htmlFor="release-pricing-mode">Mode harga release</Label><select id="release-pricing-mode" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={row.settings.release_pricing_mode} onChange={event => setRow({ ...row, settings: { ...row.settings, release_pricing_mode: event.target.value as AdminSettings['release_pricing_mode'] } })}><option value="per_track">Per track</option><option value="per_category">Per kategori</option></select><p className="text-xs text-muted-foreground">Per kategori mengenakan satu tarif berdasarkan tipe release (single, EP, atau album).</p></div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="minimum-payout" className="flex items-center gap-2"><WalletCards className="h-4 w-4" />Minimum payout</Label><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">IDR</span><Input id="minimum-payout" className="pl-12" inputMode="numeric" placeholder="50000" pattern="(?:0|[1-9][0-9]{0,15})" value={displayMoneyValue(row.settings.min_payout_amount)} onChange={event => { const value = event.target.value.replace(/\D/g, ''); setRow({ ...row, settings: { ...row.settings, min_payout_amount: value || null } }); }} /></div><p className="text-xs text-muted-foreground">Masukkan angka saja. Kosong memakai default Rp 50.000; isi 0 untuk menonaktifkan batas minimum.</p></div>
              <div className="space-y-2"><Label htmlFor="release-price" className="flex items-center gap-2"><WalletCards className="h-4 w-4" />Harga release per track</Label><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">IDR</span><Input id="release-price" className="pl-12" inputMode="numeric" placeholder="10000" pattern="[1-9][0-9]{0,15}" value={displayMoneyValue(row.settings.release_price_per_track)} onChange={event => { const value = event.target.value.replace(/\D/g, ''); setRow({ ...row, settings: { ...row.settings, release_price_per_track: value || null } }); }} /></div><p className="text-xs text-muted-foreground">Masukkan angka saja untuk biaya setiap track. Contoh: 10000.</p></div>
              <div className="space-y-2"><Label htmlFor="release-price-single">Harga kategori Single (IDR)</Label><Input id="release-price-single" inputMode="numeric" placeholder="50000" value={displayMoneyValue(row.settings.release_price_single)} onChange={event => { const value = event.target.value.replace(/\D/g, ''); setRow({ ...row, settings: { ...row.settings, release_price_single: value || null } }); }} /></div>
              <div className="space-y-2"><Label htmlFor="release-price-ep">Harga kategori EP (IDR)</Label><Input id="release-price-ep" inputMode="numeric" placeholder="150000" value={displayMoneyValue(row.settings.release_price_ep)} onChange={event => { const value = event.target.value.replace(/\D/g, ''); setRow({ ...row, settings: { ...row.settings, release_price_ep: value || null } }); }} /></div>
              <div className="space-y-2"><Label htmlFor="release-price-album">Harga kategori Album (IDR)</Label><Input id="release-price-album" inputMode="numeric" placeholder="300000" value={displayMoneyValue(row.settings.release_price_album)} onChange={event => { const value = event.target.value.replace(/\D/g, ''); setRow({ ...row, settings: { ...row.settings, release_price_album: value || null } }); }} /></div>
            </div>
              <div className="space-y-2"><Label htmlFor="custom-label-price" className="flex items-center gap-2"><WalletCards className="h-4 w-4" />Harga Custom Label per track</Label><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">IDR</span><Input id="custom-label-price" className="pl-12" inputMode="numeric" placeholder="75000" pattern="[1-9][0-9]{0,15}" value={displayMoneyValue(row.settings.release_price_custom_label)} onChange={event => { const value = event.target.value.replace(/\D/g, ''); setRow({ ...row, settings: { ...row.settings, release_price_custom_label: value || null } }); }} /></div><p className="text-xs text-muted-foreground">Harga khusus release Custom Label SoundPub. Kosongkan untuk menonaktifkan harga khusus.</p></div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div><CardTitle className="flex items-center gap-2 text-lg"><Megaphone className="h-5 w-5" />Popup Informasi Login</CardTitle><CardDescription className="mt-2">Tampilkan pengumuman singkat pada halaman login.</CardDescription></div>
              <Switch aria-label="Aktifkan popup informasi" checked={row.settings.auth_notice_config.enabled} onCheckedChange={value => setRow({ ...row, settings: { ...row.settings, auth_notice_config: { ...row.settings.auth_notice_config, enabled: value } } })} />
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {(['title', 'badge'] as const).map(key => <div key={key} className="space-y-2"><Label htmlFor={`auth-notice-${key}`}>{key === 'title' ? 'Judul' : 'Badge'}</Label><Input id={`auth-notice-${key}`} maxLength={key === 'title' ? 160 : 80} value={row.settings.auth_notice_config[key]} onChange={event => setRow({ ...row, settings: { ...row.settings, auth_notice_config: { ...row.settings.auth_notice_config, [key]: event.target.value, revision: String(Date.now()) } } })} /></div>)}
            </div>
            <div className="space-y-2"><Label htmlFor="auth-notice-message">Pesan utama</Label><Textarea id="auth-notice-message" rows={3} maxLength={2000} value={row.settings.auth_notice_config.message} onChange={event => setRow({ ...row, settings: { ...row.settings, auth_notice_config: { ...row.settings.auth_notice_config, message: event.target.value, revision: String(Date.now()) } } })} /></div>
            <div className="space-y-2"><Label htmlFor="auth-notice-detail">Detail</Label><Textarea id="auth-notice-detail" rows={4} maxLength={4000} value={row.settings.auth_notice_config.detail} onChange={event => setRow({ ...row, settings: { ...row.settings, auth_notice_config: { ...row.settings.auth_notice_config, detail: event.target.value, revision: String(Date.now()) } } })} /></div>
            <div className="space-y-2"><Label htmlFor="auth-notice-button">Teks tombol</Label><Input id="auth-notice-button" maxLength={80} value={row.settings.auth_notice_config.buttonText} onChange={event => setRow({ ...row, settings: { ...row.settings, auth_notice_config: { ...row.settings.auth_notice_config, buttonText: event.target.value, revision: String(Date.now()) } } })} /></div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardFooter className="flex flex-col gap-3 pt-6 sm:flex-row sm:justify-between">
            <p className="text-sm text-muted-foreground">Perubahan aplikasi disimpan setelah tombol Simpan ditekan.</p>
            <div className="flex w-full gap-2 sm:w-auto"><Button type="button" className="flex-1 sm:flex-none" variant="outline" onClick={() => void load()}><RefreshCw />Muat ulang</Button><Button type="submit" className="flex-1 sm:flex-none"><Save />Simpan pengaturan</Button></div>
          </CardFooter>
        </Card>

        {busy && <div role="status" className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border bg-background px-4 py-3 text-sm shadow-lg"><Loader2 className="h-4 w-4 animate-spin" />Menyimpan dan memverifikasi...</div>}
      </fieldset>
    </form>}
  </section>;
}
