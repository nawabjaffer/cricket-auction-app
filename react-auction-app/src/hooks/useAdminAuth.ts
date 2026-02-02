import { useEffect, useState } from 'react';
import { authService, type AdminSession } from '../services/authService';

/**
 * Hook for admin authentication
 */
export const useAdminAuth = () => {
  const [session, setSession] = useState<AdminSession | null>(() => authService.getCurrentSession());
  const [isAuthenticated, setIsAuthenticated] = useState(authService.isAuthenticated());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check session on mount
    const currentSession = authService.getCurrentSession();
    setSession(currentSession);
    setIsAuthenticated(!!currentSession);
  }, []);

  const login = async (email: string) => {
    setLoading(true);
    setError(null);

    try {
      const session = await authService.login(email);
      setSession(session);
      setIsAuthenticated(true);
      return session;
    } catch (err: any) {
      const errorMessage = err.message || 'Login failed';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await authService.logout();
      setSession(null);
      setIsAuthenticated(false);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Logout failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const extendSession = () => {
    authService.extendSession();
  };

  const getTimeUntilExpiry = () => {
    return authService.getTimeUntilExpiry();
  };

  return {
    session,
    isAuthenticated,
    loading,
    error,
    login,
    logout,
    extendSession,
    getTimeUntilExpiry
  };
};
