import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/integrations/supabase/client';
import { Moon, Sun, Monitor, Wrench, Clock, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Maintenance() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  // Target date: 18 Agustus 2026, 10:00 WIB (GMT+7)
  const targetDate = new Date('2026-08-18T10:00:00+07:00').getTime();

  const whatsappContacts = [
    { number: '+6289517898767', display: '+62 895-1789-8767' },
    { number: '+6281727089', display: '+62 817-270-898' },
    { number: '+6281999900900', display: '+62 819-9990-0900' },
  ];

  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('key, value')
          .in('key', ['dashboard_logo_light', 'dashboard_logo_dark', 'dashboard_logo']);

        if (!error && data) {
          const settingsMap: Record<string, string | null> = {};
          data.forEach(row => {
            settingsMap[row.key] = row.value;
          });
          
          const themeLogo = resolvedTheme === 'dark'
            ? settingsMap.dashboard_logo_dark || settingsMap.dashboard_logo_light || settingsMap.dashboard_logo
            : settingsMap.dashboard_logo_light || settingsMap.dashboard_logo;
          
          setLogoUrl(themeLogo || null);
        }
      } catch (error) {
        console.error('Error fetching dashboard logo:', error);
      }
    };

    fetchLogo();
  }, [resolvedTheme]);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const difference = targetDate - now;

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000),
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  const toggleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const getThemeIcon = () => {
    if (theme === 'light') return <Sun className="h-5 w-5" />;
    if (theme === 'dark') return <Moon className="h-5 w-5" />;
    return <Monitor className="h-5 w-5" />;
  };

  const openWhatsApp = (number: string) => {
    const message = encodeURIComponent('Halo, saya ingin menanyakan tentang maintenance sistem.');
    window.open(`https://wa.me/${number}?text=${message}`, '_blank');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className="absolute top-4 right-4 rounded-full"
        aria-label="Toggle theme"
      >
        {getThemeIcon()}
      </Button>

      <div className="w-full max-w-2xl">
        <Card className="border-2 shadow-2xl">
          <CardHeader className="text-center space-y-6 pb-8">
            <div className="flex justify-center mb-4">
              {logoUrl ? (
                <img 
                  src={logoUrl} 
                  alt="Logo" 
                  className="h-16 w-auto object-contain"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Wrench className="h-8 w-8 text-primary" />
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2">
                <Wrench className="h-6 w-6 text-primary animate-pulse" />
                <CardTitle className="text-3xl font-bold">Sedang Dalam Pemeliharaan</CardTitle>
              </div>
              <CardDescription className="text-base">
                Kami sedang melakukan peningkatan sistem untuk memberikan pengalaman yang lebih baik
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-8">
            <div className="bg-muted/50 rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Clock className="h-5 w-5" />
                <p className="text-sm font-medium">Estimasi Selesai</p>
              </div>
              
              <div className="text-center">
                <p className="text-lg font-semibold text-foreground">
                  18 Agustus 2026, 10:00 WIB
                </p>
              </div>

              <div className="grid grid-cols-4 gap-4 mt-6">
                <div className="text-center">
                  <div className="bg-primary/10 rounded-lg p-4 mb-2">
                    <p className="text-3xl font-bold text-primary">{timeLeft.days}</p>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">Hari</p>
                </div>
                
                <div className="text-center">
                  <div className="bg-primary/10 rounded-lg p-4 mb-2">
                    <p className="text-3xl font-bold text-primary">{timeLeft.hours}</p>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">Jam</p>
                </div>
                
                <div className="text-center">
                  <div className="bg-primary/10 rounded-lg p-4 mb-2">
                    <p className="text-3xl font-bold text-primary">{timeLeft.minutes}</p>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">Menit</p>
                </div>
                
                <div className="text-center">
                  <div className="bg-primary/10 rounded-lg p-4 mb-2">
                    <p className="text-3xl font-bold text-primary">{timeLeft.seconds}</p>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">Detik</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Mohon maaf atas ketidaknyamanan ini. Kami akan kembali segera!
                </p>
                <p className="text-sm font-medium text-foreground">
                  Butuh bantuan segera? Hubungi kami via WhatsApp:
                </p>
              </div>

              <div className="space-y-2">
                {whatsappContacts.map((contact, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    className="w-full justify-start gap-3 h-auto py-3 hover:bg-green-500/10 hover:border-green-500/50 transition-colors"
                    onClick={() => openWhatsApp(contact.number)}
                  >
                    <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                      <MessageCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <span className="text-sm font-medium">{contact.display}</span>
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
