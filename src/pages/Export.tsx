import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Download, 
  FileCode, 
  FileText, 
  FolderArchive, 
  Database,
  Server,
  ExternalLink,
  Copy,
  Check,
  Table,
  Loader2,
  FileSpreadsheet
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useExportCsv } from '@/hooks/useExportCsv';

interface ExportFile {
  name: string;
  path: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  type: 'sql' | 'markdown' | 'javascript' | 'json';
  size?: string;
}

const exportFiles: ExportFile[] = [
  {
    name: 'Full Schema SQL',
    path: '/exports/full-schema.sql',
    description: 'Schema lengkap database termasuk tables, functions, triggers, RLS policies, dan storage buckets',
    icon: Database,
    type: 'sql',
    size: '~25 KB',
  },
  {
    name: 'Migration Guide',
    path: '/exports/MIGRATION-GUIDE.md',
    description: 'Panduan step-by-step untuk migrasi dari Lovable Cloud ke Supabase eksternal',
    icon: FileText,
    type: 'markdown',
    size: '~8 KB',
  },
  {
    name: 'Migration Script',
    path: '/exports/migration-scripts/migrate.js',
    description: 'Script Node.js untuk automasi migrasi data antar Supabase projects',
    icon: FileCode,
    type: 'javascript',
    size: '~6 KB',
  },
  {
    name: 'Package.json',
    path: '/exports/migration-scripts/package.json',
    description: 'Dependencies untuk menjalankan migration script',
    icon: FileCode,
    type: 'json',
    size: '~200 B',
  },
  {
    name: 'Environment Template',
    path: '/exports/migration-scripts/.env.example',
    description: 'Template environment variables untuk konfigurasi migration script',
    icon: FileCode,
    type: 'javascript',
    size: '~300 B',
  },
  {
    name: 'Script README',
    path: '/exports/migration-scripts/README.md',
    description: 'Dokumentasi lengkap cara penggunaan migration script',
    icon: FileText,
    type: 'markdown',
    size: '~3 KB',
  },
];

const getTypeBadgeColor = (type: string) => {
  const colors: Record<string, string> = {
    sql: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    markdown: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    javascript: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    json: 'bg-green-500/10 text-green-500 border-green-500/20',
  };
  return colors[type] || 'bg-muted text-muted-foreground';
};

export default function Export() {
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const { exportableTables, exportTable, exportAllTables, exporting } = useExportCsv();

  const handleDownload = (file: ExportFile) => {
    window.open(file.path, '_blank');
    toast.success(`Downloading ${file.name}...`);
  };

  const handleCopyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(window.location.origin + path);
      setCopiedPath(path);
      toast.success('Path copied to clipboard');
      setTimeout(() => setCopiedPath(null), 2000);
    } catch (err) {
      toast.error('Failed to copy path');
    }
  };

  const handleDownloadAll = () => {
    exportFiles.forEach((file, index) => {
      setTimeout(() => {
        window.open(file.path, '_blank');
      }, index * 500);
    });
    toast.success('Downloading all files...');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Export & Migration</h1>
            <p className="text-muted-foreground">
              Download file migrasi dan export data ke CSV
            </p>
          </div>
        </div>

        <Tabs defaultValue="data" className="space-y-6">
          <TabsList>
            <TabsTrigger value="data" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Export Data
            </TabsTrigger>
            <TabsTrigger value="migration" className="gap-2">
              <Server className="h-4 w-4" />
              Migration Files
            </TabsTrigger>
          </TabsList>

          {/* Data Export Tab */}
          <TabsContent value="data" className="space-y-6">
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Table className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Export Data ke CSV</CardTitle>
                  </div>
                  <Button 
                    onClick={exportAllTables}
                    disabled={exporting !== null}
                    className="gap-2"
                  >
                    {exporting === 'all' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Export Semua Table
                  </Button>
                </div>
                <CardDescription>
                  Export data dari database ke format CSV untuk backup atau analisis
                </CardDescription>
              </CardHeader>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {exportableTables.map((table) => (
                <Card key={table.id} className="hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-muted">
                          <Table className="h-5 w-5 text-foreground" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{table.name}</CardTitle>
                          <Badge variant="outline" className="mt-1 bg-green-500/10 text-green-500 border-green-500/20">
                            CSV
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <CardDescription className="mb-4">{table.description}</CardDescription>
                    <Button 
                      size="sm" 
                      onClick={() => exportTable(table.id)}
                      disabled={exporting !== null}
                      className="w-full gap-2"
                    >
                      {exporting === table.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      Export CSV
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Migration Files Tab */}
          <TabsContent value="migration" className="space-y-6">
            {/* Quick Start Card */}
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Quick Start Migration</CardTitle>
                  </div>
                  <Button onClick={handleDownloadAll} className="gap-2">
                    <FolderArchive className="h-4 w-4" />
                    Download Semua
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Buat project baru di <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Supabase <ExternalLink className="h-3 w-3" /></a></li>
                  <li>Download dan jalankan <strong>Full Schema SQL</strong> di SQL Editor Supabase</li>
                  <li>Download <strong>Migration Script</strong> dan ikuti panduan di README</li>
                  <li>Jalankan script untuk migrasi data</li>
                  <li>Deploy Edge Functions dan update environment variables</li>
                </ol>
              </CardContent>
            </Card>

            {/* Export Files Grid */}
            <div className="grid gap-4 md:grid-cols-2">
              {exportFiles.map((file) => (
                <Card key={file.path} className="hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-muted">
                          <file.icon className="h-5 w-5 text-foreground" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{file.name}</CardTitle>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className={getTypeBadgeColor(file.type)}>
                              {file.type.toUpperCase()}
                            </Badge>
                            {file.size && (
                              <span className="text-xs text-muted-foreground">{file.size}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <CardDescription className="mb-4">{file.description}</CardDescription>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        onClick={() => handleDownload(file)}
                        className="flex-1 gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyPath(file.path)}
                        className="gap-2"
                      >
                        {copiedPath === file.path ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Additional Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Catatan Penting</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  <strong>• Urutan Migrasi:</strong> Jalankan schema SQL terlebih dahulu, kemudian migrasi data menggunakan script.
                </p>
                <p>
                  <strong>• User Password:</strong> Password user tidak bisa di-migrate. Setelah migrasi, kirim email reset password ke semua user.
                </p>
                <p>
                  <strong>• Storage Files:</strong> File di storage bucket perlu di-download dan upload manual ke Supabase target.
                </p>
                <p>
                  <strong>• Edge Functions:</strong> Copy folder <code className="px-1 py-0.5 bg-muted rounded">supabase/functions/</code> ke project baru dan deploy menggunakan Supabase CLI.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
