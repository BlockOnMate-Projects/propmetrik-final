'use client'

import React, { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  CheckSquare,
  ChevronRight,
  Clock,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  StickyNote,
  User,
  Building2,
  Filter,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DealActivity, Task, Note, CrmDocument } from '@/types/crm'

// =====================================================
// UNIFIED TIMELINE ITEM
// =====================================================
type TimelineItemType = 'activity' | 'task' | 'note' | 'document'

interface TimelineItem {
  id: string
  type: TimelineItemType
  subType: string // activity_type, task priority, etc.
  title: string
  description?: string
  date: Date
  author?: string
  metadata?: Record<string, any>
  raw: DealActivity | Task | Note | CrmDocument
}

function mergeIntoTimeline(
  activities: DealActivity[],
  tasks: Task[],
  notes: Note[],
  documents: CrmDocument[]
): TimelineItem[] {
  const items: TimelineItem[] = []

  activities.forEach((a) => {
    items.push({
      id: `activity-${a.id}`,
      type: 'activity',
      subType: a.activity_type,
      title: a.title,
      description: a.description,
      date: new Date(a.activity_date),
      author: a.performed_by_name || 'System',
      raw: a,
    })
  })

  tasks.forEach((t) => {
    items.push({
      id: `task-${t.id}`,
      type: 'task',
      subType: t.status,
      title: t.title,
      description: t.description,
      date: new Date(t.created_at),
      author: t.created_by_name,
      metadata: { priority: t.priority, status: t.status, due_date: t.due_date },
      raw: t,
    })
  })

  notes.forEach((n) => {
    items.push({
      id: `note-${n.id}`,
      type: 'note',
      subType: n.is_pinned ? 'pinned' : 'regular',
      title: n.content.slice(0, 100) + (n.content.length > 100 ? '...' : ''),
      description: n.content,
      date: new Date(n.created_at),
      author: n.created_by_name,
      metadata: { is_pinned: n.is_pinned },
      raw: n,
    })
  })

  documents.forEach((d) => {
    items.push({
      id: `doc-${d.id}`,
      type: 'document',
      subType: d.document_type,
      title: d.file_name,
      description: d.description,
      date: new Date(d.created_at),
      author: d.uploaded_by_name,
      metadata: { file_size: d.file_size, is_signed: d.is_signed },
      raw: d,
    })
  })

  // Sort newest first
  items.sort((a, b) => b.date.getTime() - a.date.getTime())
  return items
}

// =====================================================
// TIMELINE ICON + COLOR
// =====================================================
function getTimelineIcon(item: TimelineItem) {
  if (item.type === 'task') return <CheckSquare className="h-3 w-3" />
  if (item.type === 'note') return <StickyNote className="h-3 w-3" />
  if (item.type === 'document') return <FileText className="h-3 w-3" />

  // Activity subtypes
  switch (item.subType) {
    case 'call': return <Phone className="h-3 w-3" />
    case 'email': return <Mail className="h-3 w-3" />
    case 'whatsapp': return <MessageSquare className="h-3 w-3" />
    case 'meeting': return <User className="h-3 w-3" />
    case 'viewing': return <Building2 className="h-3 w-3" />
    case 'stage_change': return <ChevronRight className="h-3 w-3" />
    case 'document': return <FileText className="h-3 w-3" />
    default: return <Clock className="h-3 w-3" />
  }
}

function getTimelineColor(item: TimelineItem): string {
  if (item.type === 'task') {
    return item.metadata?.status === 'completed' ? 'bg-green-500' : 'bg-orange-500'
  }
  if (item.type === 'note') return item.metadata?.is_pinned ? 'bg-amber-500' : 'bg-yellow-500'
  if (item.type === 'document') return item.metadata?.is_signed ? 'bg-green-500' : 'bg-indigo-500'

  switch (item.subType) {
    case 'call': return 'bg-blue-500'
    case 'email': return 'bg-purple-500'
    case 'whatsapp': return 'bg-green-500'
    case 'meeting': return 'bg-orange-500'
    case 'viewing': return 'bg-amber-500'
    case 'stage_change': return 'bg-cyan-500'
    default: return 'bg-muted-foreground'
  }
}

function getTypeLabel(item: TimelineItem): string {
  if (item.type === 'task') return 'Task'
  if (item.type === 'note') return 'Note'
  if (item.type === 'document') return 'Document'
  return item.subType?.replace('_', ' ') || 'Activity'
}

