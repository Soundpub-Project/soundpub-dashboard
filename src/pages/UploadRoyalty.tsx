import { BackendRoyaltyImport } from '@/components/finance/BackendRoyaltyImport';
import { usesBackendFinance } from '@/components/finance/mode';
import { usesBackendReleases } from '@/services/releases';
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
  DollarSign,
  Trash2
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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
  totalRevenue: bigint;
  labelShare: bigint;
  artistShare: bigint;
  adminShare: bigint;
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

const containsControlCharacter = (value: string, allowLineBreaks = false) =>
  [...value].some(character => {
    const code = character.charCodeAt(0);
    return code === 127 || (code <= 31 && !(allowLineBreaks && (code === 10 || code === 13)));
  });

const parseCsvDocument = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(field.trim());
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('Tanda kutip CSV tidak ditutup');
  row.push(field.trim());
  if (row.some(value => value.length > 0)) rows.push(row);
  return rows;
};

const revenueToCents = (revenue: number): bigint => BigInt(Math.round(revenue * 100));
const roundShareCents = (revenueCents: bigint, percentage: bigint): bigint =>
  (revenueCents * percentage + 50n) / 100n;
const formatRevenueCents = (revenueCents: bigint): string => {
  const negative = revenueCents < 0n;
  const absoluteCents = negative ? -revenueCents : revenueCents;
  const whole = absoluteCents / 100n;
  const fraction = absoluteCents % 100n;
  const formatted = whole.toLocaleString('id-ID');
  return `${negative ? '-' : ''}${formatted}${fraction === 0n ? '' : `,${fraction.toString().padStart(2, '0')}`}`;
};

const getFunctionErrorMessage = async (error: unknown): Promise<string> => {
  if (typeof error === 'object' && error !== null && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: unknown; message?: unknown };
        if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
        if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
      } catch {
        const responseText = await context.clone().text().catch(() => '');
        if (responseText.trim()) return responseText;
      }
    }
  }

  return error instanceof Error ? error.message : 'Terjadi kesalahan saat mengimport data';
};

