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
  Download,
} from 'lucide-react';

interface StorageFile {
  name: string;
  size: number;
  contentType: string | undefined;
  created: string;
  updated: string;
  publicUrl: string;
  folder: string | null;
  bucket: string;
  urlStatus: 'ready' | 'unavailable';
  urlError?: string;
}

interface OrphanFile extends StorageFile {
  reason: string;
}

// Supabase Storage buckets
const BUCKETS = ['release-covers', 'track-audio', 'audio-clips'] as const;
type BucketType = typeof BUCKETS[number];

const BUCKET_CONFIG: Record<BucketType, { label: string; icon: React.ReactNode; color: string; isPublic: boolean }> = {
  'release-covers': { label: 'Cover Images', icon: <ImageIcon className="h-4 w-4" />, color: 'bg-blue-500', isPublic: false },
  'track-audio': { label: 'Full Audio', icon: <Music className="h-4 w-4" />, color: 'bg-green-500', isPublic: false },
  'audio-clips': { label: 'Audio Clips', icon: <FileAudio className="h-4 w-4" />, color: 'bg-purple-500', isPublic: true },
};

type StorageListItem = {
  id?: string | null;
  name?: string | null;
  metadata?: { size?: number; mimetype?: string } | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const isFolderLikeStorageItem = (item: StorageListItem) => {
  return !item.id && !item.created_at && !item.metadata;
};

const buildStorageFile = async (bucket: BucketType, item: StorageListItem, folderPath = ''): Promise<StorageFile | null> => {
  if (!item.name || isFolderLikeStorageItem(item)) return null;

  const objectPath = folderPath ? `${folderPath}/${item.name}` : item.name;

  const bucketConfig = BUCKET_CONFIG[bucket];
  let publicUrl = '';
  let urlStatus: StorageFile['urlStatus'] = 'ready';
  let urlError: string | undefined;

  if (bucketConfig.isPublic) {
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(objectPath);
    publicUrl = urlData.publicUrl;
  } else {
    try {
      const { data: signedData, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(objectPath, 3600);

      if (error) {
        console.error(`Error creating signed URL for ${bucket}/${objectPath}:`, error);
        urlStatus = 'unavailable';
        urlError = error.message || 'Signed URL tidak tersedia';
      } else if (signedData?.signedUrl) {
        publicUrl = signedData.signedUrl;
      } else {
        urlStatus = 'unavailable';
        urlError = 'Signed URL tidak tersedia';
      }
    } catch (err: any) {
      console.error(`Exception creating signed URL for ${bucket}/${objectPath}:`, err);
      urlStatus = 'unavailable';
      urlError = err.message || 'Error saat membuat signed URL';
    }
  }

  return {
    name: objectPath,
    size: item.metadata?.size || 0,
    contentType: item.metadata?.mimetype,
    created: item.created_at || '',
    updated: item.updated_at || item.created_at || '',
    publicUrl,
    folder: null,
    bucket,
    urlStatus,
    urlError,
  };
};

const listStorageFilesRecursive = async (bucket: BucketType, folderPath = ''): Promise<StorageFile[]> => {
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(folderPath, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });

  if (error) throw error;

  const results = await Promise.all(
    (data || []).map(async (item) => {
      if (!item.name) return [] as StorageFile[];

      if (isFolderLikeStorageItem(item)) {
        const nextPath = folderPath ? `${folderPath}/${item.name}` : item.name;
        return listStorageFilesRecursive(bucket, nextPath);
      }

      const file = await buildStorageFile(bucket, item, folderPath);
      return file ? [file] : [];
    })
  );

  return results.flat();
};

const getStorageReferenceKeys = (url: string | null, bucket: BucketType) => {
  const keys = new Set<string>();
  if (!url) return keys;

  const addPath = (path: string) => {
    const cleanPath = decodeURIComponent(path).replace(/^\/+/, '');
    if (!cleanPath) return;
    keys.add(`${bucket}:${cleanPath}`);
    const fileName = cleanPath.split('/').pop();
    if (fileName) keys.add(`${bucket}:${fileName}`);
  };

  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const bucketIndex = pathParts.findIndex(part => part === bucket);

    if (bucketIndex >= 0 && pathParts[bucketIndex + 1]) {
      addPath(pathParts.slice(bucketIndex + 1).join('/'));
    } else {
      addPath(pathParts[pathParts.length - 1] || '');
    }
  } catch {
    addPath(url.split('/').pop() || url);
  }

  return keys;
};

