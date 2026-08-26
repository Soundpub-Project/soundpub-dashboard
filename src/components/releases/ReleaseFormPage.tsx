import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { 
  Loader2, 
  X, 
  Plus, 
  Trash2, 
  Music, 
  ImageIcon,
  UserPlus,
  ChevronDown
} from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MediaUploadSection } from './MediaUploadSection';
import { ArtistSelector } from './ArtistSelector';
import { ContributorSelector } from './ContributorSelector';
import { createXenditInvoice, openXenditInvoice } from '@/lib/xendit';

// Genre list
const GENRE_LIST = [
  'Pop', 'Rock', 'Hip-Hop', 'R&B', 'Jazz', 'Classical', 'Electronic', 
  'Dance', 'Country', 'Folk', 'Reggae', 'Blues', 'Metal', 'Punk', 
  'Alternative', 'Indie', 'Soul', 'Funk', 'Latin', 'World', 
  'Dangdut', 'Koplo', 'Keroncong', 'Gamelan', 'Campursari'
];

// Artist type options
const ARTIST_TYPES = ['Main Artist', 'Featured Artist'] as const;

// Contributor type options  
const CONTRIBUTOR_TYPES = ['Composer', 'Lyricist', 'Producer', 'Arranger', 'Mixer', 'Mastering Engineer', 'Session Musician', 'Other'] as const;

// Contributor role options
const CONTRIBUTOR_ROLES = ['Primary', 'Additional', 'Featured'] as const;

const artistSchema = z.object({
  name: z.string().min(1, 'Nama artist wajib diisi'),
  type: z.enum(['Main Artist', 'Featured Artist']),
});

const contributorSchema = z.object({
  name: z.string().min(1, 'Nama contributor wajib diisi'),
  type: z.string().min(1, 'Tipe wajib dipilih'),
  role: z.string().min(1, 'Peran wajib dipilih'),
});

const trackSchema = z.object({
  id: z.string().optional(),
  isrc: z.string().optional(),
  title: z.string().min(1, 'Judul wajib diisi'),
  artists: z.array(artistSchema).min(1, 'Minimal 1 artist wajib ditambahkan'),
  composer: z.string().optional(),
  lyricist: z.string().optional(),
  genre: z.string().optional(),
  lyrics: z.string().optional(),
  explicit_lyrics: z.boolean().default(false),
  contributors: z.array(contributorSchema).optional().default([]),
  audio_url: z.string().optional().nullable(),
  clip_url: z.string().optional().nullable(),
  duration: z.number().optional().nullable(),
});

const releaseFormSchema = z.object({
  upc: z.string().max(20, 'UPC maksimal 20 karakter').optional().or(z.literal('')),
  title: z.string().min(1, 'Judul wajib diisi').max(200, 'Judul maksimal 200 karakter'),
  artist_name: z.string().min(1, 'Nama artist wajib diisi').max(200, 'Nama artist maksimal 200 karakter'),
  release_type: z.string().min(1, 'Tipe release wajib dipilih'),
  genre: z.string().optional(),
  release_date: z.string().optional(),
  status: z.string().default('pending'),
  label_id: z.string().optional(),
  tracks: z.array(trackSchema).min(1, 'Minimal 1 track wajib ditambahkan'),
});

type ReleaseFormValues = z.infer<typeof releaseFormSchema>;

interface LabelProfile {
  id: string;
  full_name: string;
  email: string;
}

interface Artist {
  id: string;
  name: string;
  label_id: string;
  user_id?: string; // NEW: Link to profiles.id for artist users
}

interface Release {
  id: string;
  upc: string;
  title: string;
  artist_name: string;
  artist_user_id?: string | null;
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
  artists?: { name: string; type: string }[];
  explicit_lyrics?: boolean;
  contributors?: { name: string; type: string; role: string }[];
  audio_url?: string | null;
  clip_url?: string | null;
  duration?: number | null;
}

interface ReleaseFormPageProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  release?: Release | null;
  onSuccess: () => void;
  lyricsOnlyMode?: boolean;
  onStepChange?: (step: 1 | 2) => void;
}

