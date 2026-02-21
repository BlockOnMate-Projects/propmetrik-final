'use client'

import { AdminTopNav } from '@/components/layout/AdminTopNav'
import { useState, useEffect } from 'react'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <div className="min-h-screen bg-black">
      {mounted ? <AdminTopNav /> : (
        <div className="w-full bg-zinc-950 border-b border-red-900/50">
          <div className="flex items-center h-8 px-4 bg-red-950/30 border-b border-red-900/30">
            <span className="font-mono text-[11px] text-red-400 font-bold tracking-wider">PROPMETRIK ADMIN CONSOLE</span>
          </div>
          <div className="h-9 px-4 bg-zinc-950" />
          <div className="h-8 px-4 bg-zinc-900/80" />
        </div>
      )}
      <main className="p-6">
        {children}
      </main>
    </div>
  )
}
