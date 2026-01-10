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
  Download
} from 'lucide-react';

interface RoyaltyRow {
  period: string;
  isrc: string;
  upc: string;
  artist_name: string;
  label_name: string;
  platform: string;
  country: string;
  sales_type: string;
  unit_penjualan: number;
  pendapatan_kotor_dsp: number;
  pendapatan_label_artis: number;
  pendapatan_bersih_soundpub: number;
  artist_revenue: number;
  soundpub_revenue: number;
  title?: string;
  artist?: string;
}

interface UploadHistory {
  id: string;
  original_filename: string;
  total_records: number;
  inserted_records: number;
  status: string;
  created_at: string;
}

const REQUIRED_COLUMNS = [
  'period',
  'isrc',
  'upc',
  'artist_name',
  'label_name',
  'platform',
  'country',
  'sales_type',
  'unit_penjualan',
  'pendapatan_kotor_dsp',
  'pendapatan_label_artis',
  'pendapatan_bersih_soundpub',
  'artist_revenue',
  'soundpub_revenue',
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
  const [uploadHistory, setUploadHistory] = useState<UploadHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

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
        .select('id, original_filename, total_records, inserted_records, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setUploadHistory(data || []);
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
          sales_type: values[getIndex('sales_type')] || '',
          unit_penjualan: parseInt(values[getIndex('unit_penjualan')] || '0', 10) || 0,
          pendapatan_kotor_dsp: parseFloat(values[getIndex('pendapatan_kotor_dsp')] || '0') || 0,
          pendapatan_label_artis: parseFloat(values[getIndex('pendapatan_label_artis')] || '0') || 0,
          pendapatan_bersih_soundpub: parseFloat(values[getIndex('pendapatan_bersih_soundpub')] || '0') || 0,
          artist_revenue: parseFloat(values[getIndex('artist_revenue')] || '0') || 0,
          soundpub_revenue: parseFloat(values[getIndex('soundpub_revenue')] || '0') || 0,
          title: headers.includes('title') ? values[getIndex('title')] : undefined,
          artist: headers.includes('artist') ? values[getIndex('artist')] : undefined,
        };

        // Validate required fields
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

    try {
      // Create upload record
      const { data: uploadRecord, error: uploadError } = await supabase
        .from('royalty_uploads')
        .insert({
          user_id: user.id,
          filename: `royalty_${Date.now()}.csv`,
          original_filename: selectedFile.name,
          total_records: parsedData.length,
          inserted_records: 0,
          status: 'pending',
        })
        .select()
        .single();

      if (uploadError) throw uploadError;

      // Insert royalties in batches
      const batchSize = 100;
      let insertedCount = 0;

      for (let i = 0; i < parsedData.length; i += batchSize) {
        const batch = parsedData.slice(i, i + batchSize).map(row => ({
          ...row,
          upload_id: uploadRecord.id,
        }));

        const { error: insertError } = await supabase
          .from('royalties')
          .insert(batch);

        if (insertError) {
          console.error('Batch insert error:', insertError);
          throw insertError;
        }

        insertedCount += batch.length;
        setUploadProgress(Math.round((insertedCount / parsedData.length) * 100));
      }

      // Update upload record
      await supabase
        .from('royalty_uploads')
        .update({
          inserted_records: insertedCount,
          status: 'success',
          summary: {
            total: parsedData.length,
            inserted: insertedCount,
            errors: parseErrors.length,
          },
        })
        .eq('id', uploadRecord.id);

      toast({
        title: 'Upload Berhasil!',
        description: `${insertedCount} data royalty berhasil diimport`,
      });

      // Reset state
      setSelectedFile(null);
      setParsedData([]);
      setParseErrors([]);
      fetchUploadHistory();

    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload Gagal',
        description: 'Terjadi kesalahan saat mengimport data',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const downloadSampleCSV = () => {
    const sampleData = `period,isrc,upc,artist_name,label_name,platform,country,sales_type,unit_penjualan,pendapatan_kotor_dsp,pendapatan_label_artis,pendapatan_bersih_soundpub,artist_revenue,soundpub_revenue,title,artist
2024-01,IDABC123456,123456789012,John Doe,Indie Records,Spotify,ID,streaming,1000,100000,70000,30000,50000,20000,My Song,John Doe
2024-01,IDABC123457,123456789013,Jane Smith,Indie Records,Apple Music,US,download,500,200000,140000,60000,100000,40000,Another Song,Jane Smith`;
    
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
      partial: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return styles[status] || '';
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Upload Royalty</h1>
            <p className="text-muted-foreground">Import data royalty dari file CSV</p>
          </div>
          <Button variant="outline" onClick={downloadSampleCSV}>
            <Download className="h-4 w-4 mr-2" />
            Download Sample CSV
          </Button>
        </div>

        {/* Upload Area */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle>Upload File CSV</CardTitle>
            <CardDescription>
              Drag & drop file CSV atau klik untuk memilih file
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
                {/* Summary */}
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
                              <TableCell>{row.platform}</TableCell>
                              <TableCell className="text-right">
                                {row.unit_penjualan.toLocaleString('id-ID')}
                              </TableCell>
                              <TableCell className="text-right text-green-400">
                                Rp {row.artist_revenue.toLocaleString('id-ID')}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Upload Button */}
                {parsedData.length > 0 && (
                  <div className="flex items-center gap-4">
                    <Button
                      className="gradient-primary"
                      onClick={handleUpload}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Mengupload...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Import {parsedData.length} Data
                        </>
                      )}
                    </Button>
                    
                    {isUploading && (
                      <div className="flex-1">
                        <Progress value={uploadProgress} className="h-2" />
                        <p className="text-xs text-muted-foreground mt-1">
                          {uploadProgress}% selesai
                        </p>
                      </div>
                    )}
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
