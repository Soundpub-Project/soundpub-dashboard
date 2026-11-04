import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { financeUnavailable } from './mode';

export function FinanceUnavailable({ title = 'Keuangan' }: { title?: string }) {
  return <DashboardLayout><section className="space-y-3"><h1 className="text-2xl font-bold">{title}</h1><p role="status">{financeUnavailable}</p></section></DashboardLayout>;
}
