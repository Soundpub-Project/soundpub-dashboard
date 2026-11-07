import { useEffect, useRef, useState } from 'react';
import { AlertCircle, KeyRound, Loader2, RefreshCw, Unlink } from 'lucide-react';
import { usersApi, type IccnIdentity } from '@/api/users';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { SoundpubApiError } from '@/api/client';

interface IccnIdentityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: string; full_name: string; email: string } | null;
  onSuccess?: () => void | Promise<void>;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof SoundpubApiError) {
    const request = error.requestId ? ` ID permintaan: ${error.requestId}.` : '';
    if (error.category === 'CONFLICT') return `Data ICCN berubah atau subject sudah dipakai akun lain.${request}`;
    if (error.category === 'FORBIDDEN') return `Akses pengelolaan identitas ICCN ditolak.${request}`;
    if (error.category === 'NOT_FOUND') return `Pengguna atau binding ICCN tidak ditemukan.${request}`;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

export function IccnIdentityDialog({ open, onOpenChange, user, onSuccess }: IccnIdentityDialogProps) {
  const activeUserId = useRef<string | null>(null);
  activeUserId.current = open ? user?.id ?? null : null;
  const [identity, setIdentity] = useState<IccnIdentity | null>(null);
  const [subject, setSubject] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    const controller = new AbortController();
    setIdentity(null);
    setSubject('');
    setConfirmation('');
    setError(null);
    setLoading(true);
    usersApi.iccnIdentity(user.id, controller.signal)
      .then(setIdentity)
      .catch(loadError => {
        if (!controller.signal.aborted) setError(errorMessage(loadError, 'Gagal memuat identitas ICCN.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, user]);

  const reload = async () => {
    if (!user) return;
    const targetId = user.id;
    setLoading(true);
    setError(null);
    try {
      const nextIdentity = await usersApi.iccnIdentity(targetId);
      if (activeUserId.current === targetId) setIdentity(nextIdentity);
    } catch (loadError) {
      if (activeUserId.current === targetId) setError(errorMessage(loadError, 'Gagal memuat identitas ICCN.'));
    } finally {
      if (activeUserId.current === targetId) setLoading(false);
    }
  };

  const bind = async () => {
    if (!user) return;
    const normalizedSubject = subject.trim();
    if (!normalizedSubject) return;
    setSaving(true);
    setError(null);
    try {
      setIdentity(await usersApi.bindIccnIdentity(user.id, normalizedSubject));
      setSubject('');
      await onSuccess?.();
      toast.success(`Identitas ICCN ${user.full_name} berhasil ditautkan.`);
    } catch (bindError) {
      setError(errorMessage(bindError, 'Gagal menautkan identitas ICCN.'));
    } finally {
      setSaving(false);
    }
  };

  const verifyLegacyBinding = async () => {
    if (!user || !identity?.binding || identity.binding.verifiedAt) return;
    setSaving(true);
    setError(null);
    try {
      setIdentity(await usersApi.bindIccnIdentity(user.id, identity.binding.subject));
      await onSuccess?.();
      toast.success(`Identitas ICCN ${user.full_name} berhasil diverifikasi.`);
    } catch (verifyError) {
      setError(errorMessage(verifyError, 'Gagal memverifikasi identitas ICCN.'));
    } finally {
      setSaving(false);
    }
  };

  const unbind = async () => {
    if (!user || !identity?.binding || confirmation !== identity.binding.subject) return;
    setSaving(true);
    setError(null);
    try {
      await usersApi.unbindIccnIdentity(user.id, identity.binding.subject);
      setIdentity({ ...identity, binding: null });
      setConfirmation('');
      await onSuccess?.();
      toast.success(`Identitas ICCN ${user.full_name} berhasil dilepas.`);
    } catch (unbindError) {
      setError(errorMessage(unbindError, 'Gagal melepas identitas ICCN.'));
    } finally {
      setSaving(false);
    }
  };

  const binding = identity?.binding;
  const issuerMismatch = !!binding && binding.issuer !== identity?.issuer;
  const canBind = !!identity?.eligible && !!identity.issuer && !!subject.trim() && !saving;
  const canUnbind = !!binding && confirmation === binding.subject && !saving;

  return (
    <Dialog open={open} onOpenChange={next => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" />Kelola ICCN</DialogTitle>
          <DialogDescription>Kelola identitas SSO ICCN untuk {user?.full_name || 'artis terpilih'}.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex min-h-40 items-center justify-center" aria-label="Memuat identitas ICCN">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error && !identity ? (
          <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Identitas ICCN tidak tersedia</AlertTitle>
            <AlertDescription className="space-y-3"><p>{error}</p><Button size="sm" variant="outline" onClick={() => void reload()}><RefreshCw className="mr-2 h-4 w-4" />Coba lagi</Button></AlertDescription>
          </Alert>
        ) : identity ? (
          <div className="space-y-5 py-2">
            {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Operasi gagal</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="space-y-2"><Label htmlFor="iccn-issuer">Issuer</Label><Input id="iccn-issuer" value={identity.issuer ?? 'Belum dikonfigurasi'} readOnly /></div>
            {!identity.eligible && !binding ? (
              <Alert><AlertCircle className="h-4 w-4" /><AlertTitle>Artis tidak memenuhi syarat</AlertTitle><AlertDescription>Binding ICCN hanya tersedia untuk artis dalam roster yang dapat dikelola admin ini.</AlertDescription></Alert>
            ) : binding ? (
              <div className="space-y-4">
                <div className="space-y-2"><Label htmlFor="iccn-bound-subject">Subject ICCN</Label><Input id="iccn-bound-subject" value={binding.subject} readOnly /></div>
                {(issuerMismatch || !binding.verifiedAt) && (
                  <Alert><AlertCircle className="h-4 w-4" /><AlertTitle>Binding lama belum diverifikasi</AlertTitle>
                    <AlertDescription className="space-y-3"><p>{issuerMismatch ? 'Issuer binding lama berbeda dari konfigurasi ICCN aktif. Lepas binding lama sebelum menautkan ulang.' : 'Konfirmasi subject ini sebelum login ICCN diaktifkan.'}</p>
                      {!issuerMismatch && <Button disabled={!identity.eligible || saving} onClick={() => void verifyLegacyBinding()}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verifikasi ICCN
                      </Button>}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                  <div><p className="font-medium text-destructive">Lepas binding ICCN</p><p className="text-sm text-muted-foreground">Ketik subject aktif persis untuk konfirmasi. Akses login ICCN artis akan berhenti.</p></div>
                  <div className="space-y-2"><Label htmlFor="iccn-unbind-confirmation">Konfirmasi subject</Label><Input id="iccn-unbind-confirmation" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={saving} autoComplete="off" /></div>
                  <Button variant="destructive" disabled={!canUnbind} onClick={() => void unbind()}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlink className="mr-2 h-4 w-4" />}Lepas ICCN</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3"><div className="space-y-2"><Label htmlFor="iccn-subject">Subject ICCN</Label><Input id="iccn-subject" value={subject} onChange={event => setSubject(event.target.value)} maxLength={255} disabled={saving} autoComplete="off" placeholder="Masukkan subject dari ICCN" /><p className="text-xs text-muted-foreground">Subject harus unik dan sama persis dengan klaim <code>sub</code> dari ICCN.</p></div>
                <Button disabled={!canBind} onClick={() => void bind()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Tautkan ICCN</Button></div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          {identity && <Button variant="ghost" disabled={saving || loading} onClick={() => void reload()}><RefreshCw className="mr-2 h-4 w-4" />Muat ulang</Button>}
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
