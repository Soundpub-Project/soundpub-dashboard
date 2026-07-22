import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Upload, FileText, AlertCircle, CheckCircle2, XCircle, Download, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';

interface CSVRow {
  row_number: number;
  composer_code: string;
  composer_name: string;
  total_net_royalti: string;
  period: string;
  is_valid?: boolean;
  errors?: string[];
}

interface ValidationResult {
  is_valid: boolean;
  errors: string[];
  composer_code: string;
  composer_name: string;
  total_net_royalti: number;
  period: string;
}

export default function CopyrightRoyaltyUpload() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<CSVRow[]>([]);
  const [validatedData, setValidatedData] = useState<ValidationResult[]>([]);
  const [period, setPeriod] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      toast.error('File harus berformat CSV');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('File terlalu besar (max 10MB)');
      return;
    }

    setFile(selectedFile);
    parseCSV(selectedFile);
  }, []);

  const parseCSV = async (file: File) => {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      toast.error('CSV harus memiliki header dan minimal 1 data row');
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const requiredHeaders = ['composer_code', 'composer_name', 'total_net_royalti', 'period'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

    if (missingHeaders.length > 0) {
      toast.error(`CSV missing required columns: ${missingHeaders.join(', ')}`);
      return;
    }

    const rows: CSVRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length !== headers.length) continue;

      const row: any = { row_number: i };
      headers.forEach((header, index) => {
        row[header] = values[index];
      });
      rows.push(row);
    }

    setCsvData(rows);
    
    // Auto-detect period from first row
    if (rows.length > 0 && rows[0].period) {
      setPeriod(rows[0].period);
    }

    toast.success(`CSV parsed: ${rows.length} rows`);
  };

  const validateCSV = async () => {
    if (csvData.length === 0) {
      toast.error('No data to validate');
      return;
    }

    setIsValidating(true);
    const results: ValidationResult[] = [];

    try {
      for (const row of csvData) {
        const { data, error } = await supabase.rpc('validate_royalty_csv_row', {
          _composer_code: row.composer_code,
          _composer_name: row.composer_name,
          _total_net_royalti: row.total_net_royalti,
          _period: row.period,
        });

        if (error) {
          console.error('Validation error:', error);
          continue;
        }

        results.push(data as ValidationResult);
      }

      setValidatedData(results);
      
      const validCount = results.filter(r => r.is_valid).length;
      const errorCount = results.length - validCount;

      if (errorCount === 0) {
        toast.success(`All ${validCount} rows are valid!`);
      } else {
        toast.warning(`${validCount} valid, ${errorCount} errors found`);
      }
    } catch (err: any) {
      console.error('Validation failed:', err);
      toast.error('Validation failed: ' + err.message);
    } finally {
      setIsValidating(false);
    }
  };

  const handleUpload = async () => {
    if (!period) {
      toast.error('Period is required');
      return;
    }

    const validRows = validatedData.filter(r => r.is_valid);
    if (validRows.length === 0) {
      toast.error('No valid rows to upload');
      return;
    }

    setShowConfirmDialog(false);
    setIsUploading(true);

    try {
      const { data, error } = await supabase.rpc('import_composer_royalties', {
        _csv_rows: validRows,
        _period: period,
        _filename: file?.name || 'upload.csv',
        _replace_existing: replaceExisting,
      });

      if (error) throw error;

      setUploadResult(data);
      
      if (data.success) {
        toast.success(`Upload complete! ${data.success_rows} rows imported`);
        
        // Reset form
        setFile(null);
        setCsvData([]);
        setValidatedData([]);
        setPeriod('');
      } else {
        toast.error(data.error || 'Upload failed');
      }
    } catch (err: any) {
      console.error('Upload failed:', err);
      toast.error('Upload failed: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = () => {
    const template = 'composer_code,composer_name,total_net_royalti,period\nSPC00001,John Doe,1500000,2026-07\nSPC00002,Jane Smith,2000000,2026-07';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'royalty-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const validCount = validatedData.filter(r => r.is_valid).length;
  const errorCount = validatedData.length - validCount;
  const hasErrors = errorCount > 0;

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>Only admins can upload royalty data.</AlertDescription>
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
            <h1 className="text-3xl font-bold">Upload Royalti Hak Cipta</h1>
            <p className="text-muted-foreground mt-1">Upload CSV berisi data royalti komposer per periode</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
            <Button variant="outline" onClick={() => navigate('/dashboard/royalties/copyright-uploads')}>
              <History className="mr-2 h-4 w-4" />
              Upload History
            </Button>
          </div>
        </div>

        {/* Upload Result */}
        {uploadResult && (
          <Alert variant={uploadResult.success ? 'default' : 'destructive'}>
            {uploadResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            <AlertTitle>Upload {uploadResult.success ? 'Complete' : 'Failed'}</AlertTitle>
            <AlertDescription>
              {uploadResult.success ? (
                <div>
                  <p>Successfully imported {uploadResult.success_rows} out of {uploadResult.total_rows} rows.</p>
                  {uploadResult.error_rows > 0 && (
                    <p className="text-red-600 mt-1">{uploadResult.error_rows} rows failed.</p>
                  )}
                </div>
              ) : (
                <p>{uploadResult.error}</p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* File Upload Card */}
        <Card>
          <CardHeader>
            <CardTitle>1. Select CSV File</CardTitle>
            <CardDescription>Upload file CSV dengan format: composer_code, composer_name, total_net_royalti, period</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Input
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  disabled={isValidating || isUploading}
                />
              </div>
              {file && (
                <Badge variant="secondary">
                  <FileText className="mr-2 h-3 w-3" />
                  {file.name} ({Math.round(file.size / 1024)} KB)
                </Badge>
              )}
            </div>

            {csvData.length > 0 && (
              <div className="text-sm text-muted-foreground">
                Parsed {csvData.length} rows from CSV
              </div>
            )}
          </CardContent>
        </Card>

        {/* Period Configuration */}
        {csvData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>2. Configure Upload</CardTitle>
              <CardDescription>Set period and upload options</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="period">Period (YYYY-MM)</Label>
                  <Input
                    id="period"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    placeholder="2026-07"
                    disabled={isValidating || isUploading}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="replace"
                  checked={replaceExisting}
                  onCheckedChange={(checked) => setReplaceExisting(checked as boolean)}
                  disabled={isValidating || isUploading}
                />
                <label
                  htmlFor="replace"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Replace existing data for this period
                </label>
              </div>

              <Button
                onClick={validateCSV}
                disabled={!period || isValidating || isUploading}
                className="w-full md:w-auto"
              >
                {isValidating ? 'Validating...' : 'Validate CSV'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Validation Results */}
        {validatedData.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>3. Validation Results</CardTitle>
                  <CardDescription>
                    {validCount} valid rows, {errorCount} errors
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Badge variant={hasErrors ? 'destructive' : 'default'}>
                    {hasErrors ? `${errorCount} Errors` : 'All Valid'}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Composer Code</TableHead>
                      <TableHead>Composer Name</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validatedData.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {row.is_valid ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{row.composer_code}</TableCell>
                        <TableCell>{row.composer_name}</TableCell>
                        <TableCell>{formatCurrency(row.total_net_royalti)}</TableCell>
                        <TableCell>{row.period}</TableCell>
                        <TableCell>
                          {row.errors && row.errors.length > 0 && (
                            <div className="text-xs text-red-600 space-y-1">
                              {row.errors.map((err, i) => (
                                <div key={i}>{err}</div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Separator className="my-4" />

              <div className="flex justify-end">
                <Button
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={validCount === 0 || isUploading}
                  size="lg"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload {validCount} Valid Rows
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Upload</DialogTitle>
            <DialogDescription>
              You are about to import {validCount} royalty records for period {period}.
              {replaceExisting && (
                <span className="text-red-600 font-medium block mt-2">
                  This will replace all existing data for this period.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={isUploading}>
              {isUploading ? 'Uploading...' : 'Confirm Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}