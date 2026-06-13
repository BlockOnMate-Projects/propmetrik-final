'use client'

import { AdminTopNav } from '@/components/layout/AdminTopNav'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const ADMIN_ROLES = ['super_admin', 'admin', 'firm_principal']

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
    const role = (session?.user as any)?.role
    if (!role || !ADMIN_ROLES.includes(role)) {
      router.replace('/dashboard')
    }
  }, [session, status, router])

  if (status === 'loading') return null

  const role = (session?.user as any)?.role
  if (!role || !ADMIN_ROLES.includes(role)) return null

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
