'use client'

import { AdminTopNav } from '@/components/layout/AdminTopNav'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

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

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (status === 'loading') return
    if (!canAccessAdmin(session?.user)) {
      router.replace('/dashboard')
    }
  }, [session, status, router])

  if (status === 'loading') return null

  if (!canAccessAdmin(session?.user)) return null

  return (
    <div className="min-h-screen bg-background">
      {mounted ? <AdminTopNav /> : (
        <div className="w-full bg-background border-b border-red-900/50">
          <div className="flex items-center h-8 px-4 bg-red-950/30 border-b border-red-900/30">
            <span className="font-mono text-[11px] text-red-600 dark:text-red-400 font-bold tracking-wider">PROPMETRIK ADMIN CONSOLE</span>
          </div>
          <div className="h-9 px-4 bg-background" />
          <div className="h-8 px-4 bg-card/80" />
        </div>
      )}
      <main className="p-6">
        {children}
      </main>
    </div>
  )
}
