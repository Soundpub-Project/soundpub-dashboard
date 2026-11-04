import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Loader2, Music, X } from 'lucide-react';
import { toast } from 'sonner';
import { SoundpubApiError } from '@/api/client';
import {
  createLabelCustomArtist, updateLabelCustomArtist, labelCustomArtistSchema,
  type LabelCustomArtist, type LabelCustomArtistCreate, type LabelCustomOwnerScope,
} from '@/services/label-custom';
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type LabelCustomArtistDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (artist: LabelCustomArtist) => void;
  /** Administrators must supply the target Label Custom owner's scope. */
  scope?: LabelCustomOwnerScope;
} & ({ mode: 'create'; artist?: never } | { mode: 'edit'; artist: LabelCustomArtist });

type Field = keyof LabelCustomArtistCreate;
const fields: { name: Field; label: string; type: string; autoComplete: string; maxLength: number }[] = [
  { name: 'name', label: 'Nama artis', type: 'text', autoComplete: 'off', maxLength: 200 },
  { name: 'contact_email', label: 'Email kontak', type: 'email', autoComplete: 'email', maxLength: 320 },
  { name: 'contact_phone', label: 'Nomor telepon kontak', type: 'tel', autoComplete: 'tel', maxLength: 50 },
];

function saveError(error: unknown) {
  if (error instanceof SoundpubApiError) {
    switch (error.category) {
      case 'VALIDATION_ERROR': return 'Data ditolak. Periksa nama, email, dan nomor telepon kontak.';
      case 'UNAUTHENTICATED': return 'Sesi berakhir. Silakan login kembali sebagai PIC Label Custom.';
      case 'FORBIDDEN': return 'Anda tidak memiliki izin mengelola artis ini. Hubungi admin.';
      case 'NOT_FOUND': return 'Unit atau artis tidak ditemukan. Tutup dialog lalu muat ulang daftar.';
      case 'CONFLICT': return 'Data tidak dapat disimpan pada status saat ini. Tutup dialog lalu muat ulang daftar.';
      case 'RATE_LIMITED': return 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.';
    }
  }
  return 'Data belum dapat disimpan. Periksa koneksi lalu coba lagi.';
}

export function LabelCustomArtistDialog(props: LabelCustomArtistDialogProps) {
  const pending = useRef(false);
  const setPending = useCallback((value: boolean) => { pending.current = value; }, []);
  return (
    <Dialog open={props.open} onOpenChange={open => { if (!pending.current) props.onOpenChange(open); }}>
      {props.open && (
        <ArtistForm
          key={`${props.mode}:${props.artist?.id ?? ''}:${props.scope?.owner_user_id ?? ''}`}
          {...props}
          setPending={setPending}
        />
      )}
    </Dialog>
  );
}

function ArtistForm(props: LabelCustomArtistDialogProps & { setPending: (pending: boolean) => void }) {
  const id = useId();
  const [values, setValues] = useState<LabelCustomArtistCreate>(() => ({
    name: props.artist?.name ?? '',
    contact_email: props.artist?.contact_email ?? '',
    contact_phone: props.artist?.contact_phone ?? '',
  }));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const createAttempt = useRef({ fingerprint: '', key: '' });
  const mounted = useRef(true);
  const summary = useRef<HTMLDivElement>(null);
  const { setPending } = props;
  const archived = props.artist?.status === 'archived';

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; setPending(false); };
  }, [setPending]);
  useEffect(() => {
    if (error || Object.keys(errors).length) summary.current?.focus();
  }, [error, errors]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || archived) return;
    setError('');
    const parsed = labelCustomArtistSchema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field;
        if (!next[field]) next[field] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    const fingerprint = JSON.stringify(parsed.data);
    if (props.mode === 'create' && createAttempt.current.fingerprint !== fingerprint) {
      createAttempt.current = { fingerprint, key: crypto.randomUUID() };
    }
    pending.current = true;
    setPending(true);
    setSaving(true);
    let saved: LabelCustomArtist;
    try {
      saved = props.mode === 'edit'
        ? await updateLabelCustomArtist(props.artist.id, parsed.data, props.scope)
        : await createLabelCustomArtist(parsed.data, createAttempt.current.key, props.scope);
    } catch (cause) {
      if (mounted.current) setError(saveError(cause));
      return;
    } finally {
      if (mounted.current) {
        pending.current = false;
        setPending(false);
        setSaving(false);
      }
    }
    if (!mounted.current) return;
    toast.success(props.mode === 'edit' ? 'Data artis berhasil diperbarui.' : 'Artis berhasil ditambahkan.');
    props.onOpenChange(false);
    props.onSuccess(saved);
  }

  return (
    <DialogContent
      className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg [&>button:last-child]:hidden"
      onOpenAutoFocus={event => {
        if (archived) return;
        event.preventDefault();
        document.getElementById(`${id}-name`)?.focus();
      }}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 pr-8">
          <Music className="h-5 w-5 shrink-0" aria-hidden="true" />
          {props.mode === 'edit' ? 'Edit Artis Label Custom' : 'Tambah Artis Label Custom'}
        </DialogTitle>
        <DialogDescription>
          Artis tidak bisa login dan tidak memiliki akun atau password. Pendapatan artis dikelola oleh PIC Label Custom.
        </DialogDescription>
      </DialogHeader>
      <DialogClose asChild>
        <Button type="button" variant="ghost" size="icon" aria-label="Tutup dialog" disabled={saving}
          className="absolute right-2 top-2 h-11 w-11">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DialogClose>
      <form onSubmit={submit} noValidate aria-busy={saving} className="space-y-5">
        {(error || Object.keys(errors).length > 0) && (
          <Alert variant="destructive" ref={summary} tabIndex={-1} aria-labelledby={`${id}-errors`}>
            <AlertDescription>
              <p id={`${id}-errors`} className="font-medium">Data belum tersimpan.</p>
              {error && <p>{error}</p>}
              {Object.keys(errors).length > 0 && (
                <ul className="list-disc space-y-1 pl-5">
                  {fields.filter(field => errors[field.name]).map(field => (
                    <li key={field.name}>
                      <a className="underline" href={`#${id}-${field.name}`} onClick={event => {
                        event.preventDefault();
                        document.getElementById(`${id}-${field.name}`)?.focus();
                      }}>{errors[field.name]}</a>
                    </li>
                  ))}
                </ul>
              )}
            </AlertDescription>
          </Alert>
        )}
        {archived && <p role="status" className="text-sm text-muted-foreground">Artis sudah diarsipkan dan tidak dapat diedit.</p>}
        <p className="text-sm text-muted-foreground">Semua kolom wajib diisi. Email dan telepon hanya untuk kontak.</p>
        {fields.map(field => (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={`${id}-${field.name}`}>{field.label}</Label>
            <Input id={`${id}-${field.name}`} name={field.name} type={field.type}
              autoComplete={field.autoComplete} maxLength={field.maxLength} required
              className="min-h-11" disabled={saving || archived} value={values[field.name]}
              aria-invalid={!!errors[field.name]}
              aria-describedby={errors[field.name] ? `${id}-${field.name}-error` : undefined}
              onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))}
            />
            {errors[field.name] && <p id={`${id}-${field.name}-error`} className="text-sm text-destructive">{errors[field.name]}</p>}
          </div>
        ))}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => props.onOpenChange(false)}>Batal</Button>
          <Button type="submit" className="min-h-11" disabled={saving || archived}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            <span role="status">{saving ? 'Menyimpan…' : props.mode === 'edit' ? 'Simpan Perubahan' : 'Tambah Artis'}</span>
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
