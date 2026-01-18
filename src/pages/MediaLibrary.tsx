import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Loader2,
  Search,
  Trash2,
  Image as ImageIcon,
  Music,
  FileAudio,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  FolderOpen,
  HardDrive,
} from 'lucide-react';

interface GCSFile {
  name: string;
  size: number;
  contentType: string;
  created: string;
  updated: string;
  publicUrl: string;
  folder: string | null;
}

interface OrphanFile extends GCSFile {
  reason: string;
}

const FOLDERS = ['covers', 'audio', 'clips'] as const;
type FolderType = typeof FOLDERS[number];

const FOLDER_CONFIG: Record<FolderType, { label: string; icon: React.ReactNode; color: string }> = {
  covers: { label: 'Cover Images', icon: <ImageIcon className="h-4 w-4" />, color: 'bg-blue-500' },
  audio: { label: 'Full Audio', icon: <Music className="h-4 w-4" />, color: 'bg-green-500' },
  clips: { label: 'Audio Clips', icon: <FileAudio className="h-4 w-4" />, color: 'bg-purple-500' },
};

export default function MediaLibrary() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  
  const [activeFolder, setActiveFolder] = useState<FolderType>('covers');
  const [files, setFiles] = useState<GCSFile[]>([]);
  const [orphanFiles, setOrphanFiles] = useState<OrphanFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<GCSFile | null>(null);
  const [scanningOrphans, setScanningOrphans] = useState(false);
  const [stats, setStats] = useState<Record<FolderType, { count: number; size: number }>>({
    covers: { count: 0, size: 0 },
    audio: { count: 0, size: 0 },
    clips: { count: 0, size: 0 },
  });

  useEffect(() => {
    loadFiles(activeFolder);
  }, [activeFolder]);

  const loadFiles = async (folder: FolderType) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gcs-manage', {
        body: { action: 'list_files', folder, max_results: 500 },
      });

      if (error) throw error;

      const filesList = data?.files || [];
      setFiles(filesList);

      // Update stats for this folder
      const totalSize = filesList.reduce((sum: number, f: GCSFile) => sum + f.size, 0);
      setStats(prev => ({
        ...prev,
        [folder]: { count: filesList.length, size: totalSize },
      }));

    } catch (error: any) {
      console.error('Error loading files:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal memuat daftar file',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const scanOrphanFiles = async () => {
    setScanningOrphans(true);
    try {
      // Load all files from all folders
      const allFilesPromises = FOLDERS.map(folder =>
        supabase.functions.invoke('gcs-manage', {
          body: { action: 'list_files', folder, max_results: 1000 },
        })
      );

      const results = await Promise.all(allFilesPromises);
      
      let allFiles: GCSFile[] = [];
      results.forEach((result, index) => {
        if (result.data?.files) {
          allFiles = allFiles.concat(result.data.files);
        }
      });

      // Get all referenced URLs from database
      const [releasesResult, tracksResult] = await Promise.all([
        supabase.from('releases').select('cover_url'),
        supabase.from('tracks').select('audio_url, clip_url'),
      ]);

      const referencedUrls = new Set<string>();
      
      releasesResult.data?.forEach(r => {
        if (r.cover_url) referencedUrls.add(r.cover_url);
      });
      
      tracksResult.data?.forEach(t => {
        if (t.audio_url) referencedUrls.add(t.audio_url);
        if (t.clip_url) referencedUrls.add(t.clip_url);
      });

      // Find orphan files
      const orphans: OrphanFile[] = allFiles
        .filter(file => !referencedUrls.has(file.publicUrl))
        .map(file => ({
          ...file,
          reason: 'Tidak ada referensi di database',
        }));

      setOrphanFiles(orphans);
      
      toast({
        title: 'Scan Selesai',
        description: `Ditemukan ${orphans.length} file orphan dari ${allFiles.length} total file`,
      });

    } catch (error: any) {
      console.error('Error scanning orphans:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal scan orphan files',
        variant: 'destructive',
      });
    } finally {
      setScanningOrphans(false);
    }
  };

  const handleDeleteFile = async () => {
    if (!fileToDelete) return;

    setDeletingFile(fileToDelete.name);
    try {
      const { error } = await supabase.functions.invoke('gcs-manage', {
        body: { action: 'delete_file', file_path: fileToDelete.name },
      });

      if (error) throw error;

      setFiles(prev => prev.filter(f => f.name !== fileToDelete.name));
      setOrphanFiles(prev => prev.filter(f => f.name !== fileToDelete.name));
      
      toast({
        title: 'Berhasil',
        description: 'File berhasil dihapus',
      });
    } catch (error: any) {
      console.error('Error deleting file:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal menghapus file',
        variant: 'destructive',
      });
    } finally {
      setDeletingFile(null);
      setShowDeleteDialog(false);
      setFileToDelete(null);
    }
  };

  const deleteAllOrphans = async () => {
    if (orphanFiles.length === 0) return;

    const confirmed = window.confirm(
      `Yakin ingin menghapus ${orphanFiles.length} file orphan? Aksi ini tidak dapat dibatalkan.`
    );

    if (!confirmed) return;

    let deleted = 0;
    let failed = 0;

    for (const file of orphanFiles) {
      try {
        await supabase.functions.invoke('gcs-manage', {
          body: { action: 'delete_file', file_path: file.name },
        });
        deleted++;
      } catch {
        failed++;
      }
    }

    setOrphanFiles([]);
    loadFiles(activeFolder);

    toast({
      title: 'Cleanup Selesai',
      description: `${deleted} file dihapus, ${failed} gagal`,
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Akses tidak diizinkan</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Media Library</h1>
            <p className="text-muted-foreground">
              Kelola semua file media di Google Cloud Storage
            </p>
          </div>
          <Button
            variant="outline"
            onClick={scanOrphanFiles}
            disabled={scanningOrphans}
          >
            {scanningOrphans ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <AlertTriangle className="h-4 w-4 mr-2" />
            )}
            Scan Orphan Files
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FOLDERS.map(folder => (
            <Card key={folder} className="bg-card/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${FOLDER_CONFIG[folder].color}`}>
                      {FOLDER_CONFIG[folder].icon}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{FOLDER_CONFIG[folder].label}</p>
                      <p className="text-2xl font-bold">{stats[folder].count}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Size</p>
                    <p className="font-medium">{formatFileSize(stats[folder].size)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Orphan Files Alert */}
        {orphanFiles.length > 0 && (
          <Card className="border-yellow-500/50 bg-yellow-500/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  <CardTitle className="text-lg">Orphan Files Ditemukan</CardTitle>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={deleteAllOrphans}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Hapus Semua ({orphanFiles.length})
                </Button>
              </div>
              <CardDescription>
                File-file berikut tidak memiliki referensi di database dan bisa dihapus
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-48 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama File</TableHead>
                      <TableHead>Ukuran</TableHead>
                      <TableHead>Alasan</TableHead>
                      <TableHead className="w-20">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orphanFiles.slice(0, 10).map(file => (
                      <TableRow key={file.name}>
                        <TableCell className="font-mono text-xs truncate max-w-[200px]">
                          {file.name}
                        </TableCell>
                        <TableCell>{formatFileSize(file.size)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {file.reason}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setFileToDelete(file);
                              setShowDeleteDialog(true);
                            }}
                            disabled={deletingFile === file.name}
                          >
                            {deletingFile === file.name ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-destructive" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {orphanFiles.length > 10 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    ... dan {orphanFiles.length - 10} file lainnya
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                <CardTitle>File Browser</CardTitle>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari file..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => loadFiles(activeFolder)}
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeFolder} onValueChange={(v) => setActiveFolder(v as FolderType)}>
              <TabsList className="grid w-full grid-cols-3">
                {FOLDERS.map(folder => (
                  <TabsTrigger key={folder} value={folder} className="gap-2">
                    {FOLDER_CONFIG[folder].icon}
                    <span className="hidden sm:inline">{FOLDER_CONFIG[folder].label}</span>
                    <Badge variant="secondary" className="ml-1">
                      {stats[folder].count}
                    </Badge>
                  </TabsTrigger>
                ))}
              </TabsList>

              {FOLDERS.map(folder => (
                <TabsContent key={folder} value={folder} className="mt-4">
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : filteredFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <HardDrive className="h-12 w-12 mb-4" />
                      <p>Tidak ada file di folder ini</p>
                    </div>
                  ) : (
                    <div className="rounded-md border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nama File</TableHead>
                            <TableHead>Tipe</TableHead>
                            <TableHead>Ukuran</TableHead>
                            <TableHead>Tanggal Upload</TableHead>
                            <TableHead className="w-24">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredFiles.map(file => (
                            <TableRow key={file.name}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {activeFolder === 'covers' ? (
                                    <img
                                      src={file.publicUrl}
                                      alt={file.name}
                                      className="h-10 w-10 rounded object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).src = '/placeholder.svg';
                                      }}
                                    />
                                  ) : (
                                    <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                      <Music className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                  )}
                                  <span className="font-mono text-xs truncate max-w-[200px]">
                                    {file.name.split('/').pop()}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="font-mono text-xs">
                                  {file.contentType.split('/').pop()}
                                </Badge>
                              </TableCell>
                              <TableCell>{formatFileSize(file.size)}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {formatDate(file.created)}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => window.open(file.publicUrl, '_blank')}
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setFileToDelete(file);
                                      setShowDeleteDialog(true);
                                    }}
                                    disabled={deletingFile === file.name}
                                  >
                                    {deletingFile === file.name ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus File?</AlertDialogTitle>
            <AlertDialogDescription>
              File <strong>{fileToDelete?.name.split('/').pop()}</strong> akan dihapus permanen.
              Aksi ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFile}
              className="bg-destructive hover:bg-destructive/90"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
