import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listArtistDeletionRequests, usesBackendArtistLabels } from '@/services/artists';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface DeletionRequest {
  id: string;
  artist_id?: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  artist?: {
    full_name: string | null;
    email: string | null;
  } | null;
}

const statusLabel: Record<DeletionRequest['status'], string> = {
  pending: 'Menunggu',
  approved: 'Disetujui',
  rejected: 'Ditolak',
};

export default function ArtistDeletionRequests() {
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      setLoadError('');
      setRequests(await listArtistDeletionRequests());
    } catch (error: any) {
      console.error('Error fetching artist deletion requests:', error);
      toast.error(error.message || 'Gagal memuat permintaan hapus artis');
      if (usesBackendArtistLabels()) setLoadError('Permintaan hapus artis backend belum dapat dimuat.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Permintaan Hapus Artis</h1>
          <p className="text-muted-foreground">Pantau status permintaan penghapusan profil artis dari label Anda</p>
          {loadError && <p role="alert">{loadError}</p>}
        </div>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle>Riwayat Permintaan</CardTitle>
            <CardDescription>Permintaan yang sudah dikirim ke Admin untuk ditinjau</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : requests.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Trash2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Belum ada permintaan hapus artis</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Artis</TableHead>
                      <TableHead>Alasan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tanggal Pengajuan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">
                           {request.artist?.full_name || request.artist_id || 'Artis Terhapus'}
                          <div className="text-xs text-muted-foreground">{request.artist?.email}</div>
                        </TableCell>
                        <TableCell className="max-w-xs truncate" title={request.reason || ''}>
                          {request.reason || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              request.status === 'pending'
                                ? 'secondary'
                                : request.status === 'approved'
                                  ? 'default'
                                  : 'destructive'
                            }
                          >
                            {statusLabel[request.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(request.created_at).toLocaleDateString('id-ID')}</TableCell>
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
