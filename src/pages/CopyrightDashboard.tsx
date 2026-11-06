import { lazy, Suspense } from 'react';
import { usesBackendDomain } from '@/api/routing';
import { BackendCopyrightDashboard } from '@/components/copyright/BackendCopyrightDashboard';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';

const LegacyCopyrightDashboard = lazy(() => import('@/components/copyright/LegacyCopyrightDashboard'));

export default function CopyrightDashboard() {
  if (usesBackendDomain('copyright-registration')) return <BackendCopyrightDashboard />;
  return <Suspense fallback={<DashboardLayout><Skeleton className="h-64 w-full" /></DashboardLayout>}>
    <LegacyCopyrightDashboard />
  </Suspense>;
}
