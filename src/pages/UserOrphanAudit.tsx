import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Download, FileJson, Loader2, RefreshCw, Search, UserCheck, UserX } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface OrphanArtistLink {
  issue_type: string;
  profile_id: string | null;
  full_name: string | null;
  current_label_id: string | null;
  current_label_name: string | null;
  related_label_id: string | null;
  related_label_name: string | null;
  release_count: number;
  track_count: number;
  royalty_count: number;
  reason: string;
}

const ISSUE_LABELS: Record<string, string> = {
  ARTIST_LABEL_MISMATCH: 'Label Artist Tidak Sama',
  ARTIST_WITHOUT_PARENT_LABEL: 'Artist Tanpa Parent Label',
  RELATED_ARTIST_PROFILE_MISSING: 'Artist Profile Hilang',
  RELATED_LABEL_PROFILE_MISSING: 'Label Profile Hilang',
  RELEASE_WITHOUT_ARTIST_USER_ID: 'Rilis Tanpa Artist ID',
};

const EXPORT_HEADERS = [
  'issue_type',
  'issue_label',
  'profile_id',
  'full_name',
  'current_label_id',
  'current_label_name',
  'related_label_id',
  'related_label_name',
  'release_count',
  'track_count',
  'royalty_count',
  'reason',
] as const;

const normalizeIssueForExport = (issue: OrphanArtistLink) => ({
  issue_type: issue.issue_type,
  issue_label: ISSUE_LABELS[issue.issue_type] || issue.issue_type,
  profile_id: issue.profile_id || '',
  full_name: issue.full_name || '',
  current_label_id: issue.current_label_id || '',
  current_label_name: issue.current_label_name || '',
  related_label_id: issue.related_label_id || '',
  related_label_name: issue.related_label_name || '',
  release_count: Number(issue.release_count || 0),
  track_count: Number(issue.track_count || 0),
  royalty_count: Number(issue.royalty_count || 0),
  reason: issue.reason || '',
});

const escapeMarkdownCell = (value: unknown) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

const buildMarkdownTable = (items: OrphanArtistLink[]) => {
  const rows = items.map(normalizeIssueForExport);
  const header = `| ${EXPORT_HEADERS.join(' | ')} |`;
  const separator = `| ${EXPORT_HEADERS.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${EXPORT_HEADERS.map((key) => escapeMarkdownCell(row[key])).join(' | ')} |`);

  return [
    '# Audit Orphan User',
    '',
    `Total rows: ${items.length}`,
    `Exported at: ${new Date().toISOString()}`,
    '',
    header,
    separator,
    ...body,
  ].join('\n');
};

