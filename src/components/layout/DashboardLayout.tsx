import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
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
  const { user, loading, profile, isAdmin, role } = useAuth();
  const navigate = useNavigate();
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [currentBalance, setCurrentBalance] = useState<number>(profile?.balance || 0);

  // Subscribe to real-time balance updates
  useEffect(() => {
    if (!profile?.id) return;

    // Set initial balance
    setCurrentBalance(profile.balance);

    // Subscribe to profile changes
    const channel = supabase
      .channel('profile-balance-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'Soundpub',
          table: 'profiles',
          filter: `id=eq.${profile.id}`,
        },
        (payload) => {
          if (payload.new && 'balance' in payload.new) {
            setCurrentBalance(Number(payload.new.balance));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, profile?.balance]);

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

  // Format role untuk ditampilkan
  const getRoleLabel = (roleValue: string | null) => {
    if (!roleValue) return 'User';
    const roleMap: Record<string, string> = {
      superadmin: 'Super Admin',
      admin: 'Admin',
      label: 'Label',
      artist: 'Artist',
      copyright: 'Copyright',
      whitelabel: 'White Label',
      user: 'User',
    };
    return roleMap[roleValue] || roleValue;
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        <div className="min-w-0 flex-1 flex flex-col">
          {/* Top Header */}
          <header className="sticky top-0 z-20 h-14 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
            <div className="h-full flex items-center justify-between gap-3 px-3 sm:px-4">
              <div className="flex min-w-0 items-center gap-2">
                <SidebarTrigger className="h-10 w-10" />
                <div className="min-w-0 sm:hidden">
                  <p className="truncate text-sm font-semibold text-foreground">Soundpub</p>
                  {profile && (
                  <>
                    <p className="truncate text-xs text-muted-foreground">{profile.full_name}</p>
                  </>
                  )}
                </div>
              </div>
              
              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
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
                  <>
                  <div className="hidden sm:flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">{profile.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {getRoleLabel(role)} • Balance: Rp {currentBalance.toLocaleString('id-ID')}
                      </p>
                    </div>
                    <Avatar className="h-9 w-9">
                      {profile.avatar_url ? (
                        <AvatarImage src={profile.avatar_url} alt={profile.full_name} />
                      ) : null}
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        {profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <Avatar className="h-9 w-9 sm:hidden">
                    {profile.avatar_url ? (
                      <AvatarImage src={profile.avatar_url} alt={profile.full_name} />
                    ) : null}
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  </>
                )}
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 lg:p-6 xl:p-8">
            <div className="mx-auto w-full max-w-[1600px] min-w-0">
              {children}
            </div>
          </main>
        </div>
      </div>

      <AnnouncementDialog open={announcementOpen} onOpenChange={setAnnouncementOpen} />
    </SidebarProvider>
  );
}
