'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Bell, Check, CheckCheck, Archive, Trash2, Loader2, Filter, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { notificationApi, type Notification } from '@/lib/notification-api'

const CATEGORIES = ['all', 'esign', 'property', 'valuation', 'crm', 'project', 'finance', 'system', 'alert'] as const

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

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [category, setCategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 25

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true)
    try {
      const params: Record<string, any> = { page, limit }
      if (category !== 'all') params.category = category
      if (unreadOnly) params.unread = true
      const data = await notificationApi.getNotifications(params)
      setNotifications(data.notifications || [])
      setTotal(data.total || 0)
    } catch { /* ignore */ }
    setIsLoading(false)
  }, [page, category, unreadOnly])

  const fetchUnreadCounts = useCallback(async () => {
    try {
      const data = await notificationApi.getUnreadCountsByCategory()
      setUnreadCounts(data.counts || {})
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])
  useEffect(() => { fetchUnreadCounts() }, [fetchUnreadCounts])

  const handleMarkRead = async (id: string) => {
    await notificationApi.markAsRead(id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    fetchUnreadCounts()
  }

  const handleMarkAllRead = async () => {
    await notificationApi.markAllAsRead()
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    fetchUnreadCounts()
  }

  const handleArchive = async (id: string) => {
    await notificationApi.archiveNotification(id)
    setNotifications(prev => prev.filter(n => n.id !== id))
    setTotal(prev => prev - 1)
  }

  const handleDelete = async (id: string) => {
    await notificationApi.deleteNotification(id)
    setNotifications(prev => prev.filter(n => n.id !== id))
    setTotal(prev => prev - 1)
  }

  const filtered = search
    ? notifications.filter(n =>
        n.title.toLowerCase().includes(search.toLowerCase()) ||
        (n.summary || '').toLowerCase().includes(search.toLowerCase()) ||
        (n.body || '').toLowerCase().includes(search.toLowerCase())
      )
    : notifications

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="min-h-screen bg-background text-foreground font-mono p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell className="h-4 w-4 text-amber-500" />
          <h1 className="text-sm font-mono text-amber-500 uppercase tracking-wider">Notifications</h1>
          {totalUnread > 0 && (
            <Badge className="bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30 text-[10px] font-mono">
              {totalUnread} unread
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setUnreadOnly(u => !u)}
            className={`text-[10px] font-mono border-border h-7 ${unreadOnly ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' : 'text-muted-foreground'}`}
          >
            <Filter className="h-3 w-3 mr-1" />
            {unreadOnly ? 'UNREAD ONLY' : 'ALL'}
          </Button>
          {totalUnread > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              className="text-[10px] font-mono border-border text-muted-foreground hover:text-amber-400 h-7"
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              MARK ALL READ
            </Button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
        {CATEGORIES.map(cat => {
          const count = cat === 'all' ? totalUnread : (unreadCounts[cat] || 0)
          return (
            <button
              key={cat}
              onClick={() => { setCategory(cat); setPage(1) }}
              className={`px-3 py-1 text-[10px] font-mono uppercase tracking-wider rounded transition-colors whitespace-nowrap ${
                category === cat
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                  : 'text-muted-foreground hover:text-muted-foreground border border-transparent'
              }`}
            >
              {cat}
              {count > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-3.5 min-w-[14px] rounded-full bg-red-500/20 text-red-600 dark:text-red-400 text-[8px] px-1">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        <Input
          placeholder="Search notifications..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 bg-card border-border text-xs font-mono placeholder:text-muted-foreground"
        />
      </div>

      {/* Notifications list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 text-amber-600 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground font-mono text-xs">
          <Bell className="h-8 w-8 text-zinc-800 mx-auto mb-3" />
          <p>No notifications</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map(notif => (
            <div
              key={notif.id}
              className={`group border border-border rounded-md px-4 py-3 transition-colors hover:bg-card/50 ${
                !notif.is_read ? 'bg-card/30 border-l-2 border-l-amber-500' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Category dot */}
                <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${CATEGORY_COLORS[notif.category] || 'bg-zinc-500'}`} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs truncate ${!notif.is_read ? 'text-zinc-200 font-medium' : 'text-muted-foreground'}`}>
                      {notif.title}
                    </span>
                    <Badge variant="outline" className="text-[8px] uppercase border-border text-muted-foreground px-1 py-0 shrink-0">
                      {notif.category}
                    </Badge>
                    {notif.priority === 'urgent' && (
                      <Badge className="bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30 text-[8px] px-1 py-0">URGENT</Badge>
                    )}
                    {notif.priority === 'high' && (
                      <Badge className="bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/30 text-[8px] px-1 py-0">HIGH</Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground line-clamp-2">
                    {notif.summary || notif.body || 'No details'}
                  </p>
                  <span className="text-[9px] text-muted-foreground mt-1 block">{timeAgo(notif.created_at)}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {!notif.is_read && (
                    <button
                      onClick={() => handleMarkRead(notif.id)}
                      className="p-1 text-muted-foreground hover:text-amber-400 transition-colors"
                      title="Mark as read"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleArchive(notif.id)}
                    className="p-1 text-muted-foreground hover:text-muted-foreground transition-colors"
                    title="Archive"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(notif.id)}
                    className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">
            Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="text-[10px] font-mono border-border text-muted-foreground h-7"
            >
              PREV
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="text-[10px] font-mono border-border text-muted-foreground h-7"
            >
              NEXT
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
