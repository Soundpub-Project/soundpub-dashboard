import { useEffect, useState } from 'react';
import { notificationsApi, type BackendNotification } from '@/api/notifications';

export function useBackendNotifications(userId?: string) {
  const [items, setItems] = useState<BackendNotification[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  useEffect(() => {
    setError('');
    if (!userId) { setLoading(false); return; }
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        const [page, unread] = await Promise.all([notificationsApi.list(undefined, controller.signal), notificationsApi.unread(controller.signal)]);
        if (!controller.signal.aborted) { setItems(page.items); setCursor(page.nextCursor); setCount(unread.count); setError(''); }
      } catch { if (!controller.signal.aborted) setError('Gagal memuat notifikasi'); }
      finally { pending = false; if (!controller.signal.aborted) setLoading(false); }
    };
    setLoading(true);
    void refresh();
    // ponytail: 30-second polling; add push delivery only if product needs lower latency.
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [userId, revision]);
  const mutate = async (id?: string, read = true) => {
    if (!userId || busy) return;
    setBusy(true);
    try { if (id) { if (read) await notificationsApi.read(id); else await notificationsApi.unreadOne(id); } else await notificationsApi.readAll(); setRevision(value => value + 1); }
    catch { setError('Gagal memperbarui notifikasi'); }
    finally { setBusy(false); }
  };
  const loadMore = async () => {
    if (!userId || busy || !cursor) return;
    setBusy(true);
    try {
      const page = await notificationsApi.list(cursor);
      if (page.nextCursor === cursor) throw new Error('Invalid notification cursor');
      setItems(current => [...new Map([...current, ...page.items].map(item => [item.id, item])).values()]);
      setCursor(page.nextCursor);
    } catch { setError('Gagal memuat notifikasi'); }
    finally { setBusy(false); }
  };
  return { items, count, error, loading, busy, cursor, markRead: mutate, loadMore, retry: () => setRevision(value => value + 1) };
}
