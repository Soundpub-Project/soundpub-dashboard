// Web Audio API helpers for client-side audio clipping.
// No external deps. Encodes output as 16-bit PCM WAV.

import { supabase } from '@/integrations/supabase/client';

/**
 * Convert any track-audio storage URL (public or signed/expired) into a
 * fresh short-lived signed URL. Returns the original URL if it doesn't
 * point at the private `track-audio` bucket (e.g. blob:/data: URLs).
 */
export async function resolveTrackAudioUrl(url: string): Promise<string> {
  if (!url) return url;
  const match = url.match(
    /\/storage\/v1\/object\/(?:public|sign)\/track-audio\/([^?#]+)/,
  );
  if (!match) return url;
  const path = decodeURIComponent(match[1]);
  const { data, error } = await supabase.storage
    .from('track-audio')
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) {
    throw new Error('Gagal mengakses file audio');
  }
  return data.signedUrl;
}

export async function decodeAudioFromUrl(url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal mengunduh audio (${res.status})`);
  const arrayBuffer = await res.arrayBuffer();
  const Ctx: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    return buffer;
  } finally {
    // Close async; ignore errors.
    ctx.close().catch(() => {});
  }
}

export function extractPeaks(buffer: AudioBuffer, samples: number): number[] {
  const channelData = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(channelData.length / samples));
  const peaks: number[] = new Array(samples);
  for (let i = 0; i < samples; i++) {
    const start = i * blockSize;
    let max = 0;
    for (let j = 0; j < blockSize; j++) {
      const v = Math.abs(channelData[start + j] || 0);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  return peaks;
}

export function sliceAudioBuffer(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * sr));
  const endSample = Math.min(buffer.length, Math.floor(endSec * sr));
  const length = Math.max(1, endSample - startSample);
  const Ctx: any =
    (window as any).OfflineAudioContext ||
    (window as any).webkitOfflineAudioContext;
  // Use AudioBuffer constructor via OfflineAudioContext for portability.
  const offline = new Ctx(buffer.numberOfChannels, length, sr);
  const out: AudioBuffer = offline.createBuffer(
    buffer.numberOfChannels,
    length,
    sr,
  );
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch).subarray(startSample, endSample);
    out.getChannelData(ch).set(src);
  }
  return out;
}

export function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const numSamples = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = numSamples * blockAlign;
  const bufferSize = 44 + dataSize;
  const ab = new ArrayBuffer(bufferSize);
  const view = new DataView(ab);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave channels and write samples
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numCh; ch++) channels.push(buffer.getChannelData(ch));

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      let s = Math.max(-1, Math.min(1, channels[ch][i]));
      s = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(offset, s, true);
      offset += 2;
    }
  }

  return new Blob([ab], { type: 'audio/wav' });
}

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}