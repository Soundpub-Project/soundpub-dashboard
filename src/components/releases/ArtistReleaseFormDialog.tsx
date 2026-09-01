import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { createXenditInvoice, openXenditInvoice } from '@/lib/xendit';
import { buildCoverStoragePath } from '@/lib/storagePaths';
import { toast } from 'sonner';
import { z } from 'zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Loader2, 
  Plus, 
  Trash2, 
  Music, 
  ImageIcon,
  AlertTriangle,
  Beaker,
  Lock,
  UserCog
} from 'lucide-react';

// Genre list
const GENRE_LIST = [
  'Pop', 'Rock', 'Hip-Hop', 'R&B', 'Jazz', 'Classical', 'Electronic', 
  'Dance', 'Country', 'Folk', 'Reggae', 'Blues', 'Metal', 'Punk', 
  'Alternative', 'Indie', 'Soul', 'Funk', 'Latin', 'World', 
  'Dangdut', 'Koplo', 'Keroncong', 'Gamelan', 'Campursari'
];

const trackSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Judul wajib diisi'),
  composer: z.string().optional(),
  lyricist: z.string().optional(),
  genre: z.string().optional(),
  lyrics: z.string().optional(),
  explicit_lyrics: z.boolean().default(false),
});

const releaseFormSchema = z.object({
  title: z.string().min(1, 'Judul wajib diisi').max(200, 'Judul maksimal 200 karakter'),
  artist_name: z.string().min(1, 'Nama artist wajib diisi').max(200, 'Nama artist maksimal 200 karakter'),
  release_type: z.string().min(1, 'Tipe release wajib dipilih'),
  genre: z.string().optional(),
  release_date: z.string().optional(),
  tracks: z.array(trackSchema).min(1, 'Minimal 1 track wajib ditambahkan'),
});

type ReleaseFormValues = z.infer<typeof releaseFormSchema>;

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
  release_id: string;
  explicit_lyrics?: boolean;
}

interface ArtistReleaseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  release?: Release | null;
  onSuccess: () => void;
}

