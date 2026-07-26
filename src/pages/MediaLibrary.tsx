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

  // Recursively list every file in a bucket (walks folders).
  // Storage.list() returns folder entries as items with `id === null` and no metadata —
  // treating those as files was the root of the orphan-scan bug (folders re-appeared
  // after "delete" because remove() on a folder path silently no-ops).
  const listAllFiles = async (
    bucket: BucketType,
    prefix = '',
  ): Promise<Array<{ path: string; item: any }>> => {
    const results: Array<{ path: string; item: any }> = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(prefix, { limit: pageSize, offset });
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const item of data) {
        if (!item.name) continue;
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
        // Folder entries have id === null and no metadata — recurse into them.
        if (item.id === null || !item.metadata) {
          const nested = await listAllFiles(bucket, fullPath);
          results.push(...nested);
        } else {
          results.push({ path: fullPath, item });
        }
      }
      if (data.length < pageSize) break;
      offset += pageSize;
    }
    return results;
  };

  const loadFiles = async (bucket: BucketType) => {
    setLoading(true);
    try {
      const bucketConfig = BUCKET_CONFIG[bucket];
      const entries = await listAllFiles(bucket);

      const filesList: StorageFile[] = await Promise.all(
        entries.map(async ({ path, item }) => {
          let publicUrl = '';
          if (bucketConfig.isPublic) {
            const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
            publicUrl = urlData.publicUrl;
          } else {
            const { data: signedData } = await supabase.storage
              .from(bucket)
              .createSignedUrl(path, 3600);
            publicUrl = signedData?.signedUrl || '';
          }
          return {
            name: path,
            size: item.metadata?.size || 0,
            contentType: item.metadata?.mimetype,
            created: item.created_at || '',
            updated: item.updated_at || item.created_at || '',
            publicUrl,
            folder: path.includes('/') ? path.split('/').slice(0, -1).join('/') : null,
            bucket,
          };
        })
      );
      
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
      // Recursively list every real file in every bucket.
      const allFiles: StorageFile[] = [];
      for (const bucket of BUCKETS) {
        const entries = await listAllFiles(bucket);
        for (const { path, item } of entries) {
          allFiles.push({
            name: path,
            size: item.metadata?.size || 0,
            contentType: item.metadata?.mimetype,
            created: item.created_at || '',
            updated: item.updated_at || item.created_at || '',
            publicUrl: '',
            folder: path.includes('/') ? path.split('/').slice(0, -1).join('/') : null,
            bucket,
          });
        }
      }

      // Get all referenced URLs from database
      const [releasesResult, tracksResult] = await Promise.all([
        supabase.from('releases').select('cover_url'),
        supabase.from('tracks').select('audio_url, clip_url'),
      ]);

      // Extract the storage path for a given bucket from any URL variant
      // (public URL, signed URL, or a raw path). Handles the `/object/{public|sign}/{bucket}/{path}`
      // pattern used by Supabase Storage, and strips query strings (signed URL tokens).
      const extractStoragePath = (url: string | null, bucket: string): string | null => {
        if (!url) return null;
        let cleaned = url.split('?')[0];
        const markers = [
          `/storage/v1/object/public/${bucket}/`,
          `/storage/v1/object/sign/${bucket}/`,
          `/storage/v1/object/${bucket}/`,
          `/${bucket}/`,
        ];
        for (const m of markers) {
          const idx = cleaned.indexOf(m);
          if (idx !== -1) return decodeURIComponent(cleaned.slice(idx + m.length));
        }
        // Fallback: assume it's already a storage path
        return decodeURIComponent(cleaned);
      };

      // Build per-bucket sets of referenced full paths.
      const referencedByBucket: Record<string, Set<string>> = {
        'release-covers': new Set(),
        'track-audio': new Set(),
        'audio-clips': new Set(),
      };

      releasesResult.data?.forEach(r => {
        const p = extractStoragePath(r.cover_url, 'release-covers');
        if (p) referencedByBucket['release-covers'].add(p);
      });
      tracksResult.data?.forEach(t => {
        const audioPath = extractStoragePath(t.audio_url, 'track-audio');
        if (audioPath) referencedByBucket['track-audio'].add(audioPath);
        // Clips may live in either 'audio-clips' or 'track-audio' historically
        const clipInClips = extractStoragePath(t.clip_url, 'audio-clips');
        if (clipInClips) referencedByBucket['audio-clips'].add(clipInClips);
        const clipInAudio = extractStoragePath(t.clip_url, 'track-audio');
        if (clipInAudio) referencedByBucket['track-audio'].add(clipInAudio);
      });

      // A file is orphan if its full path is not in the referenced set for its bucket.
      const orphans: OrphanFile[] = allFiles
        .filter(file => !referencedByBucket[file.bucket]?.has(file.name))
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
                                  {activeBucket === 'release-covers' ? (
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
                                    {file.name}
                                  </span>
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
                                    onClick={() => window.open(file.publicUrl, '_blank')}
                                    title="Lihat file"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      const link = document.createElement('a');
                                      link.href = file.publicUrl;
                                      link.download = file.name;
                                      link.target = '_blank';
                                      link.click();
                                    }}
                                    title="Download file"
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
