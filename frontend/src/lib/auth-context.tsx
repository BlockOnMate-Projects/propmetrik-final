'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export type UserRole = 'admin' | 'project_manager' | 'tenant' | 'investor';

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, role?: UserRole, password?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const PM_EMAIL = 'eric@propmetrik.com';
  const PM_PASSWORD = 'eric1234';
  const PM_USER_ID = 'ed4a50d7-a1b2-4c3d-8e5f-6a7b8c9d0e1f';
  const PM_LOCK_KEY = 'pm_login_lock_until';
  const PM_ATTEMPTS_KEY = 'pm_login_attempts';
  const PM_MAX_ATTEMPTS = 5;
  const PM_LOCK_MS = 5 * 60 * 1000;

  useEffect(() => {
    // Check for stored session (simulate persistence)
    const storedUser = localStorage.getItem('pm_user_session');
    const storedToken = localStorage.getItem('pm_access_token');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      
      // Generate token if user exists but token doesn't (migration for existing sessions)
      if (storedToken) {
        setToken(storedToken);
      } else {
        // Generate token without expiration for E-Sign compatibility
        const tokenPayload = {
          sub: parsedUser.id,
          email: parsedUser.email,
          name: parsedUser.name,
          role: parsedUser.role,
          iat: Math.floor(Date.now() / 1000)
        };
        const newToken = btoa(JSON.stringify(tokenPayload));
        setToken(newToken);
        localStorage.setItem('pm_access_token', newToken);
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, role: UserRole = 'project_manager', password?: string) => {
    setLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 400));

    if (role === 'project_manager') {
      const lockUntil = localStorage.getItem(PM_LOCK_KEY);
      if (lockUntil && Date.now() < Number(lockUntil)) {
        setLoading(false);
        throw new Error('Too many attempts. Try again in a few minutes.');
      }

      if (email.toLowerCase() !== PM_EMAIL || password !== PM_PASSWORD) {
        const attempts = Number(localStorage.getItem(PM_ATTEMPTS_KEY) || '0') + 1;
        localStorage.setItem(PM_ATTEMPTS_KEY, String(attempts));

        if (attempts >= PM_MAX_ATTEMPTS) {
          localStorage.setItem(PM_LOCK_KEY, String(Date.now() + PM_LOCK_MS));
          localStorage.setItem(PM_ATTEMPTS_KEY, '0');
        }

        setLoading(false);
        throw new Error('Invalid credentials.');
      }

      localStorage.removeItem(PM_ATTEMPTS_KEY);
      localStorage.removeItem(PM_LOCK_KEY);
    }
    
    const mockUser: User = {
      id: email.toLowerCase() === PM_EMAIL ? PM_USER_ID : 'u-123',
      name: email.toLowerCase() === PM_EMAIL ? 'Eric Danso' : email.split('@')[0],
      email,
      role,
      avatar: 'https://github.com/shadcn.png'
    };

    setUser(mockUser);
    localStorage.setItem('pm_user_session', JSON.stringify(mockUser));
    
    // Generate token without expiration for E-Sign and internal services
    const tokenPayload = {
      sub: mockUser.id,
      email: mockUser.email,
      name: mockUser.name,
      role: mockUser.role,
      iat: Math.floor(Date.now() / 1000)
    };
    const accessToken = btoa(JSON.stringify(tokenPayload));
    setToken(accessToken);
    localStorage.setItem('pm_access_token', accessToken);
    
    // REDIRECT LOGIC
    if (role === 'project_manager') {
      router.push('/pm-portal/dashboard');
    } else if (role === 'admin') {
      router.push('/dashboard');
    } else {
       router.push('/'); 
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
