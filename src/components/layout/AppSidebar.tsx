import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
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
  Crown,
  Shield,
  HardDrive,
} from 'lucide-react';

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
}

// Main navigation - NOT shown to copyright users
const mainNavItems: NavItem[] = [
  { 
    title: 'Dashboard', 
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

const adminNavItems: NavItem[] = [
  { 
    title: 'Pengguna', 
    url: '/dashboard/users', 
    icon: Users,
    roles: ['superadmin', 'admin'],
  },
  { 
    title: 'Upload Royalti', 
    url: '/dashboard/upload', 
    icon: Upload,
    roles: ['superadmin', 'admin'],
  },
  { 
    title: 'Royalti Komposer', 
    url: '/dashboard/composer-royalties', 
    icon: Music2,
    roles: ['superadmin', 'admin'],
  },
  { 
    title: 'Kelola Pembayaran', 
    url: '/dashboard/admin-payouts', 
    icon: CreditCard,
    roles: ['superadmin', 'admin'],
  },
  { 
    title: 'Log Aktivitas', 
    url: '/dashboard/audit-logs', 
    icon: ScrollText,
    roles: ['superadmin', 'admin'],
  },
  { 
    title: 'Ekspor Data', 
    url: '/dashboard/export', 
    icon: FolderArchive,
    roles: ['superadmin', 'admin'],
  },
  { 
    title: 'Media Library', 
    url: '/dashboard/media-library', 
    icon: HardDrive,
    roles: ['superadmin', 'admin'],
  },
];

const labelNavItems: NavItem[] = [
  { 
    title: 'Artis Saya', 
    url: '/dashboard/my-artists', 
    icon: Users,
    roles: ['label', 'whitelabel'],
  },
];

const whitelabelNavItems: NavItem[] = [
  { 
    title: 'Panel Whitelabel', 
    url: '/dashboard/whitelabel', 
    icon: Crown,
    roles: ['whitelabel'],
  },
];

const copyrightNavItems: NavItem[] = [
  { 
    title: 'Hak Cipta', 
    url: '/dashboard/copyright', 
    icon: Shield,
    roles: ['copyright'],
  },
];

const accountNavItems: NavItem[] = [
  { 
    title: 'Pembayaran', 
    url: '/dashboard/payouts', 
    icon: CreditCard 
  },
  { 
    title: 'Pengaturan', 
    url: '/dashboard/settings', 
    icon: Settings 
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const { profile, role, signOut, isAdmin, isLabel, isArtist, isCopyright, isWhitelabel } = useAuth();
  const { resolvedTheme } = useTheme();
  const collapsed = state === 'collapsed';
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchLogo = async () => {
      try {
        // For artists, get their parent label's logo
        if (isArtist && profile?.parent_label_id) {
          const { data: labelProfile, error: labelError } = await supabase
            .from('profiles')
            .select('logo_url_light, logo_url_dark, logo_url')
            .eq('id', profile.parent_label_id)
            .single();

          if (!labelError && labelProfile) {
            const themeLogo = resolvedTheme === 'dark' 
              ? (labelProfile as any).logo_url_dark || (labelProfile as any).logo_url_light || labelProfile.logo_url
              : (labelProfile as any).logo_url_light || labelProfile.logo_url;
            if (themeLogo) {
              setLogoUrl(themeLogo);
              return;
            }
          }
        }

        // For labels, use their own logo
        if (isLabel && profile) {
          const themeLogo = resolvedTheme === 'dark' 
            ? (profile as any).logo_url_dark || (profile as any).logo_url_light || profile.logo_url
            : (profile as any).logo_url_light || profile.logo_url;
          if (themeLogo) {
            setLogoUrl(themeLogo);
            return;
          }
        }

        // Fallback to app-wide dashboard logo
        const logoKey = resolvedTheme === 'dark' ? 'dashboard_logo_dark' : 'dashboard_logo_light';
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
        console.error('Error fetching logo:', error);
      }
    };

    fetchLogo();
  }, [resolvedTheme, isLabel, isArtist, profile]);

  const isActive = (path: string) => location.pathname === path;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleBadge = (role: string | null) => {
    const colors: Record<string, string> = {
      superadmin: 'bg-destructive/20 text-destructive',
      admin: 'bg-primary/20 text-primary',
      label: 'bg-chart-4/20 text-chart-4',
      artist: 'bg-chart-3/20 text-chart-3',
      user: 'bg-muted text-muted-foreground',
      copyright: 'bg-blue-500/20 text-blue-600',
      whitelabel: 'bg-yellow-500/20 text-yellow-600',
    };
    return colors[role || 'user'] || colors.user;
  };

  return (
    <Sidebar collapsible="icon">
      {/* Header */}
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center justify-center px-2 py-3">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt="Logo" 
              className={`${collapsed ? 'h-8 w-8' : 'h-10 max-w-[160px]'} rounded-lg object-contain`}
            />
          ) : (
            <div className="p-1.5 rounded-lg gradient-primary">
              <Music2 className="h-5 w-5 text-primary-foreground" />
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Main Navigation - Only show to non-copyright users */}
        {!isCopyright && (
          <SidebarGroup>
            <SidebarGroupLabel>Menu Utama</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mainNavItems
                  .filter(item => !item.roles || item.roles.includes(role || 'user'))
                  .map((item) => (
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

        {/* Admin Navigation */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNavItems.map((item) => (
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

        {/* Label/Whitelabel Navigation */}
        {(isLabel || isWhitelabel) && (
          <SidebarGroup>
            <SidebarGroupLabel>{isWhitelabel ? 'Manajemen' : 'Label'}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {labelNavItems.map((item) => (
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
                {/* Whitelabel specific items inline */}
                {isWhitelabel && whitelabelNavItems.map((item) => (
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

        {/* Copyright Navigation */}
        {isCopyright && (
          <SidebarGroup>
            <SidebarGroupLabel>Copyright</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {copyrightNavItems.map((item) => (
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

        {/* Account Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Akun</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {accountNavItems.map((item) => (
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
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="p-2">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-sidebar-accent/50">
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                {profile?.full_name ? getInitials(profile.full_name) : 'U'}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {profile?.full_name || 'User'}
                </p>
                <span className={`text-xs px-1.5 py-0.5 rounded ${getRoleBadge(role)}`}>
                  {role || 'user'}
                </span>
              </div>
            )}
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="w-full mt-2 justify-start text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4 mr-2" />
            {!collapsed && 'Logout'}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
