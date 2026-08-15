import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import { useSsoAuth } from '@/context/SsoAuthContext';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/integrations/supabase/client';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  LayoutDashboard,
  Disc3,
  Music,
  DollarSign,
  Users,
  Upload,
  CreditCard,
  Settings,
  LogOut,
  Music2,
  BarChart3,
  ScrollText,
  FolderArchive,
  PieChart,
  Shield,
  HardDrive,
  ListMusic,
  FileText,
  Bell,
  ClipboardList,
  History,
  Wallet,
  UserRound,
} from 'lucide-react';

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
}

// === DASBOR MUSIC ===
const musicDashboardItems: NavItem[] = [
  { 
    title: 'Dasbor', 
    url: '/dashboard', 
    icon: LayoutDashboard,
    roles: ['superadmin', 'admin', 'label', 'artist', 'user', 'whitelabel'],
  },
  { 
    title: 'Rilis', 
    url: '/dashboard/releases', 
    icon: Disc3,
    roles: ['superadmin', 'admin', 'label', 'artist', 'whitelabel'],
  },
  { 
    title: 'Lagu', 
    url: '/dashboard/tracks', 
    icon: Music,
    roles: ['superadmin', 'admin', 'label', 'artist', 'whitelabel'],
  },
  { 
    title: 'Royalti', 
    url: '/dashboard/royalties', 
    icon: DollarSign,
    roles: ['superadmin', 'admin', 'label', 'artist', 'whitelabel'],
  },
  { 
    title: 'Analitik', 
    url: '/dashboard/analytics', 
    icon: BarChart3,
    roles: ['superadmin', 'admin', 'label', 'artist', 'whitelabel'],
  },
  { 
    title: 'Ringkasan Royalti', 
    url: '/dashboard/royalty-summary', 
    icon: PieChart,
    roles: ['superadmin', 'admin', 'label', 'artist', 'whitelabel'],
  },
];

// === DASBOR HAK CIPTA ===
const copyrightDashboardItems: NavItem[] = [
  { 
    title: 'Registrasi Hak Cipta', 
    url: '/dashboard/copyright-registration', 
    icon: FileText,
    roles: ['superadmin', 'admin', 'copyright', 'user', 'label', 'artist', 'whitelabel'],
  },
  { 
    title: 'Dasbor', 
    url: '/dashboard/copyright', 
    icon: Shield,
    roles: ['copyright'],
  },
  { 
    title: 'Analitik (Hak Cipta)', 
    url: '/dashboard/copyright-analytics', 
    icon: BarChart3,
    roles: ['superadmin', 'admin', 'copyright'],
  },
  { 
    title: 'Ringkasan Royalti (Hak Cipta)', 
    url: '/dashboard/copyright-royalty-summary', 
    icon: PieChart,
    roles: ['superadmin', 'admin', 'copyright'],
  },
];

// === MANAJEMEN ROYALTI (Admin) ===
const royaltyManagementItems: NavItem[] = [
  { 
    title: 'Upload Royalti', 
    url: '/dashboard/upload', 
    icon: Upload,
    roles: ['superadmin', 'admin'],
  },
  { 
    title: 'Semua Royalti', 
    url: '/dashboard/all-royalties', 
    icon: ListMusic,
    roles: ['superadmin', 'admin'],
  },
  { 
    title: 'Royalti Komposer', 
    url: '/dashboard/composer-royalties', 
    icon: Music2,
    roles: ['superadmin', 'admin'],
  },
];

// === MANAJEMEN PENGGUNA (Admin) ===
const userManagementItems: NavItem[] = [
  { 
    title: 'Pengguna', 
    url: '/dashboard/users', 
    icon: Users,
    roles: ['superadmin', 'admin'],
  },
  { 
    title: 'Invoice', 
    url: '/dashboard/invoices', 
    icon: FileText,
    roles: ['superadmin', 'admin'],
  },
  {
    title: 'Kelola Notifikasi',
    url: '/dashboard/notifications',
    icon: Bell,
    roles: ['superadmin', 'admin'],
  },
  { 
    title: 'Media Library', 
    url: '/dashboard/media-library', 
    icon: HardDrive,
    roles: ['superadmin', 'admin'],
  },
  {
    title: 'Review Hak Cipta',
    url: '/dashboard/copyright-registration/review',
    icon: ClipboardList,
    roles: ['superadmin', 'admin'],
  },
];

// === ADMINISTRASI SISTEM (Superadmin Only) ===
const systemAdminItems: NavItem[] = [
  { 
    title: 'Log Aktivitas', 
    url: '/dashboard/audit-logs', 
    icon: ScrollText,
    roles: ['superadmin'],
  },
  { 
    title: 'Ekspor Data', 
    url: '/dashboard/export', 
    icon: FolderArchive,
    roles: ['superadmin'],
  },
  { 
    title: 'Kelola Pembayaran', 
    url: '/dashboard/payment-management', 
    icon: Wallet,
    roles: ['superadmin', 'admin'],
  },
  { 
    title: 'Pengaturan Pembayaran', 
    url: '/dashboard/payment-settings', 
    icon: CreditCard,
    roles: ['superadmin'],
  },
];

// === MANAJEMEN LABEL & ARTIST ===
const labelManagementItems: NavItem[] = [
  { 
    title: 'Artis', 
    url: '/dashboard/artists', 
    icon: Users,
    roles: ['superadmin', 'admin', 'label', 'whitelabel'],
  },
  {
    title: 'Permintaan Hapus Artis',
    url: '/dashboard/artist-deletion-requests',
    icon: History,
    roles: ['label', 'whitelabel'],
  },
];

