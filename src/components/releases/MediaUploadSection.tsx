import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Music, 
  Video, 
  FileAudio, 
  Upload, 
  X, 
  Loader2,
  Play,
  Pause
} from 'lucide-react';

interface MediaUploadSectionProps {
  trackIndex: number;
  audioUrl?: string;
  videoUrl?: string;
  clipUrl?: string;
  onAudioChange: (url: string | null) => void;
  onVideoChange: (url: string | null) => void;
  onClipChange: (url: string | null) => void;
  disabled?: boolean;
}

type MediaType = 'audio' | 'video' | 'clip';

const BUCKET_MAP: Record<MediaType, string> = {
  audio: 'track-audio',
  video: 'track-video',
  clip: 'audio-clips',
};

const ACCEPT_MAP: Record<MediaType, string> = {
  audio: '.wav,.flac,.aiff,.mp3',
  video: '.mp4,.mov,.webm',
  clip: '.mp3,.m4a,.ogg,.wav',
};

const MAX_SIZE_MAP: Record<MediaType, number> = {
  audio: 500 * 1024 * 1024, // 500MB for full audio
  video: 2 * 1024 * 1024 * 1024, // 2GB for video
  clip: 20 * 1024 * 1024, // 20MB for clips
};

const LABEL_MAP: Record<MediaType, string> = {
  audio: 'Full Audio (WAV/FLAC)',
  video: 'Music Video (MP4)',
  clip: 'Audio Clip (30-60s)',
};

const ICON_MAP: Record<MediaType, React.ReactNode> = {
  audio: <Music className="h-4 w-4" />,
  video: <Video className="h-4 w-4" />,
  clip: <FileAudio className="h-4 w-4" />,
};

export function MediaUploadSection({
  trackIndex,
  audioUrl,
  videoUrl,
  clipUrl,
  onAudioChange,
  onVideoChange,
  onClipChange,
  disabled = false,
}: MediaUploadSectionProps) {
  const [uploading, setUploading] = useState<MediaType | null>(null);
  const [progress, setProgress] = useState(0);
  const [playingClip, setPlayingClip] = useState(false);
  
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const clipInputRef = useRef<HTMLInputElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const handleUpload = async (file: File, type: MediaType) => {
    const maxSize = MAX_SIZE_MAP[type];
    if (file.size > maxSize) {
      toast.error(`File terlalu besar. Maksimal ${formatFileSize(maxSize)}`);
      return;
    }

    setUploading(type);
    setProgress(0);

    try {
      const bucket = BUCKET_MAP[type];
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `track-${trackIndex}/${fileName}`;

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file);

      clearInterval(progressInterval);

      if (uploadError) throw uploadError;

      setProgress(100);

      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      // For private buckets, we store the path instead of public URL
      const url = bucket === 'audio-clips' ? urlData.publicUrl : filePath;

      switch (type) {
        case 'audio':
          onAudioChange(url);
          break;
        case 'video':
          onVideoChange(url);
          break;
        case 'clip':
          onClipChange(url);
          break;
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

  const handleRemove = async (type: MediaType, currentUrl: string | undefined) => {
    if (!currentUrl) return;

    try {
      const bucket = BUCKET_MAP[type];
      const filePath = type === 'clip' 
        ? currentUrl.split('/').slice(-2).join('/') 
        : currentUrl;

      await supabase.storage.from(bucket).remove([filePath]);

      switch (type) {
        case 'audio':
          onAudioChange(null);
          break;
        case 'video':
          onVideoChange(null);
          break;
        case 'clip':
          onClipChange(null);
          break;
      }

      toast.success(`${LABEL_MAP[type]} berhasil dihapus`);
    } catch (error) {
      console.error('Error removing file:', error);
      // Still remove from state even if storage delete fails
      switch (type) {
        case 'audio':
          onAudioChange(null);
          break;
        case 'video':
          onVideoChange(null);
          break;
        case 'clip':
          onClipChange(null);
          break;
      }
    }
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

  const renderMediaUpload = (
    type: MediaType,
    currentUrl: string | undefined,
    inputRef: React.RefObject<HTMLInputElement>
  ) => {
    const isUploading = uploading === type;
    const hasFile = !!currentUrl;

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
                    <audio
                      ref={audioPlayerRef}
                      src={currentUrl}
                      onEnded={() => setPlayingClip(false)}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <span>File uploaded</span>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => handleRemove(type, currentUrl)}
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => inputRef.current?.click()}
                  disabled={disabled}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload {type === 'audio' ? 'Audio' : type === 'video' ? 'Video' : 'Clip'}
                </Button>
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
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {renderMediaUpload('audio', audioUrl, audioInputRef)}
        {renderMediaUpload('video', videoUrl, videoInputRef)}
        {renderMediaUpload('clip', clipUrl, clipInputRef)}
      </div>
    </div>
  );
}
