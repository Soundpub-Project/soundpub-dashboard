import { useEffect, useMemo, useState } from 'react';
import { Link2Off, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import { copyrightApi, type CopyrightBeneficiaryMapping, type CopyrightRoyaltyEntry } from '@/api/copyright';
import { usersApi, type BackendUser } from '@/api/users';
import { useAuth } from '@/hooks/useAuth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

const money = (value: string) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(Number(value));
const date = (value: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(value));

export function BackendComposerRoyalties() {
  const { isAdmin, isCopyright } = useAuth();
  const [royalties, setRoyalties] = useState<CopyrightRoyaltyEntry[]>([]);
  const [mappings, setMappings] = useState<CopyrightBeneficiaryMapping[]>([]);
  const [owners, setOwners] = useState<BackendUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [mappingOpen, setMappingOpen] = useState(false);
  const [revoke, setRevoke] = useState<CopyrightBeneficiaryMapping | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ composer_code: '', owner_id: '', canonical_name: '', valid_from: '', valid_through: '' });

  const load = async () => {
    setLoading(true); setError('');
    try {
      const royaltyPage = await copyrightApi.listRoyalties(100);
      setRoyalties(royaltyPage.items);
      if (isAdmin) {
        const [mappingPage, userPage] = await Promise.all([copyrightApi.listMappings({ include_revoked: true, limit: 100 }), usersApi.list()]);
        setMappings(mappingPage.items);
        setOwners(userPage.items.filter(user => user.status === 'active' && user.roles.includes('copyright')));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Data royalti gagal dimuat.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [isAdmin]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id-ID');
    return query ? royalties.filter(item => [item.composer_code, item.composer_name, item.canonical_name, item.period].some(value => value?.toLocaleLowerCase('id-ID').includes(query))) : royalties;
  }, [royalties, search]);
  const total = filtered.reduce((sum, item) => sum + Number(item.amount), 0);

  const createMapping = async () => {
    if (!form.composer_code.trim() || !form.owner_id || !form.canonical_name.trim() || !form.valid_from) return;
    setBusy(true);
    try {
      await copyrightApi.createMapping({ ...form, composer_code: form.composer_code.trim(), canonical_name: form.canonical_name.trim(), valid_through: form.valid_through || null });
      toast.success('Mapping penerima berhasil dibuat.'); setMappingOpen(false); setForm({ composer_code: '', owner_id: '', canonical_name: '', valid_from: '', valid_through: '' }); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Mapping gagal dibuat.'); }
    finally { setBusy(false); }
  };
  const revokeMapping = async () => {
    if (!revoke || !reason.trim()) return;
    setBusy(true);
    try { await copyrightApi.revokeMapping(revoke.id, reason.trim()); toast.success('Mapping berhasil dicabut.'); setRevoke(null); setReason(''); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Mapping gagal dicabut.'); }
    finally { setBusy(false); }
  };

  if (!isAdmin && !isCopyright) return <Alert variant="destructive"><AlertTitle>Akses ditolak</AlertTitle><AlertDescription>Halaman ini hanya untuk admin dan pengguna hak cipta.</AlertDescription></Alert>;
  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-3xl font-bold tracking-tight">Royalti Komposer</h1><p className="mt-1 text-muted-foreground">{isAdmin ? 'Lihat seluruh royalti dan kelola mapping penerima.' : 'Riwayat royalti hak cipta milik Anda.'}</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Muat ulang</Button></div>
    {error && <Alert variant="destructive"><AlertTitle>Operasi gagal</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    <Tabs defaultValue="royalties"><TabsList><TabsTrigger value="royalties">Daftar royalti</TabsTrigger>{isAdmin && <TabsTrigger value="mappings">Mapping penerima</TabsTrigger>}</TabsList>
      <TabsContent value="royalties" className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Card><CardHeader className="pb-2"><CardDescription>Entri ditampilkan</CardDescription><CardTitle>{filtered.length}</CardTitle></CardHeader></Card><Card><CardHeader className="pb-2"><CardDescription>Total royalti</CardDescription><CardTitle>{money(String(total))}</CardTitle></CardHeader></Card></div><div className="relative max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Label htmlFor="royalty-search" className="sr-only">Cari royalti</Label><Input id="royalty-search" className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari kode, komposer, penerima, atau periode" /></div><Card><CardContent className="p-0">{loading ? <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" aria-label="Memuat royalti" /></div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Periode</TableHead><TableHead>Kode</TableHead><TableHead>Komposer</TableHead><TableHead>Penerima</TableHead><TableHead className="text-right">Jumlah</TableHead><TableHead>Tanggal</TableHead></TableRow></TableHeader><TableBody>{filtered.length ? filtered.map(item => <TableRow key={item.id}><TableCell><Badge variant="outline">{item.period}</Badge></TableCell><TableCell className="font-mono">{item.composer_code}</TableCell><TableCell>{item.composer_name}</TableCell><TableCell>{item.canonical_name}</TableCell><TableCell className="text-right font-medium tabular-nums">{money(item.amount)}</TableCell><TableCell>{date(item.created_at)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Belum ada royalti.</TableCell></TableRow>}</TableBody></Table></div>}</CardContent></Card></TabsContent>
      {isAdmin && <TabsContent value="mappings" className="space-y-4"><div className="flex justify-end"><Dialog open={mappingOpen} onOpenChange={setMappingOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Tambah mapping</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Tambah mapping penerima</DialogTitle><DialogDescription>Mapping berlaku per kode komposer dan rentang periode.</DialogDescription></DialogHeader><div className="grid gap-4"><div className="space-y-2"><Label htmlFor="mapping-code">Kode komposer</Label><Input id="mapping-code" value={form.composer_code} onChange={event => setForm(current => ({ ...current, composer_code: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="mapping-owner">Pengguna hak cipta</Label><Select value={form.owner_id} onValueChange={value => { const owner = owners.find(item => item.id === value); setForm(current => ({ ...current, owner_id: value, canonical_name: current.canonical_name || owner?.full_name || owner?.email || '' })); }}><SelectTrigger id="mapping-owner"><SelectValue placeholder="Pilih penerima" /></SelectTrigger><SelectContent>{owners.map(owner => <SelectItem key={owner.id} value={owner.id}>{owner.full_name || owner.email || owner.id}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="mapping-name">Nama kanonis</Label><Input id="mapping-name" value={form.canonical_name} onChange={event => setForm(current => ({ ...current, canonical_name: event.target.value }))} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="mapping-from">Berlaku mulai</Label><Input id="mapping-from" type="month" value={form.valid_from} onChange={event => setForm(current => ({ ...current, valid_from: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="mapping-through">Berlaku sampai</Label><Input id="mapping-through" type="month" value={form.valid_through} onChange={event => setForm(current => ({ ...current, valid_through: event.target.value }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setMappingOpen(false)} disabled={busy}>Batal</Button><Button onClick={() => void createMapping()} disabled={busy || !form.composer_code.trim() || !form.owner_id || !form.canonical_name.trim() || !form.valid_from}>{busy ? 'Menyimpan...' : 'Simpan mapping'}</Button></DialogFooter></DialogContent></Dialog></div><Card><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Kode</TableHead><TableHead>Penerima</TableHead><TableHead>Periode berlaku</TableHead><TableHead>Status</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader><TableBody>{mappings.map(item => <TableRow key={item.id}><TableCell className="font-mono">{item.composer_code}</TableCell><TableCell><div>{item.canonical_name}</div><div className="font-mono text-xs text-muted-foreground">{item.owner_id}</div></TableCell><TableCell>{item.valid_from} – {item.valid_through ?? 'seterusnya'}</TableCell><TableCell><Badge variant={item.revoked ? 'destructive' : 'default'}>{item.revoked ? 'Dicabut' : 'Aktif'}</Badge></TableCell><TableCell><Button variant="ghost" size="sm" disabled={item.revoked} onClick={() => setRevoke(item)}><Link2Off className="mr-2 h-4 w-4" />Cabut</Button></TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card></TabsContent>}
    </Tabs>
    <AlertDialog open={!!revoke} onOpenChange={open => !open && setRevoke(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Cabut mapping?</AlertDialogTitle><AlertDialogDescription>Mapping {revoke?.composer_code} tidak dapat dipakai untuk preview baru setelah dicabut. Riwayat batch lama tetap mempertahankan mapping asal.</AlertDialogDescription></AlertDialogHeader><div className="space-y-2"><Label htmlFor="revoke-reason">Alasan pencabutan</Label><Input id="revoke-reason" value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></div><AlertDialogFooter><AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel><AlertDialogAction disabled={busy || !reason.trim()} onClick={event => { event.preventDefault(); void revokeMapping(); }}>{busy ? 'Mencabut...' : 'Cabut mapping'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
