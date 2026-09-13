import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileDown, FileText, Loader2, Search, ExternalLink, CheckCircle, Clock, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface Invoice {
  id: string;
  release_id: string;
  user_id: string;
  amount: number;
  currency: string;
  track_count: number;
  price_per_track: number;
  status: string;
  xendit_invoice_url: string | null;
  xendit_invoice_id: string | null;
  paid_at: string | null;
  created_at: string;
  release_title?: string;
  release_artist?: string;
  user_name?: string;
  user_email?: string;
}

export default function Invoices() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [tab, setTab] = useState<'all' | 'pending' | 'paid' | 'expired'>('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) fetchInvoices();
  }, [isAdmin]);

  const fetchInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from('release_payments')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Get related releases and profiles
      const releaseIds = [...new Set((data || []).map(d => d.release_id))];
      const userIds = [...new Set((data || []).map(d => d.user_id))];

      const [{ data: releases }, { data: profiles }] = await Promise.all([
        supabase.from('releases').select('id, title, artist_name').in('id', releaseIds),
        supabase.from('profiles').select('id, full_name, email').in('id', userIds),
      ]);

      const releaseMap = new Map((releases || []).map(r => [r.id, r]));
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      setInvoices((data || []).map(inv => ({
        ...inv,
        release_title: releaseMap.get(inv.release_id)?.title,
        release_artist: releaseMap.get(inv.release_id)?.artist_name,
        user_name: profileMap.get(inv.user_id)?.full_name,
        user_email: profileMap.get(inv.user_id)?.email,
      })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    try { return format(new Date(date), 'dd MMM yyyy HH:mm', { locale: idLocale }); } catch { return '-'; }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'paid': return { icon: CheckCircle, color: 'bg-green-500/20 text-green-600', label: 'Lunas' };
      case 'pending': return { icon: Clock, color: 'bg-yellow-500/20 text-yellow-600', label: 'Belum Bayar' };
      case 'expired': return { icon: XCircle, color: 'bg-red-500/20 text-red-600', label: 'Expired' };
      case 'failed': return { icon: XCircle, color: 'bg-red-500/20 text-red-600', label: 'Gagal' };
      default: return { icon: Clock, color: 'bg-muted text-muted-foreground', label: status };
    }
  };

  const downloadInvoice = async (paymentId: string) => {
    setDownloadingId(paymentId);
    try {
      const { data, error } = await supabase.functions.invoke('download-release-invoice', {
        body: { payment_id: paymentId },
      });
      if (error) throw error;
      if (!data?.url) throw new Error('Link invoice tidak tersedia');
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Invoice PDF download failed:', error);
      toast.error('Gagal menyiapkan PDF invoice');
    } finally {
      setDownloadingId(null);
    }
  };

  const filtered = invoices.filter(inv => {
    const matchSearch = (inv.release_title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.release_artist || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.user_name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchTab = tab === 'all' || inv.status === tab;
    return matchSearch && matchTab;
  });

  const stats = {
    pending: invoices.filter(i => i.status === 'pending').length,
    paid: invoices.filter(i => i.status === 'paid').length,
    expired: invoices.filter(i => i.status === 'expired' || i.status === 'failed').length,
  };

  if (authLoading) return <DashboardLayout><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></DashboardLayout>;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Invoice Pembayaran</h1>
          <p className="text-muted-foreground">Daftar invoice pembayaran release</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-yellow-500/10 border-yellow-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                  <p className="text-sm text-muted-foreground">Belum Bayar</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-green-500/10 border-green-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.paid}</p>
                  <p className="text-sm text-muted-foreground">Lunas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-red-500/10 border-red-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <XCircle className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.expired}</p>
                  <p className="text-sm text-muted-foreground">Expired/Gagal</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Daftar Invoice
              </CardTitle>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari invoice..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
            </div>
            <Tabs value={tab} onValueChange={v => setTab(v as any)} className="mt-4">
              <TabsList>
                <TabsTrigger value="all">Semua ({invoices.length})</TabsTrigger>
                <TabsTrigger value="pending">Belum Bayar ({stats.pending})</TabsTrigger>
                <TabsTrigger value="paid">Lunas ({stats.paid})</TabsTrigger>
                <TabsTrigger value="expired">Expired ({stats.expired})</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Tidak ada invoice</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Release</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Track</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Link</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(inv => {
                      const sc = getStatusConfig(inv.status);
                      return (
                        <TableRow key={inv.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{inv.release_title || '-'}</p>
                              <p className="text-xs text-muted-foreground">{inv.release_artist || '-'}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm">{inv.user_name || '-'}</p>
                              <p className="text-xs text-muted-foreground">{inv.user_email || '-'}</p>
                            </div>
                          </TableCell>
                          <TableCell>{inv.track_count}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(inv.amount)}</TableCell>
                          <TableCell>
                            <Badge className={`gap-1 ${sc.color}`}>
                              <sc.icon className="h-3 w-3" />
                              {sc.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatDate(inv.status === 'paid' ? inv.paid_at : inv.created_at)}
                          </TableCell>
                          <TableCell>
                            {inv.status === 'paid' ? (
                              <Button variant="ghost" size="sm" onClick={() => downloadInvoice(inv.id)} disabled={downloadingId === inv.id} title="Unduh invoice PDF">
                                {downloadingId === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                              </Button>
                            ) : inv.xendit_invoice_url && inv.status === 'pending' ? (
                              <Button variant="ghost" size="sm" asChild>
                                <a href={inv.xendit_invoice_url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            ) : '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
