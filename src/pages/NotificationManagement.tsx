import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, Loader2, Pencil, Trash2, Search, Globe, User } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

interface Notification {
  id: string;
  user_id: string | null;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  is_global: boolean;
  metadata: Record<string, any>;
  created_at: string;
}

export default function NotificationManagement() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'global' | 'personal'>('all');

  // Edit dialog
  const [editNotif, setEditNotif] = useState<Notification | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete dialog
  const [deleteNotif, setDeleteNotif] = useState<Notification | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isAdmin) fetchNotifications();
  }, [isAdmin]);

  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setNotifications((data || []) as Notification[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!editNotif) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ title: editTitle, message: editMessage })
        .eq('id', editNotif.id);
      if (error) throw error;
      toast.success('Notifikasi berhasil diperbarui');
      setEditNotif(null);
      fetchNotifications();
    } catch (err: any) {
      toast.error(err.message || 'Gagal memperbarui');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteNotif) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', deleteNotif.id);
      if (error) throw error;
      toast.success('Notifikasi berhasil dihapus');
      setDeleteNotif(null);
      fetchNotifications();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menghapus');
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (n: Notification) => {
    setEditNotif(n);
    setEditTitle(n.title);
    setEditMessage(n.message);
  };

  const filtered = notifications.filter(n => {
    const matchSearch = n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.message.toLowerCase().includes(searchTerm.toLowerCase());
    const matchFilter = filter === 'all' || (filter === 'global' ? n.is_global : !n.is_global);
    return matchSearch && matchFilter;
  });

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      success: 'bg-green-500/20 text-green-600',
      warning: 'bg-yellow-500/20 text-yellow-600',
      error: 'bg-red-500/20 text-red-600',
      release: 'bg-blue-500/20 text-blue-600',
      announcement: 'bg-primary/20 text-primary',
      info: 'bg-muted text-muted-foreground',
      payout: 'bg-purple-500/20 text-purple-600',
    };
    return colors[type] || colors.info;
  };

  if (authLoading) {
    return <DashboardLayout><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></DashboardLayout>;
  }
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Kelola Notifikasi</h1>
          <p className="text-muted-foreground">Edit atau hapus notifikasi yang sudah dipublish ke dashboard</p>
        </div>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                Daftar Notifikasi ({filtered.length})
              </CardTitle>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari notifikasi..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
            </div>
            <Tabs value={filter} onValueChange={v => setFilter(v as any)} className="mt-4">
              <TabsList>
                <TabsTrigger value="all">Semua</TabsTrigger>
                <TabsTrigger value="global" className="gap-1"><Globe className="h-3 w-3" />Global</TabsTrigger>
                <TabsTrigger value="personal" className="gap-1"><User className="h-3 w-3" />Personal</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Tidak ada notifikasi</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipe</TableHead>
                      <TableHead>Judul</TableHead>
                      <TableHead className="hidden md:table-cell">Pesan</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Waktu</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(n => (
                      <TableRow key={n.id}>
                        <TableCell>
                          <Badge className={`capitalize ${getTypeBadge(n.type)}`}>{n.type}</Badge>
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">{n.title}</TableCell>
                        <TableCell className="hidden md:table-cell max-w-[300px] truncate text-muted-foreground text-sm">{n.message}</TableCell>
                        <TableCell>
                          {n.is_global ? (
                            <Badge variant="outline" className="gap-1"><Globe className="h-3 w-3" />Global</Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1"><User className="h-3 w-3" />Personal</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: localeId })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(n)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteNotif(n)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editNotif} onOpenChange={() => setEditNotif(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Notifikasi</DialogTitle>
            <DialogDescription>Ubah judul atau pesan notifikasi dashboard</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Judul</label>
              <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Pesan</label>
              <Textarea value={editMessage} onChange={e => setEditMessage(e.target.value)} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditNotif(null)}>Batal</Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteNotif} onOpenChange={() => setDeleteNotif(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Notifikasi</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus notifikasi <strong>"{deleteNotif?.title}"</strong>? Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
