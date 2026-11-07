import { useState } from 'react';
import { toast } from 'sonner';
import { downloadBackendExport, type ExportDataset } from '@/api/exports';
import { SoundpubApiError } from '@/api/client';

export interface ExportableTable {
  id: ExportDataset;
  name: string;
  description: string;
}

const exportableTables: ExportableTable[] = [
  { id: 'profiles', name: 'Users/Profiles', description: 'Data semua user dan profil' },
  { id: 'artists', name: 'Artists', description: 'Data semua artist' },
  { id: 'releases', name: 'Releases', description: 'Data semua release/album' },
  { id: 'tracks', name: 'Tracks', description: 'Data semua track/lagu' },
  { id: 'royalties', name: 'Royalties', description: 'Data royalti dari semua platform' },
  { id: 'royalty_uploads', name: 'Royalty Uploads', description: 'Riwayat upload data royalti' },
  { id: 'payout_requests', name: 'Payout Requests', description: 'Data permintaan pencairan' },
  { id: 'audit_logs', name: 'Audit Logs', description: 'Log aktivitas sistem' },
  { id: 'user_roles', name: 'User Roles', description: 'Data role pengguna' },
  { id: 'app_settings', name: 'App Settings', description: 'Pengaturan aplikasi' },
];

function downloadCSV(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function errorMessage(error: unknown) {
  if (error instanceof SoundpubApiError) {
    if (error.category === 'UNAUTHENTICATED') return 'Sesi berakhir. Silakan login kembali.';
    if (error.category === 'FORBIDDEN') return 'Anda tidak memiliki izin untuk export data ini.';
    if (error.category === 'RATE_LIMITED') return 'Terlalu banyak permintaan. Coba lagi nanti.';
    if (error.code === 'EXPORT_TOO_LARGE') return 'Dataset terlalu besar untuk export langsung. Gunakan proses batch.';
    if (error.category === 'TEMPORARY_FAILURE') return 'Layanan export sedang tidak tersedia.';
  }
  return 'Export gagal. Coba lagi.';
}

export const useExportCsv = () => {
  const [exporting, setExporting] = useState<string | null>(null);

  const exportTable = async (tableId: string) => {
    const table = exportableTables.find(item => item.id === tableId);
    if (!table) return toast.error('Dataset export tidak ditemukan.');
    setExporting(table.id);
    try {
      const result = await downloadBackendExport(table.id);
      if (result.rowCount === 0) return toast.warning(`Tidak ada data pada ${table.name}.`);
      downloadCSV(result.csv, table.id);
      toast.success(`${table.name} berhasil diexport (${result.rowCount} baris).`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally { setExporting(null); }
  };

  const exportAllTables = async () => {
    setExporting('all');
    let successCount = 0;
    let errorCount = 0;
    try {
      for (const table of exportableTables) {
        try {
          const result = await downloadBackendExport(table.id);
          if (result.rowCount > 0) {
            downloadCSV(result.csv, table.id);
            successCount++;
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch { errorCount++; }
      }
      if (errorCount) toast.warning(`${successCount} dataset berhasil, ${errorCount} gagal.`);
      else toast.success(`${successCount} dataset berhasil diexport.`);
    } finally { setExporting(null); }
  };

  return { exportableTables, exportTable, exportAllTables, exporting };
};
