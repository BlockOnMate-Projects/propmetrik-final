'use client'

import { TopNav } from '@/components/layout'
import { UpgradeGateProvider } from '@/components/UpgradeGate'
import { FloatingWindowManager } from '@/components/workspace/window-manager/FloatingWindowManager'
import { WorkspaceWidget } from '@/components/workspace/WorkspacePanel'
import { GlobalSearch } from '@/components/layout/GlobalSearch'
import { useEffect, Suspense } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { prefetchRbacConfig, canNavigateToPlatformTab } from '@/lib/rbac'
import { isValidOrganizationId } from '@/lib/utils'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()

  // Pre-fetch RBAC config when session is available — but NOT for tenant-portal
  // users. Tenants carry a tenant session token with no staff RBAC access, so the
  // /rbac/config call 401s (harmless but console noise). Staff/platform roles only.
  useEffect(() => {
    if (session?.accessToken && session.user?.role !== 'tenant') {
      prefetchRbacConfig(session.accessToken);
    }
  }, [session?.accessToken, session?.user?.role])

  // Redirect users who haven't completed onboarding (e.g. new Google OAuth signups)
  useEffect(() => {
    if (session?.user?.onboardingCompleted === false) {
      router.replace('/onboarding');
    }
  }, [session?.user?.onboardingCompleted, router])

  // Role-based route guard: redirect users away from pages they can't access
  useEffect(() => {
    const role = session?.user?.role;
    const userType = (session?.user as any)?.userType || 'customer';
    const tier = session?.user?.tier || 'starter';
    const subscribedServices: string[] = (session?.user as any)?.subscribedServices || [];
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
      if (pathname.startsWith(prefix) && !canNavigateToPlatformTab(tabKey, { userRole: role, userTier: tier, userType, subscribedServices })) {
        router.replace('/dashboard');
        return;
      }
    }
  }, [session?.user?.role, session?.user?.tier, session?.user?.userType, session?.user, pathname, router])

  const isTenantRoute = pathname?.startsWith('/dashboard/tenant');

  return (
    <UpgradeGateProvider>
      <div className="min-h-screen bg-background">
        {isTenantRoute ? null : <TopNav />}
        <main className="flex-1">
          {/* Boundary so any child page using useSearchParams() is prerenderable in Next 15
              (avoids "should be wrapped in a suspense boundary" build failures per-page). */}
          <Suspense fallback={null}>
            {children}
          </Suspense>
        </main>
        {!isTenantRoute && (
          <>
            <FloatingWindowManager />
            <GlobalSearch />
            {/* Company-wide workspace — one per organization (Teams-tenant model).
                The backend forces the platform workspace's entity_id to the caller's own
                org, so we pass the session org id here for clarity (it can't cross orgs). */}
            {!pathname.includes('/projects/') && !pathname.includes('/valuations/') && isValidOrganizationId(session?.user?.organizationId) && (
              <WorkspaceWidget
                entityType="platform"
                entityId={session!.user!.organizationId!}
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
