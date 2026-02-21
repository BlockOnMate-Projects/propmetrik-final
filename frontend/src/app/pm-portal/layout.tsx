'use client'

import React from 'react'
import { HardHat, Home, LayoutDashboard, LogOut, Bell, Search, ChevronDown, Briefcase, CalendarDays, BarChart3, FolderOpen, Users, Settings, User, Shield, BellRing, Globe, SlidersHorizontal, FileSignature, Activity, LifeBuoy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function PMPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="h-16 border-b border-zinc-800 bg-zinc-950 flex items-center px-6 justify-between sticky top-0 z-50">
        {/* Logo */}
        <div className="flex items-center gap-8">
          <Link href="/pm-portal/dashboard" className="flex items-center gap-2">
            <HardHat className="h-6 w-6 text-amber-500" />
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight text-white">PROPMETRIK</span>
              <span className="text-[10px] text-amber-500 font-medium -mt-1">PM PORTAL</span>
            </div>
          </Link>

          {/* Main Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            <NavLink href="/pm-portal/dashboard" icon={LayoutDashboard}>Dashboard</NavLink>
            <NavLink href="/pm-portal/portfolio" icon={Briefcase}>Portfolio</NavLink>
            <NavLink href="/pm-portal/projects" icon={Home}>Projects</NavLink>
            <NavLink href="/pm-portal/schedule" icon={CalendarDays}>Schedule</NavLink>
            <NavLink href="/pm-portal/reports" icon={BarChart3}>Reports</NavLink>
            <NavLink href="/pm-portal/documents" icon={FolderOpen}>Documents</NavLink>
            <NavLink href="/pm-portal/team" icon={Users}>Team</NavLink>
            <NavLink href="/pm-portal/settings" icon={Settings}>Settings</NavLink>
          </nav>
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-4">
          {/* Search */}
          <button className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-colors">
            <Search className="h-4 w-4" />
            <span>Search...</span>
            <kbd className="hidden lg:inline-flex h-5 items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-1.5 text-[10px] font-medium text-zinc-400">
              ⌘K
            </kbd>
          </button>

          {/* Notifications */}
          <button className="relative p-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-lg transition-colors">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-amber-500 rounded-full"></span>
          </button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 p-1.5 hover:bg-zinc-900 rounded-lg transition-colors">
                <div className="h-8 w-8 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center font-bold text-xs ring-1 ring-amber-500/50">
                  {user?.name ? user.name.split(' ').map((part) => part[0]).join('').slice(0, 2) : 'PM'}
                </div>
                <ChevronDown className="h-4 w-4 text-zinc-500" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-zinc-200 w-64">
              <DropdownMenuLabel className="text-zinc-300">
                {user?.name || 'Project Manager'}
                <div className="text-xs text-zinc-500 font-normal">
                  {user?.email || 'pm@propmetrik.com'}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-zinc-800" />

              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/pm-portal/account/profile">
                  <User className="mr-2 h-4 w-4" /> My Profile
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/pm-portal/account/settings">
                  <Shield className="mr-2 h-4 w-4" /> Account Settings
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/pm-portal/account/settings">
                  <BellRing className="mr-2 h-4 w-4" /> Notifications
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/pm-portal/account/settings">
                  <Globe className="mr-2 h-4 w-4" /> Language & Timezone
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/pm-portal/account/preferences">
                  <SlidersHorizontal className="mr-2 h-4 w-4" /> Preferences
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/pm-portal/account/documents">
                  <FileSignature className="mr-2 h-4 w-4" /> Documents & Signatures
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/pm-portal/account/activity">
                  <Activity className="mr-2 h-4 w-4" /> Activity Log
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/pm-portal/account/support">
                  <LifeBuoy className="mr-2 h-4 w-4" /> Help & Support
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem
                className="text-red-400 focus:text-red-400 focus:bg-zinc-800 cursor-pointer"
                onClick={logout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 md:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-zinc-950 border-t border-zinc-800 flex items-center justify-around px-2 z-50">
        <MobileNavLink href="/pm-portal/dashboard" icon={LayoutDashboard} label="Dashboard" />
        <MobileNavLink href="/pm-portal/projects" icon={Home} label="Projects" />
        <MobileNavLink href="/pm-portal/schedule" icon={CalendarDays} label="Schedule" />
        <MobileNavLink href="/pm-portal/reports" icon={BarChart3} label="Reports" />
        <MobileNavLink href="/pm-portal/settings" icon={Settings} label="Settings" />
      </nav>
    </div>
  )
}

function NavLink({ href, icon: Icon, children }: { href: string, icon: any, children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors">
      <Icon className="h-4 w-4" />
      {children}
    </Link>
  )
}

function MobileNavLink({ href, icon: Icon, label }: { href: string, icon: any, label: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-1 px-3 py-2 text-zinc-500 hover:text-amber-500 transition-colors">
      <Icon className="h-5 w-5" />
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  )
}
