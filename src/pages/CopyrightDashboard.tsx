import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  FileText, 
  Music, 
  TrendingUp, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Download,
  Wallet
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/utils';

interface ComposerRoyalty {
  id: string;
  composer_code: string;
  composer_name: string;
  total_net_royalti: number;
  period: string;
  upload_id: string;
  created_at: string;
}

interface CopyrightRegistration {
  id: string;
  status: string;
  legal_name: string;
  composer_code: string | null;
  contract_number: string | null;
  created_at: string;
  approved_at: string | null;
}

interface CopyrightContract {
  id: string;
  contract_number: string;
  status: string;
  stamped_pdf_url: string | null;
  signed_at: string | null;
  created_at: string;
}

interface CopyrightWork {
  id: string;
  title: string;
  composer_name: string;
  lyricist_name: string | null;
  ownership_percentage: number;
  is_collaboration: boolean;
  release_status: string;
  release_date: string | null;
  created_at: string;
}

export default function CopyrightDashboard() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [royalties, setRoyalties] = useState<ComposerRoyalty[]>([]);
  const [registration, setRegistration] = useState<CopyrightRegistration | null>(null);
  const [contract, setContract] = useState<CopyrightContract | null>(null);
  const [works, setWorks] = useState<CopyrightWork[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, [user]);

  async function loadDashboardData() {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Load royalties using RPC
      const { data: royaltyData, error: royaltyError } = await supabase
        .rpc('get_my_composer_royalties', { _period: null });

      if (royaltyError) throw royaltyError;
      setRoyalties(royaltyData || []);

      // Load registration
      const { data: regData, error: regError } = await supabase
        .from('copyright_registrations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (regError) throw regError;
      setRegistration(regData);

      // If registration exists, load contract
      if (regData?.id) {
        const { data: contractData, error: contractError } = await supabase
          .from('copyright_contracts')
          .select('*')
          .eq('registration_id', regData.id)
          .maybeSingle();

        if (contractError && contractError.code !== 'PGRST116') throw contractError;
        setContract(contractData);

        // Load works
        const { data: worksData, error: worksError } = await supabase
          .from('copyright_registration_works')
          .select('*')
          .eq('registration_id', regData.id)
          .order('created_at', { ascending: false });

        if (worksError) throw worksError;
        setWorks(worksData || []);
      }
    } catch (err: any) {
      console.error('Error loading dashboard data:', err);
      setError(err.message || 'Gagal memuat data dashboard');
    } finally {
      setLoading(false);
    }
  }

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      draft: { label: 'Draft', variant: 'secondary' },
      awaiting_payment: { label: 'Menunggu Pembayaran', variant: 'outline' },
      paid_pending_review: { label: 'Menunggu Review', variant: 'outline' },
      in_review: { label: 'Sedang Direview', variant: 'default' },
      revision_requested: { label: 'Perlu Revisi', variant: 'destructive' },
      approved: { label: 'Disetujui', variant: 'default' },
      rejected: { label: 'Ditolak', variant: 'destructive' },
      contract_generated: { label: 'Kontrak Dibuat', variant: 'default' },
      stamping_pending: { label: 'Proses Meterai', variant: 'outline' },
      stamped: { label: 'Sudah Bermeterai', variant: 'default' },
      contract_signed: { label: 'Kontrak Ditandatangani', variant: 'default' },
      active: { label: 'Aktif', variant: 'default' },
    };

    const config = statusMap[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getContractStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      draft: { label: 'Draft', variant: 'secondary' },
      generated: { label: 'Dibuat', variant: 'default' },
      stamping_pending: { label: 'Proses Meterai', variant: 'outline' },
      stamped: { label: 'Bermeterai', variant: 'default' },
      signed: { label: 'Ditandatangani', variant: 'default' },
      active: { label: 'Aktif', variant: 'default' },
      void: { label: 'Batal', variant: 'destructive' },
    };

    const config = statusMap[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const totalRoyalties = royalties.reduce((sum, r) => sum + Number(r.total_net_royalti), 0);
  const latestRoyalty = royalties[0];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Dashboard Hak Cipta</h1>
            <p className="text-muted-foreground mt-1">Kelola hak cipta dan royalti Anda</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-8 w-24 mt-2" />
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dashboard Hak Cipta</h1>
            <p className="text-muted-foreground mt-1">
              {profile?.composer_code ? `Composer Code: ${profile.composer_code}` : 'Kelola hak cipta dan royalti Anda'}
            </p>
          </div>
          {!registration && (
            <Button onClick={() => navigate('/dashboard/copyright-registration')}>
              <FileText className="mr-2 h-4 w-4" />
              Daftar Hak Cipta
            </Button>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Total Royalties */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Royalti</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalRoyalties)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {royalties.length} periode
              </p>
            </CardContent>
          </Card>

          {/* Latest Period */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Royalti Terbaru</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {latestRoyalty ? formatCurrency(Number(latestRoyalty.total_net_royalti)) : '-'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {latestRoyalty ? `Periode ${latestRoyalty.period}` : 'Belum ada data'}
              </p>
            </CardContent>
          </Card>

          {/* Registered Works */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Karya Terdaftar</CardTitle>
              <Music className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{works.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {registration?.status === 'active' ? 'Terlindungi' : 'Dalam proses'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Registration Status */}
        {registration && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Status Pendaftaran</CardTitle>
                  <CardDescription>Informasi pendaftaran hak cipta Anda</CardDescription>
                </div>
                {getStatusBadge(registration.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Nama Legal</p>
                  <p className="text-sm mt-1">{registration.legal_name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Composer Code</p>
                  <p className="text-sm mt-1">{registration.composer_code || '-'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tanggal Pendaftaran</p>
                  <p className="text-sm mt-1">
                    {new Date(registration.created_at).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                {registration.approved_at && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Tanggal Disetujui</p>
                    <p className="text-sm mt-1">
                      {new Date(registration.approved_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                )}
              </div>

              {/* Contract Info */}
              {contract && (
                <>
                  <Separator />
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold">Informasi Kontrak</h3>
                      {getContractStatusBadge(contract.status)}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Nomor Kontrak</p>
                        <p className="text-sm mt-1 font-mono">{contract.contract_number}</p>
                      </div>
                      {contract.signed_at && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Tanggal Ditandatangani</p>
                          <p className="text-sm mt-1">
                            {new Date(contract.signed_at).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                      )}
                    </div>
                    {contract.stamped_pdf_url && (
                      <div className="mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(contract.stamped_pdf_url!, '_blank')}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download Kontrak
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Royalty History */}
        {royalties.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Riwayat Royalti</CardTitle>
              <CardDescription>Royalti Anda per periode</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {royalties.map((royalty) => (
                  <div key={royalty.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium">Periode {royalty.period}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(royalty.created_at).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{formatCurrency(Number(royalty.total_net_royalti))}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Registered Works */}
        {works.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Karya Terdaftar</CardTitle>
              <CardDescription>Daftar karya yang Anda daftarkan</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {works.map((work) => (
                  <div key={work.id} className="flex items-start justify-between border-b pb-4 last:border-0 last:pb-0">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <Music className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium">{work.title}</p>
                        {work.is_collaboration && (
                          <Badge variant="outline" className="text-xs">Kolaborasi</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p>Pencipta: {work.composer_name}</p>
                        {work.lyricist_name && <p>Penulis Lirik: {work.lyricist_name}</p>}
                        <p>Kepemilikan: {work.ownership_percentage}%</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={work.release_status === 'released' ? 'default' : 'secondary'}>
                        {work.release_status === 'released' ? 'Dirilis' : 'Belum Dirilis'}
                      </Badge>
                      {work.release_date && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(work.release_date).toLocaleDateString('id-ID')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!registration && royalties.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Belum Ada Pendaftaran</h3>
              <p className="text-sm text-muted-foreground text-center mb-4 max-w-md">
                Anda belum mendaftarkan karya Anda untuk perlindungan hak cipta.
                Mulai proses pendaftaran sekarang untuk melindungi karya Anda.
              </p>
              <Button onClick={() => navigate('/dashboard/copyright-registration')}>
                <FileText className="mr-2 h-4 w-4" />
                Mulai Pendaftaran
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}