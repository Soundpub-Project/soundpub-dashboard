import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Track {
  id: string;
  title: string;
  artist_name: string;
  isrc: string | null;
}

interface ActivateReleaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  release: {
    id: string;
    title: string;
    upc: string | null;
  } | null;
  onSuccess: () => void;
}

export function ActivateReleaseModal({
  open,
  onOpenChange,
  release,
  onSuccess,
}: ActivateReleaseModalProps) {
  const [loading, setLoading] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [upcCode, setUpcCode] = useState('');
  const [trackIsrcCodes, setTrackIsrcCodes] = useState<Record<string, string>>({});
  const [fetchingTracks, setFetchingTracks] = useState(false);

  useEffect(() => {
    if (open && release) {
      setUpcCode(release.upc || '');
      fetchTracks();
    }
  }, [open, release]);

  const fetchTracks = async () => {
    if (!release) return;

    try {
      setFetchingTracks(true);
      const { data, error } = await supabase
        .from('tracks')
        .select('id, title, artist_name, isrc')
        .eq('release_id', release.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setTracks(data || []);
      
      // Initialize ISRC codes with existing values
      const initialIsrcCodes: Record<string, string> = {};
      (data || []).forEach(track => {
        initialIsrcCodes[track.id] = track.isrc || '';
      });
      setTrackIsrcCodes(initialIsrcCodes);
    } catch (error) {
      console.error('Error fetching tracks:', error);
      toast.error('Gagal memuat tracks');
    } finally {
      setFetchingTracks(false);
    }
  };

  const handleActivate = async () => {
    if (!release) return;

    // Validation
    if (!upcCode.trim()) {
      toast.error('UPC Code wajib diisi');
      return;
    }

    // Check all tracks have ISRC
    const missingIsrc = tracks.some(track => !trackIsrcCodes[track.id]?.trim());
    if (missingIsrc) {
      toast.error('Semua track harus memiliki ISRC Code');
      return;
    }

    try {
      setLoading(true);

      // Update release with UPC and status to active
      const { error: releaseError } = await supabase
        .from('releases')
        .update({
          upc: upcCode.trim(),
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', release.id);

      if (releaseError) throw releaseError;

      // Update all tracks with ISRC codes
      for (const track of tracks) {
        const { error: trackError } = await supabase
          .from('tracks')
          .update({
            isrc: trackIsrcCodes[track.id].trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', track.id);

        if (trackError) throw trackError;
      }

      toast.success('Release berhasil diaktifkan');
      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      console.error('Error activating release:', error);
      toast.error(error.message || 'Gagal mengaktifkan release');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setUpcCode('');
    setTrackIsrcCodes({});
    setTracks([]);
  };

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false);
      resetForm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Aktifkan Release
          </DialogTitle>
          <DialogDescription>
            Masukkan UPC Code untuk album dan ISRC Code untuk setiap track
          </DialogDescription>
        </DialogHeader>

        {fetchingTracks ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Release Info */}
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-sm font-medium">{release?.title}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {tracks.length} track{tracks.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* UPC Code Input */}
            <div className="space-y-2">
              <Label htmlFor="upc">
                UPC Code <span className="text-destructive">*</span>
              </Label>
              <Input
                id="upc"
                placeholder="Masukkan UPC Code"
                value={upcCode}
                onChange={(e) => setUpcCode(e.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Universal Product Code untuk album/single ini
              </p>
            </div>

            {/* ISRC Codes for Tracks */}
            {tracks.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Label>ISRC Codes untuk Tracks</Label>
                  <span className="text-destructive text-sm">*</span>
                </div>
                
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                  {tracks.map((track, index) => (
                    <div
                      key={track.id}
                      className="rounded-lg border bg-card p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            Track {index + 1}: {track.title}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {track.artist_name}
                          </p>
                        </div>
                      </div>
                      <Input
                        placeholder="Masukkan ISRC Code"
                        value={trackIsrcCodes[track.id] || ''}
                        onChange={(e) =>
                          setTrackIsrcCodes({
                            ...trackIsrcCodes,
                            [track.id]: e.target.value,
                          })
                        }
                        disabled={loading}
                        className="text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tracks.length === 0 && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-900">
                    Tidak ada track
                  </p>
                  <p className="text-sm text-yellow-700 mt-1">
                    Release ini belum memiliki track. Tambahkan track terlebih dahulu.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={loading}
          >
            Batal
          </Button>
          <Button
            onClick={handleActivate}
            disabled={loading || fetchingTracks || tracks.length === 0}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Aktifkan Release
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
