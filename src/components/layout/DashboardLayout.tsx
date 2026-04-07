import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Loader2, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { AnnouncementDialog } from '@/components/notifications/AnnouncementDialog';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, loading, profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [announcementOpen, setAnnouncementOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          {/* Top Header */}
          <header className="h-14 border-b border-border bg-card sticky top-0 z-10">
            <div className="h-full flex items-center justify-between px-4">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
              </div>
              
              <div className="flex items-center gap-2">
                <ThemeToggle />

                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setAnnouncementOpen(true)}
                    title="Kirim Pengumuman"
                  >
                    <Megaphone className="h-5 w-5" />
                  </Button>
                )}
                
                <NotificationBell />
                
                {profile && (
                  <div className="hidden sm:flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">{profile.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Balance: Rp {profile.balance.toLocaleString('id-ID')}
                      </p>
                    </div>
                    <Avatar className="h-8 w-8">
                      {profile.avatar_url ? (
                        <AvatarImage src={profile.avatar_url} alt={profile.full_name} />
                      ) : null}
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        {profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>

      <AnnouncementDialog open={announcementOpen} onOpenChange={setAnnouncementOpen} />
    </SidebarProvider>
  );
}
