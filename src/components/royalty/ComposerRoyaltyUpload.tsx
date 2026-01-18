import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Download,
  X,
} from 'lucide-react';

interface ComposerRoyaltyRow {
  composer_id: string;
  composer_name: string;
  total_net_royalti: number;
  period: string;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

interface UploadResult {
  success: boolean;
  insertedCount: number;
  totalErrors: number;
  errors: ValidationError[];
}

const REQUIRED_COLUMNS = ['composer_id', 'composer_name', 'total_net_royalti'];
const OPTIONAL_COLUMNS = ['period'];

interface ComposerRoyaltyUploadProps {
  onSuccess?: () => void;
}

export function ComposerRoyaltyUpload({ onSuccess }: ComposerRoyaltyUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ComposerRoyaltyRow[]>([]);
  const [parseErrors, setParseErrors] = useState<ValidationError[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<string>('');
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [lastUploadResult, setLastUploadResult] = useState<UploadResult | null>(null);

  const parseCSV = (text: string): { data: ComposerRoyaltyRow[]; errors: ValidationError[] } => {
    const lines = text.trim().split('\n');
    const errors: ValidationError[] = [];
    const data: ComposerRoyaltyRow[] = [];

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
        const composer_id = values[getIndex('composer_id')] || '';
        const composer_name = values[getIndex('composer_name')] || '';
        const totalRoyaltiRaw = values[getIndex('total_net_royalti')] || '0';
        const period = headers.includes('period') ? values[getIndex('period')] || '' : '';

        // Validate composer_id
        if (!composer_id) {
          errors.push({ row: i + 1, field: 'composer_id', message: 'Composer ID tidak boleh kosong', severity: 'error' });
          continue;
        }

        // Validate composer_name
        if (!composer_name) {
          errors.push({ row: i + 1, field: 'composer_name', message: 'Nama composer tidak boleh kosong', severity: 'error' });
          continue;
        }

        // Validate total_net_royalti
        const total_net_royalti = parseFloat(totalRoyaltiRaw);
        if (isNaN(total_net_royalti)) {
          errors.push({ row: i + 1, field: 'total_net_royalti', message: `Total royalti "${totalRoyaltiRaw}" bukan angka valid`, severity: 'error' });
          continue;
        }
        if (total_net_royalti < 0) {
          errors.push({ row: i + 1, field: 'total_net_royalti', message: 'Total royalti tidak boleh negatif', severity: 'warning' });
        }

        const row: ComposerRoyaltyRow = {
          composer_id,
          composer_name,
          total_net_royalti,
          period,
        };

        data.push(row);
      } catch (err) {
        errors.push({ row: i + 1, field: 'parsing', message: 'Format data tidak valid', severity: 'error' });
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

      const errorCount = errors.filter(e => e.severity === 'error').length;
      const warningCount = errors.filter(e => e.severity === 'warning').length;
      
      if (data.length > 0) {
        toast({
          title: 'File Berhasil Diparsing',
          description: `${data.length} baris valid${warningCount > 0 ? `, ${warningCount} peringatan` : ''}`,
        });
        setShowPreviewDialog(true);
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
    if (parsedData.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStage('Memvalidasi data...');

    try {
      setUploadProgress(10);
      setUploadStage('Mengirim data ke server...');

      // Insert in batches
      const batchSize = 100;
      let insertedCount = 0;
      const errors: ValidationError[] = [];

      for (let i = 0; i < parsedData.length; i += batchSize) {
        const batch = parsedData.slice(i, i + batchSize);
        const progress = 10 + ((i / parsedData.length) * 80);
        setUploadProgress(progress);
        setUploadStage(`Mengupload batch ${Math.floor(i / batchSize) + 1}...`);

        const { data, error } = await supabase
          .from('composer_royalties')
          .insert(batch.map(row => ({
            composer_id: row.composer_id,
            composer_name: row.composer_name,
            total_net_royalti: row.total_net_royalti,
            period: row.period || null,
          })))
          .select();

        if (error) {
          console.error('Batch insert error:', error);
          errors.push({
            row: i + 1,
            field: 'batch',
            message: error.message,
            severity: 'error',
          });
        } else {
          insertedCount += data?.length || 0;
        }
      }

      setUploadProgress(100);
      setUploadStage('Selesai!');

      setLastUploadResult({
        success: insertedCount > 0,
        insertedCount,
        totalErrors: errors.length,
        errors,
      });

      if (insertedCount > 0) {
        toast({
          title: 'Upload Berhasil',
          description: `${insertedCount} data royalty composer berhasil diupload`,
        });
        onSuccess?.();
      }

      // Reset after success
      setTimeout(() => {
        setSelectedFile(null);
        setParsedData([]);
        setShowPreviewDialog(false);
      }, 2000);

    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload Gagal',
        description: error.message || 'Terjadi kesalahan saat mengupload',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = () => {
    const headers = ['composer_id', 'composer_name', 'total_net_royalti', 'period'];
    const sampleData = [
      ['COMP001', 'John Doe', '1500000', '2024-Q1'],
      ['COMP002', 'Jane Smith', '2500000', '2024-Q1'],
    ];
    
    const csvContent = [
      headers.join(','),
      ...sampleData.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_composer_royalty.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const errorCount = parseErrors.filter(e => e.severity === 'error').length;
  const warningCount = parseErrors.filter(e => e.severity === 'warning').length;
  const totalRoyalties = parsedData.reduce((sum, r) => sum + r.total_net_royalti, 0);

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload CSV Royalty Composer
        </CardTitle>
        <CardDescription>
          Upload file CSV dengan data royalty untuk pemilik hak cipta (composer)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Template Download */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div>
            <p className="text-sm font-medium">Download Template CSV</p>
            <p className="text-xs text-muted-foreground">
              Kolom wajib: composer_id, composer_name, total_net_royalti
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-2" />
            Download Template
          </Button>
        </div>

        {/* Drop Zone */}
        <div
          className={`
            relative border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer
            ${isDragging 
              ? 'border-primary bg-primary/5' 
              : 'border-border hover:border-primary/50 hover:bg-muted/50'
            }
          `}
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
          
          {selectedFile ? (
            <div className="space-y-2">
              <FileSpreadsheet className="h-12 w-12 mx-auto text-primary" />
              <p className="font-medium">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {(selectedFile.size / 1024).toFixed(2)} KB
              </p>
              {parsedData.length > 0 && (
                <div className="flex items-center justify-center gap-2 mt-2">
                  <Badge variant="default" className="bg-green-500">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {parsedData.length} baris valid
                  </Badge>
                  {warningCount > 0 && (
                    <Badge variant="secondary">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {warningCount} peringatan
                    </Badge>
                  )}
                  {errorCount > 0 && (
                    <Badge variant="destructive">
                      <XCircle className="h-3 w-3 mr-1" />
                      {errorCount} error
                    </Badge>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="font-medium">Drag & drop file CSV di sini</p>
              <p className="text-sm text-muted-foreground">
                atau klik untuk memilih file
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {parsedData.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowPreviewDialog(true)}
            >
              Preview Data
            </Button>
            <Button
              onClick={() => {
                setSelectedFile(null);
                setParsedData([]);
                setParseErrors([]);
              }}
              variant="ghost"
            >
              <X className="h-4 w-4 mr-2" />
              Batal
            </Button>
          </div>
        )}

        {/* Preview Dialog */}
        <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Preview Data Upload</DialogTitle>
              <DialogDescription>
                Review data sebelum mengupload ke database
              </DialogDescription>
            </DialogHeader>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-4 py-4">
              <div className="p-4 bg-muted/50 rounded-lg text-center">
                <p className="text-sm text-muted-foreground">Total Baris</p>
                <p className="text-2xl font-bold">{parsedData.length}</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg text-center">
                <p className="text-sm text-muted-foreground">Total Royalties</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalRoyalties)}</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg text-center">
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="text-2xl font-bold">
                  {errorCount > 0 ? (
                    <span className="text-destructive">Error</span>
                  ) : (
                    <span className="text-green-600">OK</span>
                  )}
                </p>
              </div>
            </div>

            {/* Upload Progress */}
            {isUploading && (
              <div className="space-y-2 py-4">
                <div className="flex items-center justify-between text-sm">
                  <span>{uploadStage}</span>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}

            {/* Data Table */}
            <div className="flex-1 overflow-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">#</TableHead>
                    <TableHead>Composer ID</TableHead>
                    <TableHead>Nama Composer</TableHead>
                    <TableHead className="text-right">Total Royalti</TableHead>
                    <TableHead>Periode</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.slice(0, 100).map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-mono text-sm">{row.composer_id}</TableCell>
                      <TableCell className="font-medium">{row.composer_name}</TableCell>
                      <TableCell className="text-right text-green-600">
                        {formatCurrency(row.total_net_royalti)}
                      </TableCell>
                      <TableCell>
                        {row.period ? (
                          <Badge variant="outline">{row.period}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {parsedData.length > 100 && (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Menampilkan 100 dari {parsedData.length} baris
                </div>
              )}
            </div>

            {/* Errors */}
            {parseErrors.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">Errors & Warnings:</p>
                <div className="max-h-[150px] overflow-auto space-y-1">
                  {parseErrors.slice(0, 20).map((error, index) => (
                    <div
                      key={index}
                      className={`text-xs p-2 rounded ${
                        error.severity === 'error'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-yellow-500/10 text-yellow-600'
                      }`}
                    >
                      Baris {error.row}: {error.field} - {error.message}
                    </div>
                  ))}
                  {parseErrors.length > 20 && (
                    <p className="text-xs text-muted-foreground">
                      ...dan {parseErrors.length - 20} lainnya
                    </p>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowPreviewDialog(false)}
                disabled={isUploading}
              >
                Batal
              </Button>
              <Button
                onClick={handleUpload}
                disabled={isUploading || errorCount > 0}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Mengupload...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload {parsedData.length} Data
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Upload Result */}
        {lastUploadResult && (
          <div className={`p-4 rounded-lg ${
            lastUploadResult.success 
              ? 'bg-green-500/10 border border-green-500/30' 
              : 'bg-destructive/10 border border-destructive/30'
          }`}>
            <div className="flex items-center gap-2">
              {lastUploadResult.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              <span className="font-medium">
                {lastUploadResult.success 
                  ? `${lastUploadResult.insertedCount} data berhasil diupload`
                  : `Upload gagal dengan ${lastUploadResult.totalErrors} error`
                }
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
