'use client'

import React, { useMemo, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { cn, formatCurrency } from '@/lib/utils'
import {
  Plus,
  LayoutGrid,
  List,
  Search,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { useKanban, useDealMetrics, useUpdateDealStage, usePipelines, useDeleteDeal, useUpdateDeal } from '@/hooks/crm'
import type { Deal } from '@/types/crm'
import { KanbanBoard } from '@/components/crm/KanbanBoard'
import { DealSlideIn } from '@/components/crm/DealSlideIn'
import { FilterBuilder, filterGroupToParams } from '@/components/crm/FilterBuilder'
import { SavedViewsPicker } from '@/components/crm/SavedViewsPicker'
import { useBulkSelection, BulkActionBar, SelectionCheckbox } from '@/components/crm/BulkActions'
import { useKeyboardShortcuts } from '@/components/crm/KeyboardShortcuts'
import { DEAL_FILTER_FIELDS } from '@/types/crm-filters'
import type { FilterGroup } from '@/types/crm-filters'
import { toast } from 'sonner'
import { EmptyState } from '@/components/crm/EmptyState'

// =====================================================
// TABLE VIEW
// =====================================================
function DealsTable({
  deals,
  isLoading,
  onRowClick,
  isSelected,
  onToggleSelect,
  isAllSelected,
  isPartiallySelected,
  onToggleAll,
}: {
  deals: Deal[]
  isLoading: boolean
  onRowClick: (deal: Deal) => void
  isSelected: (id: string) => boolean
  onToggleSelect: (id: string) => void
  isAllSelected: boolean
  isPartiallySelected: boolean
  onToggleAll: () => void
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px]">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground border-b border-border">
            <th className="text-left pb-3 pl-4 w-10">
              <SelectionCheckbox
                checked={isAllSelected}
                indeterminate={isPartiallySelected}
                onChange={onToggleAll}
              />
            </th>
            <th className="text-left pb-3 pl-2 w-28">ID</th>
            <th className="text-left pb-3">Title</th>
            <th className="text-left pb-3">Client</th>
            <th className="text-left pb-3 w-20">Type</th>
            <th className="text-right pb-3 w-28">Value</th>
            <th className="text-left pb-3 pl-4 w-32">Stage</th>
            <th className="text-left pb-3 w-24">Agent</th>
            <th className="text-right pb-3 pr-4 w-24">Updated</th>
          </tr>
        </thead>
        <tbody className="text-sm">
          {deals.map((deal) => (
            <tr
              key={deal.id}
              className={cn(
                'border-b border-border hover:bg-muted/50 cursor-pointer transition-colors',
                isSelected(deal.id) && 'bg-primary/5'
              )}
              onClick={() => onRowClick(deal)}
            >
              <td className="py-3 pl-4">
                <SelectionCheckbox
                  checked={isSelected(deal.id)}
                  onChange={() => onToggleSelect(deal.id)}
                />
              </td>
              <td className="py-3 pl-2 font-mono text-xs text-muted-foreground">{deal.deal_number}</td>
              <td className="py-3 font-medium text-foreground">{deal.title}</td>
              <td className="py-3 text-muted-foreground">{deal.primary_contact_name || '—'}</td>
              <td className="py-3">
                <span
                  className={cn(
                    'px-2 py-0.5 text-[10px] rounded-full font-medium',
                    deal.deal_type === 'sale' && 'bg-green-500/10 text-green-500',
                    deal.deal_type === 'rental' && 'bg-blue-500/10 text-blue-500',
                    deal.deal_type === 'development' && 'bg-purple-500/10 text-purple-500'
                  )}
                >
                  {deal.deal_type?.toUpperCase()}
                </span>
              </td>
              <td className="py-3 text-right font-mono text-xs text-foreground">
                {deal.deal_value ? formatCurrency(deal.deal_value, deal.currency || 'GHS') : '—'}
              </td>
              <td className="py-3 pl-4">
                <span
                  className="px-2 py-0.5 text-[10px] rounded-full bg-muted text-foreground border border-border"
                  style={{ borderColor: deal.stage_color || '#71717a' }}
                >
                  {deal.stage_name}
                </span>
              </td>
              <td className="py-3 text-muted-foreground">{deal.assigned_agent_name || '—'}</td>
              <td className="py-3 pr-4 text-right text-xs text-muted-foreground">
                {new Date(deal.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {deals.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">No deals found</p>
        </div>
      )}
    </div>
  )
}

// =====================================================
// MAIN COMPONENT
// =====================================================
export default function DealsPage() {
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [selectedPipeline, setSelectedPipeline] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Slide-in panel
  const [slideInDealId, setSlideInDealId] = useState<string | null>(null)
  const [slideInOpen, setSlideInOpen] = useState(false)

  // Stage change confirmation dialog
  const [stageChangeDialog, setStageChangeDialog] = useState<{
    dealId: string
    stageId: string
    stageName: string
  } | null>(null)
  const [stageChangeNote, setStageChangeNote] = useState('')

  // Phase 3: Advanced filters
  const [filterGroup, setFilterGroup] = useState<FilterGroup>({
    id: 'root',
    conjunction: 'and',
    conditions: [],
  })

  // React Query hooks
  const { data: pipelines = [], isLoading: pipelinesLoading } = usePipelines()
  const { data: metrics } = useDealMetrics()
  const updateStageMutation = useUpdateDealStage()
  const deleteDealMutation = useDeleteDeal()
  const updateDealMutation = useUpdateDeal()

  // Auto-select default pipeline
  const activePipelineId = useMemo(() => {
    if (selectedPipeline) return selectedPipeline
    const def = pipelines.find((p) => p.is_default) || pipelines[0]
    return def?.id || ''
  }, [selectedPipeline, pipelines])

  // Set pipeline once loaded
  React.useEffect(() => {
    if (!selectedPipeline && activePipelineId) {
      setSelectedPipeline(activePipelineId)
    }
  }, [activePipelineId, selectedPipeline])

  const { data: kanbanData = [], isLoading: kanbanLoading } = useKanban(activePipelineId)

  const isLoading = pipelinesLoading || kanbanLoading

  // All deals flat list for table view
  const allDeals = useMemo(() => kanbanData.flatMap((col) => col.deals || []), [kanbanData])

  // Filtered kanban
  const filteredKanban = useMemo(() => {
    if (!searchTerm) return kanbanData
    const search = searchTerm.toLowerCase()
    return kanbanData.map((col) => ({
      ...col,
      deals: col.deals.filter(
        (deal) =>
          deal.title?.toLowerCase().includes(search) ||
          deal.deal_number?.toLowerCase().includes(search) ||
          deal.primary_contact_name?.toLowerCase().includes(search)
      ),
    }))
  }, [kanbanData, searchTerm])

  // Filtered deals for list view
  const filteredDeals = useMemo(() => {
    if (!searchTerm) return allDeals
    const search = searchTerm.toLowerCase()
    return allDeals.filter(
      (deal) =>
        deal.title?.toLowerCase().includes(search) ||
        deal.deal_number?.toLowerCase().includes(search) ||
        deal.primary_contact_name?.toLowerCase().includes(search)
    )
  }, [allDeals, searchTerm])

  // Phase 3: Client-side advanced filter matching
  const advancedFilteredDeals = useMemo(() => {
    if (filterGroup.conditions.length === 0) return filteredDeals
    return filteredDeals.filter((deal) => {
      const results = filterGroup.conditions.map((c) => {
        const val = (deal as any)[c.field]
        const cVal = c.value
        switch (c.operator) {
          case 'equals': return String(val) === String(cVal)
          case 'not_equals': return String(val) !== String(cVal)
          case 'contains': return String(val || '').toLowerCase().includes(String(cVal).toLowerCase())
          case 'greater_than': return Number(val) > Number(cVal)
          case 'less_than': return Number(val) < Number(cVal)
          case 'is_empty': return !val
          case 'is_not_empty': return !!val
          case 'is_true': return val === true
          case 'is_false': return val === false || !val
          default: return true
        }
      })
      return filterGroup.conjunction === 'and' ? results.every(Boolean) : results.some(Boolean)
    })
  }, [filteredDeals, filterGroup])

  // Phase 3: Bulk selection
  const bulkSelection = useBulkSelection(advancedFilteredDeals)

  // Phase 3: Stage options for bulk actions
  const stageOptions = useMemo(() => {
    const pipeline = pipelines.find((p) => p.id === activePipelineId)
    return (pipeline?.stages || []).map((s) => ({ label: s.stage_name, value: s.id }))
  }, [pipelines, activePipelineId])

  // Phase 3: Keyboard shortcuts
  useKeyboardShortcuts({
    onToggleView: () => setViewMode((v) => (v === 'kanban' ? 'list' : 'kanban')),
    onFocusSearch: () => searchRef.current?.focus(),
  })

  // Handle card click → open slide-in
  const handleCardClick = useCallback((deal: Deal) => {
    setSlideInDealId(deal.id)
    setSlideInOpen(true)
  }, [])

  // Handle DnD stage change → open confirmation dialog
  const handleDealStageChange = useCallback(
    (dealId: string, newStageId: string) => {
      const targetStage = kanbanData
        .flatMap((col) => (col.stage.id === newStageId ? [col.stage] : []))
        .find(Boolean)

      setStageChangeDialog({
        dealId,
        stageId: newStageId,
        stageName: targetStage?.stage_name || 'Unknown Stage',
      })
      setStageChangeNote('')
    },
    [kanbanData]
  )

  // Confirm stage change
  const confirmStageChange = useCallback(() => {
    if (!stageChangeDialog) return

    updateStageMutation.mutate(
      {
        dealId: stageChangeDialog.dealId,
        stageId: stageChangeDialog.stageId,
        note: stageChangeNote || undefined,
      },
      {
        onSuccess: () => {
          toast.success(`Deal moved to ${stageChangeDialog.stageName}`)
          setStageChangeDialog(null)
        },
        onError: () => {
          toast.error('Failed to update deal stage')
          setStageChangeDialog(null)
        },
      }
    )
  }, [stageChangeDialog, stageChangeNote, updateStageMutation])

  // Phase 3: Handle bulk actions
  const handleBulkAction = useCallback(
    async (actionId: string, value?: string) => {
      const ids = Array.from(bulkSelection.selectedIds)
      try {
        switch (actionId) {
          case 'delete':
            await Promise.all(ids.map((id) => deleteDealMutation.mutateAsync(id)))
            toast.success(`Deleted ${ids.length} deals`)
            break
          case 'change_stage':
            if (value) {
              await Promise.all(
                ids.map((id) => updateStageMutation.mutateAsync({ dealId: id, stageId: value }))
              )
              toast.success(`Moved ${ids.length} deals`)
            }
            break
          case 'add_tags':
            if (value) {
              const tags = value.split(',').map((t) => t.trim()).filter(Boolean)
              await Promise.all(
                ids.map((id) => {
                  const deal = allDeals.find((d) => d.id === id)
                  const existingTags = deal?.tags || []
                  return updateDealMutation.mutateAsync({
                    id,
                    data: { tags: [...new Set([...existingTags, ...tags])] },
                  })
                })
              )
              toast.success(`Added tags to ${ids.length} deals`)
            }
            break
          case 'export':
            // Simple CSV export
            const exportDeals = advancedFilteredDeals.filter((d) => ids.includes(d.id))
            const headers = ['Deal Number', 'Title', 'Type', 'Status', 'Value', 'Stage', 'Contact', 'Agent']
            const rows = exportDeals.map((d) => [
              d.deal_number, d.title, d.deal_type, d.deal_status,
              d.deal_value || '', d.stage_name || '', d.primary_contact_name || '', d.assigned_agent_name || '',
            ])
            const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n')
            const blob = new Blob([csv], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `deals_export_${new Date().toISOString().slice(0, 10)}.csv`
            a.click()
            URL.revokeObjectURL(url)
            toast.success(`Exported ${exportDeals.length} deals`)
            break
          default:
            toast.info(`Action "${actionId}" is not yet implemented`)
        }
        bulkSelection.clearSelection()
      } catch (err) {
        toast.error('Bulk action failed')
      }
    },
    [bulkSelection, allDeals, advancedFilteredDeals, deleteDealMutation, updateStageMutation, updateDealMutation]
  )

  // Phase 3: Handle saved view application
  const handleApplyView = useCallback((filters: FilterGroup) => {
    setFilterGroup(filters)
  }, [])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
        <div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight text-foreground">Deals</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your sales pipeline and track opportunities.</p>
        </div>
        <Link href="/dashboard/deals/new">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm h-9 px-4 rounded-md shadow-sm">
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Create Deal</span>
          </Button>
        </Link>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Card className="bg-card border-border shadow-sm">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Active Deals</div>
            <div className="text-2xl font-bold text-foreground">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : metrics?.activeDeals || 0}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border shadow-sm">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Pipeline Value</div>
            <div className="text-2xl font-bold text-primary">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : formatCurrency(metrics?.totalValue || 0, 'GHS')}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border shadow-sm">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Won (Month)</div>
            <div className="text-2xl font-bold text-green-500">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : metrics?.wonDeals || 0}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border shadow-sm">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Won Value</div>
            <div className="text-2xl font-bold text-green-500">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : formatCurrency(metrics?.wonValue || 0, 'GHS')}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border shadow-sm">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Conversion</div>
            <div className="text-2xl font-bold text-foreground">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : `${((metrics?.conversionRate || 0) * 100).toFixed(1)}%`}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & View Toggle */}
      <Card className="border-border bg-card shadow-sm">
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={selectedPipeline} onValueChange={setSelectedPipeline}>
              <SelectTrigger className="w-full sm:w-[200px] h-9">
                <SelectValue placeholder="Select pipeline" />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map((pipeline) => (
                  <SelectItem key={pipeline.id} value={pipeline.id}>
                    {pipeline.pipeline_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative w-full sm:flex-1 sm:max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="Search deals... (press /)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            <div className="hidden sm:block flex-1" />

            <div className="flex items-center border border-border rounded-md bg-muted/50 p-0.5">
              <button
                onClick={() => setViewMode('kanban')}
                className={cn(
                  'p-1.5 rounded-sm transition-all',
                  viewMode === 'kanban' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'p-1.5 rounded-sm transition-all',
                  viewMode === 'list' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Phase 3: Filter Builder + Saved Views */}
          <div className="flex items-center gap-2 flex-wrap">
            <FilterBuilder
              fields={DEAL_FILTER_FIELDS}
              value={filterGroup}
              onChange={setFilterGroup}
            />
            <SavedViewsPicker
              entityType="deals"
              currentFilters={filterGroup}
              onApply={handleApplyView}
            />
          </div>
        </div>
      </Card>

      {/* Kanban View with DnD */}
      {viewMode === 'kanban' && (
        <div className="overflow-x-auto pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !activePipelineId ? (
            <EmptyState
              icon={LayoutGrid}
              title="No pipeline configured"
              description="Create a deal pipeline to start tracking opportunities on the kanban board."
              actions={[
                { label: 'Set up pipeline', href: '/dashboard/deals/pipelines', icon: Plus },
              ]}
            />
          ) : filteredKanban.length === 0 ? (
            <EmptyState
              icon={LayoutGrid}
              title="No deals yet"
              description="Create your first deal or adjust filters to see pipeline cards here."
              actions={[
                { label: 'Create Deal', href: '/dashboard/deals/new', icon: Plus },
              ]}
            />
          ) : (
            <KanbanBoard
              columns={filteredKanban}
              onCardClick={handleCardClick}
              onDealStageChange={handleDealStageChange}
            />
          )}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <Card className="border-border bg-card shadow-sm">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-medium text-foreground">
              All Deals
              {bulkSelection.selectedCount > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  ({bulkSelection.selectedCount} selected)
                </span>
              )}
            </h3>
          </div>
          <DealsTable
            deals={advancedFilteredDeals}
            isLoading={isLoading}
            onRowClick={handleCardClick}
            isSelected={bulkSelection.isSelected}
            onToggleSelect={bulkSelection.toggleOne}
            isAllSelected={bulkSelection.isAllSelected}
            isPartiallySelected={bulkSelection.isPartiallySelected}
            onToggleAll={bulkSelection.toggleAll}
          />
        </Card>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar
        entityType="deal"
        selectedCount={bulkSelection.selectedCount}
        onAction={handleBulkAction}
        onClear={bulkSelection.clearSelection}
        stageOptions={stageOptions}
      />

      {/* Deal Slide-in Panel */}
      <DealSlideIn
        dealId={slideInDealId}
        open={slideInOpen}
        onOpenChange={setSlideInOpen}
      />

      {/* Stage Change Confirmation Dialog */}
      <Dialog open={!!stageChangeDialog} onOpenChange={(open) => !open && setStageChangeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Deal</DialogTitle>
            <DialogDescription>
              Move this deal to <span className="font-medium text-foreground">{stageChangeDialog?.stageName}</span>?
              You can optionally add a note.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Add a note about this stage change (optional)..."
              value={stageChangeNote}
              onChange={(e) => setStageChangeNote(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStageChangeDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={confirmStageChange}
              disabled={updateStageMutation.isPending}
            >
              {updateStageMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Move Deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
