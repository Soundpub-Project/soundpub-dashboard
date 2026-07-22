import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Upload, Plus, Trash2, Eye, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface UploadRecord {
  id: string;
  uploader_email: string;
  filename: string;
  period: string;
  total_rows: number;
  success_rows: number;
  error_rows: number;
  status: string;
  error_summary: any[];
  created_at: string;
  updated_at: string;
}

export default function CopyrightRoyaltyUploadHistory() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedUpload, setSelectedUpload] = useState<UploadRecord | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      loadUploads();
    }
  }, [isAdmin]);

  async function loadUploads() {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_royalty_upload_history', {
        _limit: 100,
      });

      if (error) throw error;

      setUploads(data || []);
    } catch (err: any) {
      console.error('Error loading uploads:', err);
      toast.error('Failed to load upload history');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(uploadId: string) {
    setDeletingId(uploadId);

    try {
      const { data, error } = await supabase.rpc('delete_royalty_upload', {
        _upload_id: uploadId,
      });

      if (error) throw error;

      toast.success(`Upload deleted. ${data.deleted_royalty_records} royalty records removed.`);
      setUploads((prev) => prev.filter((u) => u.id !== uploadId));
      setShowDeleteDialog(false);
    } catch (err: any) {
      console.error('Error deleting upload:', err);
      toast.error('Failed to delete upload');
    } finally {
      setDeletingId(null);
    }
  }

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      processing: { label: 'Processing', variant: 'outline' },
      completed: { label: 'Completed', variant: 'default' },
      failed: { label: 'Failed', variant: 'destructive' },
      partial: { label: 'Partial', variant: 'secondary' },
    };

    const badgeConfig = config[status] || { label: status, variant: 'outline' };
    return <Badge variant={badgeConfig.variant}>{badgeConfig.label}</Badge>;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>Only admins can view upload history.</AlertDescription>
        </Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Royalti Upload History</h1>
            <p className="text-muted-foreground mt-1">Kelola semua upload CSV royalti hak cipta</p>
          </div>
          <Button onClick={() => navigate('/dashboard/royalties/copyright-upload')}>
            <Plus className="mr-2 h-4 w-4" />
            New Upload
          </Button>
        </div>

        {/* Upload History Table */}
        <Card>
          <CardHeader>
            <CardTitle>Upload History</CardTitle>
            <CardDescription>Recent royalty CSV uploads</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : uploads.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Upload className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No uploads yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Filename</TableHead>
                      <TableHead>Uploader</TableHead>
                      <TableHead>Rows</TableHead>
                      <TableHead>Success</TableHead>
                      <TableHead>Errors</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploads.map((upload) => (
                      <TableRow key={upload.id}>
                        <TableCell className="text-sm">
                          {formatDate(upload.created_at)}
                        </TableCell>
                        <TableCell className="font-mono font-bold">{upload.period}</TableCell>
                        <TableCell className="text-sm">{upload.filename}</TableCell>
                        <TableCell className="text-sm">{upload.uploader_email}</TableCell>
                        <TableCell className="text-center font-medium">
                          {upload.total_rows}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-green-50">
                            {upload.success_rows}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {upload.error_rows > 0 ? (
                            <Badge variant="destructive">{upload.error_rows}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(upload.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {upload.error_rows > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedUpload(upload)}
                                title="View errors"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedUpload(upload);
                                setShowDeleteDialog(true);
                              }}
                              disabled={deletingId === upload.id}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
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

        {/* Error Details Modal */}
        {selectedUpload && selectedUpload.error_rows > 0 && !showDeleteDialog && (
          <Card>
            <CardHeader>
              <CardTitle>Upload Details - {selectedUpload.period}</CardTitle>
              <CardDescription>
                Errors from upload on {formatDate(selectedUpload.created_at)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Rows</p>
                    <p className="text-2xl font-bold">{selectedUpload.total_rows}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Success</p>
                    <p className="text-2xl font-bold text-green-600">{selectedUpload.success_rows}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Errors</p>
                    <p className="text-2xl font-bold text-red-600">{selectedUpload.error_rows}</p>
                  </div>
                </div>

                {selectedUpload.error_summary && selectedUpload.error_summary.length > 0 && (
                  <>
                    <div className="text-sm font-semibold">Error Details:</div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selectedUpload.error_summary.map((error: any, idx: number) => (
                        <Alert key={idx} variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Row {error.row}: {error.composer_code}</AlertTitle>
                          <AlertDescription>{error.error}</AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  </>
                )}

                <Button
                  variant="outline"
                  onClick={() => setSelectedUpload(null)}
                  className="w-full"
                >
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Upload?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the upload record and all {selectedUpload?.success_rows} associated royalty
              records for period {selectedUpload?.period}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => selectedUpload && handleDelete(selectedUpload.id)}
            disabled={deletingId !== null}
            className="bg-red-600 hover:bg-red-700"
          >
            {deletingId ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}