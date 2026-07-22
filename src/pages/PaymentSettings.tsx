import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PricingSettings } from '@/components/settings/PricingSettings';
import { PayoutSettings } from '@/components/settings/PayoutSettings';
import { Loader2 } from 'lucide-react';

export default function PaymentSettings() {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return <DashboardLayout><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></DashboardLayout>;
  }
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Pengaturan Pembayaran</h1>
          <p className="text-muted-foreground">Kelola harga release dan batas minimal payout</p>
        </div>
        <PricingSettings />
        <PayoutSettings />
      </div>
    </DashboardLayout>
  );
}
