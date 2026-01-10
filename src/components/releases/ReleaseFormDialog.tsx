import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
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
import { 
  Loader2, 
  Upload, 
  X, 
  Plus, 
  Trash2, 
  Music, 
  ImageIcon 
} from 'lucide-react';

const trackSchema = z.object({
  id: z.string().optional(),
  isrc: z.string().min(1, 'ISRC wajib diisi'),
  title: z.string().min(1, 'Judul wajib diisi'),
  artist_name: z.string().min(1, 'Nama artist wajib diisi'),
  composer: z.string().optional(),
  lyricist: z.string().optional(),
  genre: z.string().optional(),
  lyrics: z.string().optional(),
});

const releaseFormSchema = z.object({
  upc: z.string().min(1, 'UPC wajib diisi').max(20, 'UPC maksimal 20 karakter'),
  title: z.string().min(1, 'Judul wajib diisi').max(200, 'Judul maksimal 200 karakter'),
  artist_name: z.string().min(1, 'Nama artist wajib diisi').max(200, 'Nama artist maksimal 200 karakter'),
  release_type: z.string().min(1, 'Tipe release wajib dipilih'),
  genre: z.string().optional(),
  release_date: z.string().optional(),
  status: z.string().default('pending'),
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
}

interface ReleaseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  release?: Release | null;
  onSuccess: () => void;
}

