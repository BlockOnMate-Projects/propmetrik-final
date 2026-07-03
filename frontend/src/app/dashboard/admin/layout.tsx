import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AdminTopNav } from '@/components/layout/AdminTopNav'

// PLATFORM-OWNER ONLY: super_admin (owner) + admin (platform staff).
// NOT firm_principal — that's the ORG-OWNER role every subscriber gets, so it
// must never grant access to the platform Admin portal. Mirrors backend rbac
// platformTabs.admin + requireAdmin.
const ADMIN_ROLES = ['super_admin', 'admin']

// Admin portal = PropMetrik employees only. A platform role is necessary but NOT
// sufficient — the user must also be platform staff (user_type='staff' = member
// of the platform org). Customers can never satisfy this. Mirrors backend requireAdmin.
function canAccessAdmin(user: any): boolean {
  return !!user && ADMIN_ROLES.includes(user.role) && user.userType === 'staff'
}

/**
 * SECURITY: this layout is a SERVER component. The role/staff check runs on the
 * server and redirects BEFORE any admin markup or JS is sent to the browser.
 * (Previously this was a client component whose useEffect redirect fired only
 * after the admin shell had already been shipped and rendered to any signed-in
 * user.) Backend admin APIs remain independently gated by requireAdmin.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!canAccessAdmin(session?.user)) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminTopNav />
      <main className="p-6">
        {children}
      </main>
    </div>
  )
}
