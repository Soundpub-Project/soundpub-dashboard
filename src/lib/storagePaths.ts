const STORAGE_SLUG_MAX_LENGTH = 80;

export const slugifyStorageName = (value?: string | null, fallback = 'untitled') => {
  const slug = (value || fallback)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, STORAGE_SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');

  return slug || fallback;
};

export const shortStorageId = (value?: string | null) => {
  if (!value) return null;
  return value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase() || null;
};

interface ReleaseStorageFolderOptions {
  userId: string;
  releaseTitle?: string | null;
  releaseId?: string | null;
}

export const buildReleaseStorageFolder = ({ userId, releaseTitle, releaseId }: ReleaseStorageFolderOptions) => {
  const releaseSlug = slugifyStorageName(releaseTitle, 'release');
  const releaseIdPart = shortStorageId(releaseId);
  return `${userId}/${releaseIdPart ? `${releaseSlug}-${releaseIdPart}` : releaseSlug}`;
};

interface TrackStoragePathOptions extends ReleaseStorageFolderOptions {
  trackIndex: number;
  trackTitle?: string | null;
  trackId?: string | null;
  uploadId?: string | null;
  extension?: string | null;
  type: 'audio' | 'clip';
}

export const buildTrackStoragePath = ({
  userId,
  releaseTitle,
  releaseId,
  trackIndex,
  trackTitle,
  trackId,
  uploadId,
  extension,
  type,
}: TrackStoragePathOptions) => {
  const folder = buildReleaseStorageFolder({ userId, releaseTitle, releaseId });
  const trackNumber = String(trackIndex + 1).padStart(2, '0');
  const trackSlug = slugifyStorageName(trackTitle, `track-${trackNumber}`);
  const trackIdPart = shortStorageId(trackId);
  const suffix = type === 'audio' ? 'master' : 'clip';
  const safeExtension = (extension || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const uploadIdPart = shortStorageId(uploadId);
  const fileName = [trackNumber, trackSlug, trackIdPart, suffix, uploadIdPart].filter(Boolean).join('-');

  return `${folder}/${fileName}.${safeExtension}`;
};

interface CoverStoragePathOptions extends ReleaseStorageFolderOptions {
  extension?: string | null;
  uploadId?: string | null;
}

export const buildCoverStoragePath = ({ userId, releaseTitle, releaseId, extension, uploadId }: CoverStoragePathOptions) => {
  const folder = buildReleaseStorageFolder({ userId, releaseTitle, releaseId });
  const releaseSlug = slugifyStorageName(releaseTitle, 'release');
  const releaseIdPart = shortStorageId(releaseId);
  const safeExtension = (extension || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const uploadIdPart = shortStorageId(uploadId);
  const fileName = ['cover', releaseSlug, releaseIdPart, uploadIdPart].filter(Boolean).join('-');

  return `${folder}/${fileName}.${safeExtension}`;
};
