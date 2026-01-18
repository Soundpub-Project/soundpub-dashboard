import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Music, 
  FileAudio, 
  Upload, 
  X, 
  Loader2,
  Play,
  Pause,
  Clock
} from 'lucide-react';

interface MediaUploadSectionProps {
  trackIndex: number;
  audioUrl?: string;
  clipUrl?: string;
  duration?: number;
  onAudioChange: (url: string | null) => void;
  onClipChange: (url: string | null) => void;
  onDurationChange: (duration: number | null) => void;
  disabled?: boolean;
}

type MediaType = 'audio' | 'clip';

const GCS_FOLDER_MAP: Record<MediaType, string> = {
  audio: 'audio',
  clip: 'clips',
};

const ACCEPT_MAP: Record<MediaType, string> = {
  audio: '.wav,.flac,.aiff,.mp3',
  clip: '.mp3,.m4a,.ogg,.wav',
};

const MAX_SIZE_MAP: Record<MediaType, number> = {
  audio: 500 * 1024 * 1024, // 500MB for full audio (no limit practically)
  clip: 20 * 1024 * 1024, // 20MB for clips
};

const LABEL_MAP: Record<MediaType, string> = {
  audio: 'Full Audio (WAV/FLAC/MP3)',
  clip: 'Audio Clip (30-60 detik)',
};

const ICON_MAP: Record<MediaType, React.ReactNode> = {
  audio: <Music className="h-4 w-4" />,
  clip: <FileAudio className="h-4 w-4" />,
};

