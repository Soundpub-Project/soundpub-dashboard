import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { CreditCard, Plus, Loader2 } from 'lucide-react';

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

export default function Payouts() {
  const { profile } = useAuth();
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPayouts();
  }, []);

  const fetchPayouts = async () => {
    try {
      const { data, error } = await supabase
        .from('payout_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPayouts(data || []);
    } catch (error) {
      console.error('Error fetching payouts:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      paid: 'default',
      approved: 'default',
      pending: 'secondary',
      rejected: 'destructive',
    };
    const colors: Record<string, string> = {
      paid: 'bg-green-500/20 text-green-400 border-green-500/30',
      approved: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return colors[status] || '';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Payouts</h1>
            <p className="text-muted-foreground">Kelola permintaan pembayaran</p>
          </div>
          <Button className="gradient-primary" disabled={!profile || profile.balance <= 0}>
            <Plus className="h-4 w-4 mr-2" />
            Request Payout
          </Button>
        </div>

        {/* Balance Card */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Saldo Tersedia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              Rp {profile?.balance.toLocaleString('id-ID') || '0'}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle>Riwayat Payout</CardTitle>
            <CardDescription>Daftar permintaan pembayaran Anda</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.map((payout) => (
                      <TableRow key={payout.id}>
                        <TableCell>
                          {new Date(payout.created_at).toLocaleDateString('id-ID')}
                        </TableCell>
                        <TableCell>{payout.bank_name}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {payout.account_number}
                        </TableCell>
                        <TableCell>{payout.account_holder_name}</TableCell>
                        <TableCell className="text-right font-medium">
                          Rp {Number(payout.amount).toLocaleString('id-ID')}
                        </TableCell>
                        <TableCell>
                          <Badge className={`capitalize ${getStatusBadge(payout.status)}`}>
                            {payout.status}
                          </Badge>
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
    </DashboardLayout>
  );
}
