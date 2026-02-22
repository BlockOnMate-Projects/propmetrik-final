'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Building2, Calendar, GripVertical, LineChart, User } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { Deal, KanbanColumn } from '@/types/crm'

// =====================================================
// SORTABLE KANBAN CARD
// =====================================================
export function SortableKanbanCard({
  deal,
  onClick,
}: {
  deal: Deal
  onClick: (deal: Deal) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id, data: { type: 'deal', deal } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'touch-none',
        isDragging && 'opacity-30'
      )}
    >
      <KanbanCardInner
        deal={deal}
        onClick={() => onClick(deal)}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}

// =====================================================
// CARD INNER (shared between sortable and overlay)
// =====================================================
export function KanbanCardInner({
  deal,
  onClick,
  dragHandleProps,
  isOverlay = false,
}: {
  deal: Deal
  onClick?: () => void
  dragHandleProps?: Record<string, any>
  isOverlay?: boolean
}) {
  return (
    <Card
      className={cn(
        'mb-2 p-3 cursor-pointer group bg-card border-border shadow-sm transition-all select-none',
        isOverlay
          ? 'shadow-xl ring-2 ring-primary/30 rotate-2 scale-105'
          : 'hover:border-primary/50'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {dragHandleProps && (
            <button
              {...dragHandleProps}
              className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          )}
          <span className="font-mono text-[10px] text-muted-foreground">{deal.deal_number}</span>
        </div>
        <span
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
            deal.deal_type === 'sale' && 'bg-green-500/10 text-green-500',
            deal.deal_type === 'rental' && 'bg-blue-500/10 text-blue-500',
            deal.deal_type === 'development' && 'bg-purple-500/10 text-purple-500'
          )}
        >
          {deal.deal_type?.toUpperCase()}
        </span>
      </div>

      {deal.has_valuation && (
        <div className="flex items-center gap-1 mb-2">
          <LineChart className="h-3 w-3 text-primary" />
          <span className="text-[10px] font-medium text-primary">Valuation Ready</span>
        </div>
      )}

      <h4 className="text-sm font-medium text-card-foreground mb-2 group-hover:text-primary transition-colors line-clamp-2">
        {deal.title}
      </h4>

      {deal.primary_contact_name && (
        <div className="flex items-center gap-1.5 mb-1">
          <User className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground truncate">{deal.primary_contact_name}</span>
        </div>
      )}

      {deal.property_names && deal.property_names.length > 0 && (
        <div className="flex items-center gap-1.5 mb-1">
          <Building2 className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground truncate">{deal.property_names[0]}</span>
        </div>
      )}

      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
        <span className="font-mono text-xs font-medium text-foreground">
          {deal.deal_value ? formatCurrency(deal.deal_value, deal.currency || 'GHS') : '—'}
        </span>
        {deal.expected_close_date && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(deal.expected_close_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>
    </Card>
  )
}

// =====================================================
// DROPPABLE KANBAN COLUMN
// =====================================================
export function KanbanColumn({
  column,
  onCardClick,
}: {
  column: KanbanColumn
  onCardClick: (deal: Deal) => void
}) {
  const dealIds = useMemo(() => column.deals.map((d) => d.id), [column.deals])

  return (
    <div className="flex-shrink-0 w-80">
      <div
        className="sticky top-0 bg-background/95 backdrop-blur z-10 p-3 mb-2 flex items-center justify-between rounded-lg border border-border"
        style={{ borderTopColor: column.stage.stage_color || '#71717a', borderTopWidth: '3px' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{column.stage.stage_name}</span>
          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
            {column.deals.length}
          </span>
        </div>
        <div className="font-mono text-xs font-medium text-muted-foreground">
          {formatCurrency(column.totalValue, 'GHS')}
        </div>
      </div>

      <SortableContext items={dealIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-0 min-h-[100px] h-[calc(100vh-280px)] overflow-y-auto pr-2 custom-scrollbar">
          {column.deals.map((deal) => (
            <SortableKanbanCard key={deal.id} deal={deal} onClick={onCardClick} />
          ))}
          {column.deals.length === 0 && (
            <div className="h-24 flex items-center justify-center border-2 border-dashed border-muted rounded-lg">
              <span className="text-xs text-muted-foreground">Drop deals here</span>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

// =====================================================
// KANBAN BOARD (DnD wrapper)
// =====================================================
export function KanbanBoard({
  columns,
  onCardClick,
  onDealStageChange,
}: {
  columns: KanbanColumn[]
  onCardClick: (deal: Deal) => void
  onDealStageChange: (dealId: string, newStageId: string) => void
}) {
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  // Build a flat map of dealId → stageId for quick lookup
  const dealStageMap = useMemo(() => {
    const map = new Map<string, string>()
    columns.forEach((col) => {
      col.deals.forEach((d) => map.set(d.id, col.stage.id))
    })
    return map
  }, [columns])

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const data = event.active.data.current
      if (data?.type === 'deal') {
        setActiveDeal(data.deal as Deal)
      }
    },
    []
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDeal(null)

      const { active, over } = event
      if (!over) return

      const dealId = active.id as string
      const overData = over.data.current

      // Determine target stage
      let targetStageId: string | null = null

      if (overData?.type === 'deal') {
        // Dropped on another deal — get that deal's stage
        targetStageId = dealStageMap.get(over.id as string) || null
      } else {
        // Dropped on a column droppable — the over.id is the column stage id
        // If over.id is a deal id, find its column
        const col = columns.find((c) => c.deals.some((d) => d.id === over.id))
        targetStageId = col?.stage.id || null
      }

      if (!targetStageId) {
        // Fallback: check if over.id matches a stage
        const stageCol = columns.find((c) => c.stage.id === over.id)
        if (stageCol) targetStageId = stageCol.stage.id
      }

      const sourceStageId = dealStageMap.get(dealId)

      if (targetStageId && targetStageId !== sourceStageId) {
        onDealStageChange(dealId, targetStageId)
      }
    },
    [columns, dealStageMap, onDealStageChange]
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 min-w-max">
        {columns.map((column) => (
          <KanbanColumn key={column.stage.id} column={column} onCardClick={onCardClick} />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
        {activeDeal ? (
          <div className="w-80">
            <KanbanCardInner deal={activeDeal} isOverlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
