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
import { Music, Search, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Track {
  id: string;
  isrc: string;
  title: string;
  artist_name: string;
  genre: string | null;
  composer: string | null;
  audio_url: string | null;
  created_at: string;
}

export default function Tracks() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchTracks();
  }, []);

  const fetchTracks = async () => {
    try {
      const { data, error } = await supabase
        .from('tracks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTracks(data || []);
    } catch (error) {
      console.error('Error fetching tracks:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTracks = tracks.filter(
    (track) =>
      track.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      track.artist_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      track.isrc.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Tracks</h1>
          <p className="text-muted-foreground">Daftar semua lagu Anda</p>
        </div>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Daftar Tracks</CardTitle>
                <CardDescription>{tracks.length} total tracks</CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari track..."
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
            ) : filteredTracks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Music className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Belum ada tracks</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Judul</TableHead>
                      <TableHead>Artist</TableHead>
                      <TableHead>ISRC</TableHead>
                      <TableHead>Genre</TableHead>
                      <TableHead>Composer</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTracks.map((track) => (
                      <TableRow key={track.id}>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={!track.audio_url}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium">{track.title}</TableCell>
                        <TableCell>{track.artist_name}</TableCell>
                        <TableCell className="font-mono text-xs">{track.isrc}</TableCell>
                        <TableCell>{track.genre || '-'}</TableCell>
                        <TableCell>{track.composer || '-'}</TableCell>
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
