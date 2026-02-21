'use client'

import { TopNav } from '@/components/layout'
import { UpgradeGateProvider } from '@/components/UpgradeGate'
import { FloatingWindowManager } from '@/components/workspace/window-manager/FloatingWindowManager'
import { WorkspaceWidget } from '@/components/workspace/WorkspacePanel'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <UpgradeGateProvider>
      <div className="min-h-screen bg-background">
        {mounted ? <TopNav /> : (
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
        <FloatingWindowManager />
        {/* Global Workspace Widget (Only if not handled by page-specific logic) */}
        {!pathname.includes('/projects/') && !pathname.includes('/valuations/') && (
          <WorkspaceWidget
            entityType="platform"
            entityId="00000000-0000-0000-0000-000000000000"
            entityName="Workspace"
            currentUserId={session?.user?.id}
            token={null} // Will be picked up from localStorage in widget
          />
        )}
      </div>
    </UpgradeGateProvider>
  )
}
