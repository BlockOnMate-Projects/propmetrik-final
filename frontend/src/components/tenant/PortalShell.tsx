'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import {
  getTenantProfile,
  TenantProfile,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getConversations,
  TenantNotification,
} from '@/lib/tenant/api';
import {
  LayoutDashboard,
  CreditCard,
  Wrench,
  FileText,
  MessageSquare,
  Bell,
  LogOut,
  Settings,
  User,
  Menu,
  X,
  Building2,
  ChevronDown,
  MoreHorizontal,
} from 'lucide-react';

/* ─── Portal Context ─── */

interface PortalData {
  profile: TenantProfile;
  activeTenancy: TenantProfile['tenancies'][0] | null;
  refreshProfile: () => Promise<void>;
}

const PortalContext = createContext<PortalData | null>(null);

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal must be used within PortalShell');
  return ctx;
}

/* ─── Navigation Config ─── */

const TENANT_BASE = '/dashboard/tenant';

const NAV_ITEMS = [
  { label: 'Dashboard', href: `${TENANT_BASE}`, icon: LayoutDashboard },
  { label: 'Payments', href: `${TENANT_BASE}/payments`, icon: CreditCard },
  { label: 'Maintenance', href: `${TENANT_BASE}/maintenance`, icon: Wrench },
  { label: 'Documents', href: `${TENANT_BASE}/documents`, icon: FileText },
  { label: 'Messages', href: `${TENANT_BASE}/messages`, icon: MessageSquare },
];

const BOTTOM_NAV = NAV_ITEMS.slice(0, 4);

/* ─── Helpers ─── */