// === AKUN ===
const accountItems: NavItem[] = [
  {
    title: 'Profil Artis',
    url: '/dashboard/artist-profile',
    icon: UserRound,
    roles: ['artist'],
  },
  { 
    title: 'Pembayaran', 
    url: '/dashboard/payouts', 
    icon: CreditCard,
    roles: ['superadmin', 'admin', 'label', 'artist', 'user', 'whitelabel'],
  },
  { 
    title: 'Pengaturan', 
    url: '/dashboard/settings', 
    icon: Settings,
    roles: ['superadmin', 'admin', 'label', 'artist', 'user', 'copyright', 'whitelabel'],
  },
];

const getInitials = (name: string) => {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

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
  return roleMap[roleValue] || roleValue.charAt(0).toUpperCase() + roleValue.slice(1);
};

const getRoleBadge = (role: string | null) => {
  if (!role) return 'bg-gray-500/20 text-gray-400';
  const roleColors: Record<string, string> = {
    superadmin: 'bg-red-500/20 text-red-400',
    admin: 'bg-orange-500/20 text-orange-400',
    label: 'bg-blue-500/20 text-blue-400',
    artist: 'bg-green-500/20 text-green-400',
    user: 'bg-gray-500/20 text-gray-400',
    copyright: 'bg-cyan-500/20 text-cyan-400',
    whitelabel: 'bg-yellow-500/20 text-yellow-400',
  };
  return roleColors[role] || 'bg-gray-500/20 text-gray-400';
};

export function AppSidebar() {
  const location = useLocation();
  const { user, role, signOut, isAdmin, isLabel, isWhitelabel, isArtist, isCopyright, isSuperAdmin } = useAuth();
  const { isSsoUser, triggerSsoLogout } = useSsoAuth();
  const { resolvedTheme } = useTheme();
  const { state } = useSidebar(); const isCollapsed = state === "collapsed";
  const [profile, setProfile] = useState<any>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

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

  const fetchProfile = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user?.id)
      .single();

    if (!error && data) {
      setProfile(data);
    }
  };

  const filterByRole = (items: NavItem[]) => {
    if (!role) return [];
    return items.filter(item => !item.roles || item.roles.includes(role));
  };

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <Sidebar>
      {/* Header with Logo */}
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt="Dashboard Logo" 
              className="h-8 w-auto object-contain"
            />
          ) : (
            <div className="flex items-center gap-2">
              <Music2 className="h-6 w-6 text-primary" />
              {!isCollapsed && <span className="font-semibold text-lg">SoundPub</span>}
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {/* Dasbor Music */}
        {(isAdmin || isLabel || isWhitelabel || isArtist) && filterByRole(musicDashboardItems).length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Dasbor Music</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filterByRole(musicDashboardItems).map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <NavLink 
                        to={item.url} 
                        end 
                        className="flex items-center gap-2"
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Dasbor Hak Cipta */}
        {(isAdmin || isCopyright) && filterByRole(copyrightDashboardItems).length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Dasbor Hak Cipta</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filterByRole(copyrightDashboardItems).map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <NavLink 
                        to={item.url} 
                        end 
                        className="flex items-center gap-2"
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Manajemen Royalti */}
        {isAdmin && filterByRole(royaltyManagementItems).length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Manajemen Royalti</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filterByRole(royaltyManagementItems).map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <NavLink 
                        to={item.url} 
                        end 
                        className="flex items-center gap-2"
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Manajemen Pengguna */}
        {isAdmin && filterByRole(userManagementItems).length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Manajemen Pengguna</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filterByRole(userManagementItems).map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <NavLink 
                        to={item.url} 
                        end 
                        className="flex items-center gap-2"
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Administrasi Sistem */}
        {isSuperAdmin && filterByRole(systemAdminItems).length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Administrasi Sistem</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filterByRole(systemAdminItems).map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <NavLink 
                        to={item.url} 
                        end 
                        className="flex items-center gap-2"
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Manajemen Label, Whitelabel & Artist */}
        {(isLabel || isWhitelabel || isArtist) && filterByRole(labelManagementItems).length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Manajemen</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filterByRole(labelManagementItems).map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <NavLink 
                        to={item.url} 
                        end 
                        className="flex items-center gap-2"
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Akun Pengguna */}
        <SidebarGroup>
          <SidebarGroupLabel>Akun</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filterByRole(accountItems).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink 
                      to={item.url} 
                      end 
                      className="flex items-center gap-2"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer with User Profile */}
      <SidebarFooter className="border-t border-sidebar-border bg-sidebar shrink-0">
        <div className="p-2">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-sidebar-accent/50">
            <Avatar className="h-9 w-9 shrink-0">
              {profile?.avatar_url ? (
                <AvatarImage src={profile.avatar_url} alt={profile.full_name} />
              ) : null}
              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                {profile?.full_name ? getInitials(profile.full_name) : 'U'}
              </AvatarFallback>
            </Avatar>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {profile?.full_name || 'User'}
                </p>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getRoleBadge(role)}`}>
                  {getRoleLabel(role)}
                </span>
              </div>
            )}
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={isSsoUser ? triggerSsoLogout : signOut}
            className="w-full mt-2 justify-start text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4 mr-2" />
            {!isCollapsed && 'Logout'}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
