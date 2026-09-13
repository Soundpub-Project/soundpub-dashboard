import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Music, Search, Loader2, Pause, Play, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Track {
  id: string;
  isrc: string;
  title: string;
  artist_name: string;
  artist_user_id: string | null;
  genre: string | null;
  composer: string | null;
  audio_url: string | null;
  created_at: string;
  release_id: string;
}

interface Release {
  id: string;
  title: string;
  label_id: string;
}

interface LabelInfo {
  id: string;
  full_name: string;
}

const PAGE_SIZE_OPTIONS = [
  { value: '10', label: '10' },
  { value: '20', label: '20' },
  { value: '50', label: '50' },
  { value: '100', label: '100' },
  { value: 'all', label: 'Semua' },
];

const hasAudioFile = (track: Track) => Boolean(track.audio_url?.trim());

export default function Tracks() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [labels, setLabels] = useState<LabelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Filters
  const [artistFilter, setArtistFilter] = useState<string>('all');
  const [genreFilter, setGenreFilter] = useState<string>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<string>('10');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [tracksRes, releasesRes] = await Promise.all([
        supabase
          .from('tracks')
          .select('*')
          .not('audio_url', 'is', null)
          .order('created_at', { ascending: false }),
        supabase.from('releases').select('id, title, label_id'),
      ]);

      if (tracksRes.error) throw tracksRes.error;
      if (releasesRes.error) throw releasesRes.error;

      setTracks((tracksRes.data || []).filter(hasAudioFile));
      setReleases(releasesRes.data || []);

      // Fetch labels
      const labelIds = [...new Set((releasesRes.data || []).map(r => r.label_id))];
      if (labelIds.length > 0) {
        const { data: labelsData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', labelIds);
        if (labelsData) setLabels(labelsData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayTrack = async (track: Track) => {
    const audio = audioRef.current;
    if (!audio || !track.audio_url) return;

    if (activeTrackId === track.id) {
      if (audio.paused) {
        await audio.play();
      } else {
        audio.pause();
      }
      return;
    }

    audio.src = track.audio_url;
    setActiveTrackId(track.id);

    try {
      await audio.play();
    } catch (error) {
      console.error('Error playing track:', error);
      setActiveTrackId(null);
      setIsPlaying(false);
    }
  };

  const getRelease = (releaseId: string) => {
    return releases.find(r => r.id === releaseId);
  };

  const getLabelName = (releaseId: string) => {
    const release = getRelease(releaseId);
    if (!release) return '-';
    const label = labels.find(l => l.id === release.label_id);
    return label?.full_name || '-';
  };

  // Get unique values for filters
  const uniqueArtists = useMemo(() => {
    return [...new Set(tracks.map(t => t.artist_name))].filter(Boolean).sort();
  }, [tracks]);

  const uniqueGenres = useMemo(() => {
    return [...new Set(tracks.map(t => t.genre).filter(Boolean))] as string[];
  }, [tracks]);

  // Safe filtering with null checks
  const filteredTracks = useMemo(() => {
    return tracks.filter((track) => {
      // Safely handle search with null checks
      const title = track.title || '';
      const artistName = track.artist_name || '';
      const isrc = track.isrc || '';
      const searchLower = searchTerm.toLowerCase();

      const matchesSearch = 
        title.toLowerCase().includes(searchLower) ||
        artistName.toLowerCase().includes(searchLower) ||
        isrc.toLowerCase().includes(searchLower);

      const matchesArtist = artistFilter === 'all' || track.artist_name === artistFilter;
      const matchesGenre = genreFilter === 'all' || track.genre === genreFilter;

      return matchesSearch && matchesArtist && matchesGenre;
    });
  }, [tracks, searchTerm, artistFilter, genreFilter]);

  // Pagination logic
  const paginatedTracks = useMemo(() => {
    if (pageSize === 'all') return filteredTracks;
    const size = parseInt(pageSize);
    const start = (currentPage - 1) * size;
    return filteredTracks.slice(start, start + size);
  }, [filteredTracks, currentPage, pageSize]);

  const totalPages = useMemo(() => {
    if (pageSize === 'all') return 1;
    return Math.ceil(filteredTracks.length / parseInt(pageSize));
  }, [filteredTracks.length, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, artistFilter, genreFilter, pageSize]);

  const hasActiveFilters = artistFilter !== 'all' || genreFilter !== 'all';

  const clearFilters = () => {
    setArtistFilter('all');
    setGenreFilter('all');
  };

  const renderPaginationItems = () => {
    const items = [];
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      items.push(
        <PaginationItem key={i}>
          <PaginationLink
            onClick={() => setCurrentPage(i)}
            isActive={currentPage === i}
            className="cursor-pointer"
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }
    return items;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <audio
          ref={audioRef}
          className="hidden"
          onEnded={() => {
            setActiveTrackId(null);
            setIsPlaying(false);
          }}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
        />
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Tracks</h1>
          <p className="text-muted-foreground">Daftar semua lagu Anda</p>
        </div>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle>Daftar Tracks</CardTitle>
                  <CardDescription>{filteredTracks.length} total tracks</CardDescription>
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

              {/* Filters Row */}
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                
                <Select value={artistFilter} onValueChange={setArtistFilter}>
                  <SelectTrigger className="w-[180px] h-9">
                    <SelectValue placeholder="Artist" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Artist</SelectItem>
                    {uniqueArtists.map((artist) => (
                      <SelectItem key={artist} value={artist}>
                        {artist}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={genreFilter} onValueChange={setGenreFilter}>
                  <SelectTrigger className="w-[150px] h-9">
                    <SelectValue placeholder="Genre" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Genre</SelectItem>
                    {uniqueGenres.map((genre) => (
                      <SelectItem key={genre} value={genre}>
                        {genre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="h-9 px-2 text-muted-foreground"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}

                <div className="flex-1" />

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Tampilkan:</span>
                  <Select value={pageSize} onValueChange={setPageSize}>
                    <SelectTrigger className="w-[80px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : paginatedTracks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Music className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Belum ada tracks</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Judul</TableHead>
                        <TableHead>Artist</TableHead>
                        <TableHead>Label</TableHead>
                        <TableHead>ISRC</TableHead>
                        <TableHead>Genre</TableHead>
                        <TableHead>Composer</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedTracks.map((track) => (
                        <TableRow key={track.id}>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => void handlePlayTrack(track)}
                              aria-label={isPlaying && activeTrackId === track.id ? `Jeda ${track.title}` : `Putar ${track.title}`}
                            >
                              {isPlaying && activeTrackId === track.id ? (
                                <Pause className="h-4 w-4" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium">{track.title}</TableCell>
                          <TableCell>{track.artist_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {getLabelName(track.release_id)}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{track.isrc || '-'}</TableCell>
                          <TableCell>{track.genre || '-'}</TableCell>
                          <TableCell>{track.composer || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Menampilkan {((currentPage - 1) * parseInt(pageSize)) + 1} - {Math.min(currentPage * parseInt(pageSize), filteredTracks.length)} dari {filteredTracks.length}
                    </p>
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                            className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                          />
                        </PaginationItem>
                        {renderPaginationItems()}
                        <PaginationItem>
                          <PaginationNext
                            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                            className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
