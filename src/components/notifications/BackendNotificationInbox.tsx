import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useBackendNotifications } from '@/hooks/useBackendNotifications';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bell } from 'lucide-react';

export function BackendNotificationInbox() {
  const { user } = useAuth();
  return <Inbox key={user?.id ?? 'signed-out'} userId={user?.id} />;
}

function Inbox({ userId }: { userId?: string }) {
  const inbox = useBackendNotifications(userId);
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button variant="ghost" size="icon" aria-label={`Notifikasi, ${inbox.count} belum dibaca`} className="relative"><Bell className="h-5 w-5" />{inbox.count > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-destructive px-1 text-xs text-destructive-foreground">{inbox.count > 99 ? '99+' : inbox.count}</span>}</Button></PopoverTrigger>
    <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-3">
      <h2 className="font-semibold">Notifikasi</h2>
      {inbox.error && <div role="alert">{inbox.error} <Button variant="outline" onClick={inbox.retry}>Coba lagi</Button></div>}
      {inbox.loading && <p role="status">Memuat…</p>}
      {inbox.count > 0 && <Button disabled={inbox.busy} onClick={() => void inbox.markRead()}>Tandai semua dibaca</Button>}
      <div className="max-h-80 overflow-y-auto space-y-2">{inbox.items.map(item => <button key={item.id} className={`block w-full rounded border p-3 text-left ${item.read_at ? '' : 'bg-primary/5'}`} disabled={inbox.busy} onClick={() => void inbox.markRead(item.id, !item.read_at)}><strong className="block text-sm">{item.title}</strong><span className="block text-sm whitespace-pre-wrap">{item.body}</span><time className="text-xs text-muted-foreground" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('id-ID')}</time><span className="block text-xs text-primary">{item.read_at ? 'Tandai belum dibaca' : 'Tandai dibaca'}</span></button>)}</div>
      {inbox.cursor && <Button disabled={inbox.busy || inbox.loading} onClick={() => void inbox.loadMore()}>Muat lebih banyak</Button>}
      {!inbox.loading && !inbox.error && inbox.items.length === 0 && <p>Belum ada notifikasi</p>}
    </PopoverContent>
  </Popover>;
}
