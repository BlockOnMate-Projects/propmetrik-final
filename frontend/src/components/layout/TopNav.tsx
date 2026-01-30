'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

const navigation: { name: string; href: string; key: string; badge?: string; adminOnly?: boolean }[] = [
  { name: 'OVERVIEW', href: '/dashboard', key: '1' },
  { name: 'VALUATIONS', href: '/dashboard/valuations', key: '2' },
  { name: 'DEALS', href: '/dashboard/deals', key: '3' },
  { name: 'PROJECTS', href: '/dashboard/projects', key: '4' },
  { name: 'ANALYTICS', href: '/dashboard/analytics', key: '5' },
  { name: 'MANAGEMENT', href: '/dashboard/property-management', key: '6' },
  { name: 'E-SIGN', href: '/dashboard/e-sign', key: '7' },
  { name: 'ADMIN', href: '/dashboard/admin', key: 'A', badge: 'ADMIN', adminOnly: true },
]

function Clock() {
  const [time, setTime] = useState<string>('')
  const [date, setDate] = useState<string>('')

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('en-US', { hour12: false }))
      setDate(now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center gap-3 font-mono text-xs">
      <span className="text-amber-500">{date}</span>
      <span className="text-green-400 font-bold">{time}</span>
    </div>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider border border-zinc-700 hover:border-amber-500 hover:text-amber-500 transition-colors"
    >
      {theme === 'dark' ? 'LIGHT' : 'DARK'}
    </button>
  )
}

export function TopNav() {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <header className="sticky top-0 z-50 w-full bg-black border-b border-zinc-800">
      {/* Top Bar */}
      <div className="flex items-center justify-between h-8 px-4 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] text-zinc-500">PROPMETRIK TERMINAL</span>
          <span className="text-[10px] text-zinc-600">|</span>
          <span className="font-mono text-[10px] text-green-500">● CONNECTED</span>
        </div>
        <div className="flex items-center gap-4">
          <Clock />
          <ThemeToggle />
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="flex items-center h-10 px-4">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 mr-6">
          <div className="flex items-center">
            <span className="font-bold text-amber-500 text-lg tracking-tight">PROP</span>
            <span className="font-bold text-white text-lg tracking-tight">METRIK</span>
          </div>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-0.5 flex-1">
          {navigation.map((item) => {
            const active = isActive(item.href)
            // TODO: Check user role from session and hide adminOnly items for non-admins
            const isAdminTab = item.adminOnly
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'px-3 py-1.5 text-xs font-mono tracking-wider transition-colors flex items-center gap-1.5',
                  active
                    ? isAdminTab 
                      ? 'bg-red-600 text-white font-bold'
                      : 'bg-amber-500 text-black font-bold'
                    : isAdminTab
                      ? 'text-red-400 hover:text-red-300 hover:bg-red-900/30 border border-red-900/50'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                )}
              >
                <span className={cn("mr-1", isAdminTab ? "text-red-600" : "text-zinc-600")}>{item.key}</span>
                {item.name}
                {item.badge && (
                  <span className={cn(
                    'px-1 py-0.5 text-[8px] rounded',
                    active 
                      ? isAdminTab 
                        ? 'bg-black/20 text-white' 
                        : 'bg-black/20 text-black' 
                      : isAdminTab
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-yellow-500/20 text-yellow-500'
                  )}>
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Right Side */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 font-mono">USER</span>
            <span className="text-xs text-white font-mono">ADMIN</span>
          </div>
          <Link
            href="/dashboard/profile"
            className="px-2 py-1 text-[10px] font-mono text-zinc-400 hover:text-amber-500 border border-zinc-800 hover:border-amber-500 transition-colors"
          >
            SETTINGS
          </Link>
        </div>
      </div>

      {/* Ticker Bar */}
      <div className="flex items-center h-6 px-4 bg-zinc-900/50 border-t border-zinc-800 overflow-hidden">
        <div className="flex items-center gap-6 font-mono text-[10px]">
          <span><span className="text-zinc-500">GH PROPERTY IDX</span> <span className="text-green-400">+2.34%</span></span>
          <span><span className="text-zinc-500">ACCRA AVG</span> <span className="text-white">₵485,000</span></span>
          <span><span className="text-zinc-500">EAST LEGON</span> <span className="text-green-400">↑</span></span>
          <span><span className="text-zinc-500">CANTONMENTS</span> <span className="text-green-400">↑</span></span>
          <span><span className="text-zinc-500">TEMA</span> <span className="text-red-400">↓</span></span>
          <span><span className="text-zinc-500">ACTIVE DEALS</span> <span className="text-amber-500">34</span></span>
          <span><span className="text-zinc-500">PENDING VAL</span> <span className="text-amber-500">23</span></span>
        </div>
      </div>
    </header>
  )
}
