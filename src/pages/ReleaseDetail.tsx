import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Disc3, 
  ArrowLeft, 
  Loader2, 
  Calendar, 
  Music, 
  User, 
  Tag, 
  Barcode,
  Pencil,
  Clock
} from 'lucide-react';
import { ReleaseFormDialog } from '@/components/releases/ReleaseFormDialog';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface Release {
  id: string;
  upc: string;
  title: string;
  artist_name: string;
  release_date: string | null;
  cover_url: string | null;
  genre: string | null;
  release_type: string;
  status: string;
  created_at: string;
  label_id: string;
}

interface Track {
  id: string;
  isrc: string;
  title: string;
  artist_name: string;
  composer: string | null;
  lyricist: string | null;
  genre: string | null;
  lyrics: string | null;
  created_at: string;
}

export default function ReleaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isLabel } = useAuth();
  const [release, setRelease] = useState<Release | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const canManageReleases = isAdmin || isLabel;

  useEffect(() => {
    if (id) {
      fetchReleaseData();
    }
  }, [id]);

  const fetchReleaseData = async () => {
    try {
      setLoading(true);
      
      // Fetch release
      const { data: releaseData, error: releaseError } = await supabase
        .from('releases')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (releaseError) throw releaseError;
      
      if (!releaseData) {
        setRelease(null);
        setLoading(false);
        return;
      }

      setRelease(releaseData);

      // Fetch tracks
      const { data: tracksData, error: tracksError } = await supabase
        .from('tracks')
        .select('*')
        .eq('release_id', id)
        .order('created_at', { ascending: true });

      if (tracksError) throw tracksError;
      setTracks(tracksData || []);
    } catch (error) {
      console.error('Error fetching release:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      active: 'default',
      pending: 'secondary',
      rejected: 'destructive',
      draft: 'outline',
      inactive: 'outline',
    };
    return variants[status] || 'secondary';
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    try {
      return format(new Date(date), 'dd MMMM yyyy', { locale: idLocale });
    } catch {
      return '-';
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!release) {
    return (
      <DashboardLayout>
        <div className="text-center py-20">
          <Disc3 className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h2 className="text-xl font-semibold mb-2">Release Tidak Ditemukan</h2>
          <p className="text-muted-foreground mb-6">
            Release yang Anda cari tidak ada atau sudah dihapus.
          </p>
          <Button onClick={() => navigate('/dashboard/releases')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kembali ke Releases
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/dashboard/releases')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">{release.title}</h1>
              <p className="text-muted-foreground">oleh {release.artist_name}</p>
            </div>
          </div>
          {canManageReleases && (
            <Button className="gradient-primary" onClick={() => setFormOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit Release
            </Button>
          )}
        </div>

        {/* Release Info */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cover & Basic Info */}
          <Card className="bg-card/50 border-border/50 lg:col-span-1">
            <CardContent className="p-6">
              <div className="aspect-square rounded-lg bg-muted flex items-center justify-center overflow-hidden mb-6">
                {release.cover_url ? (
                  <img
                    src={release.cover_url}
                    alt={release.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Disc3 className="h-20 w-20 text-muted-foreground opacity-50" />
                )}
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant={getStatusBadge(release.status)} className="capitalize">
                    {release.status}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {release.release_type}
                  </Badge>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <Barcode className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">UPC:</span>
                    <span className="font-mono">{release.upc}</span>
                  </div>
                  
                  <div className="flex items-center gap-3 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Artist:</span>
                    <span>{release.artist_name}</span>
                  </div>
                  
                  {release.genre && (
                    <div className="flex items-center gap-3 text-sm">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Genre:</span>
                      <span>{release.genre}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Release Date:</span>
                    <span>{formatDate(release.release_date)}</span>
                  </div>
                  
                  <div className="flex items-center gap-3 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Dibuat:</span>
                    <span>{formatDate(release.created_at)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tracks */}
          <Card className="bg-card/50 border-border/50 lg:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Music className="h-5 w-5 text-primary" />
                <CardTitle>Daftar Track</CardTitle>
              </div>
              <CardDescription>
                {tracks.length} track{tracks.length !== 1 ? 's' : ''} dalam release ini
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tracks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Music className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Belum ada track</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Judul</TableHead>
                        <TableHead>ISRC</TableHead>
                        <TableHead>Artist</TableHead>
                        <TableHead>Composer</TableHead>
                        <TableHead>Genre</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tracks.map((track, index) => (
                        <TableRow key={track.id}>
                          <TableCell className="text-muted-foreground">
                            {index + 1}
                          </TableCell>
                          <TableCell className="font-medium">{track.title}</TableCell>
                          <TableCell className="font-mono text-xs">{track.isrc}</TableCell>
                          <TableCell>{track.artist_name}</TableCell>
                          <TableCell>{track.composer || '-'}</TableCell>
                          <TableCell>{track.genre || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Track Details (Lyrics, etc.) */}
        {tracks.some(t => t.lyrics) && (
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle>Lirik</CardTitle>
              <CardDescription>Lirik untuk setiap track</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {tracks.filter(t => t.lyrics).map((track, index) => (
                <div key={track.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-primary">
                      Track {tracks.findIndex(t => t.id === track.id) + 1}:
                    </span>
                    <span className="font-medium">{track.title}</span>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 whitespace-pre-wrap text-sm">
                    {track.lyrics}
                  </div>
                  {index < tracks.filter(t => t.lyrics).length - 1 && <Separator />}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <ReleaseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        release={release}
        onSuccess={fetchReleaseData}
      />
    </DashboardLayout>
  );
}
