import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  requireLabel?: boolean;
  requireArtist?: boolean;
  allowedRoles?: Array<'admin' | 'label' | 'artist' | 'user'>;
}

/**
 * ProtectedRoute component that handles authentication and authorization
 * at the route level. This prevents flash of unauthorized content (FOUC)
 * and provides centralized route protection.
 * 
 * Note: This is a UX improvement - RLS policies are the true security boundary.
 * Server-side authorization is enforced via RLS policies on database queries.
 */
export function ProtectedRoute({ 
  children, 
  requireAdmin = false,
  requireLabel = false,
  requireArtist = false,
  allowedRoles
}: ProtectedRouteProps) {
  const { user, loading, isAdmin, isLabel, isArtist, role } = useAuth();

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect to auth if not authenticated
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Check role-based access
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireLabel && !isLabel && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireArtist && !isArtist && !isLabel && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // Check against allowed roles list
  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = role as 'admin' | 'label' | 'artist' | 'user' | null;
    
    // Admins always have access unless explicitly excluded
    if (!isAdmin && userRole && !allowedRoles.includes(userRole)) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}
