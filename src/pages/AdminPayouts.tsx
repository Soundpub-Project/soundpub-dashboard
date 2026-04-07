import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CreditCard,
  Search,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Banknote,
  User,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface PayoutRequest {
  id: string;
  user_id: string;
  amount: number;
  bank_name: string;
  account_number: string;
  account_holder_name: string;
  status: string;
  notes: string | null;
  created_at: string;
  processed_at: string | null;
  processed_by: string | null;
  user_profile?: {
    full_name: string;
    email: string;
    balance: number;
  };
}

type TabStatus = 'pending' | 'approved' | 'rejected' | 'paid' | 'all';

export default function AdminPayouts() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabStatus>('pending');
  
  // Dialog states
  const [selectedPayout, setSelectedPayout] = useState<PayoutRequest | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'pay' | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (user && isAdmin) {
      fetchPayouts();
    }
  }, [user, isAdmin]);

  const fetchPayouts = async () => {
    try {
      setLoading(true);
      
      // Fetch all payout requests
      const { data: payoutsData, error: payoutsError } = await supabase
        .from('payout_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (payoutsError) throw payoutsError;

      // Fetch user profiles for each payout
      const userIds = [...new Set(payoutsData?.map(p => p.user_id) || [])];
      
      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, email, balance')
          .in('id', userIds);

        if (profilesError) throw profilesError;

        // Map profiles to payouts
        const payoutsWithProfiles = payoutsData?.map(payout => ({
          ...payout,
          user_profile: profiles?.find(p => p.id === payout.user_id),
        })) || [];

        setPayouts(payoutsWithProfiles);
      } else {
        setPayouts([]);
      }
    } catch (error) {
      console.error('Error fetching payouts:', error);
      toast.error('Gagal memuat data payout');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async () => {
    if (!selectedPayout || !actionType) return;

    setProcessing(true);
    try {
      let newStatus = '';
      switch (actionType) {
        case 'approve':
          newStatus = 'approved';
          break;
        case 'reject':
          newStatus = 'rejected';
          break;
        case 'pay':
          newStatus = 'paid';
          break;
      }

      const { error } = await supabase
        .from('payout_requests')
        .update({
          status: newStatus,
          notes: actionNotes || null,
          processed_by: user?.id,
          processed_at: new Date().toISOString(),
        })
        .eq('id', selectedPayout.id);

      if (error) throw error;

      // Send notification to the user
      const statusLabel = actionType === 'approve' ? 'Disetujui' : actionType === 'reject' ? 'Ditolak' : 'Dibayarkan';
      const notifType = actionType === 'reject' ? 'error' : 'success';
      const notifMsg = actionType === 'approve'
        ? `Pengajuan payout Rp ${Number(selectedPayout.amount).toLocaleString('id-ID')} telah disetujui. Dana akan segera ditransfer.`
        : actionType === 'reject'
        ? `Pengajuan payout Rp ${Number(selectedPayout.amount).toLocaleString('id-ID')} ditolak.${actionNotes ? ' Alasan: ' + actionNotes : ''}`
        : `Dana sebesar Rp ${Number(selectedPayout.amount).toLocaleString('id-ID')} telah ditransfer ke rekening ${selectedPayout.bank_name} Anda.`;

      await supabase.from('notifications').insert({
        user_id: selectedPayout.user_id,
        type: notifType,
        title: `Payout ${statusLabel}`,
        message: notifMsg,
        metadata: { payout_id: selectedPayout.id, amount: selectedPayout.amount },
      });

      const actionLabel = actionType === 'approve' ? 'disetujui' : actionType === 'reject' ? 'ditolak' : 'dibayarkan';
      toast.success(`Payout berhasil ${actionLabel}`);
      
      fetchPayouts();
      closeDialog();
    } catch (error: any) {
      console.error('Error processing payout:', error);
      toast.error(error.message || 'Gagal memproses payout');
    } finally {
      setProcessing(false);
    }
  };

  const closeDialog = () => {
    setSelectedPayout(null);
    setActionType(null);
    setActionNotes('');
  };

  const openActionDialog = (payout: PayoutRequest, action: 'approve' | 'reject' | 'pay') => {
    setSelectedPayout(payout);
    setActionType(action);
    setActionNotes('');
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode; label: string }> = {
      pending: { variant: 'secondary', icon: <Clock className="h-3 w-3" />, label: 'Pending' },
      approved: { variant: 'default', icon: <CheckCircle className="h-3 w-3" />, label: 'Approved' },
      rejected: { variant: 'destructive', icon: <XCircle className="h-3 w-3" />, label: 'Rejected' },
      paid: { variant: 'outline', icon: <Banknote className="h-3 w-3" />, label: 'Paid' },
    };
    const { variant, icon, label } = config[status] || config.pending;
    return (
      <Badge variant={variant} className="gap-1">
        {icon}
        {label}
      </Badge>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    try {
      return format(new Date(date), 'dd MMM yyyy HH:mm', { locale: idLocale });
    } catch {
      return '-';
    }
  };

  const filteredPayouts = payouts.filter((payout) => {
    const matchesSearch =
      payout.user_profile?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payout.user_profile?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payout.bank_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payout.account_holder_name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesTab = activeTab === 'all' || payout.status === activeTab;

    return matchesSearch && matchesTab;
  });

  // Statistics
  const stats = {
    pending: payouts.filter(p => p.status === 'pending').length,
    pendingAmount: payouts.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0),
    approved: payouts.filter(p => p.status === 'approved').length,
    paid: payouts.filter(p => p.status === 'paid').length,
    rejected: payouts.filter(p => p.status === 'rejected').length,
  };

  // Auth loading state
  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  // Redirect non-admin users
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Admin Payouts</h1>
          <p className="text-muted-foreground">Kelola dan proses permintaan payout</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-amber-500/10 border-amber-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20">
                  <Clock className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
              </div>
              <p className="text-xs text-amber-500 mt-2 font-medium">
                Total: {formatCurrency(stats.pendingAmount)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-blue-500/10 border-blue-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <CheckCircle className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.approved}</p>
                  <p className="text-sm text-muted-foreground">Approved</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-green-500/10 border-green-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/20">
                  <Banknote className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.paid}</p>
                  <p className="text-sm text-muted-foreground">Paid</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-red-500/10 border-red-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/20">
                  <XCircle className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.rejected}</p>
                  <p className="text-sm text-muted-foreground">Rejected</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payouts Table */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  Daftar Payout Requests
                </CardTitle>
                <CardDescription>
                  {filteredPayouts.length} requests
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari user atau bank..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabStatus)} className="mt-4">
              <TabsList>
                <TabsTrigger value="pending" className="gap-1">
                  <Clock className="h-3 w-3" />
                  Pending ({stats.pending})
                </TabsTrigger>
                <TabsTrigger value="approved" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Approved ({stats.approved})
                </TabsTrigger>
                <TabsTrigger value="paid" className="gap-1">
                  <Banknote className="h-3 w-3" />
                  Paid ({stats.paid})
                </TabsTrigger>
                <TabsTrigger value="rejected" className="gap-1">
                  <XCircle className="h-3 w-3" />
                  Rejected ({stats.rejected})
                </TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredPayouts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Tidak ada payout request</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Bank</TableHead>
                      <TableHead>No. Rekening</TableHead>
                      <TableHead>Atas Nama</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayouts.map((payout) => (
                      <TableRow key={payout.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">
                                {payout.user_profile?.full_name || 'Unknown'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {payout.user_profile?.email}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold text-primary">
                          {formatCurrency(payout.amount)}
                        </TableCell>
                        <TableCell>{payout.bank_name}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {payout.account_number}
                        </TableCell>
                        <TableCell>{payout.account_holder_name}</TableCell>
                        <TableCell>{getStatusBadge(payout.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(payout.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {payout.status === 'pending' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => openActionDialog(payout, 'approve')}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => openActionDialog(payout, 'reject')}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {payout.status === 'approved' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                onClick={() => openActionDialog(payout, 'pay')}
                              >
                                <Banknote className="h-4 w-4 mr-1" />
                                Pay
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Action Dialog */}
      <Dialog open={!!actionType} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionType === 'approve' && (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Approve Payout
                </>
              )}
              {actionType === 'reject' && (
                <>
                  <XCircle className="h-5 w-5 text-red-500" />
                  Reject Payout
                </>
              )}
              {actionType === 'pay' && (
                <>
                  <Banknote className="h-5 w-5 text-blue-500" />
                  Mark as Paid
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'approve' && 'Setujui permintaan payout ini?'}
              {actionType === 'reject' && 'Tolak permintaan payout ini?'}
              {actionType === 'pay' && 'Tandai payout ini sebagai sudah dibayarkan?'}
            </DialogDescription>
          </DialogHeader>

          {selectedPayout && (
            <div className="space-y-4">
              {/* Payout Details */}
              <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">User:</span>
                  <span className="font-medium">{selectedPayout.user_profile?.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Amount:</span>
                  <span className="font-semibold text-primary">{formatCurrency(selectedPayout.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Bank:</span>
                  <span>{selectedPayout.bank_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">No. Rekening:</span>
                  <span className="font-mono">{selectedPayout.account_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Atas Nama:</span>
                  <span>{selectedPayout.account_holder_name}</span>
                </div>
              </div>

              {/* Warning for reject */}
              {actionType === 'reject' && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    User akan diberitahu bahwa permintaan payout mereka ditolak.
                  </p>
                </div>
              )}

              {/* Warning for pay */}
              {actionType === 'pay' && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <Banknote className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    Balance user akan dikurangi sebesar {formatCurrency(selectedPayout.amount)} setelah status diubah ke Paid.
                  </p>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Catatan {actionType === 'reject' ? '(wajib untuk reject)' : '(opsional)'}
                </label>
                <Textarea
                  placeholder="Tambahkan catatan..."
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={processing}>
              Batal
            </Button>
            <Button
              onClick={handleAction}
              disabled={processing || (actionType === 'reject' && !actionNotes.trim())}
              className={
                actionType === 'approve'
                  ? 'bg-green-600 hover:bg-green-700'
                  : actionType === 'reject'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }
            >
              {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {actionType === 'approve' && 'Approve'}
              {actionType === 'reject' && 'Reject'}
              {actionType === 'pay' && 'Mark as Paid'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
