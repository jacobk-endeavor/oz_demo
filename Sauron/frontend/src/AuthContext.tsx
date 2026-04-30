import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import api from './api';

interface AuthContextType {
  user: string | null;
  role: string | null;
  isAdmin: boolean;
  canAccessLeads: boolean;
  authResolved: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>(null!);

const HAS_ASSIGNED_LEADS_STORAGE_KEY = 'hasAssignedLeads';

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

const TOKEN_CHECK_INTERVAL_MS = 30_000;

interface CurrentUserResponse {
  role: string;
  has_assigned_leads: boolean;
}

function deriveLeadAccess(role: string | null, hasAssignedLeads: boolean): boolean {
  if (role === 'ae') return hasAssignedLeads;
  return role === 'admin' || role === 'exec' || role === 'bdr';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(() => {
    const token = localStorage.getItem('token');
    if (token && isTokenExpired(token)) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('role');
      localStorage.removeItem(HAS_ASSIGNED_LEADS_STORAGE_KEY);
      return null;
    }
    return localStorage.getItem('user');
  });
  const [role, setRole] = useState<string | null>(() => {
    const token = localStorage.getItem('token');
    if (!token || isTokenExpired(token)) return null;
    return localStorage.getItem('role');
  });
  const [canAccessLeads, setCanAccessLeads] = useState<boolean>(() => {
    const token = localStorage.getItem('token');
    if (!token || isTokenExpired(token)) return false;
    const storedRole = localStorage.getItem('role');
    const hasAssignedLeads = localStorage.getItem(HAS_ASSIGNED_LEADS_STORAGE_KEY) === 'true';
    return deriveLeadAccess(storedRole, hasAssignedLeads);
  });
  const [authResolved, setAuthResolved] = useState<boolean>(() => {
    const token = localStorage.getItem('token');
    return !token || isTokenExpired(token);
  });

  const clearAuth = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('role');
    localStorage.removeItem(HAS_ASSIGNED_LEADS_STORAGE_KEY);
    setUser(null);
    setRole(null);
    setCanAccessLeads(false);
    setAuthResolved(true);
  }, []);

  const applyCurrentUser = useCallback((data: CurrentUserResponse) => {
    const nextRole = data.role;
    const hasAssignedLeads = Boolean(data.has_assigned_leads);
    localStorage.setItem('role', nextRole);
    localStorage.setItem(HAS_ASSIGNED_LEADS_STORAGE_KEY, String(hasAssignedLeads));
    setRole(nextRole);
    setCanAccessLeads(deriveLeadAccess(nextRole, hasAssignedLeads));
  }, []);

  const loadCurrentUser = useCallback(async () => {
    const res = await api.get<CurrentUserResponse>('/api/auth/me');
    applyCurrentUser(res.data);
  }, [applyCurrentUser]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setAuthResolved(true);
      return;
    }
    if (isTokenExpired(token)) {
      clearAuth();
      return;
    }

    setAuthResolved(false);
    loadCurrentUser()
      .catch(() => {
        clearAuth();
      })
      .finally(() => {
        setAuthResolved(true);
      });
  }, [clearAuth, loadCurrentUser]);

  useEffect(() => {
    const id = setInterval(() => {
      const token = localStorage.getItem('token');
      if (token && isTokenExpired(token)) {
        clearAuth();
      }
    }, TOKEN_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [clearAuth]);

  const login = async (email: string, password: string) => {
    const res = await api.post('/api/auth/login', { email, password });
    localStorage.setItem('token', res.data.access_token);
    localStorage.setItem('user', email);
    setUser(email);
    setAuthResolved(false);
    try {
      await loadCurrentUser();
    } catch (error) {
      clearAuth();
      throw error;
    } finally {
      setAuthResolved(true);
    }
  };

  const logout = () => {
    clearAuth();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAdmin: role === 'admin',
        canAccessLeads,
        authResolved,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