export default function MediaLibrary() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  
  const [activeBucket, setActiveBucket] = useState<BucketType>('release-covers');
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [orphanFiles, setOrphanFiles] = useState<OrphanFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<StorageFile | null>(null);
  const [scanningOrphans, setScanningOrphans] = useState(false);
  const [stats, setStats] = useState<Record<BucketType, { count: number; size: number }>>({
    'release-covers': { count: 0, size: 0 },
    'track-audio': { count: 0, size: 0 },
    'audio-clips': { count: 0, size: 0 },
  });

  useEffect(() => {
    loadFiles(activeBucket);
  }, [activeBucket]);

  const loadFiles = async (bucket: BucketType) => {
    setLoading(true);
    try {
      // Use recursive listing to get all files including subdirectories
      const filesList = await listStorageFilesRecursive(bucket);
      
      setFiles(filesList);

      // Update stats for this bucket
      const totalSize = filesList.reduce((sum, f) => sum + f.size, 0);
      setStats(prev => ({
        ...prev,
        [bucket]: { count: filesList.length, size: totalSize },
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
      // Load all files from all buckets
      const allFilesPromises = BUCKETS.map(async (bucket) => {
        try {
          return await listStorageFilesRecursive(bucket);
        } catch (err) {
          console.error(`Error listing files in bucket ${bucket}:`, err);
          return [];
        }
      });

      const results = await Promise.all(allFilesPromises);
      const allFiles = results.flat();

      console.log(`Total files found: ${allFiles.length}`);

      // Get all referenced URLs from database
      const [releasesResult, tracksResult] = await Promise.all([
        supabase.from('releases').select('cover_url').throwOnError(),
        supabase.from('tracks').select('audio_url, clip_url').throwOnError(),
      ]);

      const referencedUrls = new Set<string>();
      
      releasesResult.data?.forEach(r => {
        if (r.cover_url) {
          getStorageReferenceKeys(r.cover_url, 'release-covers').forEach(key => referencedUrls.add(key));
        }
      });
      
      tracksResult.data?.forEach(t => {
        if (t.audio_url) {
          getStorageReferenceKeys(t.audio_url, 'track-audio').forEach(key => referencedUrls.add(key));
        }
        if (t.clip_url) {
          getStorageReferenceKeys(t.clip_url, 'audio-clips').forEach(key => referencedUrls.add(key));
        }
      });

      console.log(`Referenced URLs: ${referencedUrls.size}`);

      // Find orphan files
      const orphans: OrphanFile[] = allFiles
        .filter(file => !referencedUrls.has(`${file.bucket}:${file.name}`) && !referencedUrls.has(`${file.bucket}:${file.name.split('/').pop()}`))
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
      const { error } = await supabase.storage
        .from(fileToDelete.bucket)
        .remove([fileToDelete.name]);

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

    // Group files by bucket for efficient deletion
    const filesByBucket: Record<string, string[]> = {};
    orphanFiles.forEach(file => {
      if (!filesByBucket[file.bucket]) {
        filesByBucket[file.bucket] = [];
      }
      filesByBucket[file.bucket].push(file.name);
    });

    for (const [bucket, fileNames] of Object.entries(filesByBucket)) {
      try {
        const { error } = await supabase.storage.from(bucket).remove(fileNames);
        if (!error) {
          deleted += fileNames.length;
        } else {
          failed += fileNames.length;
        }
      } catch {
        failed += fileNames.length;
      }
    }

    setOrphanFiles([]);
    loadFiles(activeBucket);

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
    if (!dateStr) return '-';
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
              Kelola semua file media di Supabase Storage
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
          {BUCKETS.map(bucket => (
            <Card key={bucket} className="bg-card/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${BUCKET_CONFIG[bucket].color}`}>
                      {BUCKET_CONFIG[bucket].icon}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{BUCKET_CONFIG[bucket].label}</p>
                      <p className="text-2xl font-bold">{stats[bucket].count}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Size</p>
                    <p className="font-medium">{formatFileSize(stats[bucket].size)}</p>
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
                      <TableHead>Bucket</TableHead>
                      <TableHead>Ukuran</TableHead>
                      <TableHead>Alasan</TableHead>
                      <TableHead className="w-20">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orphanFiles.slice(0, 10).map(file => (
                      <TableRow key={`${file.bucket}-${file.name}`}>
                        <TableCell className="font-mono text-xs truncate max-w-[200px]">
                          {file.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{file.bucket}</Badge>
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
                  onClick={() => loadFiles(activeBucket)}
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeBucket} onValueChange={(v) => setActiveBucket(v as BucketType)}>
              <TabsList className="grid w-full grid-cols-3">
                {BUCKETS.map(bucket => (
                  <TabsTrigger key={bucket} value={bucket} className="gap-2">
                    {BUCKET_CONFIG[bucket].icon}
                    <span className="hidden sm:inline">{BUCKET_CONFIG[bucket].label}</span>
                    <Badge variant="secondary" className="ml-1">
                      {stats[bucket].count}
                    </Badge>
                  </TabsTrigger>
                ))}
              </TabsList>

              {BUCKETS.map(bucket => (
                <TabsContent key={bucket} value={bucket} className="mt-4">
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : filteredFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <HardDrive className="h-12 w-12 mb-4" />
                      <p>Tidak ada file di bucket ini</p>
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
                                  {activeBucket === 'release-covers' && file.publicUrl ? (
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
                                  <div className="min-w-0 space-y-1">
                                    <span className="block font-mono text-xs truncate max-w-[200px]">
                                      {file.name}
                                    </span>
                                    {file.urlStatus === 'unavailable' && (
                                      <Badge variant="destructive" className="text-[10px]">
                                        URL tidak tersedia
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {file.contentType?.split('/')[1]?.toUpperCase() || 'Unknown'}
                                </Badge>
                              </TableCell>
                              <TableCell>{formatFileSize(file.size)}</TableCell>
                              <TableCell>{formatDate(file.created)}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => file.publicUrl && window.open(file.publicUrl, '_blank')}
                                    title={file.urlError || 'Lihat file'}
                                    disabled={!file.publicUrl}
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      if (!file.publicUrl) return;
                                      const link = document.createElement('a');
                                      link.href = file.publicUrl;
                                      link.download = file.name;
                                      link.target = '_blank';
                                      link.click();
                                    }}
                                    title={file.urlError || 'Download file'}
                                    disabled={!file.publicUrl}
                                  >
                                    <Download className="h-4 w-4" />
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
              Apakah Anda yakin ingin menghapus file <strong>{fileToDelete?.name}</strong>?
              <br />
              Aksi ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFile}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}









