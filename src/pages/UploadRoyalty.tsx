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
  title?: string;
  artist?: string;
  label_name?: string; // Now optional - will be auto-filled from UPC match
  platform: string;
  country: string;
  sales_type?: string;
  sales_unit: number;
  net_revenue: number;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
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

interface RevenueSplitPreview {
  label: string;
  totalRevenue: number;
  labelShare: number;
  artistShare: number;
  adminShare: number;
  labelPercentage: number;
  artistPercentage: number;
  adminPercentage: number;
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

interface ISRCMatchResult {
  isrc: string;
  upc: string;
  existsInTracks: boolean;
  existsInReleases: boolean;
  trackTitle?: string;
  trackArtist?: string;
  releaseTitle?: string;
  labelName?: string;
  labelId?: string;
  artistUserId?: string;
}

// ISRC is the primary key for matching (per-song royalties)
const REQUIRED_COLUMNS = [
  'period',
  'isrc',
  'platform',
  'country',
  'sales_unit',
  'net_revenue',
];

// Optional columns that can be auto-filled from database
const OPTIONAL_COLUMNS = ['upc', 'artist', 'label_name', 'title', 'sales_type'];

export default function UploadRoyalty() {
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<RoyaltyRow[]>([]);
  const [parseErrors, setParseErrors] = useState<ValidationError[]>([]);
  const [revenueSplitPreview, setRevenueSplitPreview] = useState<RevenueSplitPreview[]>([]);
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
  const [isrcMatchResults, setIsrcMatchResults] = useState<ISRCMatchResult[]>([]);
  const [isCheckingISRC, setIsCheckingISRC] = useState(false);

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

  const parseCSV = (text: string): { data: RoyaltyRow[]; errors: ValidationError[] } => {
    const lines = text.trim().split('\n');
    const errors: ValidationError[] = [];
    const data: RoyaltyRow[] = [];

    if (lines.length < 2) {
      errors.push({ row: 0, field: 'file', message: 'File CSV kosong atau tidak memiliki data', severity: 'error' });
      return { data, errors };
    }

    // Parse header
    const headerLine = lines[0].toLowerCase().replace(/\r/g, '');
    const headers = headerLine.split(',').map(h => h.trim().replace(/"/g, ''));
    
    // Check required columns
    const missingColumns = REQUIRED_COLUMNS.filter(col => !headers.includes(col));
    if (missingColumns.length > 0) {
      errors.push({ 
        row: 1, 
        field: 'header', 
        message: `Kolom yang diperlukan tidak ditemukan: ${missingColumns.join(', ')}`, 
        severity: 'error' 
      });
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
        const period = values[getIndex('period')] || '';
        const isrcRaw = values[getIndex('isrc')] || '';
        const upc = values[getIndex('upc')] || '';
        const artist = values[getIndex('artist')] || '';
        const label_name = values[getIndex('label_name')] || '';
        const platform = values[getIndex('platform')] || '';
        const country = values[getIndex('country')] || '';
        const salesUnitRaw = values[getIndex('sales_unit')] || '0';
        const netRevenueRaw = values[getIndex('net_revenue')] || '0';
        
        // Validate period format (YYYY-MM or similar)
        if (!period) {
          errors.push({ row: i + 1, field: 'period', message: 'Period tidak boleh kosong', severity: 'error' });
          continue;
        }
        
        // Normalize ISRC - remove dashes for consistent matching
        // This allows both formats: FR-X76-25-98330 and FRX762598330
        const isrc = isrcRaw.replace(/-/g, '').toUpperCase();
        
        // Validate ISRC format (should be 12 characters after normalization)
        if (!isrc) {
          errors.push({ row: i + 1, field: 'isrc', message: 'ISRC tidak boleh kosong', severity: 'error' });
          continue;
        }
        if (isrc.length !== 12) {
          errors.push({ row: i + 1, field: 'isrc', message: `ISRC "${isrcRaw}" harus 12 karakter setelah normalisasi (saat ini: ${isrc.length})`, severity: 'warning' });
        }
        
        // UPC is now OPTIONAL - will be auto-filled from database
        // Only validate format if provided
        if (upc && !/^\d{12,13}$/.test(upc)) {
          errors.push({ row: i + 1, field: 'upc', message: `UPC "${upc}" harus 12-13 digit angka`, severity: 'warning' });
        }
        
        // Artist and label_name are optional (will be auto-filled from ISRC match)
        // No warnings needed - system will auto-fill from database
        
        // Validate platform
        if (!platform) {
          errors.push({ row: i + 1, field: 'platform', message: 'Platform tidak boleh kosong', severity: 'error' });
          continue;
        }
        
        // Validate country
        if (!country) {
          errors.push({ row: i + 1, field: 'country', message: 'Country tidak boleh kosong', severity: 'error' });
          continue;
        }
        
        // Validate numeric fields
        const salesUnit = parseInt(salesUnitRaw, 10);
        if (isNaN(salesUnit)) {
          errors.push({ row: i + 1, field: 'sales_unit', message: `Sales unit "${salesUnitRaw}" bukan angka valid`, severity: 'error' });
          continue;
        }
        if (salesUnit < 0) {
          errors.push({ row: i + 1, field: 'sales_unit', message: 'Sales unit tidak boleh negatif', severity: 'warning' });
        }
        
        const netRevenue = parseFloat(netRevenueRaw);
        if (isNaN(netRevenue)) {
          errors.push({ row: i + 1, field: 'net_revenue', message: `Net revenue "${netRevenueRaw}" bukan angka valid`, severity: 'error' });
          continue;
        }
        if (netRevenue < 0) {
          errors.push({ row: i + 1, field: 'net_revenue', message: 'Net revenue negatif terdeteksi', severity: 'warning' });
        }

        const row: RoyaltyRow = {
          period,
          isrc,
          upc,
          title: headers.includes('title') ? values[getIndex('title')] : undefined,
          artist: artist || undefined, // Optional now
          label_name: label_name || undefined, // Optional now
          platform,
          country,
          sales_type: headers.includes('sales_type') ? values[getIndex('sales_type')] : undefined,
          sales_unit: salesUnit,
          net_revenue: netRevenue,
        };

        data.push(row);
      } catch (err) {
        errors.push({ row: i + 1, field: 'parsing', message: 'Format data tidak valid', severity: 'error' });
      }
    }

    return { data, errors };
  };

  // Calculate revenue split preview per label
  const calculateRevenueSplitPreview = (data: RoyaltyRow[]): RevenueSplitPreview[] => {
    const labelTotals: Record<string, number> = {};
    
    data.forEach(row => {
      labelTotals[row.label_name] = (labelTotals[row.label_name] || 0) + row.net_revenue;
    });
    
    return Object.entries(labelTotals).map(([label, totalRevenue]) => {
      // Flat split for all labels: 70% Artist, 21% Label, 9% Admin
      const artistShare = totalRevenue * 0.70;
      const labelShare = totalRevenue * 0.21;
      const adminShare = totalRevenue * 0.09;
      return {
        label,
        totalRevenue,
        labelShare,
        artistShare,
        adminShare,
        labelPercentage: 21,
        artistPercentage: 70,
        adminPercentage: 9,
      };
    }).sort((a, b) => b.totalRevenue - a.totalRevenue);
  };

  // Check which UPCs/ISRCs from CSV exist in the database
  const checkISRCsInDatabase = async (data: RoyaltyRow[]) => {
    if (data.length === 0) return;
    
    setIsCheckingISRC(true);
    try {
      // Get unique UPCs and ISRCs from parsed data
      const uniqueUpcs = [...new Set(data.map(row => row.upc))];
      const uniqueIsrcs = [...new Set(data.map(row => row.isrc))];
      
      // Query releases table for UPC matching
      const { data: releases, error: releasesError } = await supabase
        .from('releases')
        .select('upc, title, label_id, artist_user_id, artist_name');
      
      // Query tracks table for ISRC matching
      const { data: tracks, error: tracksError } = await supabase
        .from('tracks')
        .select('isrc, title, artist_name, artist_user_id');
      
      // Query profiles for label names
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name');
      
      if (releasesError) console.error('Error checking releases:', releasesError);
      if (tracksError) console.error('Error checking tracks:', tracksError);
      
      // Create maps for lookup
      const releaseMap = new Map<string, { title: string; labelId: string; labelName: string; artistUserId: string | null; artistName: string }>();
      const profileMap = new Map<string, string>();
      
      (profiles || []).forEach(p => profileMap.set(p.id, p.full_name));
      
      (releases || []).forEach(release => {
        if (release.upc) {
          releaseMap.set(release.upc, {
            title: release.title,
            labelId: release.label_id,
            labelName: profileMap.get(release.label_id) || '',
            artistUserId: release.artist_user_id,
            artistName: release.artist_name,
          });
        }
      });
      
      const trackMap = new Map<string, { title: string; artist: string; artistUserId: string | null }>();
      (tracks || []).forEach(track => {
        if (track.isrc) {
          const normalizedDbIsrc = track.isrc.replace(/-/g, '').toUpperCase();
          trackMap.set(normalizedDbIsrc, {
            title: track.title,
            artist: track.artist_name,
            artistUserId: track.artist_user_id,
          });
        }
      });
      
      // Build results combining UPC and ISRC matches
      const results: ISRCMatchResult[] = data.map(row => {
        const releaseInfo = releaseMap.get(row.upc);
        const trackInfo = trackMap.get(row.isrc);
        
        return {
          isrc: row.isrc,
          upc: row.upc,
          existsInTracks: !!trackInfo,
          existsInReleases: !!releaseInfo,
          trackTitle: trackInfo?.title,
          trackArtist: trackInfo?.artist || releaseInfo?.artistName,
          releaseTitle: releaseInfo?.title,
          labelName: releaseInfo?.labelName,
          labelId: releaseInfo?.labelId,
          artistUserId: trackInfo?.artistUserId || releaseInfo?.artistUserId || undefined,
        };
      });
      
      // Deduplicate by ISRC+UPC combination
      const uniqueResults = Array.from(
        new Map(results.map(r => [`${r.isrc}-${r.upc}`, r])).values()
      );
      
      setIsrcMatchResults(uniqueResults);
    } catch (error) {
      console.error('Error checking ISRCs/UPCs:', error);
    } finally {
      setIsCheckingISRC(false);
    }
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
    setRevenueSplitPreview([]);
    setLastUploadResult(null);
    setIsrcMatchResults([]);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const { data, errors } = parseCSV(text);
      setParsedData(data);
      setParseErrors(errors);
      
      // Calculate revenue split preview
      if (data.length > 0) {
        setRevenueSplitPreview(calculateRevenueSplitPreview(data));
        // Check ISRCs in database
        await checkISRCsInDatabase(data);
      }

      const errorCount = errors.filter(e => e.severity === 'error').length;
      const warningCount = errors.filter(e => e.severity === 'warning').length;
      
      if (data.length > 0) {
        toast({
          title: 'File Berhasil Diparsing',
          description: `${data.length} baris valid${warningCount > 0 ? `, ${warningCount} peringatan` : ''}`,
        });
      } else if (errorCount > 0) {
        toast({
          title: 'Parsing Gagal',
          description: `Ditemukan ${errorCount} error yang harus diperbaiki`,
          variant: 'destructive',
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
    const sampleData = `period,isrc,upc,title,artist,label_name,platform,country,sales_type,sales_unit,net_revenue
2024-01,IDABC1234567,123456789012,My Song,John Doe,Indie Records,Spotify,ID,streaming,1000,100000
2024-01,IDXYZ7654321,123456789013,Another Song,Jane Smith,Soundpub Music,Apple Music,US,streaming,500,200000
2024-02,IDABC1234567,123456789012,My Song,John Doe,Indie Records,YouTube Music,ID,streaming,2500,250000`;
    
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
    totalRevenue: parsedData.reduce((sum, row) => sum + row.net_revenue, 0),
    totalStreams: parsedData.reduce((sum, row) => sum + row.sales_unit, 0),
    uniqueLabels: [...new Set(parsedData.map(r => r.label_name))].length,
    uniqueArtists: [...new Set(parsedData.map(r => r.artist))].length,
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

                {/* Data count and validation summary */}
                <div className="flex flex-wrap items-center gap-4">
                  {parsedData.length > 0 && (
                    <div className="flex items-center gap-2 text-green-400">
                      <CheckCircle2 className="h-5 w-5" />
                      <span>{parsedData.length} baris data valid</span>
                    </div>
                  )}
                  {parseErrors.filter(e => e.severity === 'error').length > 0 && (
                    <div className="flex items-center gap-2 text-red-400">
                      <XCircle className="h-5 w-5" />
                      <span>{parseErrors.filter(e => e.severity === 'error').length} error</span>
                    </div>
                  )}
                  {parseErrors.filter(e => e.severity === 'warning').length > 0 && (
                    <div className="flex items-center gap-2 text-yellow-400">
                      <AlertCircle className="h-5 w-5" />
                      <span>{parseErrors.filter(e => e.severity === 'warning').length} peringatan</span>
                    </div>
                  )}
                </div>

                {/* Validation Errors */}
                {parseErrors.length > 0 && (
                  <div className="space-y-3">
                    {/* Critical Errors */}
                    {parseErrors.filter(e => e.severity === 'error').length > 0 && (
                      <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                        <p className="font-medium text-red-400 mb-2 flex items-center gap-2">
                          <XCircle className="h-4 w-4" />
                          Error ({parseErrors.filter(e => e.severity === 'error').length}):
                        </p>
                        <ul className="text-sm text-red-300 space-y-1">
                          {parseErrors.filter(e => e.severity === 'error').slice(0, 5).map((error, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <span className="text-red-400 font-mono text-xs bg-red-500/20 px-1.5 py-0.5 rounded">
                                Baris {error.row}
                              </span>
                              <span>
                                <strong className="text-red-400">{error.field}:</strong> {error.message}
                              </span>
                            </li>
                          ))}
                          {parseErrors.filter(e => e.severity === 'error').length > 5 && (
                            <li className="text-red-400/70">
                              ...dan {parseErrors.filter(e => e.severity === 'error').length - 5} error lainnya
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                    
                    {/* Warnings */}
                    {parseErrors.filter(e => e.severity === 'warning').length > 0 && (
                      <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                        <p className="font-medium text-yellow-400 mb-2 flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          Peringatan ({parseErrors.filter(e => e.severity === 'warning').length}):
                        </p>
                        <ul className="text-sm text-yellow-300 space-y-1">
                          {parseErrors.filter(e => e.severity === 'warning').slice(0, 3).map((error, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <span className="text-yellow-400 font-mono text-xs bg-yellow-500/20 px-1.5 py-0.5 rounded">
                                Baris {error.row}
                              </span>
                              <span>
                                <strong className="text-yellow-400">{error.field}:</strong> {error.message}
                              </span>
                            </li>
                          ))}
                          {parseErrors.filter(e => e.severity === 'warning').length > 3 && (
                            <li className="text-yellow-400/70">
                              ...dan {parseErrors.filter(e => e.severity === 'warning').length - 3} peringatan lainnya
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* ISRC Matching Results */}
                {(isrcMatchResults.length > 0 || isCheckingISRC) && (
                  <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                    <p className="font-medium mb-3 flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4" />
                      Perbandingan ISRC dengan Database Tracks
                    </p>
                    
                    {isCheckingISRC ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Memeriksa ISRC di database...</span>
                      </div>
                    ) : (
                      <>
                        {/* Summary */}
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                            <div className="flex items-center gap-2 mb-1">
                              <CheckCircle2 className="h-4 w-4 text-green-400" />
                              <span className="text-sm font-medium text-green-400">ISRC Ditemukan</span>
                            </div>
                            <p className="text-2xl font-bold text-green-400">
                              {isrcMatchResults.filter(r => r.existsInTracks).length}
                            </p>
                            <p className="text-xs text-muted-foreground">dari {isrcMatchResults.length} ISRC unik</p>
                          </div>
                          <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
                            <div className="flex items-center gap-2 mb-1">
                              <AlertCircle className="h-4 w-4 text-orange-400" />
                              <span className="text-sm font-medium text-orange-400">ISRC Tidak Ditemukan</span>
                            </div>
                            <p className="text-2xl font-bold text-orange-400">
                              {isrcMatchResults.filter(r => !r.existsInTracks).length}
                            </p>
                            <p className="text-xs text-muted-foreground">tidak ada di database tracks</p>
                          </div>
                        </div>

                        {/* Details - Matched ISRCs */}
                        {isrcMatchResults.filter(r => r.existsInTracks).length > 0 && (
                          <div className="mb-3">
                            <p className="text-sm font-medium text-green-400 mb-2">
                              ✓ ISRC yang cocok dengan database:
                            </p>
                            <div className="max-h-32 overflow-y-auto space-y-1">
                              {isrcMatchResults.filter(r => r.existsInTracks).slice(0, 10).map((result, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-sm bg-green-500/5 p-2 rounded">
                                  <code className="font-mono text-xs bg-green-500/20 px-1.5 py-0.5 rounded text-green-400">
                                    {result.isrc}
                                  </code>
                                  <span className="text-muted-foreground">→</span>
                                  <span className="truncate">
                                    {result.trackTitle} - {result.trackArtist}
                                  </span>
                                </div>
                              ))}
                              {isrcMatchResults.filter(r => r.existsInTracks).length > 10 && (
                                <p className="text-xs text-muted-foreground pl-2">
                                  ...dan {isrcMatchResults.filter(r => r.existsInTracks).length - 10} ISRC lainnya
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Details - Unmatched ISRCs */}
                        {isrcMatchResults.filter(r => !r.existsInTracks).length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-orange-400 mb-2">
                              ⚠ ISRC yang tidak ditemukan di database:
                            </p>
                            <div className="max-h-32 overflow-y-auto">
                              <div className="flex flex-wrap gap-1">
                                {isrcMatchResults.filter(r => !r.existsInTracks).slice(0, 20).map((result, idx) => (
                                  <code key={idx} className="font-mono text-xs bg-orange-500/20 px-1.5 py-0.5 rounded text-orange-400">
                                    {result.isrc}
                                  </code>
                                ))}
                                {isrcMatchResults.filter(r => !r.existsInTracks).length > 20 && (
                                  <span className="text-xs text-muted-foreground">
                                    +{isrcMatchResults.filter(r => !r.existsInTracks).length - 20} lainnya
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              ISRC ini akan tetap diupload, namun tidak terhubung dengan track yang ada.
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Revenue Split Preview */}
                {revenueSplitPreview.length > 0 && (
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="font-medium mb-3 flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-primary" />
                      Preview Pembagian Revenue
                    </p>
                    <div className="space-y-3">
                      {revenueSplitPreview.map((split, index) => (
                        <div key={index} className="p-3 rounded-lg bg-muted/30 border border-border/50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{split.label}</span>
                              {split.isSoundpubLabel && (
                                <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                                  Soundpub Label
                                </Badge>
                              )}
                            </div>
                            <span className="font-mono text-sm text-muted-foreground">
                              Total: Rp {split.totalRevenue.toLocaleString('id-ID')}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            {split.adminPercentage > 0 && (
                              <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
                                <p className="text-xs text-muted-foreground">Admin ({split.adminPercentage}%)</p>
                                <p className="font-mono text-red-400">Rp {split.adminShare.toLocaleString('id-ID')}</p>
                              </div>
                            )}
                            <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20">
                              <p className="text-xs text-muted-foreground">Label ({split.labelPercentage}%)</p>
                              <p className="font-mono text-blue-400">Rp {split.labelShare.toLocaleString('id-ID')}</p>
                            </div>
                            <div className="p-2 rounded bg-green-500/10 border border-green-500/20">
                              <p className="text-xs text-muted-foreground">Artist ({split.artistPercentage}%)</p>
                              <p className="font-mono text-green-400">Rp {split.artistShare.toLocaleString('id-ID')}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      * Soundpub Music: 70% Artist, 30% Label | Label lain: 49% Artist, 21% Label, 30% Admin
                    </p>
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
                              <TableCell>{row.artist}</TableCell>
                              <TableCell>{row.label_name}</TableCell>
                              <TableCell>{row.platform}</TableCell>
                              <TableCell className="text-right">
                                {row.sales_unit.toLocaleString('id-ID')}
                              </TableCell>
                              <TableCell className="text-right text-green-400">
                                Rp {row.net_revenue.toLocaleString('id-ID')}
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
                        setRevenueSplitPreview([]);
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