// =====================================================
// FILTER CHIPS
// =====================================================
const FILTER_OPTIONS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'activity', label: 'Activities' },
  { key: 'task', label: 'Tasks' },
  { key: 'note', label: 'Notes' },
  { key: 'document', label: 'Documents' },
  { key: 'stage_change', label: 'Stage Changes' },
]

// =====================================================
// UNIFIED TIMELINE COMPONENT
// =====================================================
export function UnifiedTimeline({
  activities,
  tasks,
  notes,
  documents,
}: {
  activities: DealActivity[]
  tasks: Task[]
  notes: Note[]
  documents: CrmDocument[]
}) {
  const [filter, setFilter] = useState('all')

  const timeline = useMemo(
    () => mergeIntoTimeline(activities, tasks, notes, documents),
    [activities, tasks, notes, documents]
  )

  const filtered = useMemo(() => {
    if (filter === 'all') return timeline
    if (filter === 'stage_change') return timeline.filter((i) => i.subType === 'stage_change')
    return timeline.filter((i) => i.type === filter)
  }, [timeline, filter])

  // Group by date
  const grouped = useMemo(() => {
    const groups = new Map<string, TimelineItem[]>()
    filtered.forEach((item) => {
      const key = item.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    })
    return Array.from(groups.entries())
  }, [filtered])

  return (
    <div className="space-y-4">
      {/* Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <Filter className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={cn(
              'text-xs px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap',
              filter === opt.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted/50 text-muted-foreground border-border hover:border-foreground/30'
            )}
          >
            {opt.label}
            {opt.key !== 'all' && (
              <span className="ml-1 text-[10px]">
                {opt.key === 'stage_change'
                  ? timeline.filter((i) => i.subType === 'stage_change').length
                  : timeline.filter((i) => i.type === opt.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Timeline Items */}
      {filtered.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">No timeline items</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([dateLabel, items]) => (
            <div key={dateLabel}>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
                {dateLabel}
              </div>
              <div className="relative">
                <div className="absolute left-[11px] top-0 bottom-0 w-px bg-border" />
                <div className="space-y-3">
                  {items.map((item) => (
                    <div key={item.id} className="relative pl-8">
                      <div
                        className={cn(
                          'absolute left-[3px] top-1 w-[17px] h-[17px] rounded-full flex items-center justify-center text-white z-10',
                          getTimelineColor(item)
                        )}
                      >
                        {getTimelineIcon(item)}
                      </div>
                      <div className="p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors">
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-medium text-primary uppercase">
                              {getTypeLabel(item)}
                            </span>
                            <span className="text-xs font-medium text-foreground truncate">
                              {item.title}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-2">
                            {item.date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {item.type === 'note' && item.description && (
                          <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">
                            {item.description}
                          </p>
                        )}

                        {item.type === 'task' && item.metadata && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <span
                              className={cn(
                                'text-[9px] px-1.5 py-0.5 rounded-full font-medium',
                                item.metadata.priority === 'urgent' && 'bg-red-500/10 text-red-500',
                                item.metadata.priority === 'high' && 'bg-orange-500/10 text-orange-500',
                                item.metadata.priority === 'medium' && 'bg-yellow-500/10 text-yellow-500',
                                item.metadata.priority === 'low' && 'bg-muted text-muted-foreground'
                              )}
                            >
                              {item.metadata.priority?.toUpperCase()}
                            </span>
                            <span
                              className={cn(
                                'text-[9px] px-1.5 py-0.5 rounded-full font-medium',
                                item.metadata.status === 'completed' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'
                              )}
                            >
                              {item.metadata.status?.replace('_', ' ').toUpperCase()}
                            </span>
                            {item.metadata.due_date && (
                              <span className="text-[10px] text-muted-foreground">
                                Due: {new Date(item.metadata.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </div>
                        )}

                        {item.type === 'document' && item.metadata && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] text-muted-foreground">
                              {(item.metadata.file_size / 1024).toFixed(0)}KB
                            </span>
                            {item.metadata.is_signed && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-green-500/10 text-green-500 rounded-full font-medium">
                                SIGNED
                              </span>
                            )}
                          </div>
                        )}

                        {item.type === 'activity' && item.description && (
                          <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                        )}

                        <div className="text-[10px] text-muted-foreground mt-1.5">
                          {item.author && `by ${item.author}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