export function ArtistReleaseFormDialog({
  open,
  onOpenChange,
  release,
  onSuccess,
}: ArtistReleaseFormDialogProps) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [artistProfile, setArtistProfile] = useState<{ artist_name: string } | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditMode = !!release;

  // Fetch artist_profiles when opening
  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('artist_profiles')
        .select('artist_name')
        .eq('user_id', user.id)
        .maybeSingle();
      setArtistProfile(data || null);
      setProfileChecked(true);
    })();
  }, [open, user]);

  const stageName = artistProfile?.artist_name || '';
  const profileIncomplete = profileChecked && !stageName;

  const form = useForm<ReleaseFormValues>({
    resolver: zodResolver(releaseFormSchema),
    defaultValues: {
      title: '',
      artist_name: '',
      release_type: 'single',
      genre: '',
      release_date: '',
      tracks: [
        {
          title: '',
          composer: '',
          lyricist: '',
          genre: '',
          lyrics: '',
          explicit_lyrics: false,
        },
      ],
    },
  });

  const { fields: trackFields, append: appendTrack, remove: removeTrack } = useFieldArray({
    control: form.control,
    name: 'tracks',
  });

  useEffect(() => {
    if (open && release) {
      loadReleaseData();
    } else if (open && !release && stageName) {
      form.reset({
        title: '',
        artist_name: stageName,
        release_type: 'single',
        genre: '',
        release_date: '',
        tracks: [
          {
            title: '',
            composer: '',
            lyricist: '',
            genre: '',
            lyrics: '',
            explicit_lyrics: false,
          },
        ],
      });
      setCoverFile(null);
      setCoverPreview(null);
    }
  }, [open, release, stageName]);

  const loadReleaseData = async () => {
    if (!release) return;

    try {
      const { data: tracks, error } = await supabase
        .from('tracks')
        .select('*')
        .eq('release_id', release.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      form.reset({
        title: release.title,
        artist_name: release.artist_name,
        release_type: release.release_type || 'single',
        genre: release.genre || '',
        release_date: release.release_date || '',
        tracks: tracks && tracks.length > 0
          ? tracks.map((t: Track) => ({
              id: t.id,
              title: t.title,
              composer: t.composer || '',
              lyricist: t.lyricist || '',
              genre: t.genre || '',
              lyrics: t.lyrics || '',
              explicit_lyrics: t.explicit_lyrics || false,
            }))
          : [
              {
                title: '',
                composer: '',
                lyricist: '',
                genre: '',
                lyrics: '',
                explicit_lyrics: false,
              },
            ],
      });

      if (release.cover_url) {
        setCoverPreview(release.cover_url);
      }
    } catch (error) {
      console.error('Error loading release data:', error);
      toast.error('Gagal memuat data release');
    }
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('File harus berupa gambar');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 5MB');
      return;
    }

    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const uploadCover = async (): Promise<string | null> => {
    if (!coverFile) return release?.cover_url || null;

    setUploadingCover(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        throw new Error('Anda harus login terlebih dahulu');
      }
      const userId = sessionData.session.user.id;
      const fileExt = coverFile.name.split('.').pop();
      const filePath = buildCoverStoragePath({
        userId,
        releaseTitle: form.getValues('title'),
        releaseId: release?.id,
        extension: fileExt,
        uploadId: crypto.randomUUID(),
      });

      const { error: uploadError } = await supabase.storage
        .from('release-covers')
        .upload(filePath, coverFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('release-covers')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading cover:', error);
      toast.error('Gagal mengupload cover');
      return null;
    } finally {
      setUploadingCover(false);
    }
  };

  const onSubmit = async (values: ReleaseFormValues) => {
    if (!user || !profile?.parent_label_id) {
      toast.error('Anda harus login dan terhubung dengan label');
      return;
    }

    setLoading(true);
    try {
      const coverUrl = await uploadCover();

      if (isEditMode && release) {
        // Update existing release
        const { error: releaseError } = await supabase
          .from('releases')
          .update({
            title: values.title,
            artist_name: values.artist_name,
            release_type: values.release_type,
            genre: values.genre || null,
            release_date: values.release_date || null,
            cover_url: coverUrl,
          })
          .eq('id', release.id);

        if (releaseError) throw releaseError;

        // Handle tracks update
        const existingTrackIds = values.tracks
          .filter((t) => t.id)
          .map((t) => t.id);

        if (existingTrackIds.length > 0) {
          await supabase
            .from('tracks')
            .delete()
            .eq('release_id', release.id)
            .not('id', 'in', `(${existingTrackIds.join(',')})`);
        }

        for (const track of values.tracks) {
          if (track.id) {
            await supabase
              .from('tracks')
              .update({
                title: track.title,
                artist_name: values.artist_name,
                composer: track.composer || null,
                lyricist: track.lyricist || null,
                genre: track.genre || null,
                lyrics: track.lyrics || null,
                explicit_lyrics: track.explicit_lyrics,
              })
              .eq('id', track.id);
          } else {
            await supabase.from('tracks').insert({
              release_id: release.id,
              title: track.title,
              artist_name: values.artist_name,
              composer: track.composer || null,
              lyricist: track.lyricist || null,
              genre: track.genre || null,
              lyrics: track.lyrics || null,
              explicit_lyrics: track.explicit_lyrics,
            });
          }
        }

        toast.success('Release berhasil diperbarui');
      } else {
        // Create new release with artist_user_id for ID-based matching
        const { data: newRelease, error: releaseError } = await supabase
          .from('releases')
          .insert({
            title: values.title,
            artist_name: values.artist_name,
            artist_user_id: user.id, // NEW: Include artist's user ID for reliable matching
            release_type: values.release_type,
            genre: values.genre || null,
            release_date: values.release_date || null,
            cover_url: coverUrl,
            label_id: profile.parent_label_id,
            created_by: user.id,
            status: 'pending',
          })
          .select('id')
          .single();

        if (releaseError) throw releaseError;

        // Insert tracks with artist_user_id
        for (const track of values.tracks) {
          await supabase.from('tracks').insert({
            release_id: newRelease.id,
            title: track.title,
            artist_name: values.artist_name,
            artist_user_id: user.id, // NEW: Include artist's user ID
            composer: track.composer || null,
            lyricist: track.lyricist || null,
            genre: track.genre || null,
            lyrics: track.lyrics || null,
            explicit_lyrics: track.explicit_lyrics,
          });
        }

        toast.success('Release berhasil dibuat');
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving release:', error);
      toast.error(error.message || 'Gagal menyimpan release');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    const values = form.getValues();
    if (!values.title || !values.artist_name || !values.release_type) {
      toast.error('Judul, artist, dan tipe release wajib diisi');
      return;
    }
    if (!user || !profile?.parent_label_id) {
      toast.error('Profile tidak lengkap');
      return;
    }

    setLoading(true);
    try {
      const coverUrl = await uploadCover();

      const { data: newRelease, error: releaseError } = await supabase
        .from('releases')
        .insert({
          title: values.title,
          artist_name: values.artist_name,
          artist_user_id: user.id,
          release_type: values.release_type,
          genre: values.genre || null,
          release_date: values.release_date || null,
          cover_url: coverUrl,
          label_id: profile.parent_label_id,
          created_by: user.id,
          status: 'draft',
        })
        .select('id')
        .single();

      if (releaseError) throw releaseError;

      for (const track of values.tracks) {
        await supabase.from('tracks').insert({
          release_id: newRelease.id,
          title: track.title,
          artist_name: values.artist_name,
          artist_user_id: user.id,
          composer: track.composer || null,
          lyricist: track.lyricist || null,
          genre: track.genre || null,
          lyrics: track.lyrics || null,
          explicit_lyrics: track.explicit_lyrics,
        });
      }

      toast.success('Release disimpan sebagai draft');
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Gagal menyimpan draft');
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    const isValid = await form.trigger();
    if (!isValid) {
      toast.error('Mohon lengkapi semua field yang wajib diisi');
      return;
    }

    const values = form.getValues();
    if (!user || !profile?.parent_label_id) return;

    setPaymentLoading(true);
    try {
      const coverUrl = await uploadCover();
      let releaseId: string;

      if (isEditMode && release) {
        // Update existing draft release to pending
        const { error: releaseError } = await supabase
          .from('releases')
          .update({
            title: values.title,
            artist_name: values.artist_name,
            release_type: values.release_type,
            genre: values.genre || null,
            release_date: values.release_date || null,
            cover_url: coverUrl,
            status: 'pending',
          })
          .eq('id', release.id);

        if (releaseError) throw releaseError;
        releaseId = release.id;

        // Update tracks
        const existingTrackIds = values.tracks.filter(t => t.id).map(t => t.id);
        if (existingTrackIds.length > 0) {
          await supabase.from('tracks').delete().eq('release_id', release.id).not('id', 'in', `(${existingTrackIds.join(',')})`);
        }
        for (const track of values.tracks) {
          if (track.id) {
            await supabase.from('tracks').update({
              title: track.title,
              artist_name: values.artist_name,
              composer: track.composer || null,
              lyricist: track.lyricist || null,
              genre: track.genre || null,
              lyrics: track.lyrics || null,
              explicit_lyrics: track.explicit_lyrics,
            }).eq('id', track.id);
          } else {
            await supabase.from('tracks').insert({
              release_id: release.id,
              title: track.title,
              artist_name: values.artist_name,
              artist_user_id: user.id,
              composer: track.composer || null,
              lyricist: track.lyricist || null,
              genre: track.genre || null,
              lyrics: track.lyrics || null,
              explicit_lyrics: track.explicit_lyrics,
            });
          }
        }
      } else {
        // Create new release
        const { data: newRelease, error: releaseError } = await supabase
          .from('releases')
          .insert({
            title: values.title,
            artist_name: values.artist_name,
            artist_user_id: user.id,
            release_type: values.release_type,
            genre: values.genre || null,
            release_date: values.release_date || null,
            cover_url: coverUrl,
            label_id: profile.parent_label_id,
            created_by: user.id,
            status: 'pending',
          })
          .select('id')
          .single();

        if (releaseError) throw releaseError;
        releaseId = newRelease.id;

        for (const track of values.tracks) {
          await supabase.from('tracks').insert({
            release_id: newRelease.id,
            title: track.title,
            artist_name: values.artist_name,
            artist_user_id: user.id,
            composer: track.composer || null,
            lyricist: track.lyricist || null,
            genre: track.genre || null,
            lyrics: track.lyrics || null,
            explicit_lyrics: track.explicit_lyrics,
          });
        }
      }

      const invoiceData = await createXenditInvoice(releaseId);
      toast.success('Mengarahkan ke halaman pembayaran...');
      openXenditInvoice(invoiceData.invoice_url);

    } catch (error: any) {
      console.error('Payment error:', error);
      toast.error(error.message || 'Gagal memproses pembayaran');
    } finally {
      setPaymentLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-center gap-2">
            <DialogTitle>
              {isEditMode ? 'Edit Release' : 'Buat Release Baru'}
            </DialogTitle>
            <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
              <Beaker className="h-3 w-3 mr-1" />
              BETA
            </Badge>
          </div>
          <DialogDescription>
            Form sederhana untuk artist. UPC & ISRC akan diisi oleh label.
          </DialogDescription>
        </DialogHeader>

        {/* Beta Notice */}
        <div className="px-6">
          <Alert className="border-amber-500/30 bg-amber-500/5">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-600">
              Fitur ini masih dalam tahap <strong>BETA</strong>. Jika menemukan bug atau masalah, 
              mohon hubungi Team Developer untuk bantuan.
            </AlertDescription>
          </Alert>
        </div>

        {profileIncomplete && !isEditMode ? (
          <div className="px-6 pb-6">
            <Alert className="border-destructive/40 bg-destructive/5">
              <UserCog className="h-4 w-4 text-destructive" />
              <AlertDescription className="space-y-3">
                <p className="text-foreground">
                  <strong>Profile Artis belum lengkap.</strong> Anda harus mengisi nama artis (stage name)
                  di Profile Artis terlebih dahulu sebelum membuat release.
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    navigate('/artist-profile');
                  }}
                >
                  <UserCog className="h-4 w-4 mr-2" />
                  Lengkapi Profile Artis
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <ScrollArea className="max-h-[60vh] px-6">
              <div className="space-y-6 py-4">
                {/* Cover Upload */}
                <div className="space-y-2">
                  <FormLabel>Cover Art</FormLabel>
                  <div className="flex items-start gap-4">
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="w-32 h-32 rounded-lg border-2 border-dashed border-border hover:border-primary/50 cursor-pointer flex items-center justify-center overflow-hidden transition-colors bg-muted/30"
                    >
                      {coverPreview ? (
                        <img
                          src={coverPreview}
                          alt="Cover preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center p-2">
                          <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground" />
                          <p className="text-xs text-muted-foreground mt-1">
                            Click to upload
                          </p>
                        </div>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleCoverChange}
                      className="hidden"
                    />
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>• Format: JPG, PNG, WEBP</p>
                      <p>• Maksimal 5MB</p>
                      <p>• Rekomendasi: 3000x3000px</p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Release Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Judul Release *</FormLabel>
                        <FormControl>
                          <Input placeholder="Nama album/single" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="artist_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          Nama Artist (Main) *
                          <Lock className="h-3 w-3 text-muted-foreground" />
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Nama artist"
                            {...field}
                            disabled
                            className="bg-muted/40"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Diambil dari Profile Artis. Featured artist bisa ditambahkan di bagian artist tambahan.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="release_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipe Release *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih tipe" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="single">Single</SelectItem>
                            <SelectItem value="ep">EP</SelectItem>
                            <SelectItem value="album">Album</SelectItem>
                            <SelectItem value="compilation">Compilation</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="genre"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Genre</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih genre" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {GENRE_LIST.map((genre) => (
                              <SelectItem key={genre} value={genre.toLowerCase()}>
                                {genre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="release_date"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Tanggal Release</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                {/* Tracks */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-base font-semibold">Tracks</FormLabel>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        appendTrack({
                          title: '',
                          composer: '',
                          lyricist: '',
                          genre: '',
                          lyrics: '',
                          explicit_lyrics: false,
                        })
                      }
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Tambah Track
                    </Button>
                  </div>

                  {trackFields.map((field, index) => (
                    <div
                      key={field.id}
                      className="p-4 rounded-lg border bg-muted/20 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Music className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">Track {index + 1}</span>
                        </div>
                        {trackFields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeTrack(index)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name={`tracks.${index}.title`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>Judul Track *</FormLabel>
                              <FormControl>
                                <Input placeholder="Judul lagu" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`tracks.${index}.composer`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Composer</FormLabel>
                              <FormControl>
                                <Input placeholder="Pencipta musik" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`tracks.${index}.lyricist`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Lyricist</FormLabel>
                              <FormControl>
                                <Input placeholder="Penulis lirik" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`tracks.${index}.genre`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Genre Track</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Pilih genre" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {GENRE_LIST.map((genre) => (
                                    <SelectItem key={genre} value={genre.toLowerCase()}>
                                      {genre}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`tracks.${index}.explicit_lyrics`}
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between rounded-lg border p-3 bg-background">
                              <div>
                                <FormLabel className="text-sm">Explicit Lyrics</FormLabel>
                                <p className="text-xs text-muted-foreground">
                                  Konten dewasa
                                </p>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`tracks.${index}.lyrics`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>Lirik (Opsional)</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Masukkan lirik lagu..."
                                  rows={4}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 p-6 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading || paymentLoading}
              >
                Batal
              </Button>
              {isEditMode && release?.status !== 'draft' ? (
                <Button
                  type="submit"
                  disabled={loading || uploadingCover || release?.status === 'pending_paid'}
                  className="gradient-primary"
                >
                  {(loading || uploadingCover) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {release?.status === 'pending_paid' ? 'Terkunci (Sudah Dibayar)' : 'Simpan Perubahan'}
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={isEditMode ? () => form.handleSubmit(onSubmit)() : handleSaveDraft}
                    disabled={loading || paymentLoading || uploadingCover}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      isEditMode ? 'Simpan Perubahan' : 'Simpan Draft'
                    )}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      if (confirm('Pastikan data release sudah benar. Setelah pembayaran, release tidak dapat diedit lagi. Lanjutkan?')) {
                        handlePayment();
                      }
                    }}
                    disabled={loading || paymentLoading || uploadingCover}
                    className="gradient-primary"
                  >
                    {paymentLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Memproses...
                      </>
                    ) : (
                      'Lanjutkan Pembayaran'
                    )}
                  </Button>
                </>
              )}
            </div>
          </form>
        </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
