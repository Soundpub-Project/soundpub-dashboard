import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Disc3, ImageIcon, ListMusic } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ArtistOnboardingDialog } from '@/components/onboarding/ArtistOnboardingDialog';
import { ReleaseFormPage } from '@/components/releases/ReleaseFormPage';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const steps = [
  {
    number: 1,
    title: 'Detail & Sampul',
    description: 'Judul, label, genre, bahasa, UPC, tanggal rilis, dan artwork.',
    icon: ImageIcon,
  },
  {
    number: 2,
    title: 'Daftar Lagu',
    description: 'Track, artist, kontributor, file audio, dan clip audio.',
    icon: ListMusic,
  },
];

export default function ReleaseCreate() {
  const navigate = useNavigate();
  const { isArtist, isArtistProfileCompleted, refreshProfile } = useAuth();
  const [onboardingOpen, setOnboardingOpen] = useState(isArtist && !isArtistProfileCompleted);
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  const handleClose = () => navigate('/dashboard/releases');
  const handleSuccess = () => navigate('/dashboard/releases');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <Button variant="ghost" className="-ml-3 w-fit" onClick={handleClose}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali ke Releases
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Tambah Release Baru</h1>
              <p className="text-muted-foreground">
                Lengkapi detail rilis, upload artwork, lalu susun daftar lagu dalam satu halaman bertahap.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground">
            <Disc3 className="h-4 w-4 text-primary" />
            Draft Release
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Card className="h-fit border-border/60 bg-card/70 lg:sticky lg:top-6">
            <CardContent className="p-4">
              <div className="mb-4 px-2 text-sm font-semibold">Langkah Rilis</div>
              <div className="space-y-3">
                {steps.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <div
                      key={step.number}
                      className={cn(
                        'rounded-xl border p-4 transition-colors',
                        currentStep === step.number
                          ? 'border-primary/40 bg-primary/10 shadow-sm'
                          : step.number < currentStep
                            ? 'border-emerald-500/40 bg-emerald-500/10'
                            : 'border-border/60 bg-muted/30'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border',
                            currentStep === step.number
                              ? 'border-primary bg-primary text-primary-foreground'
                              : step.number < currentStep
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-border bg-background text-muted-foreground'
                          )}
                        >
                          {step.number < currentStep ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Tahap {step.number}
                          </div>
                          <div className="font-semibold">{step.title}</div>
                          <p className="text-xs leading-relaxed text-muted-foreground">{step.description}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 shadow-sm">
            <CardContent className="p-4 md:p-6">
              <ReleaseFormPage
                open
                onOpenChange={(open) => {
                  if (!open) handleClose();
                }}
                release={null}
                onSuccess={handleSuccess}
                onStepChange={setCurrentStep}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <ArtistOnboardingDialog
        open={onboardingOpen}
        onOpenChange={(open) => {
          setOnboardingOpen(open);
          if (!open && isArtist && !isArtistProfileCompleted) {
            handleClose();
          }
        }}
        onSuccess={async () => {
          await refreshProfile();
          setOnboardingOpen(false);
        }}
      />
    </DashboardLayout>
  );
}
