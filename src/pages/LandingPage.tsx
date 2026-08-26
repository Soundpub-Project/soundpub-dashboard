import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Music, 
  Search, 
  Play, 
  Disc3, 
  LogIn,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface CatalogTrack {
  id: string;
  title: string;
  artist_name: string;
  isrc: string | null;
  genre: string | null;
  audio_url: string | null;
  clip_url: string | null;
  duration: number | null;
}

interface CatalogRelease {
  id: string;
  title: string;
  artist_name: string;
  cover_url: string | null;
  genre: string | null;
  release_type: string | null;
  release_date: string | null;
  upc: string | null;
  tracks: CatalogTrack[];
}

interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [releases, setReleases] = useState<CatalogRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [pagination, setPagination] = useState<PaginationInfo>({
    total: 0,
    limit: 12,
    offset: 0,
    hasMore: false
  });

  useEffect(() => {
    fetchCatalog();
  }, [pagination.offset]);

  const fetchCatalog = async (search?: string) => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
      });
      
      if (search) {
        params.append('search', search);
      }

      const { data, error } = await supabase.functions.invoke('get-catalog-tracks', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (error) throw error;
      
      if (data?.success) {
        setReleases(data.data || []);
        setPagination(prev => ({
          ...prev,
          total: data.pagination?.total || 0,
          hasMore: data.pagination?.hasMore || false
        }));
      }
    } catch (error) {
      console.error('Error fetching catalog:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, offset: 0 }));
    fetchCatalog(searchQuery);
  };

  const handlePrevPage = () => {
    setPagination(prev => ({
      ...prev,
      offset: Math.max(0, prev.offset - prev.limit)
    }));
  };

  const handleNextPage = () => {
    setPagination(prev => ({
      ...prev,
      offset: prev.offset + prev.limit
    }));
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;
  const totalPages = Math.ceil(pagination.total / pagination.limit);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Disc3 className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">Soundpub</span>
          </div>
          
          <div className="flex items-center gap-4">
            {user ? (
              <Button onClick={() => navigate('/dashboard')}>
                Dashboard
              </Button>
            ) : (
              <Button onClick={() => navigate('/auth')} variant="outline">
                <LogIn className="h-4 w-4 mr-2" />
                Masuk
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 md:py-24 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Katalog Musik <span className="text-primary">Soundpub</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Jelajahi koleksi musik terbaru dari artis-artis terbaik kami
          </p>
          
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="max-w-lg mx-auto flex gap-2">
            <Input
              type="text"
              placeholder="Cari judul atau artis..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <Button type="submit">
              <Search className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </section>

      {/* Catalog Section */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              <Music className="h-6 w-6" />
              Rilisan Terbaru
            </h2>
            <p className="text-muted-foreground">
              {pagination.total} rilisan ditemukan
            </p>
          </div>

          {/* Releases Grid */}
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="aspect-square" />
                  <CardContent className="p-3">
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-3 w-2/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : releases.length === 0 ? (
            <div className="text-center py-16">
              <Disc3 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-xl text-muted-foreground">Tidak ada rilisan yang ditemukan</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {releases.map((release) => (
                <Card key={release.id} className="overflow-hidden group hover:shadow-lg transition-shadow">
                  <div className="aspect-square relative bg-muted">
                    {release.cover_url ? (
                      <img
                        src={release.cover_url}
                        alt={release.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc3 className="h-12 w-12 text-muted-foreground" />
                      </div>
                    )}
                    {/* Play overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button size="icon" variant="secondary" className="rounded-full">
                        <Play className="h-6 w-6" />
                      </Button>
                    </div>
                  </div>
                  <CardContent className="p-3">
                    <h3 className="font-medium truncate" title={release.title}>
                      {release.title}
                    </h3>
                    <p className="text-sm text-muted-foreground truncate" title={release.artist_name}>
                      {release.artist_name}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      {release.genre && (
                        <Badge variant="secondary" className="text-xs">
                          {release.genre}
                        </Badge>
                      )}
                      {release.tracks && (
                        <span className="text-xs text-muted-foreground">
                          {release.tracks.length} trek
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <Button
                variant="outline"
                onClick={handlePrevPage}
                disabled={pagination.offset === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Sebelumnya
              </Button>
              <span className="text-sm text-muted-foreground">
                Halaman {currentPage} dari {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={handleNextPage}
                disabled={!pagination.hasMore}
              >
                Selanjutnya
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 mt-auto">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Soundpub. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
