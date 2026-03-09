'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useOnlineStatus } from '@/hooks/useServiceWorker'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { authedFetch } from '@/lib/authed-fetch'
import {
  Home,
  FolderOpen,
  DollarSign,
  ClipboardList,
  Menu,
  X,
  Bell,
  RefreshCw,
  WifiOff,
  Wifi,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  MoreVertical,
  Plus,
} from 'lucide-react'

// =====================================================
// TYPES
// =====================================================

interface Project {
  id: string
  name: string
  clientName: string
  status: 'active' | 'on_hold' | 'completed' | 'draft'
  progress: number
  budgetUsed: number
  budgetTotal: number
  nextMilestone?: {
    name: string
    dueDate: string
  }
  lastActivity: string
}

interface QuickAction {
  id: string
  label: string
  icon: React.ReactNode
  href: string
  color: string
}

interface Notification {
  id: string
  type: 'warning' | 'success' | 'info' | 'error'
  message: string
  timestamp: string
  read: boolean
}

// =====================================================
// MOBILE DASHBOARD COMPONENT
// =====================================================

export function MobileDashboard() {
  const router = useRouter()
  const isOnline = useOnlineStatus()
  const { pendingCount, sync, isSyncing, lastSyncAt } = useOfflineSync()
  const [refreshing, setRefreshing] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [pullDistance, setPullDistance] = useState(0)

  // Quick actions for mobile
  const quickActions: QuickAction[] = [
    {
      id: 'new-expense',
      label: 'Log Expense',
      icon: <DollarSign className="h-6 w-6" />,
      href: '/mobile/expense',
      color: 'bg-green-500',
    },
    {
      id: 'daily-log',
      label: 'Daily Log',
      icon: <ClipboardList className="h-6 w-6" />,
      href: '/mobile/daily-log',
      color: 'bg-blue-500',
    },
    {
      id: 'projects',
      label: 'Projects',
      icon: <FolderOpen className="h-6 w-6" />,
      href: '/projects',
      color: 'bg-purple-500',
    },
    {
      id: 'more',
      label: 'More',
      icon: <MoreVertical className="h-6 w-6" />,
      href: '/mobile/menu',
      color: 'bg-gray-500',
    },
  ]

  // Fetch dashboard data
  const fetchData = useCallback(async () => {
    try {
      const [projectsRes, notificationsRes] = await Promise.all([
        authedFetch('/api/projects?limit=5&status=active'),
        authedFetch('/api/notifications?unread=true&limit=5'),
      ])

      if (projectsRes.ok) {
        const data = await projectsRes.json()
        setProjects(data.projects || [])
      }

      if (notificationsRes.ok) {
        const data = await notificationsRes.json()
        setNotifications(data.notifications || [])
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    }
  }, [])

  // Pull to refresh
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientY)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null) return
    const currentTouch = e.touches[0].clientY
    const distance = currentTouch - touchStart
    if (distance > 0 && window.scrollY === 0) {
      setPullDistance(Math.min(distance, 100))
    }
  }

  const handleTouchEnd = async () => {
    if (pullDistance > 60) {
      setRefreshing(true)
      await fetchData()
      if (isOnline && pendingCount > 0) {
        await sync()
      }
      setRefreshing(false)
    }
    setTouchStart(null)
    setPullDistance(0)
  }

  // Initial data load
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Format relative time
  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  return (
    <div
      className="min-h-screen bg-gray-50 pb-20"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to refresh indicator */}
      {pullDistance > 0 && (
        <div
          className="flex items-center justify-center bg-amber-500 text-white transition-all"
          style={{ height: pullDistance }}
        >
          <RefreshCw className={`h-6 w-6 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="ml-2 text-sm">
            {refreshing ? 'Refreshing...' : pullDistance > 60 ? 'Release to refresh' : 'Pull to refresh'}
          </span>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">PROPMETRIK</h1>
            <p className="text-xs text-gray-500">Construction Management</p>
          </div>
          <div className="flex items-center space-x-3">
            {/* Online/Offline indicator */}
            <div className={`flex items-center px-2 py-1 rounded-full text-xs ${isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isOnline ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
              {isOnline ? 'Online' : 'Offline'}
            </div>
            
            {/* Sync indicator */}
            {pendingCount > 0 && (
              <button
                onClick={() => sync()}
                disabled={isSyncing || !isOnline}
                className="flex items-center px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
                {pendingCount} pending
              </button>
            )}

            {/* Notifications */}
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-full hover:bg-gray-100"
            >
              <Bell className="h-5 w-5 text-gray-600" />
              {notifications.length > 0 && (
                <span className="absolute top-0 right-0 h-4 w-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">
                  {notifications.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Notifications dropdown */}
      {showNotifications && (
        <div className="absolute top-16 right-4 left-4 z-50 bg-white rounded-lg shadow-lg border border-gray-200 max-h-80 overflow-y-auto">
          <div className="p-3 border-b border-gray-200 flex justify-between items-center">
            <h3 className="font-semibold text-gray-900">Notifications</h3>
            <button onClick={() => setShowNotifications(false)}>
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              No new notifications
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map((notification) => (
                <div key={notification.id} className="p-3 hover:bg-gray-50">
                  <div className="flex items-start">
                    {notification.type === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 mr-2 flex-shrink-0" />}
                    {notification.type === 'success' && <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />}
                    {notification.type === 'info' && <Clock className="h-4 w-4 text-blue-500 mt-0.5 mr-2 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{notification.message}</p>
                      <p className="text-xs text-gray-500 mt-1">{formatRelativeTime(notification.timestamp)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main content */}
      <main className="p-4 space-y-6">
        {/* Quick Actions Grid */}
        <section>
          <h2 className="text-sm font-medium text-gray-500 mb-3">Quick Actions</h2>
          <div className="grid grid-cols-4 gap-3">
            {quickActions.map((action) => (
              <Link
                key={action.id}
                href={action.href}
                className="flex flex-col items-center"
              >
                <div className={`${action.color} w-14 h-14 rounded-xl flex items-center justify-center text-white shadow-sm active:scale-95 transition-transform`}>
                  {action.icon}
                </div>
                <span className="text-xs text-gray-600 mt-1.5 text-center">{action.label}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Offline pending items */}
        {pendingCount > 0 && (
          <section className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <WifiOff className="h-5 w-5 text-amber-600 mr-2" />
                <div>
                  <h3 className="font-medium text-amber-900">{pendingCount} items pending sync</h3>
                  <p className="text-xs text-amber-700">
                    {isOnline ? 'Tap to sync now' : 'Will sync when online'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => sync()}
                disabled={isSyncing || !isOnline}
                className="px-3 py-1.5 bg-amber-500 text-white text-sm rounded-lg disabled:opacity-50"
              >
                {isSyncing ? 'Syncing...' : 'Sync'}
              </button>
            </div>
          </section>
        )}

        {/* Active Projects */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-500">Active Projects</h2>
            <Link href="/projects" className="text-sm text-amber-600 font-medium">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {projects.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
                <FolderOpen className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No active projects</p>
                <Link
                  href="/projects/new"
                  className="inline-flex items-center mt-3 text-sm text-amber-600 font-medium"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Create project
                </Link>
              </div>
            ) : (
              projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="block bg-white rounded-lg border border-gray-200 p-4 active:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">{project.name}</h3>
                      <p className="text-sm text-gray-500">{project.clientName}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  </div>
                  
                  {/* Progress bar */}
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-500">Progress</span>
                      <span className="font-medium text-gray-700">{project.progress}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Budget info */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">
                      Budget: GH₵{project.budgetUsed.toLocaleString()} / GH₵{project.budgetTotal.toLocaleString()}
                    </span>
                    {project.nextMilestone && (
                      <span className="text-amber-600">
                        {project.nextMilestone.name}
                      </span>
                    )}
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* Summary Stats */}
        <section>
          <h2 className="text-sm font-medium text-gray-500 mb-3">This Week</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="h-5 w-5 text-green-500" />
                <TrendingUp className="h-4 w-4 text-green-500" />
              </div>
              <p className="text-2xl font-bold text-gray-900">GH₵45.2K</p>
              <p className="text-xs text-gray-500">Expenses logged</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <ClipboardList className="h-5 w-5 text-blue-500" />
                <span className="text-xs text-green-500 font-medium">+12%</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">24</p>
              <p className="text-xs text-gray-500">Daily logs</p>
            </div>
          </div>
        </section>
      </main>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  )
}

// =====================================================
// BOTTOM NAVIGATION
// =====================================================

export function BottomNavigation() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('home')

  const tabs = [
    { id: 'home', label: 'Home', icon: Home, href: '/mobile' },
    { id: 'projects', label: 'Projects', icon: FolderOpen, href: '/projects' },
    { id: 'expense', label: 'Expense', icon: DollarSign, href: '/mobile/expense' },
    { id: 'logs', label: 'Logs', icon: ClipboardList, href: '/mobile/daily-log' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-inset-bottom">
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          
          return (
            <Link
              key={tab.id}
              href={tab.href}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                isActive ? 'text-amber-600' : 'text-gray-400'
              }`}
            >
              <Icon className={`h-6 w-6 ${isActive ? 'stroke-2' : ''}`} />
              <span className="text-[10px] mt-1 font-medium">{tab.label}</span>
              {isActive && (
                <div className="absolute bottom-0 w-12 h-0.5 bg-amber-500 rounded-full" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

// =====================================================
// OFFLINE INDICATOR COMPONENT
// =====================================================

export function OfflineIndicator() {
  const isOnline = useOnlineStatus()
  const { pendingCount, isSyncing } = useOfflineSync()

  if (isOnline && pendingCount === 0) return null

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-sm font-medium ${
      isOnline ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'
    }`}>
      {!isOnline ? (
        <div className="flex items-center justify-center">
          <WifiOff className="h-4 w-4 mr-2" />
          You&apos;re offline. Changes will sync when connected.
        </div>
      ) : pendingCount > 0 ? (
        <div className="flex items-center justify-center">
          <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing...' : `${pendingCount} changes pending sync`}
        </div>
      ) : null}
    </div>
  )
}

export default MobileDashboard