function LegacyUploadRoyalty() {
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadErrorRef = useRef<HTMLDivElement>(null);
  // Refs block repeated events before React commits disabled controls.
  const activeActionRef = useRef<'parsing' | 'upload' | 'delete' | null>(null);
  const importedFileRef = useRef<File | null>(null);
  const deletedUploadIdsRef = useRef(new Set<string>());
  
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<RoyaltyRow[]>([]);
  const [parseErrors, setParseErrors] = useState<ValidationError[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [serverValidationErrors, setServerValidationErrors] = useState<ValidationError[]>([]);
  const [visibleIssueCount, setVisibleIssueCount] = useState(10);
  const [revenueSplitPreview, setRevenueSplitPreview] = useState<RevenueSplitPreview[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [deletingUploadId, setDeletingUploadId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<string>('');
  const [uploadHistory, setUploadHistory] = useState<UploadHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [lastUploadResult, setLastUploadResult] = useState<{
    insertedCount: number;
    totalErrors: number;
    balanceUpdates: BalanceUpdate[];
    managedArtistsCreated?: number;
    managedArtistsReused?: number;
    replacedUploads?: number;
    replacedRows?: number;
  } | null>(null);
  const [isrcMatchResults, setIsrcMatchResults] = useState<ISRCMatchResult[]>([]);
  const [isCheckingISRC, setIsCheckingISRC] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [replaceMode, setReplaceMode] = useState<'filename_period'>('filename_period');
  const [replaceScopeAcknowledged, setReplaceScopeAcknowledged] = useState(false);
  const isBusy = isUploading || isParsing || deletingUploadId !== null;
  const hasParseErrors = parseErrors.some(error => error.severity === 'error');
  const replacementPeriods = [...new Set(parsedData.map(row => row.period))].sort();
  const replacementPeriodLabel = replacementPeriods.join(', ');
  const serverErrorRow = uploadError?.match(/^Row (\d+):/i)?.[1];
  const serverErrorData = serverErrorRow ? parsedData[Number(serverErrorRow) - 1] : null;

  useEffect(() => {
    if (uploadError) uploadErrorRef.current?.focus();
  }, [uploadError]);

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
    const errors: ValidationError[] = [];
    const data: RoyaltyRow[] = [];
    if (containsControlCharacter(text, true)) {
      errors.push({ row: 0, field: 'file', message: 'File CSV mengandung karakter kontrol yang tidak diterima server', severity: 'error' });
      return { data, errors };
    }
    let rows: string[][];

    try {
      rows = parseCsvDocument(text.replace(/^\uFEFF/, ''));
    } catch (error) {
      errors.push({ row: 0, field: 'file', message: error instanceof Error ? error.message : 'Format CSV tidak valid', severity: 'error' });
      return { data, errors };
    }

    if (rows.length < 2) {
      errors.push({ row: 0, field: 'file', message: 'File CSV kosong atau tidak memiliki data', severity: 'error' });
      return { data, errors };
    }

    // Parse header
    const headers = rows[0].map(header => header.toLowerCase().trim());
    const duplicateHeaders = headers.filter((header, index) => header && headers.indexOf(header) !== index);
    if (duplicateHeaders.length > 0) {
      errors.push({ row: 1, field: 'header', message: `Header duplikat: ${[...new Set(duplicateHeaders)].join(', ')}`, severity: 'error' });
      return { data, errors };
    }

    // Check required columns
    const missingColumns = REQUIRED_COLUMNS.filter(col => !headers.includes(col));
    if (missingColumns.length > 0) {
      errors.push({ row: 1, field: 'header', message: 'Kolom yang diperlukan tidak ditemukan: ' + missingColumns.join(', '), severity: 'error' });
      return { data, errors };
    }
    const getIndex = (name: string) => headers.indexOf(name);

    // Parse data rows
    for (let i = 1; i < rows.length; i++) {
      const values = rows[i];
      const rowNumber = i + 1;
      if (values.length !== headers.length) {
        errors.push({ row: rowNumber, field: 'csv', message: 'Jumlah kolom tidak sesuai header', severity: 'error' });
        continue;
      }
      if (values.some(value => containsControlCharacter(value))) {
        errors.push({ row: rowNumber, field: 'csv', message: 'Nilai mengandung baris baru atau karakter kontrol yang tidak diterima server', severity: 'error' });
        continue;
      }
      try {
        const period = values[getIndex('period')] || '';
        const isrcRaw = values[getIndex('isrc')] || '';
        const upc = values[getIndex('upc')] || '';
        const artist = values[getIndex('artist')] || '';
        const label_name = values[getIndex('label_name')] || '';
        const platform = values[getIndex('platform')] || '';
        const country = values[getIndex('country')] || '';
        const salesUnitRaw = values[getIndex('sales_unit')] || '';
        const netRevenueRaw = values[getIndex('net_revenue')] || '';
        
        // Validate period format (YYYY-MM)
        if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(period)) {
          errors.push({ row: rowNumber, field: 'period', message: 'Period harus berformat YYYY-MM', severity: 'error' });
          continue;
        }
        
        // Normalize ISRC - remove dashes for consistent matching
        // This allows both formats: FR-X76-25-98330 and FRX762598330
        const isrc = isrcRaw.replace(/-/g, '').toUpperCase();
        
        // Validate ISRC format (should be 12 characters after normalization)
        if (!isrc) {
          errors.push({ row: rowNumber, field: 'isrc', message: 'ISRC tidak boleh kosong', severity: 'error' });
          continue;
        }
        if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc)) {
          errors.push({ row: rowNumber, field: 'isrc', message: `ISRC "${isrcRaw}" tidak valid`, severity: 'error' });
          continue;
        }
        
        // UPC is now OPTIONAL - will be auto-filled from database
        // Only validate format if provided
        if (upc && !/^\d{12,13}$/.test(upc)) {
          errors.push({ row: rowNumber, field: 'upc', message: `UPC "${upc}" harus 12-13 digit angka`, severity: 'error' });
          continue;
        }
        
        // Artist and label_name are optional (will be auto-filled from ISRC match)
        // No warnings needed - system will auto-fill from database
        
        // Validate platform
        if (!platform) {
          errors.push({ row: rowNumber, field: 'platform', message: 'Platform tidak boleh kosong', severity: 'error' });
          continue;
        }
        
        // Validate country
        if (!/^[A-Za-z]{2}$/.test(country)) {
          errors.push({ row: rowNumber, field: 'country', message: 'Country harus kode dua huruf', severity: 'error' });
          continue;
        }
        
        // Validate numeric fields
        const salesUnit = /^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(salesUnitRaw)
          ? Number(salesUnitRaw.replace(/\./g, '')) : NaN;
        if (!Number.isSafeInteger(salesUnit) || salesUnit > 2147483647) {
          errors.push({ row: rowNumber, field: 'sales_unit', message: `Sales unit "${salesUnitRaw}" bukan angka valid`, severity: 'error' });
          continue;
        }
        if (salesUnit < 0) {
          errors.push({ row: rowNumber, field: 'sales_unit', message: 'Sales unit tidak boleh negatif', severity: 'error' });
          continue;
        }

        const normalizedRevenue = /^-?\d{1,3}(?:\.\d{3})+,\d+$/.test(netRevenueRaw)
          ? netRevenueRaw.replace(/\./g, '').replace(',', '.')
          : /^-?\d{1,3}(?:,\d{3})+\.\d+$/.test(netRevenueRaw)
            ? netRevenueRaw.replace(/,/g, '')
            : /^-?\d+,\d+$/.test(netRevenueRaw)
              ? netRevenueRaw.replace(',', '.') : netRevenueRaw;
        const netRevenue = /^-?\d+(?:\.\d+)?$/.test(normalizedRevenue) ? Number(normalizedRevenue) : NaN;
        if (!Number.isFinite(netRevenue) || Math.abs(netRevenue) > Number.MAX_SAFE_INTEGER / 100 || Math.abs(netRevenue * 100 - Math.round(netRevenue * 100)) > 1e-8) {
          errors.push({ row: rowNumber, field: 'net_revenue', message: `Net revenue "${netRevenueRaw}" bukan angka valid`, severity: 'error' });
          continue;
        }
        if (netRevenue < 0) {
          errors.push({ row: rowNumber, field: 'net_revenue', message: 'Net revenue tidak boleh negatif', severity: 'error' });
          continue;
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
        errors.push({ row: rowNumber, field: 'parsing', message: 'Format data tidak valid', severity: 'error' });
      }
    }

    return { data, errors };
  };

  const calculateRevenueSplitPreview = (data: RoyaltyRow[]): RevenueSplitPreview[] => {
    const labelTotals: Record<string, RevenueSplitPreview> = {};
    
    data.forEach(row => {
      const label = row.label_name || 'Label belum teridentifikasi';
      const revenueCents = revenueToCents(row.net_revenue);
      const adminShare = roundShareCents(revenueCents, 9n);
      const artistShare = roundShareCents(revenueCents, 70n);

      if (!labelTotals[label]) {
        labelTotals[label] = {
          label,
          totalRevenue: 0n,
          labelShare: 0n,
          artistShare: 0n,
          adminShare: 0n,
          labelPercentage: 21,
          artistPercentage: 70,
          adminPercentage: 9,
        };
      }

      // SQL rounds admin and artist shares per royalty row; label receives row remainder.
      labelTotals[label].totalRevenue += revenueCents;
      labelTotals[label].adminShare += adminShare;
      labelTotals[label].artistShare += artistShare;
      labelTotals[label].labelShare += revenueCents - adminShare - artistShare;
    });
    
    return Object.values(labelTotals).sort((a, b) =>
      a.totalRevenue === b.totalRevenue ? 0 : a.totalRevenue > b.totalRevenue ? -1 : 1
    );
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
    if (activeActionRef.current) return;
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

    activeActionRef.current = 'parsing';
    importedFileRef.current = null;
    setIsParsing(true);
    setSelectedFile(file);
    setParsedData([]);
    setParseErrors([]);
    setUploadError(null);
    setServerValidationErrors([]);
    setVisibleIssueCount(10);
    setRevenueSplitPreview([]);
    setLastUploadResult(null);
    setIsrcMatchResults([]);
    setReplaceExisting(false);
    setReplaceMode('filename_period');
    setReplaceScopeAcknowledged(false);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
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

        if (errorCount > 0) {
          toast({
            title: 'Parsing Gagal',
            description: `Ditemukan ${errorCount} error yang harus diperbaiki sebelum import`,
            variant: 'destructive',
          });
        } else if (data.length > 0) {
          toast({
            title: 'File Berhasil Diparsing',
            description: `${data.length} baris valid${warningCount > 0 ? `, ${warningCount} peringatan` : ''}`,
          });
        }
      } finally {
        activeActionRef.current = null;
        setIsParsing(false);
      }
    };
    reader.onerror = reader.onabort = () => {
      setParseErrors([{ row: 0, field: 'file', message: 'File CSV gagal dibaca. Pilih ulang file.', severity: 'error' }]);
      activeActionRef.current = null;
      setIsParsing(false);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (activeActionRef.current) return;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleUpload = async () => {
    if (activeActionRef.current || !selectedFile || parsedData.length === 0 || !user || importedFileRef.current === selectedFile) return;
    if (parseErrors.some(error => error.severity === 'error')) {
      toast({ title: 'Validasi Gagal', description: 'Perbaiki semua error CSV sebelum import.', variant: 'destructive' });
      return;
    }
    if (replaceExisting && !replaceScopeAcknowledged) {
      toast({ title: 'Konfirmasi Replace Diperlukan', description: 'Konfirmasi scope penggantian sebelum menghapus data lama.', variant: 'destructive' });
      return;
    }

    activeActionRef.current = 'upload';
    setIsUploading(true);
    setUploadProgress(0);
    setUploadStage('Memvalidasi data...');
    setLastUploadResult(null);
    setUploadError(null);
    setServerValidationErrors([]);
    setVisibleIssueCount(10);

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
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          rows: parsedData,
          filename: `royalty_${Date.now()}.csv`,
          originalFilename: selectedFile.name,
          replaceExisting,
          replaceMode,
        },
      });

      if (error) {
        const response = 'context' in error ? error.context : undefined;
        if (response instanceof Response) {
          const details = await response.clone().json().catch(() => null);
          if (details && typeof details.error === 'string') throw new Error(details.error);
        }
        throw error;
      }

      setUploadProgress(80);
      setUploadStage('Memperbarui saldo...');

      if (!data.success) {
        // Handle validation errors from server
        if (data.validationErrors && data.validationErrors.length > 0) {
          setUploadError('Validasi server menemukan data yang perlu diperbaiki.');
          setServerValidationErrors(data.validationErrors);
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
      importedFileRef.current = selectedFile;

      // Store result for display
      setLastUploadResult({
        insertedCount: data.insertedCount,
        totalErrors: data.totalErrors,
        balanceUpdates: data.balanceUpdates || [],
        managedArtistsCreated: data.managedArtistsCreated || 0,
        managedArtistsReused: data.managedArtistsReused || 0,
        replacedUploads: data.replacedUploads || 0,
        replacedRows: data.replacedRows || 0,
      });

      toast(data.idempotentReplay ? {
        title: 'Upload Duplikat Dicegah',
        description: 'CSV identik sudah pernah diimport. Data tidak ditambahkan ulang.',
      } : {
        title: 'Upload Berhasil!',
        description: `${data.insertedCount} data royalty berhasil diimport`,
      });

      // Reset state
      setSelectedFile(null);
      setParsedData([]);
      setParseErrors([]);
      setRevenueSplitPreview([]);
      setIsrcMatchResults([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setReplaceExisting(false);
      setReplaceMode('filename_period');
      setReplaceScopeAcknowledged(false);
      await fetchUploadHistory();

    } catch (error: unknown) {
      const errorMessage = await getFunctionErrorMessage(error);
      setUploadError(errorMessage);
      console.error('Upload error:', error, errorMessage);
      toast({
        title: 'Upload Gagal',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      activeActionRef.current = null;
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStage('');
    }
  };

  const handleDeleteUpload = async (uploadId: string, filename: string) => {
    if (activeActionRef.current || deletedUploadIdsRef.current.has(uploadId)) return;
    activeActionRef.current = 'delete';
    setDeletingUploadId(uploadId);
    try {
      toast({ title: 'Menghapus...', description: `Menghapus upload ${filename} dan rollback saldo...` });

      const { data, error } = await supabase.functions.invoke('delete-royalty-upload', {
        body: { upload_id: uploadId },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Unknown error');

      deletedUploadIdsRef.current.add(uploadId);
      setUploadHistory(history => history.filter(upload => upload.id !== uploadId));
      if (data.rebuildErrors?.length || data.balanceRebuilt === false) {
        throw new Error(`${data.deletedRecords} record dihapus, tetapi penghitungan ulang saldo gagal. ${data.rebuildErrors?.join(', ') || 'Saldo belum berhasil dihitung ulang.'}`);
      }

      toast({
        title: 'Upload Dihapus',
        description: `${data.deletedRecords} record dihapus dan saldo telah di-rollback.`,
      });

    } catch (error: unknown) {
      console.error('Delete upload error:', error);
      toast({
        title: 'Gagal Menghapus',
        description: error instanceof Error ? error.message : 'Terjadi kesalahan saat menghapus upload',
        variant: 'destructive',
      });
    } finally {
      // A failed response can follow a committed delete; refresh before allowing another action.
      await fetchUploadHistory();
      activeActionRef.current = null;
      setDeletingUploadId(null);
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

        {uploadError && (
          <Card ref={uploadErrorRef} tabIndex={-1} role="alert" aria-labelledby="royalty-upload-error-title" className="border-destructive/50 bg-destructive/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive">
            <CardHeader className="pb-2">
              <CardTitle id="royalty-upload-error-title" className="flex items-center gap-2 text-destructive">
                <XCircle className="h-5 w-5" aria-hidden="true" /> Upload royalti gagal
              </CardTitle>
              <CardDescription>Periksa masalah berikut sebelum mencoba lagi. Jika koneksi terputus, cek riwayat upload lebih dulu.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="break-words font-medium">{uploadError}</p>
              {serverErrorData && (
                <p className="break-words rounded-md border border-destructive/30 bg-background/70 p-3">
                  Baris data {serverErrorRow} (setelah header): ISRC {serverErrorData.isrc}, artist {serverErrorData.artist || 'kosong'}, label {serverErrorData.label_name || 'kosong'}.
                </p>
              )}
              {serverValidationErrors.length > 0 && (
                <ul className="max-h-64 space-y-2 overflow-y-auto" aria-label="Detail validasi server">
                  {serverValidationErrors.slice(0, visibleIssueCount).map((issue, index) => (
                    <li key={index}>Baris {issue.row}, {issue.field}: {issue.message}</li>
                  ))}
                </ul>
              )}
              {serverValidationErrors.length > visibleIssueCount && (
                <Button variant="outline" size="sm" onClick={() => setVisibleIssueCount(count => count + 20)}>
                  Tampilkan 20 detail berikutnya ({serverValidationErrors.length - visibleIssueCount} tersisa)
                </Button>
              )}
              {serverErrorData && /artist.*(unresolved|ambiguous|missing|inactive)/i.test(uploadError) && (
                <p className="text-muted-foreground">Periksa nama artist, label, dan ISRC pada baris ini. Jika ada nama artist yang sama, pastikan katalog menunjuk ke akun yang benar.</p>
              )}
            </CardContent>
          </Card>
        )}

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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 text-sm">
                <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
                  <p className="text-muted-foreground">Managed Artist Dibuat</p>
                  <p className="text-lg font-semibold">{lastUploadResult.managedArtistsCreated || 0}</p>
                </div>
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
                  <p className="text-muted-foreground">Data Lama Direplace</p>
                  <p className="text-lg font-semibold">{lastUploadResult.replacedRows || 0} baris</p>
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
              className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isBusy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${
                isDragging
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50 hover:bg-muted/30'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              aria-disabled={isBusy}
              onClick={() => { if (!activeActionRef.current) fileInputRef.current?.click(); }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                disabled={isBusy}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                  e.target.value = '';
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

            {isParsing && <p role="status" className="mt-2 text-sm text-muted-foreground">Membaca dan memvalidasi CSV...</p>}

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
                          {parseErrors.filter(e => e.severity === 'error').slice(0, visibleIssueCount).map((error, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <span className="text-red-400 font-mono text-xs bg-red-500/20 px-1.5 py-0.5 rounded">
                                Baris {error.row}
                              </span>
                              <span>
                                <strong className="text-red-400">{error.field}:</strong> {error.message}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {parseErrors.filter(e => e.severity === 'error').length > visibleIssueCount && (
                          <Button variant="outline" size="sm" className="mt-3" onClick={() => setVisibleIssueCount(count => count + 20)}>
                            Tampilkan error berikutnya ({parseErrors.filter(e => e.severity === 'error').length - visibleIssueCount} tersisa)
                          </Button>
                        )}
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
                          {parseErrors.filter(e => e.severity === 'warning').slice(0, visibleIssueCount).map((error, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <span className="text-yellow-400 font-mono text-xs bg-yellow-500/20 px-1.5 py-0.5 rounded">
                                Baris {error.row}
                              </span>
                              <span>
                                <strong className="text-yellow-400">{error.field}:</strong> {error.message}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {parseErrors.filter(e => e.severity === 'warning').length > visibleIssueCount && (
                          <Button variant="outline" size="sm" className="mt-3" onClick={() => setVisibleIssueCount(count => count + 20)}>
                            Tampilkan peringatan berikutnya ({parseErrors.filter(e => e.severity === 'warning').length - visibleIssueCount} tersisa)
                          </Button>
                        )}
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
                            </div>
                            <span className="font-mono text-sm text-muted-foreground">
                              Total: Rp {formatRevenueCents(split.totalRevenue)}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
                              <p className="text-xs text-muted-foreground">Admin ({split.adminPercentage}%)</p>
                              <p className="font-mono text-red-400">Rp {formatRevenueCents(split.adminShare)}</p>
                            </div>
                            <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20">
                              <p className="text-xs text-muted-foreground">Label ({split.labelPercentage}%)</p>
                              <p className="font-mono text-blue-400">Rp {formatRevenueCents(split.labelShare)}</p>
                            </div>
                            <div className="p-2 rounded bg-green-500/10 border border-green-500/20">
                              <p className="text-xs text-muted-foreground">Artist ({split.artistPercentage}%)</p>
                              <p className="font-mono text-green-400">Rp {formatRevenueCents(split.artistShare)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      * Estimasi per label: 70% Artist, 21% Label, 9% Admin. Pembulatan dilakukan per baris; penerima akhir ditentukan server, bukan CSV.
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

                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-border"
                      checked={replaceExisting}
                      disabled={isBusy}
                      onChange={(event) => {
                        setReplaceExisting(event.target.checked);
                        setReplaceScopeAcknowledged(false);
                      }}
                    />
                    <span>
                      <span className="block font-medium">Replace upload lama dengan nama file yang sama</span>
                      <span className="block text-sm text-muted-foreground">
                        Aktifkan jika ini adalah upload ulang/koreksi. Default hanya mengganti data dengan nama file dan periode yang sama.
                      </span>
                    </span>
                  </label>
                  {!replaceExisting && (
                    <p className="ml-7 text-sm text-muted-foreground">
                      Import biasa menambahkan data baru. CSV identik akan dikenali server sebagai duplikat dan tidak ditambahkan ulang.
                    </p>
                  )}
                  {replaceExisting && (
                    <div className="ml-7 mt-3 space-y-2 text-sm">
                      <p className="font-medium">Nama file asli + periode</p>
                      <p className="text-muted-foreground">Hanya upload lama dengan nama file dan periode sama yang dapat diganti.</p>
                      <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3">
                        <p className="font-medium text-amber-700 dark:text-amber-300">Scope yang akan diganti</p>
                        <p className="mt-1 text-muted-foreground">
                          {`Data dari file lama bernama "${selectedFile?.name}" untuk periode ${replacementPeriodLabel} akan dihapus lalu diganti.`}
                        </p>
                        <label className="mt-3 flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-border"
                            checked={replaceScopeAcknowledged}
                            disabled={isBusy}
                            onChange={(event) => setReplaceScopeAcknowledged(event.target.checked)}
                          />
                          <span className="text-sm font-medium">Saya memahami scope penggantian ini.</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

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
                {parsedData.length > 0 && parseErrors.some(error => error.severity === 'error') && (
                  <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
                    Import diblokir karena ada baris gagal validasi. Perbaiki file dan unggah ulang; baris valid tidak akan diimpor sebagian.
                  </div>
                )}
                {parsedData.length > 0 && !isUploading && (
                  <div className="flex items-center gap-4">
                    <Button
                      className="gradient-primary"
                      onClick={handleUpload}
                      disabled={isBusy || hasParseErrors || (replaceExisting && !replaceScopeAcknowledged)}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {replaceExisting ? 'Replace & Import' : 'Import'} {parsedData.length} Data
                    </Button>
                    <Button
                      variant="outline"
                      disabled={isBusy}
                      onClick={() => {
                        if (activeActionRef.current) return;
                        setSelectedFile(null);
                        setParsedData([]);
                        setParseErrors([]);
                        setUploadError(null);
                        setServerValidationErrors([]);
                        setVisibleIssueCount(10);
                        setRevenueSplitPreview([]);
                        setIsrcMatchResults([]);
                        setReplaceExisting(false);
                        setReplaceMode('filename_period');
                        setReplaceScopeAcknowledged(false);
                        if (fileInputRef.current) fileInputRef.current.value = '';
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
                      <TableHead className="text-right">Aksi</TableHead>
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
                          {(upload.inserted_records ?? upload.total_records).toLocaleString('id-ID')}
                        </TableCell>
                        <TableCell>
                          <Badge className={`capitalize ${getStatusBadge(upload.status)}`}>
                            {upload.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" disabled={isBusy || deletedUploadIdsRef.current.has(upload.id)} aria-label={`Hapus ${upload.original_filename}`}>
                                {deletingUploadId === upload.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Hapus Upload Royalti?</AlertDialogTitle>
                                <AlertDialogDescription asChild>
                                  <div className="space-y-2 text-sm text-muted-foreground">
                                    <div>Anda akan menghapus upload <strong>{upload.original_filename}</strong> ({(upload.inserted_records ?? upload.total_records).toLocaleString('id-ID')} record).</div>
                                    <div className="text-destructive font-medium">⚠️ Saldo akan dihitung ulang dari data royalti yang tersisa.</div>
                                    <div>Tindakan ini tidak dapat dibatalkan.</div>
                                  </div>
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Batal</AlertDialogCancel>
                                <AlertDialogAction
                                  disabled={isBusy || deletedUploadIdsRef.current.has(upload.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => handleDeleteUpload(upload.id, upload.original_filename)}
                                >
                                  Hapus & Rollback Saldo
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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

export default function UploadRoyalty() {
  if (usesBackendReleases()) return <BackendRoyaltyImport />;
  if (usesBackendFinance()) return <BackendRoyaltyImport />;
  return <LegacyUploadRoyalty />;
}
