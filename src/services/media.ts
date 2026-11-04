import { mediaApi, type MediaBinding } from '@/api/media';
import { usesBackendDomain } from '@/api/routing';

const mediaReference = /^\/api\/v1\/storage\/objects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/download$/i;
export const mediaIdFromReference = (value?: string | null) => value?.match(mediaReference)?.[1] ?? null;
export function capabilityUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid media capability');
  return url.href;
}
export async function resolveMediaDownload(reference: string) {
  if (!usesBackendDomain('storage')) {
    if (usesBackendDomain('releases')) throw new Error('Backend storage mode required');
    return reference;
  }
  const id = mediaIdFromReference(reference);
  if (!id) throw new Error('Media backend belum tersedia');
  const capability = await mediaApi.download(id);
  if (!Number.isFinite(Date.parse(capability.expires_at)) || Date.parse(capability.expires_at) <= Date.now()) throw new Error('Expired media capability');
  return capabilityUrl(capability.url);
}
export async function uploadBackendMedia(file: File, binding: MediaBinding) {
  if (!usesBackendDomain('storage')) throw new Error('Backend storage mode required');
  const max = { USER_AVATAR: 5, LABEL_LOGO: 1, RELEASE_COVER: 5, TRACK_AUDIO: 500, OTHER: 5 }[binding.category] * 1024 ** 2;
  const types = binding.category === 'TRACK_AUDIO' ? ['audio/wav', 'audio/x-wav', 'audio/flac', 'audio/aiff', 'audio/x-aiff', 'audio/mpeg'] : ['image/png', 'image/jpeg', 'image/webp'];
  if (!file.size || file.size > max || !types.includes(file.type)) throw new Error('Jenis atau ukuran file tidak didukung');
  // ponytail: Web Crypto hashes whole file in memory, capped at 500 MiB; use worker streaming hash if larger files are required.
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
  const checksum = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  const upload = await mediaApi.request({ ...binding, variant: binding.variant ?? 'default', visibility: 'PRIVATE', filename: file.name, mime_type: file.type, size: file.size, checksum });
  let uploaded = false;
  try {
    if (upload.method !== 'PUT' || !upload.object?.id) throw new Error('Invalid upload capability');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000);
    try {
      const response = await fetch(capabilityUrl(upload.url), { method: 'PUT', headers: upload.headers, body: file, credentials: 'omit', redirect: 'error', signal: controller.signal });
      if (!response.ok) throw new Error('Upload gagal');
      uploaded = true;
    } finally { clearTimeout(timeout); }
    const object = await mediaApi.complete(upload.object.id);
    if (object.status !== 'ACTIVE' || object.id !== upload.object.id) throw new Error('Media belum terverifikasi');
    return object;
  } catch (error) {
    // Completion may have committed despite a lost response. Never delete an uncertain active replacement.
    if (!uploaded && upload.object?.id) await mediaApi.abort(upload.object.id).catch(() => undefined);
    throw error;
  }
}
