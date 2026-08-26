import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
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
  Clock,
  Building2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  Download,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface LabelInfo {
  id: string;
  full_name: string;
  email: string;
}

interface Release {
  id: string;
  upc: string;
  title: string;
  artist_name: string;
  artist_user_id: string | null;
  release_date: string | null;
  cover_url: string | null;
  genre: string | null;
  release_type: string;
  status: string;
  created_at: string;
  label_id: string;
  rejection_reason: string | null;
}

interface Track {
  id: string;
  isrc: string;
  title: string;
  artist_name: string;
  artist_user_id: string | null;
  composer: string | null;
  lyricist: string | null;
  genre: string | null;
  lyrics: string | null;
  created_at: string;
  audio_url: string | null;
  clip_url: string | null;
}

export default function ReleaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isLabel, isWhitelabel, isArtist, user } = useAuth();
  const [release, setRelease] = useState<Release | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [labelInfo, setLabelInfo] = useState<LabelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Audio player state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const canManageReleases = isAdmin || isLabel || isWhitelabel;
  
  // Determine edit capability based on status
  // - Admin: can always fully edit
  // - Label/Whitelabel: 
  //   - pending/draft status: can fully edit
  //   - active status: can only edit lyrics
  // - Artist: can edit their own pending/draft releases
  const isPendingOrDraft = release?.status === 'pending' || release?.status === 'draft';
  const isOwnRelease = isArtist && release && (
    release.artist_user_id === user?.id || 
    (!release.artist_user_id && release.artist_name === user?.user_metadata?.full_name)
  );
  const isLocked = release?.status === 'pending_paid' || release?.status === 'active';
  const canFullyEdit = isAdmin || ((isLabel || isWhitelabel) && isPendingOrDraft) || (isOwnRelease && isPendingOrDraft);
  const canEditLyricsOnly = (isLabel || isWhitelabel) && release?.status === 'active';
  
  // Get tracks with audio
  const tracksWithAudio = tracks.filter(t => t.audio_url);

  useEffect(() => {
    if (id) {
      fetchReleaseData();
    }
  }, [id]);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => {
      // Play next track if available
      if (currentTrackIndex !== null && currentTrackIndex < tracksWithAudio.length - 1) {
        playTrack(currentTrackIndex + 1);
      } else {
        setIsPlaying(false);
        setCurrentTrackIndex(null);
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentTrackIndex, tracksWithAudio.length]);

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

      // Fetch label info - use royalties table to get label name if artist can't see profiles
      // First try to fetch from profiles
      const { data: labelData, error: labelError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', releaseData.label_id)
        .maybeSingle();

      if (!labelError && labelData) {
        setLabelInfo(labelData);
      } else {
        // For artists who can't see label profiles due to RLS,
        // try to get label name from royalties table
        const { data: royaltyData } = await supabase
          .from('royalties')
          .select('label_name')
          .limit(1);
        
        if (royaltyData && royaltyData.length > 0) {
          // Use the label_name from royalties as a fallback
          setLabelInfo({
            id: releaseData.label_id,
            full_name: royaltyData[0].label_name,
            email: ''
          });
        } else {
          // Last resort: check if current user has parent_label_id
          const { data: currentUserProfile } = await supabase
            .from('profiles')
            .select('parent_label_id')
            .eq('id', releaseData.label_id)
            .maybeSingle();
          
          // If still no data, try to get parent label info
          if (currentUserProfile?.parent_label_id) {
            const { data: parentLabel } = await supabase
              .from('profiles')
              .select('id, full_name, email')
              .eq('id', currentUserProfile.parent_label_id)
              .maybeSingle();
            
            if (parentLabel) {
              setLabelInfo(parentLabel);
            }
          }
        }
      }

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

  const playTrack = (index: number) => {
    const track = tracksWithAudio[index];
    if (!track?.audio_url || !audioRef.current) return;

    audioRef.current.src = track.audio_url;
    audioRef.current.play();
    setCurrentTrackIndex(index);
    setIsPlaying(true);
  };

  const togglePlayPause = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (currentTrackIndex === null && tracksWithAudio.length > 0) {
        playTrack(0);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const playPrevious = () => {
    if (currentTrackIndex !== null && currentTrackIndex > 0) {
      playTrack(currentTrackIndex - 1);
    }
  };

  const playNext = () => {
    if (currentTrackIndex !== null && currentTrackIndex < tracksWithAudio.length - 1) {
      playTrack(currentTrackIndex + 1);
    }
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.volume = volume || 1;
        setIsMuted(false);
      } else {
        audioRef.current.volume = 0;
        setIsMuted(true);
      }
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const currentPlayingTrack = currentTrackIndex !== null ? tracksWithAudio[currentTrackIndex] : null;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      active: 'default',
      pending: 'secondary',
      pending_paid: 'default',
      processing: 'secondary',
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
          {(canManageReleases || isArtist) && (canFullyEdit || canEditLyricsOnly) && (
            <Button className="gradient-primary" onClick={() => navigate(`/dashboard/releases/${release.id}/edit`)}>
              <Pencil className="h-4 w-4 mr-2" />
              {canEditLyricsOnly ? 'Edit Lyrics' : 'Edit Release'}
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

                {/* Display rejection reason if status is rejected */}
                {release.status === 'rejected' && release.rejection_reason && (
                  <div className="mt-4 p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Badge variant="destructive" className="mt-0.5">Alasan Penolakan</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{release.rejection_reason}</p>
                  </div>
                )}

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <Barcode className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">UPC:</span>
                    <span className="font-mono">{release.upc || '-'}</span>
                  </div>
                  
                  <div className="flex items-center gap-3 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Artist:</span>
                    <span>{release.artist_name}</span>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Label:</span>
                    <span className="font-medium text-primary">
                      {labelInfo?.full_name || 'Unknown Label'}
                    </span>
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
                <>
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
                          <TableHead className="w-16">Audio</TableHead>
                          {isAdmin && <TableHead className="w-16">Full Audio</TableHead>}
                          {isAdmin && <TableHead className="w-16">Clip</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tracks.map((track, index) => {
                          const audioIndex = tracksWithAudio.findIndex(t => t.id === track.id);
                          const isCurrentTrack = currentTrackIndex !== null && tracksWithAudio[currentTrackIndex]?.id === track.id;
                          
                          return (
                            <TableRow key={track.id} className={isCurrentTrack ? 'bg-primary/10' : ''}>
                              <TableCell className="text-muted-foreground">
                                {index + 1}
                              </TableCell>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {track.title}
                                  {isCurrentTrack && isPlaying && (
                                    <Music className="h-3 w-3 text-primary animate-pulse" />
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs">{track.isrc || '-'}</TableCell>
                              <TableCell>{track.artist_name}</TableCell>
                              <TableCell>{track.composer || '-'}</TableCell>
                              <TableCell>{track.genre || '-'}</TableCell>
                              <TableCell>
                                {track.audio_url ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => {
                                      if (isCurrentTrack && isPlaying) {
                                        togglePlayPause();
                                      } else {
                                        playTrack(audioIndex);
                                      }
                                    }}
                                  >
                                    {isCurrentTrack && isPlaying ? (
                                      <Pause className="h-4 w-4" />
                                    ) : (
                                      <Play className="h-4 w-4" />
                                    )}
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              {isAdmin && (
                                <TableCell>
                                  {track.audio_url ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => {
                                        const link = document.createElement('a');
                                        link.href = track.audio_url!;
                                        link.download = `${track.title} - ${track.artist_name}.mp3`;
                                        link.target = '_blank';
                                        link.click();
                                      }}
                                      title="Download full audio"
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                              )}
                              {isAdmin && (
                                <TableCell>
                                  {track.clip_url ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => {
                                        const link = document.createElement('a');
                                        link.href = track.clip_url!;
                                        link.download = `${track.title} - ${track.artist_name} (clip).mp3`;
                                        link.target = '_blank';
                                        link.click();
                                      }}
                                      title="Download audio clip"
                                    >
                                      <Download className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Audio Player */}
                  {tracksWithAudio.length > 0 && (
                    <div className="mt-6 p-4 rounded-lg bg-muted/50 border">
                      <audio ref={audioRef} className="hidden" />
                      
                      <div className="flex flex-col gap-3">
                        {/* Track Info */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded bg-primary/20 flex items-center justify-center">
                              <Music className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">
                                {currentPlayingTrack?.title || 'Tidak ada track yang dipilih'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {currentPlayingTrack?.artist_name || 'Pilih track untuk memutar'}
                              </p>
                            </div>
                          </div>
                          
                          {/* Volume Control */}
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleMute}>
                              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                            </Button>
                            <Slider
                              value={[isMuted ? 0 : volume]}
                              max={1}
                              step={0.1}
                              onValueChange={handleVolumeChange}
                              className="w-20"
                            />
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-10">
                            {formatTime(currentTime)}
                          </span>
                          <Slider
                            value={[currentTime]}
                            max={duration || 100}
                            step={1}
                            onValueChange={handleSeek}
                            className="flex-1"
                            disabled={!currentPlayingTrack}
                          />
                          <span className="text-xs text-muted-foreground w-10">
                            {formatTime(duration)}
                          </span>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={playPrevious}
                            disabled={currentTrackIndex === null || currentTrackIndex === 0}
                          >
                            <SkipBack className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="default"
                            size="icon"
                            className="h-10 w-10"
                            onClick={togglePlayPause}
                            disabled={tracksWithAudio.length === 0}
                          >
                            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={playNext}
                            disabled={currentTrackIndex === null || currentTrackIndex >= tracksWithAudio.length - 1}
                          >
                            <SkipForward className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
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
    </DashboardLayout>
  );
}


