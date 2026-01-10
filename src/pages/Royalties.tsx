import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { DollarSign, Search, Loader2 } from 'lucide-react';

interface Royalty {
  id: string;
  period: string;
  isrc: string;
  title: string | null;
  artist_name: string;
  platform: string;
  country: string;
  unit_penjualan: number;
  artist_revenue: number;
  created_at: string;
}

export default function Royalties() {
  const [royalties, setRoyalties] = useState<Royalty[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [totalRevenue, setTotalRevenue] = useState(0);

  useEffect(() => {
    fetchRoyalties();
  }, []);

  const fetchRoyalties = async () => {
    try {
      const { data, error } = await supabase
        .from('royalties')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setRoyalties(data || []);
      
      const total = data?.reduce((sum, r) => sum + Number(r.artist_revenue || 0), 0) || 0;
      setTotalRevenue(total);
    } catch (error) {
      console.error('Error fetching royalties:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredRoyalties = royalties.filter(
    (royalty) =>
      (royalty.title?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      royalty.artist_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      royalty.platform.toLowerCase().includes(searchTerm.toLowerCase()) ||
      royalty.isrc.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Royalties</h1>
          <p className="text-muted-foreground">Laporan pendapatan dari streaming</p>
        </div>

        {/* Summary Card */}
        <Card className="gradient-primary text-white">
          <CardHeader>
            <CardTitle className="text-lg">Total Pendapatan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              Rp {totalRevenue.toLocaleString('id-ID')}
            </div>
            <p className="text-white/80 text-sm mt-1">
              Dari {royalties.length} transaksi
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Detail Royalties</CardTitle>
                <CardDescription>Rincian pendapatan per track</CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredRoyalties.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Belum ada data royalties</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Judul</TableHead>
                      <TableHead>Artist</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead className="text-right">Streams</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRoyalties.map((royalty) => (
                      <TableRow key={royalty.id}>
                        <TableCell className="font-mono text-xs">{royalty.period}</TableCell>
                        <TableCell className="font-medium">{royalty.title || '-'}</TableCell>
                        <TableCell>{royalty.artist_name}</TableCell>
                        <TableCell>{royalty.platform}</TableCell>
                        <TableCell>{royalty.country}</TableCell>
                        <TableCell className="text-right">
                          {royalty.unit_penjualan.toLocaleString('id-ID')}
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-500">
                          Rp {Number(royalty.artist_revenue).toLocaleString('id-ID')}
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
