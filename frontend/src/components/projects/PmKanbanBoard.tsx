'use client'

import React, { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'

// =====================================================
// Generic, reusable Kanban board for PM entities.
// Items carry a `columnId` telling the board which column they sit in; dragging
// a card to another column calls onMove(itemId, toColumnId). Card visuals are
// fully delegated to renderCard so this works for issues, change orders, etc.
// =====================================================

export interface KanbanItem {
  id: string
  columnId: string
}

export interface KanbanColumnDef {
  id: string
  title: string
  /** tailwind accent classes for the column header dot/badge */
  accent?: string
}

interface PmKanbanBoardProps<T extends KanbanItem> {
  columns: KanbanColumnDef[]
  items: T[]
  renderCard: (item: T) => React.ReactNode
  onMove: (itemId: string, toColumnId: string) => void
  className?: string
}

function SortableCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { type: 'card' },
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('touch-none cursor-grab active:cursor-grabbing', isDragging && 'opacity-30')}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}

function Column<T extends KanbanItem>({
  column,
  items,
  renderCard,
}: {
  column: KanbanColumnDef
  items: T[]
  renderCard: (item: T) => React.ReactNode
}) {
  // Droppable so a card can be dropped onto an empty column too.
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { type: 'column', columnId: column.id } })
  return (
    <div className="flex flex-col w-72 shrink-0">
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-2">
          <span className={cn('h-2.5 w-2.5 rounded-full', column.accent || 'bg-zinc-500')} />
          <span className="text-xs font-mono uppercase tracking-wider text-zinc-300">{column.title}</span>
        </div>
        <span className="text-xs text-zinc-500 tabular-nums">{items.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 min-h-[120px] rounded-lg border border-zinc-800 bg-zinc-900/40 p-2 space-y-2 transition-colors',
          isOver && 'border-amber-600/60 bg-amber-950/10'
        )}
      >
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <SortableCard key={item.id} id={item.id}>
              {renderCard(item)}
            </SortableCard>
          ))}
        </SortableContext>
        {items.length === 0 && (
          <div className="text-center text-xs text-zinc-600 py-6">Drop here</div>
        )}
      </div>
    </div>
  )
}

export function PmKanbanBoard<T extends KanbanItem>({
  columns,
  items,
  renderCard,
  onMove,
  className,
}: PmKanbanBoardProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const itemsByColumn = useMemo(() => {
    const map: Record<string, T[]> = {}
    for (const col of columns) map[col.id] = []
    for (const item of items) {
      // Items whose status isn't a known column fall into the first column so
      // nothing silently disappears from the board.
      const key = map[item.columnId] ? item.columnId : columns[0]?.id
      if (key) map[key].push(item)
    }
    return map
  }, [columns, items])

  const activeItem = items.find((i) => i.id === activeId) || null

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const activeItemId = String(active.id)
    const item = items.find((i) => i.id === activeItemId)
    if (!item) return

    // Resolve the target column: dropped on a column, or on a card in a column.
    let toColumn: string | undefined
    if (over.data.current?.type === 'column') {
      toColumn = over.data.current.columnId
    } else {
      const overItem = items.find((i) => i.id === String(over.id))
      toColumn = overItem?.columnId
    }
    if (toColumn && toColumn !== item.columnId) {
      onMove(activeItemId, toColumn)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className={cn('flex gap-4 overflow-x-auto pb-4', className)}>
        {columns.map((col) => (
          <Column key={col.id} column={col} items={itemsByColumn[col.id] || []} renderCard={renderCard} />
        ))}
      </div>
      <DragOverlay>{activeItem ? <div className="w-72">{renderCard(activeItem)}</div> : null}</DragOverlay>
    </DndContext>
  )
}

export default PmKanbanBoard
