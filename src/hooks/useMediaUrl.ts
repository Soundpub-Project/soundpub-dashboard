import { useEffect, useState } from 'react';
import { usesBackendDomain } from '@/api/routing';
import { mediaApi } from '@/api/media';
import { capabilityUrl, mediaIdFromReference } from '@/services/media';
import { useAuth } from '@/hooks/useAuth';

export function useMediaUrl(reference?: string | null, autoRefresh = true) {
  const { user } = useAuth();
  const userId = user?.id;
  const [result, setResult] = useState<{ reference: string; userId: string; url: string } | null>(null);
  const backend = usesBackendDomain('storage');
  useEffect(() => {
    if (!backend || !userId || !reference) return;
    const id = mediaIdFromReference(reference);
    if (!id) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const capability = await mediaApi.download(id);
        if (!active) return;
        const expires = Date.parse(capability.expires_at);
        if (!Number.isFinite(expires) || expires <= Date.now()) throw new Error('Expired media capability');
        setResult({ reference, userId, url: capabilityUrl(capability.url) });
        if (autoRefresh) timer = setTimeout(() => void refresh(), Math.max(1000, Math.min(45000, expires - Date.now() - 10000)));
      } catch { if (active) setResult(null); }
    };
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [reference, userId, backend, autoRefresh]);
  return backend ? (result?.reference === reference && result?.userId === user?.id ? result.url : undefined) : reference || undefined;
}
