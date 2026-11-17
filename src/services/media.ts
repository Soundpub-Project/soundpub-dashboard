import { mediaApi, type MediaBinding } from '@/api/media';
import { usesBackendDomain } from '@/api/routing';
import { sha256File } from '@/lib/fileChecksum';

const mediaReference = /^\/api\/v1\/storage\/objects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/download$/i;
const multipartThresholdBytes = 24 * 1024 ** 2;
const retryDelays = [0, 1000, 3000, 5000];
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
function multipartSessionKey(binding: MediaBinding, checksum: string) {
  return `soundpub-media-multipart:${binding.category}:${binding.resource_id}:${checksum}`;
}
function getSavedMultipartId(key: string) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function saveMultipartId(key: string, id: string | null) {
  try { if (id) sessionStorage.setItem(key, id); else sessionStorage.removeItem(key); } catch { /* Resume remains best-effort when browser storage is unavailable. */ }
}
async function uploadMultipart(file: File, binding: MediaBinding, checksum: string, onProgress: (progress: number) => void) {
  const key = multipartSessionKey(binding, checksum);
  let id = getSavedMultipartId(key);
  let status = id ? await mediaApi.multipartStatus(id).catch(() => null) : null;
  if (!status) {
    saveMultipartId(key, null);
    const created = await mediaApi.requestMultipart({ ...binding, variant: binding.variant ?? 'default', visibility: 'PRIVATE',
      filename: file.name, mime_type: file.type, size: file.size, checksum });
    id = created.object.id;
    saveMultipartId(key, id);
    status = await mediaApi.multipartStatus(id);
  }
  if (!id || status.object.size !== file.size || status.object.checksum !== checksum || status.object.resource_id !== binding.resource_id) {
    saveMultipartId(key, null);
    throw new Error('Sesi upload tidak cocok dengan file yang dipilih');
  }
  if (status.completed) {
    const object = await mediaApi.complete(id);
    saveMultipartId(key, null); onProgress(100); return object;
  }
  const count = Math.ceil(file.size / status.part_size);
  const completed = new Set(status.parts);
  for (let partNumber = 1; partNumber <= count; partNumber++) {
    if (completed.has(partNumber)) continue;
    const start = (partNumber - 1) * status.part_size;
    const body = file.slice(start, Math.min(start + status.part_size, file.size));
    let uploaded = false;
    let failure: unknown;
    for (const delay of retryDelays) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      const capability = await mediaApi.multipartPart(id, partNumber);
      if (capability.size !== body.size) throw new Error('Ukuran bagian upload tidak cocok');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      try {
        const response = await fetch(capabilityUrl(capability.url), { method: 'PUT', body, credentials: 'omit', redirect: 'error', signal: controller.signal });
        if (!response.ok) throw new Error('Upload bagian gagal');
        uploaded = true; completed.add(partNumber); onProgress(Math.floor(completed.size / count * 100)); break;
      } catch (error) { failure = error; }
      finally { clearTimeout(timeout); }
    }
    if (!uploaded) throw failure instanceof Error ? failure : new Error('Upload bagian gagal');
  }
  const object = await mediaApi.complete(id);
  if (object.status !== 'ACTIVE' || object.id !== id) throw new Error('Media belum terverifikasi');
  saveMultipartId(key, null); onProgress(100); return object;
}

export async function uploadBackendMedia(file: File, binding: MediaBinding, onProgress: (progress: number) => void = () => undefined) {
  if (!usesBackendDomain('storage')) throw new Error('Backend storage mode required');
  const max = { USER_AVATAR: 5, ARTIST_PROFILE_IMAGE: 5, LABEL_LOGO: 1, RELEASE_COVER: 5, TRACK_AUDIO: 500, TRACK_CLIP: 20, TAKEDOWN_DOCUMENT: 10, PAYOUT_PROOF: 10, OTHER: 5 }[binding.category] * 1024 ** 2;
  const types = binding.category === 'TRACK_AUDIO' ? ['audio/wav', 'audio/x-wav', 'audio/flac', 'audio/aiff', 'audio/x-aiff', 'audio/mpeg']
    : binding.category === 'TRACK_CLIP' ? ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/x-wav']
    : ['TAKEDOWN_DOCUMENT', 'PAYOUT_PROOF'].includes(binding.category) ? ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
    : ['image/png', 'image/jpeg', 'image/webp'];
  if (!file.size || file.size > max || !types.includes(file.type)) throw new Error('Jenis atau ukuran file tidak didukung');
  const checksum = await sha256File(file);
  if (binding.category === 'TRACK_AUDIO' && file.size > multipartThresholdBytes) return uploadMultipart(file, binding, checksum, onProgress);
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
