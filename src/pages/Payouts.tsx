import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CreditCard, Plus, Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';

interface PayoutRequest {
  id: string;
  amount: number;
  bank_name: string;
  account_number: string;
  account_holder_name: string;
  status: string;
  notes: string | null;
  created_at: string;
  processed_at: string | null;
}

const BANK_LIST = ['BCA', 'BNI', 'BRI', 'Mandiri', 'CIMB Niaga', 'Bank Jago', 'Bank Jenius', 'SeaBank', 'Dana', 'OVO', 'GoPay', 'ShopeePay', 'Lainnya'];

export default function Payouts() {
  const { profile, user } = useAuth();
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [minPayout, setMinPayout] = useState(50000);

  const [form, setForm] = useState({
    bank_name: '',
    account_number: '',
    account_holder_name: '',
    amount: '',
  });

  useEffect(() => {
    fetchPayouts();
    fetchMinPayout();
  }, []);

  const fetchPayouts = async () => {
    try {
      const { data, error } = await supabase
        .from('payout_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPayouts(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMinPayout = async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'min_payout_amount')
      .maybeSingle();
    if (data?.value) setMinPayout(parseInt(data.value));
  };

  const handleSubmit = async () => {
    if (!user || !profile) return;
    const amount = parseInt(form.amount);
    if (!form.bank_name || !form.account_number || !form.account_holder_name) {
      toast.error('Semua field harus diisi');
      return;
    }
    if (isNaN(amount) || amount < minPayout) {
      toast.error(`Minimal penarikan Rp ${minPayout.toLocaleString('id-ID')}`);
      return;
    }
    if (amount > profile.balance) {
      toast.error('Saldo tidak mencukupi');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('payout_requests').insert({
        user_id: user.id,
        amount,
        bank_name: form.bank_name,
        account_number: form.account_number,
        account_holder_name: form.account_holder_name,
        status: 'pending',
      });
      if (error) throw error;

      // Notify admins
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['superadmin', 'admin']);

      if (adminRoles && adminRoles.length > 0) {
        const notifs = adminRoles.map((ar: any) => ({
          user_id: ar.user_id,
          type: 'payout',
          title: 'Pengajuan Payout Baru',
          message: `${profile.full_name} mengajukan penarikan Rp ${amount.toLocaleString('id-ID')} ke ${form.bank_name} - ${form.account_number}`,
          metadata: { amount, bank: form.bank_name },
        }));
        await supabase.from('notifications').insert(notifs);
      }

      toast.success('Pengajuan payout berhasil dikirim');
      setDialogOpen(false);
      setForm({ bank_name: '', account_number: '', account_holder_name: '', amount: '' });
      fetchPayouts();
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengajukan payout');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      paid: 'bg-green-500/20 text-green-600 border-green-500/30',
      approved: 'bg-blue-500/20 text-blue-600 border-blue-500/30',
      pending: 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30',
      rejected: 'bg-red-500/20 text-red-600 border-red-500/30',
    };
    return colors[status] || '';
  };

  const balance = profile?.balance || 0;
  const canRequestPayout = balance >= minPayout;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Payouts</h1>
            <p className="text-muted-foreground">Kelola penarikan dana</p>
          </div>
          <Button className="gradient-primary" disabled={!canRequestPayout} onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Request Payout
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2"><Wallet className="h-5 w-5" />Saldo Tersedia</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">
                Rp {balance.toLocaleString('id-ID')}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Minimal payout: Rp {minPayout.toLocaleString('id-ID')}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2"><CreditCard className="h-5 w-5" />Total Penarikan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {payouts.filter(p => p.status === 'paid').length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Rp {payouts.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0).toLocaleString('id-ID')} total dicairkan
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle>Riwayat Payout</CardTitle>
            <CardDescription>Daftar permintaan penarikan dana Anda</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : payouts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Belum ada permintaan payout</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Bank</TableHead>
                      <TableHead>Rekening</TableHead>
                      <TableHead>Atas Nama</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Catatan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.map(payout => (
                      <TableRow key={payout.id}>
                        <TableCell className="whitespace-nowrap">{new Date(payout.created_at).toLocaleDateString('id-ID')}</TableCell>
                        <TableCell>{payout.bank_name}</TableCell>
                        <TableCell className="font-mono text-xs">{payout.account_number}</TableCell>
                        <TableCell>{payout.account_holder_name}</TableCell>
                        <TableCell className="text-right font-medium">Rp {Number(payout.amount).toLocaleString('id-ID')}</TableCell>
                        <TableCell>
                          <Badge className={`capitalize ${getStatusBadge(payout.status)}`}>{payout.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{payout.notes || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Request Payout Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Payout</DialogTitle>
            <DialogDescription>
              Ajukan penarikan dana. Saldo Anda: Rp {balance.toLocaleString('id-ID')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Bank / E-Wallet</Label>
              <Select value={form.bank_name} onValueChange={v => setForm(f => ({ ...f, bank_name: v }))}>
                <SelectTrigger><SelectValue placeholder="Pilih bank" /></SelectTrigger>
                <SelectContent>
                  {BANK_LIST.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nomor Rekening / Akun</Label>
              <Input value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} placeholder="Contoh: 1234567890" />
            </div>
            <div className="space-y-2">
              <Label>Nama Pemilik Rekening</Label>
              <Input value={form.account_holder_name} onChange={e => setForm(f => ({ ...f, account_holder_name: e.target.value }))} placeholder="Nama sesuai rekening" />
            </div>
            <div className="space-y-2">
              <Label>Jumlah Penarikan (IDR)</Label>
              <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} min={minPayout} max={balance} placeholder={`Min. ${minPayout.toLocaleString('id-ID')}`} />
              {form.amount && parseInt(form.amount) > balance && (
                <p className="text-xs text-destructive">Jumlah melebihi saldo tersedia</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ajukan Payout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
