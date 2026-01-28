'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  FolderKanban,
  ListTodo,
  Calendar,
  FileText,
  Users,
  Bell,
  Settings,
  LogOut,
  HardHat,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const PM_NAV_ITEMS = [
  { href: '/pm', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pm/projects', label: 'My Projects', icon: FolderKanban },
  { href: '/pm/milestones', label: 'Milestones', icon: ListTodo },
  { href: '/pm/calendar', label: 'Calendar', icon: Calendar },
  { href: '/pm/reports', label: 'Reports', icon: FileText },
  { href: '/pm/team', label: 'Team', icon: Users },
]

export default function PMLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  
  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <Link href="/pm" className="flex items-center gap-2">
              <HardHat className="h-6 w-6 text-amber-500" />
              <span className="font-mono text-sm font-bold text-white">
                PROP<span className="text-amber-500">METRIK</span>
              </span>
              <span className="font-mono text-[10px] text-zinc-500 border border-zinc-700 px-1.5 py-0.5 rounded">
                PM PORTAL
              </span>
            </Link>
          </div>
          
          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {PM_NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href || 
                (item.href !== '/pm' && pathname.startsWith(item.href))
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 font-mono text-xs transition-colors rounded",
                    isActive 
                      ? "text-amber-500 bg-amber-500/10" 
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
          
          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Notifications */}
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-4 w-4 text-zinc-400" />
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">
                3
              </span>
            </Button>
            
            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src="" />
                    <AvatarFallback className="bg-amber-600 text-black text-xs">PM</AvatarFallback>
                  </Avatar>
                  <span className="font-mono text-xs text-zinc-300 hidden sm:block">Project Manager</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-zinc-900 border-zinc-800">
                <DropdownMenuLabel className="font-mono text-xs text-zinc-400">My Account</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-zinc-800" />
                <DropdownMenuItem className="font-mono text-xs">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-zinc-800" />
                <DropdownMenuItem className="font-mono text-xs text-red-400">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="min-h-[calc(100vh-3.5rem)]">
        {children}
      </main>
    </div>
  )
}