const escapeCsvCell = (value: unknown) => {
  const stringValue = String(value ?? '');
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const buildCsv = (items: OrphanArtistLink[]) => {
  const rows = items.map(normalizeIssueForExport);
  return [
    EXPORT_HEADERS.join(','),
    ...rows.map((row) => EXPORT_HEADERS.map((key) => escapeCsvCell(row[key])).join(',')),
  ].join('\n');
};

const downloadTextFile = (filename: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export default function UserOrphanAudit() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [issues, setIssues] = useState<OrphanArtistLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [repairingKey, setRepairingKey] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) {
      scanOrphanUsers();
    }
  }, [isAdmin]);

  const scanOrphanUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('scan_orphan_artist_links');

      if (error) throw error;

      setIssues((data || []) as OrphanArtistLink[]);
      toast.success('Scan orphan user selesai');
    } catch (error: any) {
      console.error('Error scanning orphan users:', error);
      toast.error(error.message || 'Gagal scan orphan user. Pastikan SQL 32 sudah dijalankan.');
    } finally {
      setLoading(false);
    }
  };


  const copyToClipboard = async (content: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success(successMessage);
    } catch (error) {
      console.error('Error copying audit export:', error);
      toast.error('Gagal copy ke clipboard');
    }
  };

  const handleCopyMarkdown = () => {
    copyToClipboard(buildMarkdownTable(filteredIssues), 'Hasil audit berhasil dicopy sebagai Markdown');
  };

  const handleCopyJson = () => {
    const json = JSON.stringify(filteredIssues.map(normalizeIssueForExport), null, 2);
    copyToClipboard(json, 'Hasil audit berhasil dicopy sebagai JSON');
  };

  const handleDownloadCsv = () => {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadTextFile(`orphan-user-audit-${timestamp}.csv`, buildCsv(filteredIssues), 'text/csv;charset=utf-8');
    toast.success('CSV audit berhasil didownload');
  };


  const getIssueKey = (issue: OrphanArtistLink, index: number) =>
    `${issue.issue_type}-${issue.profile_id || 'none'}-${issue.related_label_id || 'none'}-${issue.full_name || 'none'}-${index}`;

  const canRepairIssue = (issue: OrphanArtistLink) =>
    issue.issue_type === 'RELEASE_WITHOUT_ARTIST_USER_ID' || issue.issue_type === 'ARTIST_WITHOUT_PARENT_LABEL';

  const handleRepairIssue = async (issue: OrphanArtistLink, index: number) => {
    const confirmed = window.confirm(
      `Repair aman untuk "${issue.full_name || issue.issue_type}"?\n\nHistori royalty lama tidak akan dipindahkan.`
    );

    if (!confirmed) return;

    const key = getIssueKey(issue, index);
    setRepairingKey(key);

    try {
      const { data, error } = await (supabase as any).rpc('repair_orphan_artist_link', {
        _issue_type: issue.issue_type,
        _profile_id: issue.profile_id,
        _full_name: issue.full_name,
        _related_label_id: issue.related_label_id,
      });

      if (error) throw error;

      toast.success(data?.message || 'Repair orphan user berhasil');
      await scanOrphanUsers();
    } catch (error: any) {
      console.error('Error repairing orphan user:', error);
      toast.error(error.message || 'Gagal repair orphan user. Pastikan SQL 36 sudah dijalankan.');
    } finally {
      setRepairingKey(null);
    }
  };

  const filteredIssues = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return issues;

    return issues.filter((issue) =>
      [
        issue.issue_type,
        issue.full_name,
        issue.current_label_name,
        issue.related_label_name,
        issue.reason,
        issue.profile_id,
        issue.current_label_id,
        issue.related_label_id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [issues, searchTerm]);

  const totals = useMemo(() => {
    return issues.reduce(
      (acc, issue) => {
        acc.releases += Number(issue.release_count || 0);
        acc.tracks += Number(issue.track_count || 0);
        acc.royalties += Number(issue.royalty_count || 0);
        return acc;
      },
      { releases: 0, tracks: 0, royalties: 0 }
    );
  }, [issues]);

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Akses tidak diizinkan</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <Button variant="ghost" className="px-0" onClick={() => navigate('/dashboard/users')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali ke Users
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Audit Orphan User</h1>
              <p className="text-muted-foreground">
                Cek relasi artist, label, rilis, track, dan royalty yang bisa membuat data label tidak akurat.
              </p>
            </div>
          </div>
          <Button onClick={scanOrphanUsers} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Scan Ulang
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-card/50">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total Issue</p>
              <p className="text-2xl font-bold">{issues.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Rilis Terdampak</p>
              <p className="text-2xl font-bold">{totals.releases}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Track Terdampak</p>
              <p className="text-2xl font-bold">{totals.tracks}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Royalty Terdampak</p>
              <p className="text-2xl font-bold">{totals.royalties}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Semua Reason Orphan User</CardTitle>
                <CardDescription>
                  Menampilkan {filteredIssues.length} dari {issues.length} hasil audit tanpa batas jumlah baris.
                </CardDescription>
              </div>
              <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Cari artist, label, reason..."
                    className="pl-9"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopyMarkdown} disabled={loading || filteredIssues.length === 0}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy MD
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCopyJson} disabled={loading || filteredIssues.length === 0}>
                    <FileJson className="mr-2 h-4 w-4" />
                    Copy JSON
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadCsv} disabled={loading || filteredIssues.length === 0}>
                    <Download className="mr-2 h-4 w-4" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredIssues.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <UserX className="mb-4 h-12 w-12 opacity-50" />
                <p className="font-medium">Tidak ada orphan user terdeteksi</p>
                <p className="text-sm">Relasi UUID artist, label, rilis, track, dan royalty terlihat konsisten.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reason</TableHead>
                      <TableHead>Artist</TableHead>
                      <TableHead>Label Saat Ini</TableHead>
                      <TableHead>Label di Data</TableHead>
                      <TableHead className="text-right">Rilis</TableHead>
                      <TableHead className="text-right">Track</TableHead>
                      <TableHead className="text-right">Royalty</TableHead>
                      <TableHead>Detail</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredIssues.map((issue, index) => (
                      <TableRow key={`${issue.issue_type}-${issue.profile_id || 'none'}-${issue.related_label_id || 'none'}-${index}`}>
                        <TableCell>
                          <Badge variant="outline">
                            {ISSUE_LABELS[issue.issue_type] || issue.issue_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{issue.full_name || '-'}</div>
                            {issue.profile_id && <div className="font-mono text-[11px] text-muted-foreground">{issue.profile_id}</div>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div>{issue.current_label_name || '-'}</div>
                            {issue.current_label_id && <div className="font-mono text-[11px] text-muted-foreground">{issue.current_label_id}</div>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div>{issue.related_label_name || '-'}</div>
                            {issue.related_label_id && <div className="font-mono text-[11px] text-muted-foreground">{issue.related_label_id}</div>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{issue.release_count}</TableCell>
                        <TableCell className="text-right">{issue.track_count}</TableCell>
                        <TableCell className="text-right">{issue.royalty_count}</TableCell>
                        <TableCell className="max-w-[360px] text-sm text-muted-foreground">
                          {issue.reason}
                        </TableCell>
                        <TableCell className="text-right">
                          {canRepairIssue(issue) ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRepairIssue(issue, index)}
                              disabled={repairingKey === getIssueKey(issue, index)}
                            >
                              {repairingKey === getIssueKey(issue, index) ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <UserCheck className="mr-2 h-4 w-4" />
                              )}
                              Repair Aman
                            </Button>
                          ) : (
                            <Badge variant="secondary">Audit only</Badge>
                          )}
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
