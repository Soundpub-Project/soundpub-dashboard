import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2, Plus, Upload, FileMusic, Search, DollarSign, FileSpreadsheet } from 'lucide-react';
import { ComposerRoyaltyUpload } from '@/components/royalty/ComposerRoyaltyUpload';

interface ComposerRoyalty {
  id: string;
  composer_id: string;
  composer_name: string;
  total_net_royalti: number;
  period: string | null;
  created_at: string;
}

export default function ComposerRoyalties() {
  const navigate = useNavigate();
  const { isAdmin, role, loading: authLoading } = useAuth();
  const [royalties, setRoyalties] = useState<ComposerRoyalty[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Form state
  const [composerId, setComposerId] = useState('');
  const [composerName, setComposerName] = useState('');
  const [totalNetRoyalti, setTotalNetRoyalti] = useState('');
  const [period, setPeriod] = useState('');

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate('/dashboard');
      return;
    }
    fetchRoyalties();
  }, [authLoading, isAdmin]);

  const fetchRoyalties = async () => {
    try {
      const { data, error } = await supabase
        .from('composer_royalties')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRoyalties(data || []);
    } catch (error) {
      console.error('Error fetching composer royalties:', error);
      toast.error('Gagal memuat data royalty composer');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!composerId || !composerName || !totalNetRoyalti) {
      toast.error('Mohon lengkapi semua field yang wajib');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('composer_royalties')
        .insert({
          composer_id: composerId,
          composer_name: composerName,
          total_net_royalti: parseFloat(totalNetRoyalti),
          period: period || null,
        });

      if (error) throw error;

      toast.success('Royalty composer berhasil ditambahkan');
      setDialogOpen(false);
      resetForm();
      fetchRoyalties();
    } catch (error: any) {
      console.error('Error adding composer royalty:', error);
      toast.error(error.message || 'Gagal menambahkan royalty composer');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setComposerId('');
    setComposerName('');
    setTotalNetRoyalti('');
    setPeriod('');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const filteredRoyalties = royalties.filter(r =>
    r.composer_name.toLowerCase().includes(search.toLowerCase()) ||
    r.composer_id.toLowerCase().includes(search.toLowerCase())
  );

  const totalRoyalties = filteredRoyalties.reduce((sum, r) => sum + Number(r.total_net_royalti), 0);

  if (authLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Royalty Composer (Hak Cipta)</h1>
            <p className="text-muted-foreground">
              Kelola royalty untuk pemilik hak cipta (composer)
            </p>
          </div>
          
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Tambah Royalty Manual
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah Royalty Composer</DialogTitle>
                <DialogDescription>
                  Masukkan data royalty untuk pemilik hak cipta
                </DialogDescription>
              </DialogHeader>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="composerId">Composer ID *</Label>
                  <Input
                    id="composerId"
                    value={composerId}
                    onChange={(e) => setComposerId(e.target.value)}
                    placeholder="ID unik composer"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="composerName">Nama Composer *</Label>
                  <Input
                    id="composerName"
                    value={composerName}
                    onChange={(e) => setComposerName(e.target.value)}
                    placeholder="Nama lengkap composer"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="totalNetRoyalti">Total Net Royalti (IDR) *</Label>
                  <Input
                    id="totalNetRoyalti"
                    type="number"
                    step="0.01"
                    value={totalNetRoyalti}
                    onChange={(e) => setTotalNetRoyalti(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="period">Periode</Label>
                  <Input
                    id="period"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    placeholder="Contoh: 2024-Q1"
                  />
                </div>
                
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Batal
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Simpan
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Tabs for different views */}
        <Tabs defaultValue="list" className="space-y-6">
          <TabsList>
            <TabsTrigger value="list" className="flex items-center gap-2">
              <FileMusic className="h-4 w-4" />
              Daftar Royalty
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Upload CSV
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Composers
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{royalties.length}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Royalties
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-chart-1">
                    {formatCurrency(totalRoyalties)}
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Rata-rata per Composer
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {royalties.length > 0 
                      ? formatCurrency(totalRoyalties / royalties.length)
                      : formatCurrency(0)}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari composer..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Composer ID</TableHead>
                      <TableHead>Nama Composer</TableHead>
                      <TableHead>Total Net Royalti</TableHead>
                      <TableHead>Periode</TableHead>
                      <TableHead>Tanggal Dibuat</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRoyalties.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          <FileMusic className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
                          <p className="text-muted-foreground">Belum ada data royalty composer</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRoyalties.map((royalty) => (
                        <TableRow key={royalty.id}>
                          <TableCell className="font-mono text-sm">{royalty.composer_id}</TableCell>
                          <TableCell className="font-medium">{royalty.composer_name}</TableCell>
                          <TableCell className="font-medium text-chart-1">
                            {formatCurrency(royalty.total_net_royalti)}
                          </TableCell>
                          <TableCell>
                            {royalty.period ? (
                              <Badge variant="outline">{royalty.period}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(royalty.created_at).toLocaleDateString('id-ID')}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="upload">
            <ComposerRoyaltyUpload onSuccess={fetchRoyalties} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
