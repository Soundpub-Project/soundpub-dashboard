import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ExportableTable {
  id: string;
  name: string;
  description: string;
  fetchData: () => Promise<unknown[]>;
}

const convertToCSV = (data: unknown[]): string => {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0] as object);
  const csvRows = [
    headers.join(','),
    ...data.map(row => {
      return headers.map(header => {
        const value = (row as Record<string, unknown>)[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
        return String(value);
      }).join(',');
    })
  ];
  
  return csvRows.join('\n');
};

const downloadCSV = (csvContent: string, filename: string) => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const useExportCsv = () => {
  const [exporting, setExporting] = useState<string | null>(null);

  const exportableTables: ExportableTable[] = [
    {
      id: 'profiles',
      name: 'Users/Profiles',
      description: 'Data semua user dan profil',
      fetchData: async () => {
        const { data, error } = await supabase.from('profiles').select('*');
        if (error) throw error;
        return data || [];
      },
    },
    {
      id: 'artists',
      name: 'Artists',
      description: 'Data semua artist',
      fetchData: async () => {
        const { data, error } = await supabase.from('artists').select('*');
        if (error) throw error;
        return data || [];
      },
    },
    {
      id: 'releases',
      name: 'Releases',
      description: 'Data semua release/album',
      fetchData: async () => {
        const { data, error } = await supabase.from('releases').select('*');
        if (error) throw error;
        return data || [];
      },
    },
    {
      id: 'tracks',
      name: 'Tracks',
      description: 'Data semua track/lagu',
      fetchData: async () => {
        const { data, error } = await supabase.from('tracks').select('*');
        if (error) throw error;
        return data || [];
      },
    },
    {
      id: 'royalties',
      name: 'Royalties',
      description: 'Data royalti dari semua platform',
      fetchData: async () => {
        const { data, error } = await supabase.from('royalties').select('*');
        if (error) throw error;
        return data || [];
      },
    },
    {
      id: 'royalty_uploads',
      name: 'Royalty Uploads',
      description: 'Riwayat upload data royalti',
      fetchData: async () => {
        const { data, error } = await supabase.from('royalty_uploads').select('*');
        if (error) throw error;
        return data || [];
      },
    },
    {
      id: 'payout_requests',
      name: 'Payout Requests',
      description: 'Data permintaan pencairan',
      fetchData: async () => {
        const { data, error } = await supabase.from('payout_requests').select('*');
        if (error) throw error;
        return data || [];
      },
    },
    {
      id: 'audit_logs',
      name: 'Audit Logs',
      description: 'Log aktivitas sistem',
      fetchData: async () => {
        const { data, error } = await supabase.from('audit_logs').select('*');
        if (error) throw error;
        return data || [];
      },
    },
    {
      id: 'user_roles',
      name: 'User Roles',
      description: 'Data role pengguna',
      fetchData: async () => {
        const { data, error } = await supabase.from('user_roles').select('*');
        if (error) throw error;
        return data || [];
      },
    },
    {
      id: 'app_settings',
      name: 'App Settings',
      description: 'Pengaturan aplikasi',
      fetchData: async () => {
        const { data, error } = await supabase.from('app_settings').select('*');
        if (error) throw error;
        return data || [];
      },
    },
  ];

  const exportTable = async (tableId: string) => {
    const table = exportableTables.find(t => t.id === tableId);
    if (!table) {
      toast.error('Table not found');
      return;
    }

    setExporting(tableId);
    try {
      const data = await table.fetchData();
      if (data.length === 0) {
        toast.warning(`No data found in ${table.name}`);
        return;
      }
      
      const csv = convertToCSV(data);
      downloadCSV(csv, tableId);
      toast.success(`${table.name} exported successfully (${data.length} rows)`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error(`Failed to export ${table.name}`);
    } finally {
      setExporting(null);
    }
  };

  const exportAllTables = async () => {
    setExporting('all');
    let successCount = 0;
    let errorCount = 0;

    for (const table of exportableTables) {
      try {
        const data = await table.fetchData();
        if (data.length > 0) {
          const csv = convertToCSV(data);
          downloadCSV(csv, table.id);
          successCount++;
          // Small delay between downloads
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (error) {
        console.error(`Export error for ${table.id}:`, error);
        errorCount++;
      }
    }

    if (errorCount > 0) {
      toast.warning(`Exported ${successCount} tables, ${errorCount} failed`);
    } else {
      toast.success(`All ${successCount} tables exported successfully`);
    }
    setExporting(null);
  };

  return {
    exportableTables,
    exportTable,
    exportAllTables,
    exporting,
  };
};
