import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, FileText, Globe2, Landmark, PenLine, Shield, Wallet } from 'lucide-react';

const royaltyItems = [
  { title: 'Mechanical Reproduction', split: '70% Komposer / 30% Publisher' },
  { title: 'Synchronization', split: '70% Komposer / 30% Publisher' },
  { title: 'Kategori Lain', split: '50% Komposer / 50% Publisher' },
];

const requirements = [
  'Data diri sesuai KTP',
  'Kontak aktif dan alamat lengkap',
  'Data rekening pembayaran royalti',
  'Data karya/lagu yang didaftarkan',
  'Bukti karya atau dokumen pendukung jika ada',
];

export default function CopyrightRegistrationInfo() {
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
          <div className="space-y-4">
            <Badge variant="outline" className="w-fit border-blue-500/30 bg-blue-500/10 text-blue-500">
              Soundpub Publishing
            </Badge>
            <div className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Perlindungan & Pengelolaan Hak Cipta Musik
              </h1>
              <p className="max-w-3xl text-muted-foreground">
                Daftarkan karya musik Anda untuk pengelolaan hak ekonomi publishing bersama Soundpub, mulai dari data karya,
                kontrak, pembayaran registrasi, sampai dashboard royalti Hak Cipta.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={() => navigate('/dashboard/copyright-registration/new')}>
                Mulai Pendaftaran
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate('/dashboard/copyright')}>
                Lihat Dasbor Hak Cipta
              </Button>
            </div>
          </div>

          <Card className="border-primary/20 bg-card/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                Biaya Registrasi
              </CardTitle>
              <CardDescription>Untuk submit final pendaftaran.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-3xl font-bold">Rp100.000</p>
                <p className="text-sm text-muted-foreground">Sudah termasuk 1 e-Meterai untuk MVP.</p>
              </div>
              <Separator />
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Draft bisa disimpan sebelum bayar.</p>
                <p>Draft PDF dapat diunduh dengan watermark sebelum kontrak final.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <Shield className="mb-2 h-8 w-8 text-blue-500" />
              <CardTitle className="text-lg">Eksklusif</CardTitle>
              <CardDescription>Pengelolaan hak ekonomi karya selama masa kontrak.</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Globe2 className="mb-2 h-8 w-8 text-emerald-500" />
              <CardTitle className="text-lg">Seluruh Dunia</CardTitle>
              <CardDescription>Wilayah pengelolaan mengikuti kontrak publishing Soundpub.</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <FileText className="mb-2 h-8 w-8 text-amber-500" />
              <CardTitle className="text-lg">Kontrak PDF</CardTitle>
              <CardDescription>Preview kontrak dan draft PDF disiapkan dari data form.</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <PenLine className="mb-2 h-8 w-8 text-violet-500" />
              <CardTitle className="text-lg">e-Meterai</CardTitle>
              <CardDescription>MVP memakai proses manual/semi-manual oleh admin.</CardDescription>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Skema Royalti Publishing</CardTitle>
              <CardDescription>Mengacu pada rancangan kontrak Soundpub Publishing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {royaltyItems.map((item) => (
                <div key={item.title} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <span className="font-medium">{item.title}</span>
                  <Badge variant="secondary">{item.split}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Syarat Pendaftaran</CardTitle>
              <CardDescription>Siapkan data berikut sebelum submit final.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {requirements.map((item) => (
                <div key={item} className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Alert>
          <Landmark className="h-4 w-4" />
          <AlertTitle>Catatan MVP</AlertTitle>
          <AlertDescription>
            Setelah pendaftaran dibayar, admin akan melakukan review. Role Hak Cipta dan composer code diberikan setelah
            kontrak aktif. Nomor surat kontrak mengikuti format `P00001/Soundpub/I/PBLSR/2026` dan digenerate saat
            approval admin.
          </AlertDescription>
        </Alert>
      </div>
    </DashboardLayout>
  );
}
