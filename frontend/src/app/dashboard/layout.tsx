'use client'

import { TopNav } from '@/components/layout'
import { UpgradeGateProvider } from '@/components/UpgradeGate'
import { FloatingWindowManager } from '@/components/workspace/window-manager/FloatingWindowManager'
import { WorkspaceWidget } from '@/components/workspace/WorkspacePanel'
import { GlobalSearch } from '@/components/layout/GlobalSearch'
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { prefetchRbacConfig, canAccessPlatformTab } from '@/lib/rbac'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Pre-fetch RBAC config when session is available
  useEffect(() => {
    if (session?.accessToken) {
      prefetchRbacConfig(session.accessToken);
    }
  }, [session?.accessToken])

  // Role-based route guard: redirect users away from pages they can't access
  useEffect(() => {
    const role = session?.user?.role;
    if (!role || !pathname) return;

    // Tenant users can only access /dashboard/tenant/* routes
    if (role === 'tenant') {
      if (!pathname.startsWith('/dashboard/tenant')) {
        router.replace('/dashboard/tenant');
        return;
      }
      return; // Skip internal tab checks for tenants
    }

    // Non-tenant users cannot access tenant routes
    if (pathname.startsWith('/dashboard/tenant') && role !== 'tenant') {
      router.replace('/dashboard');
      return;
    }

    // Map dashboard path segments to platform tab keys
    const PATH_TO_TAB: Record<string, string> = {
      '/dashboard/valuations': 'valuations',
      '/dashboard/deals': 'deals',
      '/dashboard/projects': 'projects',
      '/dashboard/analytics': 'analytics',
      '/dashboard/property-management': 'property-management',
      '/dashboard/e-sign': 'e-sign',
      '/dashboard/admin': 'admin',
    };

    for (const [prefix, tabKey] of Object.entries(PATH_TO_TAB)) {
      if (pathname.startsWith(prefix) && !canAccessPlatformTab(role, tabKey)) {
        router.replace('/dashboard');
        return;
      }
    }
  }, [session?.user?.role, pathname, router])

  const isTenantRoute = pathname?.startsWith('/dashboard/tenant');

  return (
    <UpgradeGateProvider>
      <div className="min-h-screen bg-background">
        {isTenantRoute ? null : mounted ? <TopNav /> : (
          <header className="sticky top-0 z-50 w-full bg-black border-b border-zinc-800">
            <div className="flex items-center justify-between h-8 px-4 bg-zinc-900 border-b border-zinc-800">
              <div className="flex items-center gap-4">
                <span className="font-mono text-[10px] text-zinc-500">PROPMETRIK TERMINAL</span>
                <span className="text-[10px] text-zinc-600">|</span>
                <span className="font-mono text-[10px] text-green-500">● CONNECTED</span>
              </div>
            </div>
            <div className="flex items-center h-10 px-4">
              <div className="flex items-center">
                <span className="font-bold text-amber-500 text-lg tracking-tight">PROP</span>
                <span className="font-bold text-white text-lg tracking-tight">METRIK</span>
              </div>
            </div>
            <div className="h-6 px-4 bg-zinc-900/50 border-t border-zinc-800">
              <span className="font-mono text-[10px] text-zinc-600">Loading market data...</span>
            </div>
          </header>
        )}
        <main className="flex-1">
          {children}
        </main>
        {!isTenantRoute && (
          <>
            <FloatingWindowManager />
            <GlobalSearch />
            {/* Global Workspace Widget (Only if not handled by page-specific logic) */}
            {!pathname.includes('/projects/') && !pathname.includes('/valuations/') && (
              <WorkspaceWidget
                entityType="platform"
                entityId="00000000-0000-0000-0000-000000000000"
                entityName="Workspace"
                currentUserId={session?.user?.id}
                token={(session as any)?.accessToken ?? null}
              />
            )}
          </>
        )}
      </div>
    </UpgradeGateProvider>
  )
}
