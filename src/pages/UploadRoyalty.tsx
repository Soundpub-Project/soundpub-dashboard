import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  AlertCircle,
  Download,
  TrendingUp,
  Users,
  DollarSign
} from 'lucide-react';

interface RoyaltyRow {
  period: string;
  isrc: string;
  upc: string;
  artist_name: string;
  label_name: string;
  platform: string;
  country: string;
  unit_penjualan: number;
  pendapatan_label_artis: number;
  pendapatan_bersih_soundpub: number;
  title?: string;
  artist?: string;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface BalanceUpdate {
  label: string;
  amount: number;
  success: boolean;
}

interface UploadSummary {
  total?: number;
  inserted?: number;
  errors?: number;
  balanceUpdates?: BalanceUpdate[];
}

interface UploadHistory {
  id: string;
  original_filename: string;
  total_records: number;
  inserted_records: number;
  status: string;
  created_at: string;
  summary?: UploadSummary | null;
}

const REQUIRED_COLUMNS = [
  'period',
  'isrc',
  'upc',
  'artist_name',
  'label_name',
  'platform',
  'country',
  'unit_penjualan',
  'pendapatan_label_artis',
  'pendapatan_bersih_soundpub',
];

export default function UploadRoyalty() {
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<RoyaltyRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<string>('');
  const [uploadHistory, setUploadHistory] = useState<UploadHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [lastUploadResult, setLastUploadResult] = useState<{
    insertedCount: number;
    totalErrors: number;
    balanceUpdates: BalanceUpdate[];
  } | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate('/dashboard');
    }
  }, [isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      fetchUploadHistory();
    }
  }, [isAdmin]);

  const fetchUploadHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('royalty_uploads')
        .select('id, original_filename, total_records, inserted_records, status, created_at, summary')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setUploadHistory((data || []) as unknown as UploadHistory[]);
    } catch (error) {
      console.error('Error fetching upload history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const parseCSV = (text: string): { data: RoyaltyRow[]; errors: string[] } => {
    const lines = text.trim().split('\n');
    const errors: string[] = [];
    const data: RoyaltyRow[] = [];

    if (lines.length < 2) {
      errors.push('File CSV kosong atau tidak memiliki data');
      return { data, errors };
    }

    // Parse header
    const headerLine = lines[0].toLowerCase().replace(/\r/g, '');
    const headers = headerLine.split(',').map(h => h.trim().replace(/"/g, ''));
    
    // Check required columns
    const missingColumns = REQUIRED_COLUMNS.filter(col => !headers.includes(col));
    if (missingColumns.length > 0) {
      errors.push(`Kolom yang diperlukan tidak ditemukan: ${missingColumns.join(', ')}`);
      return { data, errors };
    }

    // Get column indices
    const getIndex = (name: string) => headers.indexOf(name);

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].replace(/\r/g, '');
      if (!line.trim()) continue;

      // Handle CSV with quoted values
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      try {
        const row: RoyaltyRow = {
          period: values[getIndex('period')] || '',
          isrc: values[getIndex('isrc')] || '',
          upc: values[getIndex('upc')] || '',
          artist_name: values[getIndex('artist_name')] || '',
          label_name: values[getIndex('label_name')] || '',
          platform: values[getIndex('platform')] || '',
          country: values[getIndex('country')] || '',
          unit_penjualan: parseInt(values[getIndex('unit_penjualan')] || '0', 10) || 0,
          pendapatan_label_artis: parseFloat(values[getIndex('pendapatan_label_artis')] || '0') || 0,
          pendapatan_bersih_soundpub: parseFloat(values[getIndex('pendapatan_bersih_soundpub')] || '0') || 0,
          title: headers.includes('title') ? values[getIndex('title')] : undefined,
          artist: headers.includes('artist') ? values[getIndex('artist')] : undefined,
        };

        // Basic client-side validation
        if (!row.period || !row.isrc || !row.upc) {
          errors.push(`Baris ${i + 1}: Data period, isrc, atau upc kosong`);
          continue;
        }

        data.push(row);
      } catch (err) {
        errors.push(`Baris ${i + 1}: Format data tidak valid`);
      }
    }

    return { data, errors };
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast({
        title: 'Format File Salah',
        description: 'Hanya file CSV yang diizinkan',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'File Terlalu Besar',
        description: 'Ukuran file maksimal 10MB',
        variant: 'destructive',
      });
      return;
    }

    setSelectedFile(file);
    setParsedData([]);
    setParseErrors([]);
    setLastUploadResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { data, errors } = parseCSV(text);
      setParsedData(data);
      setParseErrors(errors);

      if (data.length > 0) {
        toast({
          title: 'File Berhasil Diparsing',
          description: `${data.length} baris data siap diimport`,
        });
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleUpload = async () => {
    if (!selectedFile || parsedData.length === 0 || !user) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStage('Memvalidasi data...');
    setLastUploadResult(null);

    try {
      // Simulate progress for UX
      setUploadProgress(10);
      setUploadStage('Mengirim data ke server...');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      setUploadProgress(20);
      setUploadStage('Memproses validasi server-side...');

      // Call edge function for server-side validation and processing
      const { data, error } = await supabase.functions.invoke('process-royalty-upload', {
        body: {
          rows: parsedData,
          filename: `royalty_${Date.now()}.csv`,
          originalFilename: selectedFile.name,
        },
      });

      if (error) {
        throw error;
      }

      setUploadProgress(80);
      setUploadStage('Memperbarui saldo...');

      if (!data.success) {
        // Handle validation errors from server
        if (data.validationErrors && data.validationErrors.length > 0) {
          const errorMessages = data.validationErrors.slice(0, 5).map(
            (err: ValidationError) => `Baris ${err.row}: ${err.field} - ${err.message}`
          );
          
          toast({
            title: 'Validasi Gagal',
            description: (
              <div className="space-y-1">
                {errorMessages.map((msg: string, i: number) => (
                  <p key={i} className="text-sm">{msg}</p>
                ))}
                {data.totalErrors > 5 && (
                  <p className="text-sm text-muted-foreground">
                    ...dan {data.totalErrors - 5} error lainnya
                  </p>
                )}
              </div>
            ),
            variant: 'destructive',
          });
          return;
        }
        throw new Error(data.error || 'Upload failed');
      }

      setUploadProgress(100);
      setUploadStage('Selesai!');

      // Store result for display
      setLastUploadResult({
        insertedCount: data.insertedCount,
        totalErrors: data.totalErrors,
        balanceUpdates: data.balanceUpdates || [],
      });

      toast({
        title: 'Upload Berhasil!',
        description: `${data.insertedCount} data royalty berhasil diimport`,
      });

      // Reset state
      setSelectedFile(null);
      setParsedData([]);
      setParseErrors([]);
      fetchUploadHistory();

    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload Gagal',
        description: error.message || 'Terjadi kesalahan saat mengimport data',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStage('');
    }
  };

  const downloadSampleCSV = () => {
    const sampleData = `period,isrc,upc,artist_name,label_name,platform,country,unit_penjualan,pendapatan_label_artis,pendapatan_bersih_soundpub,title,artist
2024-01,IDABC1234567,123456789012,John Doe,Indie Records,Spotify,ID,1000,70000,30000,My Song,John Doe
2024-01,IDXYZ7654321,123456789013,Jane Smith,Indie Records,Apple Music,US,500,140000,60000,Another Song,Jane Smith
2024-02,IDABC1234567,123456789012,John Doe,Indie Records,YouTube Music,ID,2500,175000,75000,My Song,John Doe`;
    
    const blob = new Blob([sampleData], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample-royalties.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      success: 'bg-green-500/20 text-green-400 border-green-500/30',
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      processing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      partial: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return styles[status] || '';
  };

  // Calculate preview stats
  const previewStats = parsedData.length > 0 ? {
    totalRevenue: parsedData.reduce((sum, row) => sum + row.pendapatan_label_artis, 0),
    totalStreams: parsedData.reduce((sum, row) => sum + row.unit_penjualan, 0),
    uniqueLabels: [...new Set(parsedData.map(r => r.label_name))].length,
    uniqueArtists: [...new Set(parsedData.map(r => r.artist_name))].length,
  } : null;

  if (!isAdmin) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Upload Royalty</h1>
            <p className="text-muted-foreground">Import data royalty dari file CSV dengan validasi otomatis</p>
          </div>
          <Button variant="outline" onClick={downloadSampleCSV}>
            <Download className="h-4 w-4 mr-2" />
            Download Sample CSV
          </Button>
        </div>

        {/* Upload Result Summary */}
        {lastUploadResult && (
          <Card className="bg-green-500/10 border-green-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-green-400 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Upload Berhasil
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/20">
                    <TrendingUp className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Data Diimport</p>
                    <p className="text-lg font-semibold">{lastUploadResult.insertedCount.toLocaleString('id-ID')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-500/20">
                    <AlertCircle className="h-5 w-5 text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Error/Dilewati</p>
                    <p className="text-lg font-semibold">{lastUploadResult.totalErrors}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <DollarSign className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Saldo Diupdate</p>
                    <p className="text-lg font-semibold">
                      {lastUploadResult.balanceUpdates.filter(b => b.success).length} label
                    </p>
                  </div>
                </div>
              </div>

              {/* Balance Updates Detail */}
              {lastUploadResult.balanceUpdates.length > 0 && (
                <div className="mt-4 pt-4 border-t border-green-500/30">
                  <p className="text-sm font-medium mb-2">Detail Update Saldo:</p>
                  <div className="space-y-1">
                    {lastUploadResult.balanceUpdates.map((update, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className={update.success ? 'text-green-400' : 'text-yellow-400'}>
                          {update.success ? '✓' : '⚠'} {update.label}
                        </span>
                        <span className="font-mono">
                          +Rp {update.amount.toLocaleString('id-ID')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Upload Area */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle>Upload File CSV</CardTitle>
            <CardDescription>
              Drag & drop file CSV atau klik untuk memilih file. Data akan divalidasi di server sebelum disimpan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                isDragging
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50 hover:bg-muted/30'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
              
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              
              {selectedFile ? (
                <div>
                  <p className="font-medium text-lg">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ) : (
                <div>
                  <p className="font-medium">Drag & drop file CSV di sini</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    atau klik untuk memilih file (maks. 10MB)
                  </p>
                </div>
              )}
            </div>

            {/* Parse Results */}
            {(parsedData.length > 0 || parseErrors.length > 0) && (
              <div className="mt-6 space-y-4">
                {/* Summary Stats */}
                {previewStats && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <TrendingUp className="h-4 w-4" />
                        <span className="text-xs">Total Revenue</span>
                      </div>
                      <p className="font-semibold text-green-400">
                        Rp {previewStats.totalRevenue.toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <FileSpreadsheet className="h-4 w-4" />
                        <span className="text-xs">Total Streams</span>
                      </div>
                      <p className="font-semibold">
                        {previewStats.totalStreams.toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Users className="h-4 w-4" />
                        <span className="text-xs">Labels</span>
                      </div>
                      <p className="font-semibold">{previewStats.uniqueLabels}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Users className="h-4 w-4" />
                        <span className="text-xs">Artists</span>
                      </div>
                      <p className="font-semibold">{previewStats.uniqueArtists}</p>
                    </div>
                  </div>
                )}

                {/* Data count and warnings */}
                <div className="flex items-center gap-4">
                  {parsedData.length > 0 && (
                    <div className="flex items-center gap-2 text-green-400">
                      <CheckCircle2 className="h-5 w-5" />
                      <span>{parsedData.length} baris data valid</span>
                    </div>
                  )}
                  {parseErrors.length > 0 && (
                    <div className="flex items-center gap-2 text-yellow-400">
                      <AlertCircle className="h-5 w-5" />
                      <span>{parseErrors.length} peringatan</span>
                    </div>
                  )}
                </div>

                {/* Errors */}
                {parseErrors.length > 0 && (
                  <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <p className="font-medium text-yellow-400 mb-2">Peringatan:</p>
                    <ul className="text-sm text-yellow-300 space-y-1">
                      {parseErrors.slice(0, 5).map((error, index) => (
                        <li key={index}>• {error}</li>
                      ))}
                      {parseErrors.length > 5 && (
                        <li>• ...dan {parseErrors.length - 5} peringatan lainnya</li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Preview */}
                {parsedData.length > 0 && (
                  <div>
                    <p className="font-medium mb-2">Preview Data (5 baris pertama):</p>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Period</TableHead>
                            <TableHead>ISRC</TableHead>
                            <TableHead>Artist</TableHead>
                            <TableHead>Label</TableHead>
                            <TableHead>Platform</TableHead>
                            <TableHead className="text-right">Streams</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parsedData.slice(0, 5).map((row, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-mono text-xs">{row.period}</TableCell>
                              <TableCell className="font-mono text-xs">{row.isrc}</TableCell>
                              <TableCell>{row.artist_name}</TableCell>
                              <TableCell>{row.label_name}</TableCell>
                              <TableCell>{row.platform}</TableCell>
                              <TableCell className="text-right">
                                {row.unit_penjualan.toLocaleString('id-ID')}
                              </TableCell>
                              <TableCell className="text-right text-green-400">
                                Rp {row.pendapatan_label_artis.toLocaleString('id-ID')}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {parsedData.length > 5 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        ...dan {parsedData.length - 5} baris lainnya
                      </p>
                    )}
                  </div>
                )}

                {/* Upload Progress */}
                {isUploading && (
                  <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="font-medium">{uploadStage}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} className="h-2" />
                  </div>
                )}

                {/* Upload Button */}
                {parsedData.length > 0 && !isUploading && (
                  <div className="flex items-center gap-4">
                    <Button
                      className="gradient-primary"
                      onClick={handleUpload}
                      disabled={isUploading}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Import {parsedData.length} Data
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedFile(null);
                        setParsedData([]);
                        setParseErrors([]);
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Batal
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upload History */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle>Riwayat Upload</CardTitle>
            <CardDescription>10 upload terakhir</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : uploadHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Upload className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Belum ada riwayat upload</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Berhasil</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploadHistory.map((upload) => (
                      <TableRow key={upload.id}>
                        <TableCell>
                          {new Date(upload.created_at).toLocaleDateString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </TableCell>
                        <TableCell className="font-medium">{upload.original_filename}</TableCell>
                        <TableCell className="text-right">
                          {upload.total_records.toLocaleString('id-ID')}
                        </TableCell>
                        <TableCell className="text-right">
                          {upload.inserted_records.toLocaleString('id-ID')}
                        </TableCell>
                        <TableCell>
                          <Badge className={`capitalize ${getStatusBadge(upload.status)}`}>
                            {upload.status}
                          </Badge>
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
    </DashboardLayout>
  );
}
