import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';

export default function PaymentCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const status = searchParams.get('status');
  const releaseId = searchParams.get('release_id');
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (status === 'success') {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            navigate('/dashboard/releases');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [status, navigate]);

  const getStatusConfig = () => {
    switch (status) {
      case 'success':
        return {
          icon: <CheckCircle className="h-16 w-16 text-green-500" />,
          title: 'Pembayaran Berhasil!',
          description: 'Pembayaran release Anda telah diterima. Tim kami akan segera memproses release Anda.',
          color: 'text-green-600',
        };
      case 'failed':
        return {
          icon: <XCircle className="h-16 w-16 text-destructive" />,
          title: 'Pembayaran Gagal',
          description: 'Pembayaran tidak dapat diproses. Release Anda telah disimpan sebagai draft. Anda dapat mencoba pembayaran lagi.',
          color: 'text-destructive',
        };
      case 'expired':
        return {
          icon: <Clock className="h-16 w-16 text-amber-500" />,
          title: 'Pembayaran Kadaluarsa',
          description: 'Waktu pembayaran telah habis. Release Anda telah disimpan sebagai draft.',
          color: 'text-amber-600',
        };
      default:
        return {
          icon: <Loader2 className="h-16 w-16 text-muted-foreground animate-spin" />,
          title: 'Memproses...',
          description: 'Menunggu konfirmasi pembayaran.',
          color: 'text-muted-foreground',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <DashboardLayout>
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full text-center">
          <CardHeader className="pb-4">
            <div className="flex justify-center mb-4">{config.icon}</div>
            <CardTitle className={config.color}>{config.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{config.description}</p>
            
            {status === 'success' && (
              <p className="text-sm text-muted-foreground">
                Redirect ke halaman releases dalam {countdown} detik...
              </p>
            )}

            <div className="flex flex-col gap-2 pt-4">
              <Button onClick={() => navigate('/dashboard/releases')} className="w-full">
                Kembali ke Releases
              </Button>
              {releaseId && status !== 'success' && (
                <Button variant="outline" onClick={() => navigate(`/dashboard/releases/${releaseId}`)} className="w-full">
                  Lihat Detail Release
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
