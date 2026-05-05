import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Loader2, Play, Pause, Scissors } from 'lucide-react';
import { toast } from 'sonner';
import {
  decodeAudioFromUrl,
  extractPeaks,
  sliceAudioBuffer,
  encodeWav,
  formatTime,
} from '@/lib/audioClipper';

interface AudioClipCutterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audioUrl: string;
  onClipReady: (blob: Blob) => void | Promise<void>;
}

const MIN_CLIP = 30;
const MAX_CLIP = 60;
const WAVEFORM_SAMPLES = 600;

export function AudioClipCutterDialog({
  open,
  onOpenChange,
  audioUrl,
  onClipReady,
}: AudioClipCutterDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [range, setRange] = useState<[number, number]>([0, 30]);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [processing, setProcessing] = useState(false);

  const bufferRef = useRef<AudioBuffer | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveContainerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<null | 'start' | 'end'>(null);

  // Load + decode audio on open
  useEffect(() => {
    if (!open || !audioUrl) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPeaks([]);
    setPlaying(false);
    setCurrentTime(0);

    decodeAudioFromUrl(audioUrl)
      .then((buf) => {
        if (cancelled) return;
        bufferRef.current = buf;
        const dur = buf.duration;
        setDuration(dur);
        setPeaks(extractPeaks(buf, WAVEFORM_SAMPLES));
        const initialEnd = Math.min(dur, MIN_CLIP);
        setRange([0, initialEnd]);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Decode error:', err);
        setError(err.message || 'Gagal memuat audio');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      bufferRef.current = null;
    };
  }, [open, audioUrl]);

  // Render waveform on canvas
  const renderWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const barWidth = cssWidth / peaks.length;
    const mid = cssHeight / 2;
    const startX = (range[0] / duration) * cssWidth;
    const endX = (range[1] / duration) * cssWidth;

    // Read CSS variables for theme colors
    const styles = getComputedStyle(document.documentElement);
    const primaryHsl = styles.getPropertyValue('--primary').trim() || '262 83% 58%';
    const mutedHsl = styles.getPropertyValue('--muted-foreground').trim() || '240 5% 65%';

    for (let i = 0; i < peaks.length; i++) {
      const x = i * barWidth;
      const h = Math.max(1, peaks[i] * (cssHeight * 0.9));
      const inRange = x >= startX && x <= endX;
      ctx.fillStyle = inRange
        ? `hsl(${primaryHsl})`
        : `hsl(${mutedHsl} / 0.35)`;
      ctx.fillRect(x, mid - h / 2, Math.max(1, barWidth - 0.5), h);
    }

    // Playhead
    if (playing || currentTime > 0) {
      const pxPos = (currentTime / duration) * cssWidth;
      ctx.fillStyle = `hsl(${primaryHsl})`;
      ctx.fillRect(pxPos - 1, 0, 2, cssHeight);
    }
  }, [peaks, range, duration, playing, currentTime]);

  useEffect(() => {
    renderWaveform();
  }, [renderWaveform]);

  useEffect(() => {
    const onResize = () => renderWaveform();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [renderWaveform]);

  // Keep playback within selected range
  const handleTimeUpdate = () => {
    const a = audioRef.current;
    if (!a) return;
    setCurrentTime(a.currentTime);
    if (a.currentTime >= range[1]) {
      a.pause();
      a.currentTime = range[0];
      setPlaying(false);
    }
  };

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      if (a.currentTime < range[0] || a.currentTime >= range[1]) {
        a.currentTime = range[0];
      }
      a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  // When user moves slider while playing, snap to new start
  const handleRangeChange = (vals: number[]) => {
    let [s, e] = vals as [number, number];
    if (e - s < MIN_CLIP) {
      // Adjust the moving handle to maintain min 30s
      if (s !== range[0]) s = Math.max(0, e - MIN_CLIP);
      else e = Math.min(duration, s + MIN_CLIP);
    }
    if (e - s > MAX_CLIP) {
      if (s !== range[0]) s = e - MAX_CLIP;
      else e = s + MAX_CLIP;
    }
    setRange([s, e]);
    const a = audioRef.current;
    if (a) {
      if (a.currentTime < s || a.currentTime > e) {
        a.currentTime = s;
        setCurrentTime(s);
      }
    }
  };

  // Direct-drag handles on the waveform itself
  const pxToSec = (clientX: number): number => {
    const el = waveContainerRef.current;
    if (!el || !duration) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  const beginDrag = (which: 'start' | 'end') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = which;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const t = pxToSec(e.clientX);
    if (draggingRef.current === 'start') {
      handleRangeChange([t, range[1]]);
    } else {
      handleRangeChange([range[0], t]);
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    try { (e.target as Element).releasePointerCapture?.(e.pointerId); } catch {}
  };

  // Click on waveform (outside handles) → move playhead
  const onWaveClick = (e: React.PointerEvent) => {
    if (draggingRef.current) return;
    const target = e.target as HTMLElement;
    if (target.dataset.handle) return;
    const t = pxToSec(e.clientX);
    const a = audioRef.current;
    if (a) {
      a.currentTime = Math.min(Math.max(t, range[0]), range[1]);
      setCurrentTime(a.currentTime);
    }
  };

  const onHandleKey = (which: 'start' | 'end') => (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const delta = (e.shiftKey ? 2 : 0.5) * (e.key === 'ArrowLeft' ? -1 : 1);
    if (which === 'start') handleRangeChange([range[0] + delta, range[1]]);
    else handleRangeChange([range[0], range[1] + delta]);
  };

  const clipDuration = range[1] - range[0];
  const valid = clipDuration >= MIN_CLIP && clipDuration <= MAX_CLIP;

  const handleSave = async () => {
    if (!bufferRef.current || !valid) return;
    setProcessing(true);
    try {
      const sliced = sliceAudioBuffer(bufferRef.current, range[0], range[1]);
      const blob = encodeWav(sliced);
      await onClipReady(blob);
      onOpenChange(false);
    } catch (err: any) {
      console.error('Clip save error:', err);
      toast.error(err.message || 'Gagal membuat clip');
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = (next: boolean) => {
    if (processing) return;
    if (!next) {
      const a = audioRef.current;
      if (a) {
        a.pause();
      }
      setPlaying(false);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Potong Audio Clip
          </DialogTitle>
          <DialogDescription>
            Geser handle kiri/kanan untuk memilih bagian lagu yang ingin
            dijadikan preview clip. Durasi harus antara 30–60 detik.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Memuat & menganalisa audio...</p>
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Waveform with draggable handles */}
            <div
              ref={waveContainerRef}
              className="relative rounded-lg border bg-muted/30 p-3 select-none"
              style={{ touchAction: 'none' }}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onPointerDown={onWaveClick}
            >
              <canvas
                ref={canvasRef}
                className="w-full h-28 block pointer-events-none"
                style={{ width: '100%', height: '112px' }}
              />
              {duration > 0 && (
                <>
                  {/* Selection overlay */}
                  <div
                    className="absolute top-3 bottom-3 bg-primary/15 pointer-events-none"
                    style={{
                      left: `calc(0.75rem + ${(range[0] / duration) * 100}% * (100% - 1.5rem) / 100%)`,
                      width: `calc(${((range[1] - range[0]) / duration) * 100}% * (100% - 1.5rem) / 100%)`,
                    }}
                  />
                  {/* Start handle */}
                  <div
                    data-handle="start"
                    role="slider"
                    aria-label="Start handle"
                    aria-valuemin={0}
                    aria-valuemax={duration}
                    aria-valuenow={range[0]}
                    tabIndex={0}
                    onPointerDown={beginDrag('start')}
                    onKeyDown={onHandleKey('start')}
                    className="absolute top-1 bottom-1 w-6 -ml-3 flex items-center justify-center cursor-ew-resize touch-none group"
                    style={{ left: `calc(0.75rem + (${(range[0] / duration) * 100}% * (100% - 1.5rem) / 100%))` }}
                  >
                    <div className="h-full w-1.5 rounded bg-primary shadow-md group-hover:w-2 transition-all" data-handle="start" />
                    <div className="absolute -top-6 px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-mono whitespace-nowrap shadow" data-handle="start">
                      {formatTime(range[0])}
                    </div>
                  </div>
                  {/* End handle */}
                  <div
                    data-handle="end"
                    role="slider"
                    aria-label="End handle"
                    aria-valuemin={0}
                    aria-valuemax={duration}
                    aria-valuenow={range[1]}
                    tabIndex={0}
                    onPointerDown={beginDrag('end')}
                    onKeyDown={onHandleKey('end')}
                    className="absolute top-1 bottom-1 w-6 -ml-3 flex items-center justify-center cursor-ew-resize touch-none group"
                    style={{ left: `calc(0.75rem + (${(range[1] / duration) * 100}% * (100% - 1.5rem) / 100%))` }}
                  >
                    <div className="h-full w-1.5 rounded bg-primary shadow-md group-hover:w-2 transition-all" data-handle="end" />
                    <div className="absolute -top-6 px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-mono whitespace-nowrap shadow" data-handle="end">
                      {formatTime(range[1])}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Range slider (dual-thumb) — fallback / fine adjust */}
            <div className="px-1">
              <SliderPrimitive.Root
                className="relative flex w-full touch-none select-none items-center"
                min={0}
                max={Math.max(duration, 0.1)}
                step={0.1}
                value={[range[0], range[1]]}
                onValueChange={handleRangeChange}
                disabled={processing}
                minStepsBetweenThumbs={1}
              >
                <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
                  <SliderPrimitive.Range className="absolute h-full bg-primary" />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb
                  aria-label="Start"
                  className="block h-7 w-7 rounded-full border-2 border-primary bg-background shadow-md cursor-grab active:cursor-grabbing ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                />
                <SliderPrimitive.Thumb
                  aria-label="End"
                  className="block h-7 w-7 rounded-full border-2 border-primary bg-background shadow-md cursor-grab active:cursor-grabbing ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                />
              </SliderPrimitive.Root>
            </div>

            {/* Info */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <span>
                  <span className="text-muted-foreground">Start: </span>
                  <span className="font-mono font-medium">{formatTime(range[0])}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">End: </span>
                  <span className="font-mono font-medium">{formatTime(range[1])}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">Durasi: </span>
                  <span
                    className={`font-mono font-medium ${
                      valid ? 'text-primary' : 'text-destructive'
                    }`}
                  >
                    {clipDuration.toFixed(1)}s
                  </span>
                </span>
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                Total: {formatTime(duration)}
              </span>
            </div>

            {!valid && (
              <p className="text-xs text-destructive">
                Durasi clip harus antara {MIN_CLIP}–{MAX_CLIP} detik.
              </p>
            )}

            {/* Preview controls */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={togglePlay}
                disabled={processing}
              >
                {playing ? (
                  <>
                    <Pause className="h-4 w-4 mr-1" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-1" />
                    Preview
                  </>
                )}
              </Button>
              <span className="text-xs text-muted-foreground font-mono">
                {formatTime(currentTime)}
              </span>
              <audio
                ref={audioRef}
                src={audioUrl}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setPlaying(false)}
                preload="auto"
                className="hidden"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={processing}
          >
            Batal
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!valid || processing || loading || !!error}
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <Scissors className="h-4 w-4 mr-1" />
                Simpan Clip
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}