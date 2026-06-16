'use client'

import { useEffect, useState, useCallback } from 'react'
import { Activity, RefreshCw, User, Clock } from 'lucide-react'
import { authedFetch } from '@/lib/authed-fetch'


interface ActivityEvent {
  id: string
  user_email: string
  event_type: string
  description: string
  metadata: Record<string, unknown>
  created_at: string
}

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)

  const fetchActivity = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authedFetch(`/api/admin/activity?limit=50`)
      if (res.ok) {
        const data = (await res.json()) as { data: ActivityEvent[] }
        setEvents(data.data || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchActivity() }, [fetchActivity])

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 border border-red-800">
            <Activity className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h1 className="font-mono text-lg text-foreground font-bold tracking-wide">ACTIVITY</h1>
            <p className="font-mono text-xs text-muted-foreground">Real-time platform activity feed</p>
          </div>
        </div>
        <button onClick={fetchActivity} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="p-8 text-center font-mono text-sm text-muted-foreground">Loading activity...</div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center font-mono text-sm text-muted-foreground">No recent activity</div>
        ) : (
          events.map((event) => (
            <div key={event.id} className="flex items-start gap-4 p-4 bg-card border border-border hover:border-border transition-colors">
              <div className="p-1.5 bg-muted border border-border mt-0.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm text-foreground">{event.user_email}</span>
                  <span className="inline-block px-1.5 py-0.5 font-mono text-[9px] bg-muted text-muted-foreground border border-border uppercase">
                    {event.event_type}
                  </span>
                </div>
                <p className="font-mono text-xs text-muted-foreground">{event.description}</p>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                <Clock className="w-3 h-3" />
                <span className="font-mono text-[10px]">{timeAgo(event.created_at)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
