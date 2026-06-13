'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, CheckCheck, Archive, Trash2, Loader2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { notificationApi, type Notification } from '@/lib/notification-api'
import { useRealtimeEvent } from '@/lib/realtime-provider'

const CATEGORY_COLORS: Record<string, string> = {
  esign: 'bg-blue-500',
  property: 'bg-green-500',
  valuation: 'bg-purple-500',
  crm: 'bg-cyan-500',
  project: 'bg-amber-500',
  finance: 'bg-emerald-500',
  system: 'bg-zinc-500',
  alert: 'bg-red-500',
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'border-l-red-500',
  high: 'border-l-orange-500',
  normal: 'border-l-zinc-700',
  low: 'border-l-zinc-800',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB')
}

export function NotificationDropdown() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Poll unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await notificationApi.getUnreadCount()
      setUnreadCount(data.unread)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 30000) // every 30s safety net
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  // Live update via SSE — bump the badge the instant the backend emits one,
  // and refresh the list if the dropdown is open.
  useRealtimeEvent('notification:new', () => {
    setUnreadCount(prev => prev + 1)
    if (open) {
      notificationApi.getNotifications({ limit: 20 })
        .then(data => setNotifications(data.notifications || []))
        .catch(() => {})
    }
  }, [open])

  // Load notifications when opened
  useEffect(() => {
    if (open) {
      setIsLoading(true)
      notificationApi.getNotifications({ limit: 20 })
        .then(data => setNotifications(data.notifications || []))
        .catch(() => {})
        .finally(() => setIsLoading(false))
    }
  }, [open])

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await notificationApi.markAsRead(id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  const handleMarkAllRead = async () => {
    await notificationApi.markAllAsRead()
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  const handleArchive = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await notificationApi.archiveNotification(id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const handleClick = (notif: Notification) => {
    if (!notif.is_read) {
      notificationApi.markAsRead(notif.id)
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    }
    if (notif.source_url) {
      router.push(notif.source_url)
      setOpen(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      {/* Bell trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center justify-center h-7 w-7 rounded hover:bg-muted transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-3.5 w-3.5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-mono font-bold text-foreground">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1 w-[380px] bg-background border border-border rounded-md shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="font-mono text-xs text-amber-500 uppercase tracking-wider">Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[10px] font-mono text-muted-foreground hover:text-amber-400 transition-colors flex items-center gap-1"
                >
                  <CheckCheck className="h-3 w-3" /> Mark all read
                </button>
              )}
              <button
                onClick={() => { router.push('/dashboard/notifications'); setOpen(false) }}
                className="text-[10px] font-mono text-muted-foreground hover:text-amber-400 transition-colors"
              >
                View all
              </button>
            </div>
          </div>

          {/* List */}
          <ScrollArea className="max-h-[400px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 text-amber-600 animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground font-mono text-xs">
                <Bell className="h-6 w-6 text-zinc-700 mx-auto mb-2" />
                No notifications
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {notifications.map(notif => (
                  <div
                    key={notif.id}
                    onClick={() => handleClick(notif)}
                    className={`px-3 py-2.5 hover:bg-card/50 cursor-pointer transition-colors border-l-2 ${PRIORITY_COLORS[notif.priority] || 'border-l-zinc-800'} ${!notif.is_read ? 'bg-card/30' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      {/* Category dot */}
                      <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${CATEGORY_COLORS[notif.category] || 'bg-zinc-500'}`} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-mono truncate ${!notif.is_read ? 'text-zinc-200 font-medium' : 'text-muted-foreground'}`}>
                            {notif.title}
                          </span>
                          <span className="text-[9px] font-mono text-muted-foreground whitespace-nowrap">{timeAgo(notif.created_at)}</span>
                        </div>
                        {notif.summary && (
                          <p className="text-[10px] text-muted-foreground font-mono mt-0.5 line-clamp-2">{notif.summary}</p>
                        )}
                        {!notif.summary && notif.body && (
                          <p className="text-[10px] text-muted-foreground font-mono mt-0.5 line-clamp-2">{notif.body}</p>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-1 mt-1">
                          <Badge variant="outline" className="text-[8px] font-mono uppercase border-border text-muted-foreground px-1 py-0">
                            {notif.category}
                          </Badge>
                          {!notif.is_read && (
                            <button
                              onClick={(e) => handleMarkAsRead(notif.id, e)}
                              className="ml-auto text-muted-foreground hover:text-amber-400 transition-colors p-0.5"
                              title="Mark as read"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            onClick={(e) => handleArchive(notif.id, e)}
                            className="text-muted-foreground hover:text-muted-foreground transition-colors p-0.5"
                            title="Archive"
                          >
                            <Archive className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
