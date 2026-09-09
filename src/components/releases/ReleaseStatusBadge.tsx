import { Badge } from '@/components/ui/badge';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: { label: 'LIVE', className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400' },
  pending: { label: 'Menunggu Bayar', className: 'border-amber-500/40 bg-amber-500/15 text-amber-400' },
  pending_paid: { label: 'Sudah Dibayar', className: 'border-sky-500/40 bg-sky-500/15 text-sky-400' },
  processing: { label: 'Diproses', className: 'border-violet-500/40 bg-violet-500/15 text-violet-400' },
  rejected: { label: 'Ditolak', className: 'border-red-500/40 bg-red-500/15 text-red-400' },
  draft: { label: 'Draft', className: 'border-slate-500/40 bg-slate-500/15 text-slate-300' },
  inactive: { label: 'Nonaktif', className: 'border-zinc-500/40 bg-zinc-500/15 text-zinc-400' },
};

export function ReleaseStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { label: status, className: 'border-zinc-500/40 bg-zinc-500/15 text-zinc-400' };

  return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
}
