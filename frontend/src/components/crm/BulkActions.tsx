'use client'

import React, { useState, useCallback, useMemo } from 'react'
import {
  UserPlus,
  ArrowRightLeft,
  Tags,
  Trash2,
  X,
  Download,
  CheckSquare,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

// =====================================================
// TYPES
// =====================================================
export type BulkEntityType = 'deal' | 'contact' | 'company'

export interface BulkActionDef {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  destructive?: boolean
  /** Only show for these entities */
  entities?: BulkEntityType[]
}

const BULK_ACTIONS: BulkActionDef[] = [
  { id: 'assign', label: 'Assign Agent', icon: UserPlus, entities: ['deal', 'contact'] },
  { id: 'change_stage', label: 'Change Stage', icon: ArrowRightLeft, entities: ['deal'] },
  { id: 'change_status', label: 'Change Status', icon: ArrowRightLeft, entities: ['deal', 'contact'] },
  { id: 'add_tags', label: 'Add Tags', icon: Tags },
  { id: 'remove_tags', label: 'Remove Tags', icon: Tags },
  { id: 'export', label: 'Export CSV', icon: Download },
  { id: 'delete', label: 'Delete', icon: Trash2, destructive: true },
]

// =====================================================
// HOOK: useBulkSelection
// =====================================================
export function useBulkSelection<T extends { id: string }>(items: T[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === items.length) {
        return new Set()
      }
      return new Set(items.map((i) => i.id))
    })
  }, [items])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds])

  const isAllSelected = items.length > 0 && selectedIds.size === items.length
  const isPartiallySelected = selectedIds.size > 0 && selectedIds.size < items.length
  const selectedCount = selectedIds.size
  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.id)),
    [items, selectedIds]
  )

  return {
    selectedIds,
    selectedItems,
    selectedCount,
    isSelected,
    isAllSelected,
    isPartiallySelected,
    toggleOne,
    toggleAll,
    clearSelection,
  }
}

// =====================================================
// CHECKBOX CELL (for table/card selection)
// =====================================================
interface SelectionCheckboxProps {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
  className?: string
}

export function SelectionCheckbox({ checked, indeterminate, onChange, className }: SelectionCheckboxProps) {
  return (
    <div
      className={cn('flex items-center justify-center', className)}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onChange()
      }}
    >
      <Checkbox
        checked={indeterminate ? 'indeterminate' : checked}
        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
      />
    </div>
  )
}

// =====================================================
// BULK ACTION BAR (floating bar when items selected)
// =====================================================
interface BulkActionBarProps {
  entityType: BulkEntityType
  selectedCount: number
  onAction: (actionId: string, value?: string) => void
  onClear: () => void
  /** Optional: stage options for deal stage change */
  stageOptions?: { label: string; value: string }[]
  /** Optional: agent options for assignment */
  agentOptions?: { label: string; value: string }[]
  /** Optional: status options */
  statusOptions?: { label: string; value: string }[]
  isProcessing?: boolean
}

export function BulkActionBar({
  entityType,
  selectedCount,
  onAction,
  onClear,
  stageOptions,
  agentOptions,
  statusOptions,
  isProcessing = false,
}: BulkActionBarProps) {
  const [confirmDialog, setConfirmDialog] = useState<{ action: string; label: string } | null>(null)
  const [actionValue, setActionValue] = useState('')
  const [tagInput, setTagInput] = useState('')

  const availableActions = BULK_ACTIONS.filter(
    (a) => !a.entities || a.entities.includes(entityType)
  )

  const handleAction = useCallback(
    (action: BulkActionDef) => {
      if (action.destructive) {
        setConfirmDialog({ action: action.id, label: action.label })
        return
      }
      if (['assign', 'change_stage', 'change_status'].includes(action.id)) {
        setConfirmDialog({ action: action.id, label: action.label })
        return
      }
      if (['add_tags', 'remove_tags'].includes(action.id)) {
        setConfirmDialog({ action: action.id, label: action.label })
        return
      }
      onAction(action.id)
    },
    [onAction]
  )

  const confirmAction = useCallback(() => {
    if (!confirmDialog) return
    const value = ['add_tags', 'remove_tags'].includes(confirmDialog.action) ? tagInput : actionValue
    onAction(confirmDialog.action, value || undefined)
    setConfirmDialog(null)
    setActionValue('')
    setTagInput('')
  }, [confirmDialog, actionValue, tagInput, onAction])

  if (selectedCount === 0) return null

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="flex items-center gap-2 bg-card border border-border shadow-xl rounded-xl px-4 py-2.5 backdrop-blur-sm">
            <div className="flex items-center gap-2 pr-3 border-r border-border">
              <CheckSquare className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground whitespace-nowrap">
                {selectedCount} selected
              </span>
            </div>

            <div className="flex items-center gap-1">
              {availableActions.map((action) => {
                const Icon = action.icon
                return (
                  <Button
                    key={action.id}
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-8 text-xs gap-1.5',
                      action.destructive && 'text-destructive hover:text-destructive hover:bg-destructive/10'
                    )}
                    onClick={() => handleAction(action)}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Icon className="h-3.5 w-3.5" />
                    )}
                    {action.label}
                  </Button>
                )
              })}
            </div>

            <div className="pl-2 border-l border-border">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground"
                onClick={onClear}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Confirmation Dialog */}
      <Dialog
        open={!!confirmDialog}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDialog(null)
            setActionValue('')
            setTagInput('')
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmDialog?.action === 'delete' && (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              )}
              {confirmDialog?.label}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog?.action === 'delete'
                ? `Are you sure you want to delete ${selectedCount} ${entityType}(s)? This action cannot be undone.`
                : `Apply "${confirmDialog?.label}" to ${selectedCount} selected ${entityType}(s).`}
            </DialogDescription>
          </DialogHeader>

          {/* Value selection for actions that need it */}
          {confirmDialog?.action === 'assign' && agentOptions && (
            <div className="py-4">
              <Select value={actionValue} onValueChange={setActionValue}>
                <SelectTrigger>
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  {agentOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {confirmDialog?.action === 'change_stage' && stageOptions && (
            <div className="py-4">
              <Select value={actionValue} onValueChange={setActionValue}>
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {stageOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {confirmDialog?.action === 'change_status' && statusOptions && (
            <div className="py-4">
              <Select value={actionValue} onValueChange={setActionValue}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(confirmDialog?.action === 'add_tags' || confirmDialog?.action === 'remove_tags') && (
            <div className="py-4">
              <Input
                placeholder="Enter tags (comma-separated)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Separate multiple tags with commas
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmDialog(null)
                setActionValue('')
                setTagInput('')
              }}
            >
              Cancel
            </Button>
            <Button
              variant={confirmDialog?.action === 'delete' ? 'destructive' : 'default'}
              onClick={confirmAction}
              disabled={
                isProcessing ||
                (['assign', 'change_stage', 'change_status'].includes(confirmDialog?.action || '') && !actionValue) ||
                (['add_tags', 'remove_tags'].includes(confirmDialog?.action || '') && !tagInput.trim())
              }
            >
              {isProcessing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {confirmDialog?.action === 'delete' ? `Delete ${selectedCount} items` : 'Apply'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
