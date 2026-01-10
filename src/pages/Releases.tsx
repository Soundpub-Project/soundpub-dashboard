import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Disc3, Search, Plus, Loader2 } from 'lucide-react';

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
}

export default function Releases() {
  const { isAdmin } = useAuth();
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchReleases();
  }, []);

  const fetchReleases = async () => {
    try {
      const { data, error } = await supabase
        .from('releases')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReleases(data || []);
    } catch (error) {
      console.error('Error fetching releases:', error);
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

  const filteredReleases = releases.filter(
    (release) =>
      release.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      release.artist_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      release.upc.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Releases</h1>
            <p className="text-muted-foreground">Kelola album dan single Anda</p>
          </div>
          {isAdmin && (
            <Button className="gradient-primary">
              <Plus className="h-4 w-4 mr-2" />
              Tambah Release
            </Button>
          )}
        </div>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Daftar Releases</CardTitle>
                <CardDescription>
                  {releases.length} total releases
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari release..."
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
            ) : filteredReleases.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Disc3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Belum ada releases</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cover</TableHead>
                      <TableHead>Judul</TableHead>
                      <TableHead>Artist</TableHead>
                      <TableHead>UPC</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Release Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReleases.map((release) => (
                      <TableRow key={release.id}>
                        <TableCell>
                          <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center overflow-hidden">
                            {release.cover_url ? (
                              <img
                                src={release.cover_url}
                                alt={release.title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Disc3 className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{release.title}</TableCell>
                        <TableCell>{release.artist_name}</TableCell>
                        <TableCell className="font-mono text-xs">{release.upc}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {release.release_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadge(release.status)} className="capitalize">
                            {release.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {release.release_date
                            ? new Date(release.release_date).toLocaleDateString('id-ID')
                            : '-'}
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
