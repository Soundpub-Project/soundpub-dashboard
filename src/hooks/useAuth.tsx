import { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { clearSessionLimit, getSessionExpiresAt, markSessionExpired } from '@/lib/sessionLimit';
import { toast } from 'sonner';
import { getCurrentProfile, primaryRole, type AppRole } from '@/services/users';
import { setApiCsrfToken, setApiTokenProvider } from '@/api/client';
import { SoundpubApiError } from '@/api/client';
import { authApi, type AuthSessionResponse } from '@/api/auth';
import { usersApi } from '@/api/users';
import { usesBackendDomain } from '@/api/routing';

setApiTokenProvider(usesBackendDomain('auth') ? async () => null :
  async () => (await supabase.auth.getSession()).data.session?.access_token ?? null);

export type { AppRole } from '@/services/users';

interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  address: string | null;
  parent_label_id: string | null;
  status: string;
  balance: number;
  logo_url: string | null;
  logo_url_light: string | null;
  logo_url_dark: string | null;
  avatar_url: string | null;
  password_set: boolean | null;
  subscription_status: string | null;
  subscription_upgraded_at: string | null;
  sso_provider: string | null;
  artist_profile_completed: boolean | null;
  email_verified: boolean | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null; user?: User }>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  isSuperadmin: boolean;
  isAdmin: boolean;
  isLabel: boolean;
  isLabelCustom: boolean;
  isArtist: boolean;
  isCopyright: boolean;
  isWhitelabel: boolean;
  isSsoUser: boolean;
  isArtistProfileCompleted: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function localUser(id: string): User {
  return { id, aud: 'authenticated', role: 'authenticated', email: undefined, app_metadata: {}, user_metadata: {},
    identities: [], created_at: new Date().toISOString() } as User;
}