export function ReleaseFormPage({
  open,
  onOpenChange,
  release,
  onSuccess,
  lyricsOnlyMode = false,
  onStepChange,
}: ReleaseFormPageProps) {
  const { user, isAdmin, isLabel, isWhitelabel, isArtist, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [labels, setLabels] = useState<LabelProfile[]>([]);
  const [loadingLabels, setLoadingLabels] = useState(false);
  const [labelArtists, setLabelArtists] = useState<Artist[]>([]);
  const [loadingArtists, setLoadingArtists] = useState(false);
  const [artistStageName, setArtistStageName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const artistFetchRequestRef = useRef(0);
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [expandedTracks, setExpandedTracks] = useState<Record<number, boolean>>({ 0: true });

  const isEditMode = !!release;
  const areTrackCreditsRequired = isArtist || isLabel;

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
      label_id: '',
      tracks: [
        {
          isrc: '',
          title: '',
          artists: [{ name: '', type: 'Main Artist' }],
          composer: '',
          lyricist: '',
          genre: '',
          lyrics: '',
          explicit_lyrics: false,
          contributors: [],
          audio_url: null,
          clip_url: null,
          duration: null,
        },
      ],
    },
  });

  const { fields: trackFields, append: appendTrack, remove: removeTrack } = useFieldArray({
    control: form.control,
    name: 'tracks',
  });

  // Fetch labels for admin
  useEffect(() => {
    if (open && isAdmin) {
      fetchLabels();
    }
  }, [open, isAdmin]);

  // Fetch artists for label, whitelabel, or artist (using parent_label_id)
  useEffect(() => {
    if (open && (isLabel || isWhitelabel) && user) {
      fetchLabelArtists(user.id);
    } else if (open && isArtist && profile?.parent_label_id) {
      fetchLabelArtists(profile.parent_label_id);
    }
  }, [open, isLabel, isWhitelabel, isArtist, user, profile?.parent_label_id]);

  // Fetch artist stage name from artist_profiles for artist role
  useEffect(() => {
    if (!open || !isArtist || !user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('artist_profiles')
        .select('artist_name')
        .eq('user_id', user.id)
        .maybeSingle();
      const name = data?.artist_name || profile?.full_name || '';
      setArtistStageName(name);
      if (name && !isEditMode) {
        form.setValue('artist_name', name);
      }
    })();
  }, [open, isArtist, user, profile?.full_name, isEditMode]);

  // Fetch artists when label is selected by admin
  const selectedLabelId = form.watch('label_id');
  useEffect(() => {
    if (!open || !isAdmin) return;

    form.setValue('artist_name', '');
    form.setValue('artist_user_id' as any, null);
    setLabelArtists([]);

    if (selectedLabelId) {
      fetchLabelArtists(selectedLabelId);
    } else {
      artistFetchRequestRef.current += 1;
      setLoadingArtists(false);
    }
  }, [open, isAdmin, selectedLabelId]);

  const fetchLabels = async () => {
    setLoadingLabels(true);
    try {
      // Fetch both label and whitelabel roles
      const { data: labelRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['label', 'whitelabel']);

      if (rolesError) throw rolesError;

      if (labelRoles && labelRoles.length > 0) {
        const labelIds = labelRoles.map(r => r.user_id);
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', labelIds);

        if (profilesError) throw profilesError;
        
        // Map role info to profiles for display
        const profilesWithRole = (profiles || []).map(profile => {
          const roleInfo = labelRoles.find(r => r.user_id === profile.id);
          return {
            ...profile,
            full_name: roleInfo?.role === 'whitelabel' 
              ? `${profile.full_name} (Whitelabel)` 
              : profile.full_name
          };
        });
        
        setLabels(profilesWithRole);
      }
    } catch (error) {
      console.error('Error fetching labels:', error);
    } finally {
      setLoadingLabels(false);
    }
  };

  const fetchLabelArtists = async (labelId: string) => {
    const requestId = artistFetchRequestRef.current + 1;
    artistFetchRequestRef.current = requestId;

    setLabelArtists([]);
    setLoadingArtists(true);

    const isStaleRequest = () => {
      if (artistFetchRequestRef.current !== requestId) return true;
      if (isAdmin) return form.getValues('label_id') !== labelId;
      return false;
    };

    try {
      const { data: artistProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, parent_label_id, status')
        .eq('parent_label_id', labelId)
        .order('full_name');

      if (profilesError) throw profilesError;

      const profileArtists = (artistProfiles || [])
        .filter((profile) => !['suspended', 'deleted'].includes(String(profile.status || '').toLowerCase()))
        .map((profile) => ({
          id: profile.id,
          name: profile.full_name,
          label_id: labelId,
          user_id: profile.id,
        }));

      if (!isStaleRequest()) {
        setLabelArtists(profileArtists);
      }
    } catch (error) {
      console.error('Error fetching artists:', error);
      if (!isStaleRequest()) {
        setLabelArtists([]);
      }
    } finally {
      if (!isStaleRequest()) {
        setLoadingArtists(false);
      }
    }
  };
  const findArtistUserIdByName = (artistName: string) => {
    const normalizedName = artistName.toLowerCase().trim();
    return labelArtists.find((artist) => artist.name.toLowerCase().trim() === normalizedName)?.user_id || null;
  };
  // Reset all state when dialog opens or release prop changes
  useEffect(() => {
    if (open) {
      // Always reset cover state first when dialog opens
      setCoverFile(null);
      setCoverPreview(null);
      setCoverError(null);
      
      if (release) {
        loadReleaseData();
      } else {
        // Determine default label_id and artist_name for different roles
        const defaultLabelId = isArtist && profile?.parent_label_id
          ? profile.parent_label_id
          : (isLabel || isWhitelabel) && user ? user.id : '';
        const defaultArtistName = isArtist
          ? (artistStageName || profile?.full_name || '')
          : '';

        form.reset({
          upc: '',
          title: '',
          artist_name: defaultArtistName,
          release_type: 'single',
          genre: '',
          release_date: '',
          status: 'pending',
          label_id: defaultLabelId,
          tracks: [
            {
              isrc: '',
              title: '',
              artists: [{ name: '', type: 'Main Artist' }],
              composer: '',
              lyricist: '',
              genre: '',
              lyrics: '',
              explicit_lyrics: false,
              contributors: [],
              audio_url: null,
              clip_url: null,
              duration: null,
            },
          ],
        });
      }
    } else {
      // Reset everything when dialog closes
      setCoverFile(null);
      setCoverPreview(null);
      setCoverError(null);
      setLabelArtists([]);
    }
  }, [open, release?.id]);

  const loadReleaseData = async () => {
    if (!release) return;

    try {
      const { data: tracks, error } = await supabase
        .from('tracks')
        .select('*')
        .eq('release_id', release.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Reset form with release data - ensure label_id is properly set
      form.reset({
        upc: release.upc || '',
        title: release.title,
        artist_name: release.artist_name,
        release_type: release.release_type || 'single',
        genre: release.genre || '',
        release_date: release.release_date || '',
        status: release.status || 'pending',
        label_id: release.label_id || '',
        tracks: tracks && tracks.length > 0
          ? tracks.map((t: any) => ({
              id: t.id,
              isrc: t.isrc || '',
              title: t.title,
              artists: t.artists && Array.isArray(t.artists) && t.artists.length > 0
                ? t.artists
                : [{ name: t.artist_name, type: 'Main Artist' }],
              composer: t.composer || '',
              lyricist: t.lyricist || '',
              genre: t.genre || '',
              lyrics: t.lyrics || '',
              explicit_lyrics: t.explicit_lyrics || false,
              contributors: t.contributors && Array.isArray(t.contributors) ? t.contributors : [],
              audio_url: t.audio_url || null,
              clip_url: t.clip_url || null,
              duration: t.duration || null,
            }))
          : [
              {
                isrc: '',
                title: '',
                artists: [{ name: '', type: 'Main Artist' }],
                composer: '',
                lyricist: '',
                genre: '',
                lyrics: '',
                explicit_lyrics: false,
                contributors: [],
                audio_url: null,
                clip_url: null,
                duration: null,
              },
            ],
      });

      // Set cover preview from release data (after reset to avoid stale state)
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
    setCoverError(null);
  };

  const validateCover = () => {
    if (lyricsOnlyMode || coverPreview) return true;

    setCoverError('Cover art wajib diupload');
    toast.error('Upload cover art sebelum melanjutkan');
    return false;
  };

  // Upload cover to Supabase Storage
  const uploadCover = async (): Promise<string | null> => {
    if (!coverFile) return release?.cover_url || null;

    setUploadingCover(true);
    try {
      const fileExt = coverFile.name.split('.').pop()?.toLowerCase();
      const bucket = 'release-covers';

      // Get the session from Supabase
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        throw new Error('Anda harus login terlebih dahulu');
      }
      const userId = sessionData.session.user.id;
      const fileName = `${userId}/cover-${Date.now()}.${fileExt}`;

      console.log(`Uploading cover to Supabase Storage bucket: ${bucket}, file: ${fileName}`);

      // Upload file to Supabase Storage
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, coverFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        console.error('Supabase Storage upload error:', error);
        
        // Handle specific error codes
        if (error.message?.includes('row-level security')) {
          throw new Error('Anda tidak memiliki izin untuk upload. Hubungi admin.');
        }
        if (error.message?.includes('duplicate')) {
          throw new Error('File dengan nama yang sama sudah ada.');
        }
        if (error.message?.includes('Payload too large')) {
          throw new Error('Ukuran file terlalu besar. Maksimal 5MB.');
        }
        throw new Error(error.message || 'Gagal mengupload cover');
      }

      console.log('Cover upload successful:', data.path);

      // For private bucket (release-covers), create a signed URL with long expiry
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(data.path, 60 * 60 * 24 * 365); // 1 year expiry

      if (signedUrlError) {
        console.error('Error creating signed URL:', signedUrlError);
        // Fallback to public URL format
        const { data: urlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(data.path);
        return urlData.publicUrl;
      }

      return signedUrlData.signedUrl;
    } catch (error: any) {
      console.error('Error uploading cover:', error);
      toast.error(error.message || 'Gagal mengupload cover');
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

    if (!validateCover()) {
      return;
    }

    if (!lyricsOnlyMode && areTrackCreditsRequired && !validateRequiredTrackCredits(values.tracks)) {
      return;
    }

    setLoading(true);
    try {
      // In lyricsOnlyMode, only update lyrics for existing tracks
      if (lyricsOnlyMode && isEditMode && release) {
        for (const track of values.tracks) {
          if (track.id) {
            const { error } = await supabase
              .from('tracks')
              .update({
                lyrics: track.lyrics || null,
              })
              .eq('id', track.id);

            if (error) throw error;
          }
        }

        toast.success('Lyrics berhasil diupdate');
        onSuccess();
        onOpenChange(false);
        return;
      }

      const coverUrl = await uploadCover();

      if (isEditMode && release) {
        // Determine label_id for update - admin can change it, others keep the original
        const updateLabelId = isAdmin && values.label_id ? values.label_id : release.label_id;
        
        // Find artist_user_id from selected artist name
        const selectedArtist = labelArtists.find(
          a => a.name.toLowerCase().trim() === values.artist_name.toLowerCase().trim()
        );
        const artistUserId = selectedArtist?.user_id || release.artist_user_id || null;
        
        const { error: releaseError } = await supabase
          .from('releases')
          .update({
            upc: values.upc || null,
            title: values.title,
            artist_name: values.artist_name,
            artist_user_id: artistUserId,
            release_type: values.release_type,
            genre: values.genre || null,
            release_date: values.release_date || null,
            // Only admins can change status; for others preserve existing release.status
            ...(isAdmin && values.status ? { status: values.status } : {}),
            ...(coverUrl !== null ? { cover_url: coverUrl } : {}),
            label_id: updateLabelId,
          })
          .eq('id', release.id);

        if (releaseError) throw releaseError;

        const existingTrackIds = values.tracks
          .filter((t) => t.id)
          .map((t) => t.id);

        if (existingTrackIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('tracks')
            .delete()
            .eq('release_id', release.id)
            .not('id', 'in', `(${existingTrackIds.join(',')})`);

          if (deleteError) {
            console.error('Error deleting tracks:', deleteError);
          }
        }

        for (const track of values.tracks) {
          // Get primary artist name for backward compatibility
          const primaryArtist = track.artists.find(a => a.type === 'Main Artist')?.name || track.artists[0]?.name || '';
          
          if (track.id) {
            const { error } = await supabase
              .from('tracks')
              .update({
                isrc: track.isrc || null,
                title: track.title,
                artist_name: primaryArtist,
                artist_user_id: findArtistUserIdByName(primaryArtist) || artistUserId || null,
                artists: track.artists,
                composer: track.composer || null,
                lyricist: track.lyricist || null,
                genre: track.genre || null,
                lyrics: track.lyrics || null,
                explicit_lyrics: track.explicit_lyrics,
                contributors: track.contributors || [],
                audio_url: track.audio_url || null,
                clip_url: track.clip_url || null,
                duration: track.duration || null,
              })
              .eq('id', track.id);

            if (error) throw error;
          } else {
            const { error } = await supabase.from('tracks').insert({
              release_id: release.id,
              isrc: track.isrc || null,
              title: track.title,
              artist_name: primaryArtist,
            artist_user_id: findArtistUserIdByName(primaryArtist) || artistUserId || null,
            artists: track.artists,
              composer: track.composer || null,
              lyricist: track.lyricist || null,
              genre: track.genre || null,
              lyrics: track.lyrics || null,
              explicit_lyrics: track.explicit_lyrics,
              contributors: track.contributors || [],
              audio_url: track.audio_url || null,
              clip_url: track.clip_url || null,
              duration: track.duration || null,
            });


            if (error) throw error;
          }
        }

        toast.success('Release berhasil diupdate');
      } else {
        const labelId = isAdmin ? values.label_id : isArtist && profile?.parent_label_id ? profile.parent_label_id : user.id;
        
        if (!labelId) {
          toast.error('Label wajib dipilih');
          setLoading(false);
          return;
        }

        // Find artist_user_id: for artist role use own ID, otherwise match from label artists
        const artistUserId = isArtist ? user.id : (findArtistUserIdByName(values.artist_name));

        const { data: newRelease, error: releaseError } = await supabase
          .from('releases')
          .insert({
            upc: values.upc || null,
            title: values.title,
            artist_name: values.artist_name,
            artist_user_id: artistUserId,
            release_type: values.release_type,
            genre: values.genre || null,
            release_date: values.release_date || null,
            status: values.status || 'pending',
            cover_url: coverUrl,
            label_id: labelId,
            created_by: user.id,
          })
          .select()
          .single();

        if (releaseError) throw releaseError;

        const tracksToInsert = values.tracks.map((track) => {
          const primaryArtist = track.artists.find(a => a.type === 'Main Artist')?.name || track.artists[0]?.name || '';
          return {
            release_id: newRelease.id,
            isrc: track.isrc || null,
            title: track.title,
            artist_name: primaryArtist,
            artist_user_id: findArtistUserIdByName(primaryArtist) || artistUserId || null,
            artists: track.artists,
            composer: track.composer || null,
            lyricist: track.lyricist || null,
            genre: track.genre || null,
            lyrics: track.lyrics || null,
            explicit_lyrics: track.explicit_lyrics,
            contributors: track.contributors || [],
            audio_url: track.audio_url || null,
            clip_url: track.clip_url || null,
            duration: track.duration || null,
          };
        });

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

  const handleSaveDraft = async () => {
    const values = form.getValues();
    // Validate minimum fields
    if (!values.title || !values.artist_name || !values.release_type) {
      toast.error('Judul, artist, dan tipe release wajib diisi');
      return;
    }
    form.setValue('status', 'draft');
    await onSubmit({ ...values, status: 'draft' });
  };

  const handlePayment = async () => {
    if (!validateCover()) {
      return;
    }

    // First validate and save the release
    const isValid = await form.trigger();
    if (!isValid) {
      toast.error('Mohon lengkapi semua field yang wajib diisi');
      return;
    }

    const values = form.getValues();
    if (areTrackCreditsRequired && !validateRequiredTrackCredits(values.tracks)) {
      return;
    }

    if (!user) return;

    setPaymentLoading(true);
    try {
      // Save release first
      const coverUrl = await uploadCover();

      const labelId = isAdmin ? values.label_id : isArtist && profile?.parent_label_id ? profile.parent_label_id : user.id;
      if (!labelId) {
        toast.error('Label wajib dipilih');
        setPaymentLoading(false);
        return;
      }

      const artistUserId = isArtist ? user.id : (findArtistUserIdByName(values.artist_name));

      let releaseId: string;

      if (isEditMode && release) {
        // Update existing release
        await supabase.from('releases').update({
          upc: values.upc || null,
          title: values.title,
          artist_name: values.artist_name,
          release_type: values.release_type,
          genre: values.genre || null,
          release_date: values.release_date || null,
          status: 'pending',
          ...(coverUrl ? { cover_url: coverUrl } : {}),
        }).eq('id', release.id);
        releaseId = release.id;
      } else {
        // Create new release
        const { data: newRelease, error: releaseError } = await supabase
          .from('releases')
          .insert({
            upc: values.upc || null,
            title: values.title,
            artist_name: values.artist_name,
            artist_user_id: artistUserId,
            release_type: values.release_type,
            genre: values.genre || null,
            release_date: values.release_date || null,
            status: 'pending',
            cover_url: coverUrl,
            label_id: labelId,
            created_by: user.id,
          })
          .select()
          .single();

        if (releaseError) throw releaseError;
        releaseId = newRelease.id;

        // Insert tracks
        const tracksToInsert = values.tracks.map((track) => {
          const primaryArtist = track.artists.find(a => a.type === 'Main Artist')?.name || track.artists[0]?.name || '';
          return {
            release_id: releaseId,
            isrc: track.isrc || null,
            title: track.title,
            artist_name: primaryArtist,
            artist_user_id: findArtistUserIdByName(primaryArtist) || artistUserId || null,
            artists: track.artists,
            composer: track.composer || null,
            lyricist: track.lyricist || null,
            genre: track.genre || null,
            lyrics: track.lyrics || null,
            explicit_lyrics: track.explicit_lyrics,
            contributors: track.contributors || [],
            audio_url: track.audio_url || null,
            clip_url: track.clip_url || null,
            duration: track.duration || null,
          };
        });

        const { error: tracksError } = await supabase.from('tracks').insert(tracksToInsert);
        if (tracksError) throw tracksError;
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

  const addTrack = () => {
    appendTrack({
      isrc: '',
      title: '',
      artists: [{ name: form.getValues('artist_name'), type: 'Main Artist' }],
      composer: '',
      lyricist: '',
      genre: form.getValues('genre') || '',
      lyrics: '',
      explicit_lyrics: false,
      contributors: [],
      audio_url: null,
      clip_url: null,
      duration: null,
    });
    setExpandedTracks(prev => ({ ...prev, [trackFields.length]: true }));
  };

  const validateRequiredTrackCredits = (tracks: ReleaseFormValues['tracks']) => {
    let isValid = true;

    tracks.forEach((track, trackIndex) => {
      if (!track.composer?.trim()) {
        form.setError(`tracks.${trackIndex}.composer`, {
          type: 'required',
          message: 'Composer wajib diisi',
        });
        isValid = false;
      }

      if (!track.lyricist?.trim()) {
        form.setError(`tracks.${trackIndex}.lyricist`, {
          type: 'required',
          message: 'Lyricist wajib diisi',
        });
        isValid = false;
      }
    });

    if (!isValid) {
      setCurrentStep(2);
      onStepChange?.(2);
      setExpandedTracks(tracks.reduce<Record<number, boolean>>((expanded, _, index) => {
        expanded[index] = true;
        return expanded;
      }, {}));
      toast.error('Composer dan lyricist wajib diisi untuk artist dan label');
    }

    return isValid;
  };

  // NOTE: ArtistSelector component is now imported from ./ArtistSelector.tsx
  // to prevent focus loss issues caused by inline component re-creation on every render

  // ContributorSelector is now imported from ./ContributorSelector.tsx
  // to prevent focus loss issues caused by inline component re-creation on every render

  // Genre Combobox Component - with internal open state
  const GenreCombobox = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
    const [open, setOpen] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    
    const filteredGenres = GENRE_LIST.filter(genre => 
      genre.toLowerCase().includes(searchValue.toLowerCase())
    );

    return (
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {value || "Pilih atau ketik genre..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-[280px] p-0" 
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command>
            <CommandInput 
              placeholder="Cari atau ketik genre..." 
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandList className="max-h-[200px]">
              <CommandEmpty>
                {searchValue && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => {
                      onChange(searchValue);
                      setOpen(false);
                      setSearchValue('');
                    }}
                  >
                    Gunakan "{searchValue}"
                  </Button>
                )}
              </CommandEmpty>
              <CommandGroup>
                {filteredGenres.map((genre) => (
                  <CommandItem
                    key={genre}
                    value={genre}
                    onSelect={() => {
                      onChange(genre);
                      setOpen(false);
                      setSearchValue('');
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === genre ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {genre}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  const handleNextStep = async () => {
    if (!validateCover()) {
      return;
    }

    const fieldsToValidate: Array<keyof ReleaseFormValues> = ['title', 'artist_name', 'release_type'];
    if (isAdmin) fieldsToValidate.push('label_id');

    const isValid = await form.trigger(fieldsToValidate);
    if (!isValid) {
      toast.error('Lengkapi detail release terlebih dahulu');
      return;
    }

    setCurrentStep(2);
    onStepChange?.(2);
  };

  // Determine if fields should be disabled based on lyricsOnlyMode
  const isFieldDisabled = lyricsOnlyMode && isEditMode;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          {lyricsOnlyMode ? 'Edit Lyrics' : isEditMode ? 'Edit Release' : currentStep === 1 ? 'Tahap 1: Detail & Sampul' : 'Tahap 2: Daftar Lagu'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {lyricsOnlyMode
            ? 'Release sudah aktif. Anda hanya dapat mengedit lirik track.'
            : isEditMode
              ? 'Edit informasi release dan tracks'
              : currentStep === 1
                ? 'Isi informasi utama release dan upload cover/artwork sebelum menambahkan lagu.'
                : 'Tambahkan track, kontributor, file audio, dan clip audio untuk release ini.'}
        </p>
      </div>
      <div className="space-y-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="p-4 sm:p-6 space-y-6">
              {/* Cover Upload - Hidden in lyricsOnlyMode */}
              {!lyricsOnlyMode && currentStep === 1 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cover Art *</label>
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
                            setCoverError('Cover art wajib diupload');
                          }}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Hapus Cover
                        </Button>
                      )}
                    </div>
                  </div>
                  {coverError && <p className="text-sm text-destructive">{coverError}</p>}
                </div>
              )}

              {!lyricsOnlyMode && <Separator />}

              {/* Release Info - Hidden in lyricsOnlyMode */}
              {!lyricsOnlyMode && currentStep === 1 && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* UPC - Only visible/editable for Admin */}
                  {isAdmin && (
                    <FormField
                      control={form.control}
                      name="upc"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>UPC (Opsional)</FormLabel>
                          <FormControl>
                            <Input placeholder="123456789012" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

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
                        <FormLabel>Nama Artist Utama *</FormLabel>
                  {isArtist ? (
                          <FormControl>
                            <Input value={artistStageName} disabled className="bg-muted" />
                          </FormControl>
                        ) : isAdmin && !selectedLabelId ? (
                          <div className="flex h-10 items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground">
                            Pilih label terlebih dahulu untuk menampilkan artist.
                          </div>
                        ) : isLabel || isWhitelabel || (isAdmin && selectedLabelId) ? (
                          loadingArtists ? (
                            <div className="flex items-center gap-2 h-10 px-3 border rounded-md">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-sm text-muted-foreground">Loading artists...</span>
                            </div>
                          ) : labelArtists.length > 0 ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    className="w-full justify-between"
                                  >
                                    {field.value || "Pilih artist..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-full p-0 z-50" align="start">
                                <Command>
                                  <CommandInput placeholder="Cari artist..." />
                                  <CommandList>
                                    <CommandEmpty>Tidak ada artist ditemukan.</CommandEmpty>
                                    <CommandGroup>
                                      {labelArtists.map((artist) => (
                                        <CommandItem
                                          key={artist.id}
                                          value={artist.name}
                                          onSelect={() => {
                                            field.onChange(artist.name);
                                            form.setValue('artist_user_id' as any, artist.user_id || null);
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              field.value === artist.name ? "opacity-100" : "opacity-0"
                                            )}
                                          />
                                          {artist.name}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 p-3 rounded-md border border-dashed border-amber-500/50 bg-amber-500/10">
                                <UserPlus className="h-4 w-4 text-amber-500" />
                                <p className="text-sm text-amber-600 dark:text-amber-400">
                                  Belum ada artist. Tambahkan artist terlebih dahulu di halaman{' '}
                                  <a 
                                    href="/dashboard/my-artists" 
                                    className="underline font-medium hover:text-amber-700 dark:hover:text-amber-300"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    My Artists
                                  </a>
                                </p>
                              </div>
                              <FormControl>
                                <Input
                                  placeholder="Atau ketik nama artist baru"
                                  {...field}
                                  onChange={(event) => {
                                    field.onChange(event.target.value);
                                    form.setValue('artist_user_id' as any, null);
                                  }}
                                />
                              </FormControl>
                            </div>
                          )
                        ) : (
                          <FormControl>
                            <Input placeholder="Artist Name" {...field} />
                          </FormControl>
                        )}
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
                          <SelectContent className="z-50">
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
                        <GenreCombobox value={field.value || ''} onChange={field.onChange} />
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
                      name="label_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Label *</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={loadingLabels ? "Loading..." : "Pilih label"} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="z-50">
                              {labels.map((label) => (
                                <SelectItem key={label.id} value={label.id}>
                                  {label.full_name} ({label.email})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

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
                            <SelectContent className="z-50">
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
              )}

              {!lyricsOnlyMode && currentStep === 1 && (
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading || paymentLoading}>
                    Batal
                  </Button>
                  <Button type="button" className="gradient-primary" onClick={handleNextStep} disabled={loading || paymentLoading || uploadingCover}>
                    Lanjut ke Daftar Lagu
                  </Button>
                </div>
              )}

              {(lyricsOnlyMode || currentStep === 2) && (
                <>
              <Separator />

              {/* Tracks Section */}
              <div className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold">Daftar Lagu</h3>
                    <p className="text-sm text-muted-foreground">
                      {lyricsOnlyMode
                        ? 'Edit lirik untuk setiap track.'
                        : 'Kelola track, preview audio, dan file clip untuk release ini.'}
                    </p>
                  </div>
                  {!lyricsOnlyMode && currentStep === 2 && (
                    <Button type="button" variant="outline" size="sm" onClick={addTrack}>
                      <Plus className="h-4 w-4 mr-1" />
                      Track Baru
                    </Button>
                  )}
                </div>

                {form.formState.errors.tracks?.root && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.tracks.root.message}
                  </p>
                )}

                <div className="overflow-hidden rounded-xl sm:rounded-2xl border bg-background">
                  <div className="hidden grid-cols-[56px_minmax(0,1.4fr)_minmax(0,1fr)_140px_88px] gap-4 border-b bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
                    <div>#</div>
                    <div>Track Title</div>
                    <div>Artist</div>
                    <div>Preview</div>
                    <div className="text-right">Actions</div>
                  </div>
                  {trackFields.map((field, trackIndex) => {
                    const trackArtists = form.watch(`tracks.${trackIndex}.artists`) || [];
                    const trackContributors = form.watch(`tracks.${trackIndex}.contributors`) || [];
                    const trackTitle = form.watch(`tracks.${trackIndex}.title`);
                    const trackAudioUrl = form.watch(`tracks.${trackIndex}.audio_url`);
                    const trackClipUrl = form.watch(`tracks.${trackIndex}.clip_url`);
                    const mainTrackArtist = trackArtists.find((artist: any) => artist.type === 'Main Artist')?.name || trackArtists[0]?.name || form.watch('artist_name') || '-';

                    return (
                      <div
                        key={field.id}
                        className="border-b bg-card p-4 sm:p-5 last:border-b-0 space-y-4"
                      >
                        <div className="grid gap-3 pb-3 lg:grid-cols-[56px_minmax(0,1.4fr)_minmax(0,1fr)_140px_88px] lg:items-center">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{trackIndex + 1}</span>
                            <span className="lg:hidden">Track</span>
                          </div>
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <Music className="h-4 w-4 shrink-0 text-primary" />
                              <span className="truncate font-medium">{trackTitle || "Track " + (trackIndex + 1)}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">Composer dan metadata bisa dilengkapi di detail track.</div>
                          </div>
                          <div className="truncate text-sm text-muted-foreground">{mainTrackArtist}</div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={trackAudioUrl ? "default" : "outline"} className="text-xs">Audio</Badge>
                            <Badge variant={trackClipUrl ? "default" : "outline"} className="text-xs">Clip</Badge>
                          </div>
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedTracks(prev => ({ ...prev, [trackIndex]: !prev[trackIndex] }))}
                              aria-expanded={!!expandedTracks[trackIndex]}
                            >
                              <ChevronDown className={cn("h-4 w-4 transition-transform", expandedTracks[trackIndex] && "rotate-180")} />
                              {expandedTracks[trackIndex] ? 'Tutup' : 'Detail'}
                            </Button>
                            {!lyricsOnlyMode && trackFields.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeTrack(trackIndex)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Track Details - Hidden in lyricsOnlyMode */}
                        {!lyricsOnlyMode && currentStep === 2 && expandedTracks[trackIndex] && (
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            {/* ISRC - Only visible/editable for Admin */}
                            {isAdmin && (
                              <FormField
                                control={form.control}
                                name={`tracks.${trackIndex}.isrc`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>ISRC (Opsional)</FormLabel>
                                    <FormControl>
                                      <Input placeholder="ISRC Code" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}

                            <FormField
                              control={form.control}
                              name={`tracks.${trackIndex}.title`}
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
                              name={`tracks.${trackIndex}.genre`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Genre</FormLabel>
                                  <GenreCombobox value={field.value || ''} onChange={field.onChange} />
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`tracks.${trackIndex}.composer`}
                              render={({ field }) => (
                                  <FormItem>
                                  <FormLabel>Composer{areTrackCreditsRequired ? ' *' : ''}</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Composer" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`tracks.${trackIndex}.lyricist`}
                              render={({ field }) => (
                                  <FormItem>
                                  <FormLabel>Lyricist{areTrackCreditsRequired ? ' *' : ''}</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Lyricist" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Explicit Lyrics */}
                            <FormField
                              control={form.control}
                              name={`tracks.${trackIndex}.explicit_lyrics`}
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                  <div className="space-y-0.5">
                                    <FormLabel>Lirik Eksplisit</FormLabel>
                                    <p className="text-xs text-muted-foreground">
                                      Apakah lagu mengandung lirik eksplisit?
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
                          </div>
                        )}

                        {/* Artists Section - Hidden in lyricsOnlyMode */}
                        {!lyricsOnlyMode && currentStep === 2 && expandedTracks[trackIndex] && (
                          <div className="space-y-2">
                        <div className="flex items-center justify-between pb-2">
                              <FormLabel>Artists *</FormLabel>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const currentArtists = form.getValues(`tracks.${trackIndex}.artists`) || [];
                                  form.setValue(`tracks.${trackIndex}.artists`, [
                                    ...currentArtists,
                                    { name: '', type: 'Featured Artist' }
                                  ]);
                                }}
                              >
                                <UserPlus className="h-4 w-4 mr-1" />
                                Tambah Artist
                              </Button>
                            </div>
                            
                            <div className="space-y-2">
                              {trackArtists.map((artist, artistIndex) => (
                                <ArtistSelector
                                  key={`${trackIndex}-${artistIndex}`}
                                  artistName={artist.name || ''}
                                  artistType={artist.type as 'Main Artist' | 'Featured Artist' || 'Main Artist'}
                                  onNameChange={(name) => {
                                    form.setValue(`tracks.${trackIndex}.artists.${artistIndex}.name`, name);
                                  }}
                                  onTypeChange={(type) => {
                                    form.setValue(`tracks.${trackIndex}.artists.${artistIndex}.type`, type);
                                  }}
                                  canRemove={trackArtists.length > 1}
                                  onRemove={() => {
                                    const currentArtists = form.getValues(`tracks.${trackIndex}.artists`);
                                    form.setValue(
                                      `tracks.${trackIndex}.artists`,
                                      currentArtists.filter((_, i) => i !== artistIndex)
                                    );
                                  }}
                                  isLabelMode={isLabel || isWhitelabel}
                                  labelArtists={labelArtists}
                                />
                              ))}
                            </div>
                            {form.formState.errors.tracks?.[trackIndex]?.artists && (
                              <p className="text-sm text-destructive">
                                {form.formState.errors.tracks[trackIndex]?.artists?.message || 
                                 form.formState.errors.tracks[trackIndex]?.artists?.root?.message}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Contributors Section - Hidden in lyricsOnlyMode */}
                        {!lyricsOnlyMode && currentStep === 2 && expandedTracks[trackIndex] && (
                          <div className="space-y-2">
                        <div className="flex items-center justify-between pb-2">
                              <FormLabel>Additional Contributors</FormLabel>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const currentContributors = form.getValues(`tracks.${trackIndex}.contributors`) || [];
                                  form.setValue(`tracks.${trackIndex}.contributors`, [
                                    ...currentContributors,
                                    { name: '', type: '', role: '' }
                                  ]);
                                }}
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                Tambah Contributor
                              </Button>
                            </div>
                            
                            {trackContributors.length > 0 && (
                              <div className="space-y-2">
                                {trackContributors.map((contributor, contributorIndex) => (
                                  <ContributorSelector
                                    key={contributorIndex}
                                    name={contributor?.name || ''}
                                    type={contributor?.type || ''}
                                    role={contributor?.role || ''}
                                    onNameChange={(value) => form.setValue(`tracks.${trackIndex}.contributors.${contributorIndex}.name`, value)}
                                    onTypeChange={(value) => form.setValue(`tracks.${trackIndex}.contributors.${contributorIndex}.type`, value)}
                                    onRoleChange={(value) => form.setValue(`tracks.${trackIndex}.contributors.${contributorIndex}.role`, value)}
                                    onRemove={() => {
                                      const currentContributors = form.getValues(`tracks.${trackIndex}.contributors`) || [];
                                      form.setValue(
                                        `tracks.${trackIndex}.contributors`,
                                        currentContributors.filter((_, i) => i !== contributorIndex)
                                      );
                                    }}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Lyrics - Always visible */}
                        {(lyricsOnlyMode || expandedTracks[trackIndex]) && (
                          <FormField
                            control={form.control}
                            name={`tracks.${trackIndex}.lyrics`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Lyrics</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="Masukkan lirik lagu..."
                                    className={lyricsOnlyMode ? "min-h-[200px]" : "min-h-[80px]"}
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        {/* Media Upload Section - Hidden in lyricsOnlyMode */}
                        {!lyricsOnlyMode && currentStep === 2 && expandedTracks[trackIndex] && (
                          <MediaUploadSection
                            trackIndex={trackIndex}
                            audioUrl={form.watch(`tracks.${trackIndex}.audio_url`) || undefined}
                            clipUrl={form.watch(`tracks.${trackIndex}.clip_url`) || undefined}
                            duration={form.watch(`tracks.${trackIndex}.duration`) || undefined}
                            onAudioChange={(url) => form.setValue(`tracks.${trackIndex}.audio_url`, url)}
                            onClipChange={(url) => form.setValue(`tracks.${trackIndex}.clip_url`, url)}
                            onDurationChange={(duration) => form.setValue(`tracks.${trackIndex}.duration`, duration)}
                            disabled={loading}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Actions */}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (currentStep === 2 && !lyricsOnlyMode) {
                      setCurrentStep(1);
                      onStepChange?.(1);
                      return;
                    }
                    onOpenChange(false);
                  }}
                  disabled={loading || paymentLoading}
                >
                  {currentStep === 2 && !lyricsOnlyMode ? 'Kembali' : 'Batal'}
                </Button>
                {isEditMode ? (
                  <Button
                    type="submit"
                    disabled={loading || uploadingCover || (release?.status === 'pending_paid' && !lyricsOnlyMode)}
                    className="gradient-primary"
                  >
                    {loading || uploadingCover ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Menyimpan...
                      </>
                    ) : release?.status === 'pending_paid' ? (
                      'Terkunci (Sudah Dibayar)'
                    ) : (
                      'Update Release'
                    )}
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleSaveDraft}
                      disabled={loading || paymentLoading || uploadingCover}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Menyimpan...
                        </>
                      ) : (
                        'Simpan Draft'
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
                </>
              )}
            </form>
          </Form>
      </div>
    </div>
  );
}
