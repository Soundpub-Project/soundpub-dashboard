import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, FileSpreadsheet, Loader2, Table } from 'lucide-react';
import { useExportCsv } from '@/hooks/useExportCsv';

export default function Export() {
  const { exportableTables, exportTable, exportAllTables, exporting } = useExportCsv();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Export Data</h1>
          <p className="text-muted-foreground">Export data yang diizinkan ke CSV</p>
        </div>
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Table className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Export Data ke CSV</CardTitle>
              </div>
              <Button onClick={exportAllTables} disabled={exporting !== null} className="min-h-11 gap-2" aria-busy={exporting === 'all'}>
                {exporting === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Export Semua Dataset
              </Button>
            </div>
            <CardDescription>Export data dari database ke format CSV untuk backup atau analisis</CardDescription>
          </CardHeader>
        </Card>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {exportableTables.map((table) => (
            <Card key={table.id} className="transition-colors hover:border-primary/50">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-muted p-2">
                      <FileSpreadsheet className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{table.name}</CardTitle>
                      <Badge variant="outline" className="mt-1 border-green-500/20 bg-green-500/10 text-green-500">CSV</Badge>
                    </div>
                  </div>
                </div>
                <CardDescription>{table.description}</CardDescription>
                <Button size="sm" onClick={() => exportTable(table.id)} disabled={exporting !== null}
                  className="min-h-11 w-full gap-2" aria-busy={exporting === table.id}>
                  {exporting === table.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Export CSV
                </Button>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