function localSession(result: AuthSessionResponse, user: User): Session {
  const expiresAt = Math.floor(new Date(result.expiresAt).getTime() / 1000);
  return { access_token: '', refresh_token: '', token_type: 'bearer', expires_in: Math.max(0, expiresAt - Math.floor(Date.now() / 1000)),
    expires_at: expiresAt, user } as Session;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const sessionExpiryTimer = useRef<number | null>(null);
  const expiringSession = useRef(false);
  const profileRequest = useRef(0);
  const activeProfileUser = useRef<string | null>(null);
  const localAuth = useRef(false);
  const restoringSession = useRef(true);

  const clearSessionExpiryTimer = () => {
    if (sessionExpiryTimer.current !== null) {
      window.clearTimeout(sessionExpiryTimer.current);
      sessionExpiryTimer.current = null;
    }
  };

  const clearAuthState = () => {
    activeProfileUser.current = null;
    profileRequest.current += 1;
    queryClient.clear();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    setApiCsrfToken(null);
  };

  const applyLocalSession = (result: AuthSessionResponse) => {
    const nextUser = localUser(result.user.id);
    restoringSession.current = false;
    localAuth.current = true;
    activeProfileUser.current = nextUser.id;
    setApiTokenProvider(async () => null);
    setApiCsrfToken(result.csrfToken);
    setUser(nextUser);
    setSession(localSession(result, nextUser));
    void fetchProfileAndRole(nextUser.id, true);
  };

  const applySupabaseSession = (nextSession: Session | null) => {
    localAuth.current = false;
    setApiCsrfToken(null);
    setApiTokenProvider(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null);
    activeProfileUser.current = nextSession?.user.id ?? null;
    setSession(nextSession);
    setUser(nextSession?.user ?? null);
    if (nextSession?.user) {
      void fetchProfileAndRole(nextSession.user.id);
    } else {
      profileRequest.current += 1;
      clearSessionExpiryTimer();
      if (!expiringSession.current) clearSessionLimit();
      expiringSession.current = false;
      setProfile(null);
      setRole(null);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (usesBackendDomain('auth')) {
      void authApi.session().then(applyLocalSession).catch(error => {
        restoringSession.current = false;
        if (!(error instanceof SoundpubApiError) || (error.status !== 401 && error.status !== 503)) {
          console.error('Error restoring local session:', error);
        }
        setLoading(false);
      });
      return () => { clearSessionExpiryTimer(); restoringSession.current = false; };
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (restoringSession.current || localAuth.current) return;
        applySupabaseSession(nextSession);
      }
    );
    void authApi.session().then(applyLocalSession).catch(async error => {
      if (error instanceof SoundpubApiError && error.status === 503 && error.code === 'MAINTENANCE_MODE') {
        restoringSession.current = false;
        setLoading(false);
        return;
      }
      if (!(error instanceof SoundpubApiError) || error.status !== 401) console.error('Error restoring local session:', error);
      const { data: { session: nextSession } } = await supabase.auth.getSession();
      restoringSession.current = false;
      applySupabaseSession(nextSession);
    });

    return () => {
      clearSessionExpiryTimer();
      restoringSession.current = false;
      subscription.unsubscribe();
    };
  }, []);


  useEffect(() => {
    const expireSession = async () => {
      expiringSession.current = true;
      markSessionExpired();
      if (localAuth.current) await authApi.logout().catch(() => undefined);
      else if (!usesBackendDomain('auth')) await supabase.auth.signOut();
      localAuth.current = false;
      clearAuthState();
      toast.error('Sesi berakhir setelah 6 jam. Silakan login kembali.');
    };

    const enforceSessionLimit = () => {
      clearSessionExpiryTimer();
      if (!session) return;

      const remainingMs = getSessionExpiresAt(session) - Date.now();
      if (remainingMs <= 0) {
        void expireSession();
        return;
      }

      sessionExpiryTimer.current = window.setTimeout(() => {
        void expireSession();
      }, remainingMs);
    };

    enforceSessionLimit();
    window.addEventListener('focus', enforceSessionLimit);
    document.addEventListener('visibilitychange', enforceSessionLimit);

    return () => {
      clearSessionExpiryTimer();
      window.removeEventListener('focus', enforceSessionLimit);
      document.removeEventListener('visibilitychange', enforceSessionLimit);
    };
  }, [session]);

  const fetchProfileAndRole = async (userId: string, forceBackend = false) => {
    const request = ++profileRequest.current;
    try {
      const result = forceBackend ? await usersApi.profile() : await getCurrentProfile(userId);
      const profile = result.profile;
      const role = 'role' in result ? result.role : primaryRole(result.roles);
      if (request !== profileRequest.current || activeProfileUser.current !== userId) return;
      setProfile(profile ? {
        id: profile.id, email: profile.email ?? '', full_name: profile.full_name ?? '',
        phone: profile.phone ?? null, address: profile.address ?? null,
        parent_label_id: profile.parent_label_id ?? null, status: profile.status,
        balance: Number(profile.balance ?? 0), logo_url: profile.logo_url ?? null,
        logo_url_light: 'logo_url_light' in profile ? profile.logo_url_light ?? null : null,
        logo_url_dark: 'logo_url_dark' in profile ? profile.logo_url_dark ?? null : null,
        avatar_url: profile.avatar_url ?? null, password_set: profile.password_set ?? null,
        subscription_status: profile.subscription_status ?? null,
        subscription_upgraded_at: profile.subscription_upgraded_at ?? null,
        sso_provider: profile.sso_provider ?? null,
        artist_profile_completed: profile.artist_profile_completed ?? null,
        email_verified: 'email_verified' in profile ? profile.email_verified ?? null : null, created_at: profile.created_at,
        updated_at: profile.updated_at ?? profile.created_at,
      } : null);
      if (profile?.email) setUser(current => current ? { ...current, email: profile.email ?? undefined } : current);
      setRole(role);
    } catch (error) {
      if (request !== profileRequest.current || activeProfileUser.current !== userId) return;
      if (error instanceof SoundpubApiError && (error.status === 401 || error.status === 403)) {
        if (localAuth.current) await authApi.logout().catch(() => undefined);
        else if (!usesBackendDomain('auth')) await supabase.auth.signOut();
        localAuth.current = false;
        clearAuthState();
        toast.error(error.status === 401
          ? 'Sesi tidak valid. Silakan login kembali.'
          : 'Akun tidak memiliki akses. Silakan hubungi administrator.');
        return;
      }
      setProfile(null);
      setRole(null);
      console.error('Error fetching user data:', error);
    } finally {
      if (request === profileRequest.current) setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    clearSessionLimit();
    try {
      if (!usesBackendDomain('auth')) await supabase.auth.signOut();
      applyLocalSession(await authApi.login(email, password));
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    void email; void password; void fullName;
    return { error: new Error('Pendaftaran akun mandiri belum tersedia. Hubungi administrator.') };
  };

  const signOut = async () => {
    activeProfileUser.current = null;
    profileRequest.current += 1;
    if (localAuth.current) await authApi.logout();
    else if (!usesBackendDomain('auth')) await supabase.auth.signOut();
    localAuth.current = false;
    setApiTokenProvider(usesBackendDomain('auth') ? async () => null :
      async () => (await supabase.auth.getSession()).data.session?.access_token ?? null);
    setApiCsrfToken(null);
    // Bersihkan semua cache data dari React Query agar tidak bocor ke user lain saat berganti akun
    queryClient.clear();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!localAuth.current) throw new Error('Password akun SSO dikelola oleh penyedia login.');
    await authApi.changePassword(currentPassword, newPassword);
    localAuth.current = false;
    clearAuthState();
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfileAndRole(user.id);
    }
  };

  const isSuperadmin = role === 'superadmin';
  const isAdmin = role === 'superadmin' || role === 'admin';
  const isLabel = role === 'label';
  const isLabelCustom = role === 'label_custom';
  const isArtist = role === 'artist';
  const isCopyright = role === 'copyright';
  const isWhitelabel = role === 'whitelabel';
  const isSsoUser = profile?.sso_provider != null;
  const isArtistProfileCompleted = profile?.artist_profile_completed === true;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        loading,
        signIn,
        signUp,
        signOut,
        changePassword,
        refreshProfile,
        isSuperadmin,
        isAdmin,
        isLabel,
        isLabelCustom,
        isArtist,
        isCopyright,
        isWhitelabel,
        isSsoUser,
        isArtistProfileCompleted,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