export function MediaUploadSection({
  trackIndex,
  audioUrl,
  clipUrl,
  duration,
  onAudioChange,
  onClipChange,
  onDurationChange,
  disabled = false,
}: MediaUploadSectionProps) {
  const [uploading, setUploading] = useState<MediaType | null>(null);
  const [progress, setProgress] = useState(0);
  const [playingClip, setPlayingClip] = useState(false);
  const [clipDuration, setClipDuration] = useState<number | null>(null);
  const [clipError, setClipError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<MediaType | null>(null);
  
  const audioInputRef = useRef<HTMLInputElement>(null);
  const clipInputRef = useRef<HTMLInputElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);
  const clipValidationRef = useRef<HTMLAudioElement>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get proper MIME type for audio files
  const getAudioMimeType = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'wav': 'audio/wav',
      'flac': 'audio/flac',
      'aiff': 'audio/aiff',
      'mp3': 'audio/mpeg',
      'm4a': 'audio/mp4',
      'ogg': 'audio/ogg',
    };
    return mimeTypes[ext || ''] || 'audio/mpeg';
  };

  // Upload with retry logic for CORS issues
  const uploadWithRetry = async (
    uploadUrl: string, 
    file: File, 
    mimeType: string,
    maxRetries = 3
  ): Promise<Response> => {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Upload attempt ${attempt}/${maxRetries}`);
        
        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': mimeType,
          },
          body: file,
        });

        if (uploadResponse.ok) {
          return uploadResponse;
        }

        // If we get a response but it's not ok, check if it's a CORS-related issue
        const errorText = await uploadResponse.text();
        console.error(`Upload attempt ${attempt} failed:`, uploadResponse.status, errorText);
        lastError = new Error(`Upload failed: ${uploadResponse.status}`);
        
      } catch (error: any) {
        console.error(`Upload attempt ${attempt} error:`, error);
        lastError = error;
        
        // If it's a network/CORS error and we have retries left, wait before retrying
        if (attempt < maxRetries) {
          const waitTime = attempt * 1000; // 1s, 2s, 3s
          console.log(`Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    throw lastError || new Error('Upload failed after retries');
  };

  // All audio uploads go to GCS using Signed URL V4
  const uploadToGCS = async (file: File, type: MediaType): Promise<string> => {
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const fileName = `${type}-${trackIndex}-${Date.now()}.${fileExt}`;
    const folder = GCS_FOLDER_MAP[type];
    const mimeType = file.type || getAudioMimeType(file.name);

    // Get the session from Supabase
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.access_token) {
      throw new Error('Not authenticated');
    }

    // Step 1: Get signed URL from edge function
    const { data, error } = await supabase.functions.invoke('gcs-upload', {
      body: {
        file_name: fileName,
        file_type: mimeType,
        folder: folder,
        file_size: file.size,
      },
    });

    if (error || data?.error) {
      const errorData = data || {};
      const errorCode = errorData.code;
      const errorMessage = errorData.error || error?.message;
      
      console.error('GCS Upload Function Error:', { error, data: errorData });
      
      // Handle specific error codes
      if (errorCode === 'INSUFFICIENT_ROLE') {
        throw new Error(`Role "${errorData.currentRole}" tidak diizinkan upload. Hubungi admin.`);
      }
      if (errorMessage?.includes('GCS configuration is missing')) {
        throw new Error('Konfigurasi storage belum lengkap. Hubungi admin.');
      }
      throw new Error(errorMessage || 'Gagal mendapatkan upload URL');
    }
    
    // Use signedUrl (new) or uploadUrl (backward compat)
    const uploadUrl = data?.signedUrl || data?.uploadUrl;
    if (!uploadUrl) throw new Error('Failed to get upload URL');

    // Step 2: Upload file directly to GCS using signed URL
    try {
      const uploadResponse = await uploadWithRetry(uploadUrl, file, mimeType, 3);
      console.log('Upload successful:', uploadResponse.status);
    } catch (uploadError: any) {
      console.error('All upload attempts failed:', uploadError);
      
      const errorMsg = uploadError.message || '';
      
      // True network/CORS error - browser blocked before getting any response
      if (uploadError.name === 'TypeError' && errorMsg.includes('Failed to fetch')) {
        throw new Error(
          'Upload gagal (network error). Pastikan koneksi internet stabil dan CORS bucket sudah dikonfigurasi.'
        );
      }
      
      // HTTP status code errors from GCS
      if (errorMsg.includes('Upload failed:')) {
        const statusMatch = errorMsg.match(/Upload failed: (\d+)/);
        const status = statusMatch ? parseInt(statusMatch[1]) : 0;
        
        if (status === 400) {
          throw new Error('Upload ditolak (400). Signed URL mungkin sudah expired atau Content-Type tidak cocok.');
        }
        if (status === 403) {
          throw new Error('Upload ditolak (403). Service account tidak punya akses write ke bucket.');
        }
        if (status === 404) {
          throw new Error('Bucket tidak ditemukan (404). Pastikan GCS_BUCKET_NAME sudah benar.');
        }
        if (status >= 500) {
          throw new Error(`Server GCS error (${status}). Coba lagi dalam beberapa saat.`);
        }
      }
      
      throw uploadError;
    }

    return data.publicUrl;
  };

  // Get audio duration from file
  const getAudioDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.onloadedmetadata = () => {
        const duration = audio.duration;
        URL.revokeObjectURL(audio.src);
        resolve(duration);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audio.src);
        reject(new Error('Gagal membaca file audio'));
      };
      audio.src = URL.createObjectURL(file);
    });
  };

  const validateClipDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.onloadedmetadata = () => {
        const duration = audio.duration;
        URL.revokeObjectURL(audio.src);
        
        if (duration < 30) {
          reject(new Error(`Audio clip terlalu pendek (${formatDuration(duration)}). Minimal 30 detik.`));
        } else if (duration > 60) {
          reject(new Error(`Audio clip terlalu panjang (${formatDuration(duration)}). Maksimal 60 detik.`));
        } else {
          resolve(duration);
        }
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audio.src);
        reject(new Error('Gagal membaca file audio'));
      };
      audio.src = URL.createObjectURL(file);
    });
  };

  const handleUpload = async (file: File, type: MediaType) => {
    const maxSize = MAX_SIZE_MAP[type];
    if (file.size > maxSize) {
      toast.error(`File terlalu besar. Maksimal ${formatFileSize(maxSize)}`);
      return;
    }

    setClipError(null);

    // Validate clip duration (30-60 seconds)
    if (type === 'clip') {
      try {
        const clipDur = await validateClipDuration(file);
        setClipDuration(clipDur);
      } catch (error: any) {
        setClipError(error.message);
        toast.error(error.message);
        return;
      }
    }

    // Auto-detect duration for full audio
    if (type === 'audio') {
      try {
        const audioDuration = await getAudioDuration(file);
        const durationInSeconds = Math.round(audioDuration);
        onDurationChange(durationInSeconds);
        toast.success(`Durasi terdeteksi: ${formatDuration(durationInSeconds)}`);
      } catch (error) {
        console.error('Could not detect audio duration:', error);
        // Don't block upload if duration detection fails
      }
    }

    setUploading(type);
    setProgress(0);

    try {
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      // All audio uploads go to GCS
      const url = await uploadToGCS(file, type);

      clearInterval(progressInterval);
      setProgress(100);

      if (type === 'audio') {
        onAudioChange(url);
      } else {
        onClipChange(url);
      }

      toast.success(`${LABEL_MAP[type]} berhasil diupload`);
    } catch (error: any) {
      console.error('Error uploading:', error);
      toast.error(error.message || `Gagal mengupload ${LABEL_MAP[type]}`);
    } finally {
      setUploading(null);
      setProgress(0);
    }
  };

  const handleRemove = (type: MediaType) => {
    if (type === 'audio') {
      onAudioChange(null);
    } else {
      onClipChange(null);
      setClipDuration(null);
    }
    toast.success(`${LABEL_MAP[type]} berhasil dihapus`);
  };

  const togglePlayClip = () => {
    if (audioPlayerRef.current) {
      if (playingClip) {
        audioPlayerRef.current.pause();
      } else {
        audioPlayerRef.current.play();
      }
      setPlayingClip(!playingClip);
    }
  };

  const handleDurationChange = (value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 0) {
      onDurationChange(null);
    } else {
      onDurationChange(numValue);
    }
  };

  const isValidAudioFile = (file: File, type: MediaType): boolean => {
    const acceptedTypes = ACCEPT_MAP[type].split(',').map(ext => ext.trim().replace('.', ''));
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    return !!fileExt && acceptedTypes.includes(fileExt);
  };

  const handleDragOver = (e: React.DragEvent, type: MediaType) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !uploading) {
      setDragOver(type);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
  };

  const handleDrop = (e: React.DragEvent, type: MediaType) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);

    if (disabled || uploading) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (isValidAudioFile(file, type)) {
        handleUpload(file, type);
      } else {
        toast.error(`Format file tidak didukung. Gunakan: ${ACCEPT_MAP[type]}`);
      }
    }
  };

  const renderMediaUpload = (
    type: MediaType,
    currentUrl: string | undefined,
    inputRef: React.RefObject<HTMLInputElement>
  ) => {
    const isUploading = uploading === type;
    const hasFile = !!currentUrl;
    const isDraggedOver = dragOver === type;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {ICON_MAP[type]}
          <span>{LABEL_MAP[type]}</span>
        </div>
        
        <div className="flex items-center gap-2">
          {hasFile ? (
            <div className="flex items-center gap-2 flex-1 p-2 rounded-lg border bg-muted/50">
              <div className="flex-1 truncate text-sm text-muted-foreground">
                {type === 'clip' ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={togglePlayClip}
                    >
                      {playingClip ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <span>Audio clip uploaded</span>
                    {clipDuration && (
                      <span className="text-xs text-muted-foreground">
                        ({formatDuration(clipDuration)})
                      </span>
                    )}
                    <audio
                      ref={audioPlayerRef}
                      src={currentUrl}
                      onEnded={() => setPlayingClip(false)}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <span>Full audio uploaded</span>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => handleRemove(type)}
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex-1">
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT_MAP[type]}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file, type);
                  e.target.value = '';
                }}
                className="hidden"
                disabled={disabled || isUploading}
              />
              
              {isUploading ? (
                <div className="space-y-2 p-3 rounded-lg border bg-muted/50">
                  <div className="flex items-center gap-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Uploading... {progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              ) : (
                <div
                  className={`
                    flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed 
                    cursor-pointer transition-all duration-200
                    ${isDraggedOver 
                      ? 'border-primary bg-primary/10 scale-[1.02]' 
                      : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
                    }
                    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                  onClick={() => !disabled && inputRef.current?.click()}
                  onDragOver={(e) => handleDragOver(e, type)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, type)}
                >
                  <Upload className={`h-6 w-6 ${isDraggedOver ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="text-center">
                    <p className={`text-sm font-medium ${isDraggedOver ? 'text-primary' : ''}`}>
                      {isDraggedOver ? 'Lepaskan file di sini' : 'Drag & drop atau klik untuk upload'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {type === 'audio' ? 'WAV, FLAC, AIFF, MP3' : 'MP3, M4A, OGG, WAV (30-60 detik)'}
                    </p>
                  </div>
                </div>
              )}
              
              {type === 'clip' && clipError && (
                <p className="text-xs text-destructive mt-1">{clipError}</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 p-4 rounded-lg border bg-background">
      <h4 className="font-medium text-sm">Media Files</h4>
      
      {/* Duration Input */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Clock className="h-4 w-4" />
          <span>Durasi Track (dalam detik)</span>
        </div>
        <Input
          type="number"
          min="0"
          placeholder="Contoh: 180 untuk 3 menit"
          value={duration || ''}
          onChange={(e) => handleDurationChange(e.target.value)}
          disabled={disabled}
          className="max-w-xs"
        />
        {duration && duration > 0 && (
          <p className="text-xs text-muted-foreground">
            = {formatDuration(duration)}
          </p>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderMediaUpload('audio', audioUrl, audioInputRef)}
        {renderMediaUpload('clip', clipUrl, clipInputRef)}
      </div>
    </div>
  );
}
