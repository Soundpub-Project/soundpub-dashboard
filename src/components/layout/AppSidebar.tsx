import { useLocation } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
} from 'lucide-react';

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
}

const mainNavItems: NavItem[] = [
  { 
    title: 'Dashboard', 
    url: '/dashboard', 
    icon: LayoutDashboard 
  },
  { 
    title: 'Releases', 
    url: '/dashboard/releases', 
    icon: Disc3 
  },
  { 
    title: 'Tracks', 
    url: '/dashboard/tracks', 
    icon: Music 
  },
  { 
    title: 'Royalties', 
    url: '/dashboard/royalties', 
    icon: DollarSign 
  },
  { 
    title: 'Analytics', 
    url: '/dashboard/analytics', 
    icon: BarChart3 
  },
];

const adminNavItems: NavItem[] = [
  { 
    title: 'Users', 
    url: '/dashboard/users', 
    icon: Users,
    roles: ['superadmin', 'admin'],
  },
  { 
    title: 'Upload Royalty', 
    url: '/dashboard/upload', 
    icon: Upload,
    roles: ['superadmin', 'admin'],
  },
];

const labelNavItems: NavItem[] = [
  { 
    title: 'My Artists', 
    url: '/dashboard/my-artists', 
    icon: Users,
    roles: ['label'],
  },
];

const accountNavItems: NavItem[] = [
  { 
    title: 'Payouts', 
    url: '/dashboard/payouts', 
    icon: CreditCard 
  },
  { 
    title: 'Settings', 
    url: '/dashboard/settings', 
    icon: Settings 
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const { profile, role, signOut, isAdmin, isLabel } = useAuth();
  const collapsed = state === 'collapsed';

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
    };
    return colors[role || 'user'] || colors.user;
  };

  return (
    <Sidebar collapsible="icon">
      {/* Header */}
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="p-1.5 rounded-lg gradient-primary shrink-0">
            <Music2 className="h-5 w-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="font-bold text-lg text-gradient">SoundPub</span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Menu Utama</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
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

        {/* Label Navigation */}
        {isLabel && (
          <SidebarGroup>
            <SidebarGroupLabel>Label</SidebarGroupLabel>
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
