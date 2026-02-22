'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Bookmark, Plus, Star, Trash2, Check, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { SavedView, FilterGroup } from '@/types/crm-filters'
import { toast } from 'sonner'

// =====================================================
// LOCAL STORAGE PERSISTENCE
// =====================================================
const STORAGE_KEY = 'propmetrik_saved_views'

function loadViews(): SavedView[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persistViews(views: SavedView[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views))
}

// =====================================================
// HOOK: useSavedViews
// =====================================================
export function useSavedViews(entityType: SavedView['entity_type']) {
  const [views, setViews] = useState<SavedView[]>([])

  useEffect(() => {
    setViews(loadViews().filter((v) => v.entity_type === entityType))
  }, [entityType])

  const saveView = useCallback(
    (name: string, filters: FilterGroup, sortBy?: string, sortOrder?: 'asc' | 'desc') => {
      const newView: SavedView = {
        id: `sv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        entity_type: entityType,
        filters,
        sort_by: sortBy,
        sort_order: sortOrder,
        is_default: false,
        is_pinned: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const all = [...loadViews(), newView]
      persistViews(all)
      setViews(all.filter((v) => v.entity_type === entityType))
      return newView
    },
    [entityType]
  )

  const updateView = useCallback(
    (id: string, updates: Partial<SavedView>) => {
      const all = loadViews().map((v) =>
        v.id === id ? { ...v, ...updates, updated_at: new Date().toISOString() } : v
      )
      persistViews(all)
      setViews(all.filter((v) => v.entity_type === entityType))
    },
    [entityType]
  )

  const deleteView = useCallback(
    (id: string) => {
      const all = loadViews().filter((v) => v.id !== id)
      persistViews(all)
      setViews(all.filter((v) => v.entity_type === entityType))
    },
    [entityType]
  )

  const togglePin = useCallback(
    (id: string) => {
      const all = loadViews().map((v) =>
        v.id === id ? { ...v, is_pinned: !v.is_pinned, updated_at: new Date().toISOString() } : v
      )
      persistViews(all)
      setViews(all.filter((v) => v.entity_type === entityType))
    },
    [entityType]
  )

  const setDefault = useCallback(
    (id: string) => {
      const all = loadViews().map((v) => ({
        ...v,
        is_default: v.entity_type === entityType ? v.id === id : v.is_default,
        updated_at: new Date().toISOString(),
      }))
      persistViews(all)
      setViews(all.filter((v) => v.entity_type === entityType))
    },
    [entityType]
  )

  const defaultView = views.find((v) => v.is_default)

  return { views, saveView, updateView, deleteView, togglePin, setDefault, defaultView }
}

// =====================================================
// SAVED VIEWS PICKER
// =====================================================
interface SavedViewsPickerProps {
  entityType: SavedView['entity_type']
  currentFilters: FilterGroup
  onApply: (filters: FilterGroup) => void
  className?: string
}

export function SavedViewsPicker({
  entityType,
  currentFilters,
  onApply,
  className,
}: SavedViewsPickerProps) {
  const { views, saveView, deleteView, togglePin, setDefault } = useSavedViews(entityType)
  const [open, setOpen] = useState(false)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [viewName, setViewName] = useState('')
  const [activeViewId, setActiveViewId] = useState<string | null>(null)

  const pinnedViews = views.filter((v) => v.is_pinned)
  const otherViews = views.filter((v) => !v.is_pinned)

  const handleSave = useCallback(() => {
    if (!viewName.trim()) return
    const hasFilters = currentFilters.conditions.length > 0
    if (!hasFilters) {
      toast.error('Add at least one filter before saving a view')
      return
    }
    saveView(viewName.trim(), currentFilters)
    toast.success(`View "${viewName}" saved`)
    setViewName('')
    setSaveDialogOpen(false)
  }, [viewName, currentFilters, saveView])

  const handleApply = useCallback(
    (view: SavedView) => {
      onApply(view.filters)
      setActiveViewId(view.id)
      setOpen(false)
      toast.success(`Applied view "${view.name}"`)
    },
    [onApply]
  )

  const handleDelete = useCallback(
    (id: string, name: string) => {
      deleteView(id)
      if (activeViewId === id) setActiveViewId(null)
      toast.success(`Deleted view "${name}"`)
    },
    [deleteView, activeViewId]
  )

  return (
    <>
      <div className={cn('flex items-center gap-1.5', className)}>
        {/* Pinned view quick-access chips */}
        {pinnedViews.map((v) => (
          <Button
            key={v.id}
            variant={activeViewId === v.id ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => handleApply(v)}
          >
            <Star className="h-3 w-3 fill-current" />
            {v.name}
          </Button>
        ))}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5">
              <Bookmark className="h-3.5 w-3.5" />
              Views
              {views.length > 0 && (
                <span className="text-[10px] text-muted-foreground ml-0.5">({views.length})</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0" sideOffset={8}>
            <div className="p-3 border-b border-border">
              <h4 className="text-sm font-medium text-foreground">Saved Views</h4>
              <p className="text-xs text-muted-foreground mt-0.5">Apply a saved filter preset</p>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {views.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">No saved views yet</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Add filters, then save them as a view
                  </p>
                </div>
              ) : (
                <div className="p-1">
                  {views.map((v) => (
                    <div
                      key={v.id}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-muted/50 group cursor-pointer',
                        activeViewId === v.id && 'bg-primary/10'
                      )}
                      onClick={() => handleApply(v)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {v.is_pinned && <Star className="h-3 w-3 text-primary fill-primary shrink-0" />}
                          <span className="text-sm text-foreground truncate">{v.name}</span>
                          {activeViewId === v.id && <Check className="h-3 w-3 text-primary shrink-0" />}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {v.filters.conditions.length} filter{v.filters.conditions.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            togglePin(v.id)
                          }}
                        >
                          <Star
                            className={cn('h-3 w-3', v.is_pinned ? 'text-primary fill-primary' : 'text-muted-foreground')}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(v.id, v.name)
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-2 border-t border-border bg-muted/30">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-full text-xs text-primary hover:text-primary justify-start"
                onClick={() => {
                  setOpen(false)
                  setSaveDialogOpen(true)
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Save current filters as view
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Clear active view */}
        {activeViewId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => {
              setActiveViewId(null)
              onApply({ id: 'default', conjunction: 'and', conditions: [] })
            }}
          >
            Clear view
          </Button>
        )}
      </div>

      {/* Save View Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save View</DialogTitle>
            <DialogDescription>
              Save your current filters as a reusable view. You can pin it for quick access.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="View name (e.g. High-value deals)"
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="h-10"
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-2">
              {currentFilters.conditions.length} active filter
              {currentFilters.conditions.length !== 1 ? 's' : ''} will be saved
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!viewName.trim()}>
              Save View
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
