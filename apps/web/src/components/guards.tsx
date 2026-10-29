import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '@campusconnect/shared';
import { dashboardPathFor, useCurrentUser } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui/feedback';

export const FullPageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner />
      Loading Campus Connect
    </div>
  </div>
);

export const RequireRole = ({ role, children }: { role: Role; children: ReactNode }) => {
  const { user, isLoading } = useCurrentUser();
  const location = useLocation();

  if (isLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== role) return <Navigate to="/unauthorized" replace />;

  return <>{children}</>;
};

export const GuestOnly = ({ children }: { children: ReactNode }) => {
  const { user, isLoading } = useCurrentUser();
  const location = useLocation();

  if (isLoading) return <FullPageLoader />;
  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? dashboardPathFor(user.role)} replace />;
  }

  return <>{children}</>;
};
