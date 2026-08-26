import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Disc3, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ReleaseFormPage } from '@/components/releases/ReleaseFormPage';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

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
  label_id: string;
}

export default function ReleaseEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isArtist, isLabel, isWhitelabel, user } = useAuth();
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const loadRelease = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('releases')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error('Error loading release:', error);
      }
      setRelease(data || null);
      setLoading(false);
    };

    loadRelease();
  }, [id]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!release) {
    return (
      <DashboardLayout>
        <div className="py-20 text-center">
          <Disc3 className="mx-auto mb-4 h-16 w-16 text-muted-foreground opacity-50" />
          <h1 className="text-xl font-semibold">Release Tidak Ditemukan</h1>
          <p className="mt-2 text-muted-foreground">Release tidak tersedia atau sudah dihapus.</p>
          <Button className="mt-6" onClick={() => navigate('/dashboard/releases')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Kembali ke Releases
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const isPendingOrDraft = release.status === 'pending' || release.status === 'draft';
  const isOwnRelease = isArtist && (
    release.artist_user_id === user?.id ||
    (!release.artist_user_id && release.artist_name === user?.user_metadata?.full_name)
  );
  const canFullyEdit = isAdmin || ((isLabel || isWhitelabel) && isPendingOrDraft) || (isOwnRelease && isPendingOrDraft);
  const lyricsOnlyMode = (isLabel || isWhitelabel) && release.status === 'active';

  if (!canFullyEdit && !lyricsOnlyMode) {
    return (
      <DashboardLayout>
        <div className="py-20 text-center">
          <h1 className="text-xl font-semibold">Release Tidak Dapat Diedit</h1>
          <p className="mt-2 text-muted-foreground">Status atau role Anda tidak mengizinkan perubahan pada release ini.</p>
          <Button className="mt-6" onClick={() => navigate(`/dashboard/releases/${release.id}`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Kembali ke Detail Release
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const handleClose = () => navigate(`/dashboard/releases/${release.id}`);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={handleClose} aria-label="Kembali ke detail release">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              {lyricsOnlyMode ? 'Edit Lyrics' : 'Edit Release'}
            </h1>
            <p className="text-muted-foreground">{release.title} — {release.artist_name}</p>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/70 shadow-sm">
          <div className="p-4 md:p-6">
            <ReleaseFormPage
              open
              onOpenChange={(open) => {
                if (!open) handleClose();
              }}
              release={release}
              onSuccess={handleClose}
              lyricsOnlyMode={lyricsOnlyMode}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