export function ReleaseFormDialog({
  open,
  onOpenChange,
  release,
  onSuccess,
}: ReleaseFormDialogProps) {
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditMode = !!release;

  const form = useForm<ReleaseFormValues>({
    resolver: zodResolver(releaseFormSchema),
    defaultValues: {
      upc: '',
      title: '',
      artist_name: '',
      release_type: 'single',
      genre: '',
      release_date: '',
      status: 'pending',
      tracks: [
        {
          isrc: '',
          title: '',
          artist_name: '',
          composer: '',
          lyricist: '',
          genre: '',
          lyrics: '',
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'tracks',
  });

  useEffect(() => {
    if (open && release) {
      loadReleaseData();
    } else if (open && !release) {
      form.reset({
        upc: '',
        title: '',
        artist_name: '',
        release_type: 'single',
        genre: '',
        release_date: '',
        status: 'pending',
        tracks: [
          {
            isrc: '',
            title: '',
            artist_name: '',
            composer: '',
            lyricist: '',
            genre: '',
            lyrics: '',
          },
        ],
      });
      setCoverFile(null);
      setCoverPreview(null);
    }
  }, [open, release]);

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
        upc: release.upc,
        title: release.title,
        artist_name: release.artist_name,
        release_type: release.release_type || 'single',
        genre: release.genre || '',
        release_date: release.release_date || '',
        status: release.status,
        tracks: tracks && tracks.length > 0
          ? tracks.map((t) => ({
              id: t.id,
              isrc: t.isrc,
              title: t.title,
              artist_name: t.artist_name,
              composer: t.composer || '',
              lyricist: t.lyricist || '',
              genre: t.genre || '',
              lyrics: t.lyrics || '',
            }))
          : [
              {
                isrc: '',
                title: '',
                artist_name: '',
                composer: '',
                lyricist: '',
                genre: '',
                lyrics: '',
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

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('File harus berupa gambar');
      return;
    }

    // Validate file size (max 5MB)
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
      const fileExt = coverFile.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `covers/${fileName}`;

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
    if (!user) {
      toast.error('Anda harus login terlebih dahulu');
      return;
    }

    setLoading(true);
    try {
      // Upload cover if there's a new file
      const coverUrl = await uploadCover();

      if (isEditMode && release) {
        // Update existing release
        const { error: releaseError } = await supabase
          .from('releases')
          .update({
            upc: values.upc,
            title: values.title,
            artist_name: values.artist_name,
            release_type: values.release_type,
            genre: values.genre || null,
            release_date: values.release_date || null,
            status: values.status,
            cover_url: coverUrl,
          })
          .eq('id', release.id);

        if (releaseError) throw releaseError;

        // Get existing track IDs
        const existingTrackIds = values.tracks
          .filter((t) => t.id)
          .map((t) => t.id);

        // Delete tracks that are no longer in the form
        const { error: deleteError } = await supabase
          .from('tracks')
          .delete()
          .eq('release_id', release.id)
          .not('id', 'in', `(${existingTrackIds.join(',')})`);

        if (deleteError && existingTrackIds.length > 0) {
          console.error('Error deleting tracks:', deleteError);
        }

        // Upsert tracks
        for (const track of values.tracks) {
          if (track.id) {
            // Update existing track
            const { error } = await supabase
              .from('tracks')
              .update({
                isrc: track.isrc,
                title: track.title,
                artist_name: track.artist_name,
                composer: track.composer || null,
                lyricist: track.lyricist || null,
                genre: track.genre || null,
                lyrics: track.lyrics || null,
              })
              .eq('id', track.id);

            if (error) throw error;
          } else {
            // Insert new track
            const { error } = await supabase.from('tracks').insert({
              release_id: release.id,
              isrc: track.isrc,
              title: track.title,
              artist_name: track.artist_name,
              composer: track.composer || null,
              lyricist: track.lyricist || null,
              genre: track.genre || null,
              lyrics: track.lyrics || null,
            });

            if (error) throw error;
          }
        }

        toast.success('Release berhasil diupdate');
      } else {
        // Create new release
        const { data: newRelease, error: releaseError } = await supabase
          .from('releases')
          .insert({
            upc: values.upc,
            title: values.title,
            artist_name: values.artist_name,
            release_type: values.release_type,
            genre: values.genre || null,
            release_date: values.release_date || null,
            status: values.status,
            cover_url: coverUrl,
            label_id: user.id,
            created_by: user.id,
          })
          .select()
          .single();

        if (releaseError) throw releaseError;

        // Insert tracks
        const tracksToInsert = values.tracks.map((track) => ({
          release_id: newRelease.id,
          isrc: track.isrc,
          title: track.title,
          artist_name: track.artist_name,
          composer: track.composer || null,
          lyricist: track.lyricist || null,
          genre: track.genre || null,
          lyrics: track.lyrics || null,
        }));

        const { error: tracksError } = await supabase
          .from('tracks')
          .insert(tracksToInsert);

        if (tracksError) throw tracksError;

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

  const addTrack = () => {
    append({
      isrc: '',
      title: '',
      artist_name: form.getValues('artist_name'),
      composer: '',
      lyricist: '',
      genre: form.getValues('genre') || '',
      lyrics: '',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>
            {isEditMode ? 'Edit Release' : 'Tambah Release Baru'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Edit informasi release dan tracks'
              : 'Masukkan informasi release dan tracks'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)]">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-6">
              {/* Cover Upload */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Cover Art</label>
                <div className="flex items-start gap-4">
                  <div
                    className="w-32 h-32 rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted/50 cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {coverPreview ? (
                      <img
                        src={coverPreview}
                        alt="Cover preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center p-2">
                        <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-1" />
                        <p className="text-xs text-muted-foreground">
                          Upload Cover
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
                  <div className="flex-1 space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Upload cover art untuk release Anda. Format yang didukung:
                      JPG, PNG, WebP. Maksimal 5MB.
                    </p>
                    {coverPreview && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setCoverFile(null);
                          setCoverPreview(null);
                        }}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Hapus Cover
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Release Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="upc"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>UPC *</FormLabel>
                      <FormControl>
                        <Input placeholder="123456789012" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Judul Release *</FormLabel>
                      <FormControl>
                        <Input placeholder="Album/Single Title" {...field} />
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
                      <FormLabel>Nama Artist *</FormLabel>
                      <FormControl>
                        <Input placeholder="Artist Name" {...field} />
                      </FormControl>
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
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                      >
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
                      <FormControl>
                        <Input placeholder="Pop, Rock, dll" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="release_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tanggal Release</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {isAdmin && (
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <Separator />

              {/* Tracks Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">Tracks</h3>
                    <p className="text-sm text-muted-foreground">
                      Tambahkan track untuk release ini
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addTrack}>
                    <Plus className="h-4 w-4 mr-1" />
                    Tambah Track
                  </Button>
                </div>

                {form.formState.errors.tracks?.root && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.tracks.root.message}
                  </p>
                )}

                <div className="space-y-4">
                  {fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="p-4 rounded-lg border bg-muted/30 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Music className="h-4 w-4 text-primary" />
                          <span className="font-medium">Track {index + 1}</span>
                        </div>
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(index)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name={`tracks.${index}.isrc`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>ISRC *</FormLabel>
                              <FormControl>
                                <Input placeholder="ISRC Code" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`tracks.${index}.title`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Judul Track *</FormLabel>
                              <FormControl>
                                <Input placeholder="Track Title" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`tracks.${index}.artist_name`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Artist *</FormLabel>
                              <FormControl>
                                <Input placeholder="Artist Name" {...field} />
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
                              <FormLabel>Genre</FormLabel>
                              <FormControl>
                                <Input placeholder="Genre" {...field} />
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
                                <Input placeholder="Composer" {...field} />
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
                                <Input placeholder="Lyricist" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name={`tracks.${index}.lyrics`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Lyrics</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Masukkan lirik lagu..."
                                className="min-h-[80px]"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  disabled={loading || uploadingCover}
                  className="gradient-primary"
                >
                  {loading || uploadingCover ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Menyimpan...
                    </>
                  ) : isEditMode ? (
                    'Update Release'
                  ) : (
                    'Simpan Release'
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
