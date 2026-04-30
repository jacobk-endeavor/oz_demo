import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

const AE_ALLOWED_PATH_PREFIXES = ['/chat', '/companies', '/sales-reps', '/deals', '/settings', '/meetings'];
const BDR_ALLOWED_PATH_PREFIXES = ['/leads', '/chat', '/settings', '/dialer'];
const BASIC_ALLOWED_PATH_PREFIXES = ['/chat', '/settings'];

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, role, canAccessLeads, authResolved } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace />;
  if (!authResolved) return null;

  if (role === 'basic') {
    const canAccess = BASIC_ALLOWED_PATH_PREFIXES.some((pathPrefix) =>
      location.pathname.startsWith(pathPrefix),
    );
    if (!canAccess) return <Navigate to="/chat" replace />;
  }

  if (role === 'ae') {
    const allowedPrefixes = canAccessLeads
      ? [...AE_ALLOWED_PATH_PREFIXES, '/leads']
      : AE_ALLOWED_PATH_PREFIXES;
    const canAccess = allowedPrefixes.some((pathPrefix) =>
      location.pathname.startsWith(pathPrefix),
    );
    if (!canAccess) return <Navigate to="/companies" replace />;
  }

  if (role === 'bdr') {
    const canAccess = BDR_ALLOWED_PATH_PREFIXES.some((pathPrefix) =>
      location.pathname.startsWith(pathPrefix),
    );
    if (!canAccess) return <Navigate to="/leads" replace />;
  }

  return <>{children}</>;
}

function getDefaultRoute(role: string | null): string {
  switch (role) {
    case 'admin':
    case 'exec':
      return '/companies';
    case 'ae':
      return '/companies';
    case 'basic':
      return '/chat';
    default:
      return '/leads';
  }
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, role, authResolved } = useAuth();
  if (!authResolved) return null;
  if (!isAdmin) return <Navigate to={getDefaultRoute(role)} replace />;
  return <>{children}</>;
}

export function CatchAllRedirect() {
  const { user, role, authResolved } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!authResolved) return null;
  return <Navigate to={getDefaultRoute(role)} replace />;
}
