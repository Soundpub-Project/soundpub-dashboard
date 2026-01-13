import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Database, Users, Music, DollarSign, FileText, Settings, Shield, Loader2 } from "lucide-react";

interface ExportConfig {
  name: string;
  table: string;
  icon: React.ReactNode;
  description: string;
  columns?: string;
}

const exportConfigs: ExportConfig[] = [
  {
    name: "Profiles (Users)",
    table: "profiles",
    icon: <Users className="h-5 w-5" />,
    description: "Data profil semua pengguna termasuk balance",
  },
  {
    name: "User Roles",
    table: "user_roles",
    icon: <Shield className="h-5 w-5" />,
    description: "Data role pengguna (superadmin, admin, label, artist)",
  },
  {
    name: "Releases",
    table: "releases",
    icon: <Music className="h-5 w-5" />,
    description: "Data semua rilis musik",
  },
  {
    name: "Tracks",
    table: "tracks",
    icon: <Music className="h-5 w-5" />,
    description: "Data semua track/lagu",
  },
  {
    name: "Royalties",
    table: "royalties",
    icon: <DollarSign className="h-5 w-5" />,
    description: "Data pendapatan royalti",
  },
  {
    name: "Royalty Uploads",
    table: "royalty_uploads",
    icon: <FileText className="h-5 w-5" />,
    description: "Riwayat upload file royalti",
  },
  {
    name: "Payout Requests",
    table: "payout_requests",
    icon: <DollarSign className="h-5 w-5" />,
    description: "Data permintaan pembayaran",
  },
  {
    name: "App Settings",
    table: "app_settings",
    icon: <Settings className="h-5 w-5" />,
    description: "Pengaturan aplikasi",
  },
  {
    name: "Audit Logs",
    table: "audit_logs",
    icon: <FileText className="h-5 w-5" />,
    description: "Log aktivitas sistem",
  },
];

export default function ExportData() {
  const [loading, setLoading] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const fetchCount = async (table: string) => {
    const { count } = await supabase.from(table as any).select("*", { count: "exact", head: true });
    setCounts((prev) => ({ ...prev, [table]: count || 0 }));
  };

  useState(() => {
    exportConfigs.forEach((config) => fetchCount(config.table));
  });

  const downloadCSV = (data: any[], filename: string) => {
    if (data.length === 0) {
      toast.error("Tidak ada data untuk diexport");
      return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((header) => {
            let value = row[header];
            if (value === null || value === undefined) return "";
            if (typeof value === "object") value = JSON.stringify(value);
            // Escape quotes and wrap in quotes if contains comma or newline
            value = String(value).replace(/"/g, '""');
            if (value.includes(",") || value.includes("\n") || value.includes('"')) {
              value = `"${value}"`;
            }
            return value;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportTable = async (config: ExportConfig) => {
    setLoading(config.table);
    try {
      let allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      // Fetch all data with pagination
      while (hasMore) {
        const { data, error } = await supabase
          .from(config.table as any)
          .select("*")
          .range(page * pageSize, (page + 1) * pageSize - 1)
          .order("created_at", { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          page++;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      downloadCSV(allData, config.table);
      toast.success(`Berhasil export ${allData.length} data dari ${config.name}`);
    } catch (error: any) {
      console.error("Export error:", error);
      toast.error(`Gagal export: ${error.message}`);
    } finally {
      setLoading(null);
    }
  };

  const exportAll = async () => {
    setLoading("all");
    try {
      for (const config of exportConfigs) {
        await exportTable(config);
        // Small delay between exports
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      toast.success("Semua data berhasil diexport!");
    } catch (error: any) {
      toast.error(`Gagal export: ${error.message}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Export Data</h1>
            <p className="text-muted-foreground">
              Export data database ke format CSV untuk migrasi ke Supabase eksternal
            </p>
          </div>
          <Button onClick={exportAll} disabled={loading === "all"} size="lg">
            {loading === "all" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export Semua
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Tabel Database
            </CardTitle>
            <CardDescription>
              Pilih tabel yang ingin diexport. Data akan didownload dalam format CSV.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {exportConfigs.map((config) => (
                <Card key={config.table} className="relative">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-primary/10 p-2 text-primary">
                          {config.icon}
                        </div>
                        <div>
                          <h3 className="font-semibold">{config.name}</h3>
                          <p className="text-sm text-muted-foreground">{config.description}</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <Badge variant="secondary">
                        {counts[config.table] !== undefined ? `${counts[config.table]} rows` : "Loading..."}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportTable(config)}
                        disabled={loading !== null}
                      >
                        {loading === config.table ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="mr-2 h-4 w-4" />
                        )}
                        Export
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Petunjuk Migrasi</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <ol className="space-y-2">
              <li>
                <strong>Export semua data</strong> - Klik tombol "Export Semua" atau export per tabel
              </li>
              <li>
                <strong>Buat struktur database</strong> - Jalankan file{" "}
                <code>public/exports/database-export.sql</code> di SQL Editor Supabase target
              </li>
              <li>
                <strong>Import data CSV</strong> - Gunakan fitur Import di Supabase Dashboard untuk setiap tabel
              </li>
              <li>
                <strong>Recreate users</strong> - User auth perlu dibuat ulang di Supabase target dengan ID yang sama
              </li>
              <li>
                <strong>Update URLs</strong> - Ganti URL storage (cover images, audio) ke URL Supabase baru
              </li>
            </ol>
            <div className="mt-4 rounded-lg bg-amber-500/10 p-4 text-amber-700 dark:text-amber-400">
              <strong>⚠️ Penting:</strong> Data auth.users tidak dapat diexport. Anda perlu membuat user baru di 
              Supabase target dengan email yang sama dan memastikan UUID-nya sesuai dengan data profiles.
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
