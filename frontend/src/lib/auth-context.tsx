'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export type UserRole = 'admin' | 'project_manager' | 'tenant' | 'investor' | 'super_admin';

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organizationId?: string;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Restore stored session
    const storedUser = localStorage.getItem('pm_user_session');
    const storedToken = localStorage.getItem('pm_access_token');
    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser));
      setToken(storedToken);
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      // Call the real backend authentication endpoint
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || data?.message || 'Login failed');
      }

      const accessToken = data.token || data.accessToken || data.data?.token;
      if (!accessToken) {
        throw new Error('No token received from server');
      }

      // Extract user info from response
      const userData: User = {
        id: data.user?.id || data.data?.user?.id || '',
        name: data.user?.name || data.user?.email || email,
        email: data.user?.email || email,
        role: (data.user?.role || 'project_manager') as UserRole,
        organizationId: data.user?.organizationId || data.user?.organization_id,
        avatar: data.user?.avatar,
      };

      setUser(userData);
      setToken(accessToken);
      localStorage.setItem('pm_user_session', JSON.stringify(userData));
      localStorage.setItem('pm_access_token', accessToken);

      router.push('/pm-portal/dashboard');
    } catch (error) {
      setLoading(false);
      throw error;
    }
    setLoading(false);
  };

  const logout = () => {
    const currentRole = user?.role;
    setUser(null);
    setToken(null);
    localStorage.removeItem('pm_user_session');
    localStorage.removeItem('pm_access_token');

    if (currentRole === 'project_manager' || pathname?.includes('/pm-portal')) {
      router.push('/pm-portal/login');
      return;
    }

    router.push('/login');
  };

  // Simple route protection (Optional, can be expanded)
  useEffect(() => {
    if (!loading && !user && pathname?.includes('/pm-portal')) {
        // In a real app, redirect to login
        router.push('/pm-portal/login');
    }
  }, [user, loading, pathname, router]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