const timeAgo = (date: string) => {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

/* ─── PortalShell Component ─── */

interface PortalShellProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export default function PortalShell({ children, title, subtitle }: PortalShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<TenantNotification[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const loadProfile = async () => {
    try {
      const data = await getTenantProfile();
      setProfile(data);
    } catch {
      // authedFetch handles 401 redirects via NextAuth
    }
  };

  const loadNotifications = async () => {
    try { const data = await getNotifications(); setNotifications(data.notifications || []); } catch {}
  };

  const loadUnreadMessages = async () => {
    try {
      const convos = await getConversations();
      const count = convos.reduce((sum: number, c: any) => sum + (c.unreadCount || 0), 0);
      setUnreadMessages(count);
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch {}
  };

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch {}
  };

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.replace('/tenant-login');
      return;
    }
    loadProfile().finally(() => setLoading(false));
    loadNotifications();
    loadUnreadMessages();
    const interval = setInterval(() => { loadNotifications(); loadUnreadMessages(); }, 30000);
    return () => clearInterval(interval);
  }, [status, router]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setProfileMenuOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(target)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    signOut({ callbackUrl: '/tenant-login' });
  };

  const isActive = (href: string) => {
    if (href === TENANT_BASE) return pathname === TENANT_BASE;
    return pathname.startsWith(href);
  };

  const activeTenancy = (profile?.tenancies || []).find(t => t.status === 'active') || null;
  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (status === 'loading' || loading) {
    return <ShellSkeleton />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Unable to load your account.</p>
          <button onClick={() => router.replace('/tenant-login')} className="text-cyan-600 hover:underline font-medium">
            Return to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <PortalContext.Provider value={{ profile, activeTenancy, refreshProfile: loadProfile }}>
      <div className="min-h-screen bg-muted flex">
        {/* ── Desktop Sidebar ── */}
        <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-card border-r border-border z-30">
          {/* Brand */}
          <div className="h-16 flex items-center px-6 border-b border-gray-100">
            <Building2 className="h-7 w-7 text-cyan-600" />
            <span className="ml-2.5 text-lg font-bold text-gray-900 tracking-tight">PROPMETRIK</span>
          </div>

          {/* Tenant Info */}
          {activeTenancy && (
            <div className="px-4 py-3 mx-3 mt-4 rounded-xl bg-gradient-to-br from-cyan-50 to-cyan-100/50 border border-cyan-100">
              <p className="text-xs font-medium text-cyan-600 uppercase tracking-wider">Your Property</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">{activeTenancy.propertyTitle}</p>
              <p className="text-xs text-muted-foreground truncate">{activeTenancy.propertyAddress}</p>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
            {NAV_ITEMS.map(item => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                    active
                      ? 'bg-cyan-50 text-cyan-700 shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-gray-900'
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${active ? 'text-cyan-600' : ''}`} />
                  <span>{item.label}</span>
                  {item.label === 'Messages' && unreadMessages > 0 && (
                    <span className="ml-auto bg-cyan-100 text-cyan-700 text-xs font-semibold px-2 py-0.5 rounded-full">{unreadMessages}</span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Bottom section */}
          <div className="border-t border-gray-100 p-3 space-y-1">
            <Link
              href={`${TENANT_BASE}/settings`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                pathname === `${TENANT_BASE}/settings` ? 'bg-cyan-50 text-cyan-700' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span>Settings</span>
            </Link>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-all"
            >
              <LogOut className="w-5 h-5" />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* ── Main Content Area ── */}
        <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
          {/* Top Bar */}
          <header className="h-16 bg-card border-b border-border flex items-center px-4 lg:px-8 sticky top-0 z-20">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 text-muted-foreground hover:text-gray-700 hover:bg-muted rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="lg:hidden flex items-center ml-2">
              <Building2 className="h-6 w-6 text-cyan-600" />
              <span className="ml-1.5 text-base font-bold text-gray-900">PROPMETRIK</span>
            </div>

            {title && (
              <div className="hidden lg:block">
                <h1 className="text-xl font-bold text-gray-900">{title}</h1>
                {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
              </div>
            )}

            <div className="flex-1" />

            {/* Notification bell */}
            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => { setNotificationsOpen(!notificationsOpen); setProfileMenuOpen(false); }}
                className="relative p-2 text-muted-foreground hover:text-gray-700 hover:bg-muted rounded-lg transition-colors"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 top-12 w-80 bg-card rounded-xl shadow-xl border border-border z-50 animate-slide-down overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Notifications</h3>
                    <button onClick={handleMarkAllRead} className="text-xs text-cyan-600 hover:underline">Mark all read</button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet</div>
                    ) : notifications.slice(0, 10).map(n => (
                      <div key={n.id} onClick={() => !n.isRead && handleMarkRead(n.id)} className={`px-4 py-3 border-b border-gray-50 hover:bg-muted transition-colors cursor-pointer ${!n.isRead ? 'bg-cyan-50/30' : ''}`}>
                        <div className="flex items-start gap-3">
                          <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${!n.isRead ? 'bg-cyan-500' : 'bg-transparent'}`} />
                          <div>
                            <p className="text-sm font-medium text-gray-900">{n.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">{timeAgo(n.createdAt)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-2.5 border-t border-gray-100 text-center">
                    <Link href={`${TENANT_BASE}/settings`} className="text-xs text-cyan-600 hover:underline font-medium" onClick={() => setNotificationsOpen(false)}>
                      View all notifications
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Profile dropdown */}
            <div className="relative ml-2" ref={profileMenuRef}>
              <button
                onClick={() => { setProfileMenuOpen(!profileMenuOpen); setNotificationsOpen(false); }}
                className="flex items-center gap-2 p-1.5 hover:bg-muted rounded-lg transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center text-foreground text-sm font-bold">
                  {profile.fullName?.charAt(0)?.toUpperCase() || 'T'}
                </div>
                <span className="hidden md:block text-sm font-medium text-gray-700 max-w-[120px] truncate">
                  {profile.fullName?.split(' ')[0]}
                </span>
                <ChevronDown className="hidden md:block w-4 h-4 text-muted-foreground" />
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 top-12 w-56 bg-card rounded-xl shadow-xl border border-border z-50 animate-slide-down overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-900">{profile.fullName}</p>
                    <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                  </div>
                  <div className="p-1.5">
                    <Link href={`${TENANT_BASE}/profile`} className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-muted rounded-lg" onClick={() => setProfileMenuOpen(false)}>
                      <User className="w-4 h-4" /> My Profile
                    </Link>
                    <Link href={`${TENANT_BASE}/settings`} className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-muted rounded-lg" onClick={() => setProfileMenuOpen(false)}>
                      <Settings className="w-4 h-4" /> Settings
                    </Link>
                  </div>
                  <div className="p-1.5 border-t border-gray-100">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </header>

          {/* Page Title (mobile) */}
          {title && (
            <div className="lg:hidden px-4 pt-4">
              <h1 className="text-xl font-bold text-gray-900">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          )}

          {/* Main Content */}
          <main className="flex-1 p-4 lg:p-8 pb-24 lg:pb-8">
            {children}
          </main>
        </div>

        {/* ── Mobile Bottom Navigation ── */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40 safe-area-pb">
          <div className="flex items-center justify-around h-16 max-w-md mx-auto">
            {BOTTOM_NAV.map(item => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center justify-center gap-0.5 w-16 py-1 ${
                    active ? 'text-cyan-600' : 'text-muted-foreground'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </Link>
              );
            })}
            <div className="relative" ref={moreMenuRef}>
              <button
                onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                className={`flex flex-col items-center justify-center gap-0.5 w-16 py-1 ${
                  [`${TENANT_BASE}/messages`, `${TENANT_BASE}/documents`, `${TENANT_BASE}/profile`, `${TENANT_BASE}/settings`].some(p => pathname.startsWith(p))
                    ? 'text-cyan-600'
                    : 'text-muted-foreground'
                }`}
              >
                <MoreHorizontal className="w-5 h-5" />
                <span className="text-[10px] font-medium">More</span>
              </button>

              {moreMenuOpen && (
                <div className="absolute bottom-16 right-0 w-48 bg-card rounded-xl shadow-xl border border-border z-50 animate-slide-up overflow-hidden">
                  <div className="p-1.5">
                    <Link href={`${TENANT_BASE}/messages`} className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-muted rounded-lg" onClick={() => setMoreMenuOpen(false)}>
                      <MessageSquare className="w-4 h-4" /> Messages
                    </Link>
                    <Link href={`${TENANT_BASE}/documents`} className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-muted rounded-lg" onClick={() => setMoreMenuOpen(false)}>
                      <FileText className="w-4 h-4" /> Documents
                    </Link>
                    <Link href={`${TENANT_BASE}/profile`} className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-muted rounded-lg" onClick={() => setMoreMenuOpen(false)}>
                      <User className="w-4 h-4" /> My Profile
                    </Link>
                    <Link href={`${TENANT_BASE}/settings`} className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-muted rounded-lg" onClick={() => setMoreMenuOpen(false)}>
                      <Settings className="w-4 h-4" /> Settings
                    </Link>
                  </div>
                  <div className="p-1.5 border-t border-gray-100">
                    <button onClick={handleLogout} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </nav>

        {/* ── Mobile Sidebar Overlay ── */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-background/50" onClick={() => setSidebarOpen(false)} />

            <aside className="absolute left-0 top-0 bottom-0 w-72 bg-card shadow-2xl flex flex-col animate-slide-right">
              <div className="h-16 flex items-center justify-between px-5 border-b border-gray-100">
                <div className="flex items-center">
                  <Building2 className="h-7 w-7 text-cyan-600" />
                  <span className="ml-2.5 text-lg font-bold text-gray-900">PROPMETRIK</span>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="p-2 text-muted-foreground hover:text-muted-foreground rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {activeTenancy && (
                <div className="px-4 py-3 mx-3 mt-4 rounded-xl bg-gradient-to-br from-cyan-50 to-cyan-100/50 border border-cyan-100">
                  <p className="text-xs font-medium text-cyan-600 uppercase tracking-wider">Your Property</p>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">{activeTenancy.propertyTitle}</p>
                  <p className="text-xs text-muted-foreground truncate">{activeTenancy.propertyAddress}</p>
                </div>
              )}

              <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                {NAV_ITEMS.map(item => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        active ? 'bg-cyan-50 text-cyan-700' : 'text-muted-foreground hover:bg-muted hover:text-gray-900'
                      }`}
                    >
                      <item.icon className={`w-5 h-5 ${active ? 'text-cyan-600' : ''}`} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="border-t border-gray-100 p-3 space-y-1">
                <Link
                  href={`${TENANT_BASE}/profile`}
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted"
                >
                  <User className="w-5 h-5" /> My Profile
                </Link>
                <Link
                  href={`${TENANT_BASE}/settings`}
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted"
                >
                  <Settings className="w-5 h-5" /> Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <LogOut className="w-5 h-5" /> Sign Out
                </button>
              </div>
            </aside>
          </div>
        )}
      </div>
    </PortalContext.Provider>
  );
}

/* ─── Loading Skeleton ─── */

function ShellSkeleton() {
  return (
    <div className="min-h-screen bg-muted flex">
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-card border-r border-border">
        <div className="h-16 flex items-center px-6 border-b border-gray-100">
          <div className="skeleton w-7 h-7 rounded" />
          <div className="skeleton w-24 h-5 ml-2.5 rounded" />
        </div>
        <div className="p-3 mt-4 space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton h-10 rounded-xl" />
          ))}
        </div>
      </aside>
      <div className="flex-1 lg:pl-64">
        <header className="h-16 bg-card border-b border-border flex items-center px-4 lg:px-8">
          <div className="skeleton w-32 h-6 rounded" />
          <div className="flex-1" />
          <div className="skeleton w-8 h-8 rounded-full" />
          <div className="skeleton w-8 h-8 rounded-full ml-2" />
        </header>
        <main className="p-4 lg:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-32 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <div className="skeleton h-64 rounded-xl" />
            <div className="skeleton h-64 rounded-xl" />
          </div>
        </main>
      </div>
    </div>
  );
}
