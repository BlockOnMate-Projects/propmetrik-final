'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { WorkspaceWidget } from '@/components/workspace/WorkspacePanel'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  Building2,
  Calendar,
  ChevronRight,
  Edit,
  Loader2,
  MapPin,
  MoreVertical,
  Plus,
  Users,
  DollarSign,
  TrendingUp,
  FileText,
  HardHat,
  Clock,
  CheckCircle2,
  AlertCircle,
  Flag,
  Layers,
  BarChart3,
  Upload,
  Pencil,
  X,
  Check,
  ClipboardType,
  MessageSquare,
  FileCheck2,
  FileEdit,
  Download,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ProjectHeader } from '@/components/projects/dashboard/ProjectHeader'
import { ProjectMetrics } from '@/components/projects/dashboard/ProjectMetrics'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { projectsApi, phasesApi, costsApi, assignmentsApi, dashboardApi } from '@/lib/projects-api'
import { teamApi, TeamMember } from '@/lib/team-api'
import { rfiApi, submittalApi, changeOrderApi, punchListApi, RfiStats, SubmittalStats, ChangeOrderStats, PunchListStats } from '@/lib/unified-project-api'
import { ProjectGantt } from '@/components/projects/gantt/ProjectGantt'
import { SiteDiaryLog } from '@/components/projects/construction/SiteDiaryLog'
import { PettyCashLedger } from '@/components/projects/construction/PettyCashLedger'
import { MaterialPriceTracker } from '@/components/projects/construction/MaterialPriceTracker'
import { RFIsTab, SubmittalsTab, ChangeOrdersTab, MilestonesTab } from '@/components/projects/pm-data'
import type {
  DevelopmentProject,
  ProjectPhase,
  ProjectCost,
  BudgetSummary,
  ContractorAssignment,
  GanttData,
  ProjectStatus,
  PhaseStatus,
} from '@/types/projects'
import { formatCurrency } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import { PhaseHierarchy } from '@/components/projects/PhaseHierarchy'

// =====================================================
// STATUS CONFIGURATIONS
// =====================================================
const statusColors: Record<ProjectStatus, { bg: string; text: string; label: string }> = {
  planning: { bg: 'bg-blue-900/50', text: 'text-blue-400', label: 'Planning' },
  pre_sales: { bg: 'bg-purple-900/50', text: 'text-purple-400', label: 'Pre-Sales' },
  under_construction: { bg: 'bg-amber-900/50', text: 'text-amber-400', label: 'Under Construction' },
  nearing_completion: { bg: 'bg-orange-900/50', text: 'text-orange-400', label: 'Near Completion' },
  completed: { bg: 'bg-green-900/50', text: 'text-green-400', label: 'Completed' },
  sold_out: { bg: 'bg-emerald-900/50', text: 'text-emerald-400', label: 'Sold Out' },
  on_hold: { bg: 'bg-zinc-700/50', text: 'text-zinc-400', label: 'On Hold' },
  cancelled: { bg: 'bg-red-900/50', text: 'text-red-400', label: 'Cancelled' },
  archived: { bg: 'bg-zinc-800/50', text: 'text-zinc-500', label: 'Archived' },
}

const phaseStatusColors: Record<PhaseStatus, { bg: string; text: string }> = {
  not_started: { bg: 'bg-zinc-700/50', text: 'text-zinc-400' },
  in_progress: { bg: 'bg-amber-900/50', text: 'text-amber-400' },
  completed: { bg: 'bg-green-900/50', text: 'text-green-400' },
  delayed: { bg: 'bg-red-900/50', text: 'text-red-400' },
  blocked: { bg: 'bg-red-900/50', text: 'text-red-400' },
  cancelled: { bg: 'bg-zinc-800/50', text: 'text-zinc-500' },
}

// =====================================================
// PANEL COMPONENT
// =====================================================
function Panel({ title, children, className, action }: {
  title: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
        <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

// =====================================================
// STAT CARD
// =====================================================
function StatCard({ label, value, subValue, icon: Icon, color = 'amber' }: {
  label: string;
  value: string | number;
  subValue?: string;
  icon: React.ElementType;
  color?: 'amber' | 'green' | 'blue' | 'red';
}) {
  const colorClasses = {
    amber: 'text-amber-500',
    green: 'text-green-500',
    blue: 'text-blue-500',
    red: 'text-red-500',
  }

  return (
    <div className="border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
        <Icon className={cn("h-4 w-4", colorClasses[color])} />
      </div>
      <div className="font-mono text-lg text-white">{value}</div>
      {subValue && (
        <div className="font-mono text-[10px] text-zinc-500 mt-1">{subValue}</div>
      )}
    </div>
  )
}

// =====================================================
// GANTT CHART (SIMPLIFIED)
// =====================================================
function GanttChart({ phases, projectStart, projectEnd }: {
  phases: ProjectPhase[];
  projectStart?: string;
  projectEnd?: string;
}) {
  const sortedPhases = [...phases].sort((a, b) => a.phase_number - b.phase_number)

  // Calculate date range
  const startDate = projectStart ? new Date(projectStart) : new Date()
  const endDate = projectEnd ? new Date(projectEnd) : new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000)
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

  const getPosition = (date: string | undefined, isEnd = false) => {
    if (!date) return isEnd ? 100 : 0
    const d = new Date(date)
    const days = Math.ceil((d.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(0, Math.min(100, (days / totalDays) * 100))
  }

  // Generate month markers
  const months: { label: string; position: number }[] = []
  const current = new Date(startDate)
  current.setDate(1)
  while (current <= endDate) {
    const days = Math.ceil((current.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    months.push({
      label: current.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      position: (days / totalDays) * 100
    })
    current.setMonth(current.getMonth() + 1)
  }

  return (
    <div className="relative">
      {/* Month headers */}
      <div className="relative h-6 border-b border-zinc-800 mb-2">
        {months.map((month, i) => (
          <div
            key={i}
            className="absolute font-mono text-[9px] text-zinc-500"
            style={{ left: `${month.position}%` }}
          >
            {month.label}
          </div>
        ))}
      </div>

      {/* Phase bars */}
      <div className="space-y-2">
        {sortedPhases.map((phase) => {
          const left = getPosition(phase.planned_start_date)
          const right = getPosition(phase.planned_end_date, true)
          const width = right - left
          const config = phaseStatusColors[phase.status]

          return (
            <div key={phase.id} className="flex items-center gap-3">
              <div className="w-32 flex-shrink-0">
                <span className="font-mono text-[10px] text-zinc-300 line-clamp-1">
                  {phase.phase_number}. {phase.phase_name}
                </span>
              </div>
              <div className="flex-1 relative h-6 bg-zinc-800/50 rounded">
                {/* Planned bar */}
                <div
                  className={cn("absolute h-4 top-1 rounded", config.bg)}
                  style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
                >
                  {/* Progress fill */}
                  <div
                    className="h-full bg-amber-500/50 rounded"
                    style={{ width: `${phase.progress_percentage}%` }}
                  />
                </div>

                {/* Milestones */}
                {phase.milestones?.map((milestone, i) => {
                  const pos = getPosition(milestone.target_date)
                  return (
                    <div
                      key={i}
                      className={cn(
                        "absolute top-0 w-3 h-3 rotate-45 border",
                        milestone.is_completed
                          ? "bg-green-500 border-green-400"
                          : "bg-zinc-700 border-zinc-600"
                      )}
                      style={{ left: `${pos}%`, transform: 'translateX(-50%) rotate(45deg)' }}
                      title={milestone.name}
                    />
                  )
                })}
              </div>
              <div className="w-12 text-right">
                <span className="font-mono text-[10px] text-zinc-500">{phase.progress_percentage}%</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Today marker */}
      <div
        className="absolute top-0 bottom-0 w-px bg-red-500/50"
        style={{ left: `${getPosition(new Date().toISOString())}%` }}
      >
        <div className="absolute -top-1 -left-2 font-mono text-[8px] text-red-400">TODAY</div>
      </div>
    </div>
  )
}

// =====================================================
// BUDGET OVERVIEW (with cost entry management)
// =====================================================
function BudgetOverview({ budget, projectId, projectBudget, currency = 'GHS', onBudgetUpdate }: {
  budget: BudgetSummary;
  projectId: string;
  projectBudget?: number;
  currency?: string;
  onBudgetUpdate?: () => void;
}) {
  const [showAddCostDialog, setShowAddCostDialog] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [costs, setCosts] = useState<ProjectCost[]>([])
  const [isLoadingCosts, setIsLoadingCosts] = useState(false)

  // Cost form
  const [costForm, setCostForm] = useState({
    description: '',
    category: 'foundation',
    original_budget: '',
    committed_costs: '',
  })

  const healthColors: Record<string, string> = {
    on_budget: 'text-green-400',
    under_budget: 'text-blue-400',
    at_risk: 'text-yellow-400',
    over_budget: 'text-red-400',
  }

  // Load costs
  useEffect(() => {
    if (!projectId) return  // Guard against undefined projectId

    const loadCosts = async () => {
      try {
        setIsLoadingCosts(true)
        const data = await costsApi.getByProject(projectId)
        // API returns array directly, not wrapped in {data: [...]}
        setCosts(Array.isArray(data) ? data : (data as any)?.data || [])
      } catch (err) {
        console.error('Failed to load costs:', err)
      } finally {
        setIsLoadingCosts(false)
      }
    }
    loadCosts()
  }, [projectId])

  // Calculate totals from costs or use project budget as fallback
  const originalBudget = budget?.total_original_budget || projectBudget || 0
  const revisedBudget = budget?.total_revised_budget || originalBudget
  const actualSpent = budget?.total_actual || costs.reduce((sum, c) => sum + (c.actual_costs || 0), 0)
  const variance = revisedBudget - actualSpent

  // Add cost entry
  const handleAddCost = async () => {
    if (!projectId || !costForm.description || !costForm.original_budget) return

    try {
      setIsAdding(true)
      await costsApi.create(projectId, {
        description: costForm.description,
        category: costForm.category as any,
        original_budget: parseFloat(costForm.original_budget),
        committed_costs: costForm.committed_costs ? parseFloat(costForm.committed_costs) : 0,
      })

      // Refresh
      const data = await costsApi.getByProject(projectId)
      setCosts(Array.isArray(data) ? data : [])
      if (onBudgetUpdate) onBudgetUpdate()

      // Reset and close
      setCostForm({ description: '', category: 'foundation', original_budget: '', committed_costs: '' })
      setShowAddCostDialog(false)
    } catch (err) {
      console.error('Failed to add cost:', err)
    } finally {
      setIsAdding(false)
    }
  }

  // Record actual on existing cost
  const handleRecordActual = async (costId: string, amount: string) => {
    if (!projectId) return

    try {
      await costsApi.update(costId, { actual_costs: parseFloat(amount) })
      const data = await costsApi.getByProject(projectId)
      setCosts(Array.isArray(data) ? data : [])
      if (onBudgetUpdate) onBudgetUpdate()
    } catch (err) {
      console.error('Failed to update actual:', err)
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-zinc-800/50 p-2 border border-zinc-700">
          <div className="font-mono text-[9px] text-zinc-500">ORIGINAL BUDGET</div>
          <div className="font-mono text-sm text-white">{formatCurrency(originalBudget, currency)}</div>
        </div>
        <div className="bg-zinc-800/50 p-2 border border-zinc-700">
          <div className="font-mono text-[9px] text-zinc-500">REVISED BUDGET</div>
          <div className="font-mono text-sm text-amber-400">{formatCurrency(revisedBudget, currency)}</div>
        </div>
        <div className="bg-zinc-800/50 p-2 border border-zinc-700">
          <div className="font-mono text-[9px] text-zinc-500">ACTUAL SPENT</div>
          <div className="font-mono text-sm text-green-400">{formatCurrency(actualSpent, currency)}</div>
        </div>
        <div className="bg-zinc-800/50 p-2 border border-zinc-700">
          <div className="font-mono text-[9px] text-zinc-500">VARIANCE</div>
          <div className={cn(
            "font-mono text-sm",
            variance >= 0 ? "text-green-400" : "text-red-400"
          )}>
            {variance >= 0 ? '+' : ''}{formatCurrency(variance, currency)}
          </div>
        </div>
      </div>

      {/* Budget Health */}
      {budget?.health && (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-zinc-500">BUDGET HEALTH:</span>
          <span className={cn("font-mono text-xs uppercase", healthColors[budget.health] || 'text-zinc-400')}>
            {budget.health.replace('_', ' ')}
          </span>
        </div>
      )}

      {/* Cost Line Items */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[10px] text-zinc-500">COST ITEMS</div>
          <Button
            size="sm"
            className="h-6 font-mono text-[10px] bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => setShowAddCostDialog(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Cost
          </Button>
        </div>

        {isLoadingCosts ? (
          <div className="text-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-amber-500 mx-auto" />
          </div>
        ) : costs.length > 0 ? (
          <div className="border border-zinc-800 rounded overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-zinc-800/50 border-b border-zinc-800">
                  <th className="font-mono text-[10px] text-zinc-500 text-left p-2">Description</th>
                  <th className="font-mono text-[10px] text-zinc-500 text-left p-2">Category</th>
                  <th className="font-mono text-[10px] text-zinc-500 text-right p-2">Budget</th>
                  <th className="font-mono text-[10px] text-zinc-500 text-right p-2">Actual</th>
                  <th className="font-mono text-[10px] text-zinc-500 text-right p-2">Variance</th>
                </tr>
              </thead>
              <tbody>
                {costs.slice(0, 10).map((cost) => {
                  const costVariance = (cost.revised_budget || cost.original_budget) - (cost.actual_costs || 0)
                  return (
                    <tr key={cost.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="font-mono text-xs text-white p-2">{cost.description}</td>
                      <td className="font-mono text-[10px] text-zinc-400 p-2 capitalize">
                        {cost.category?.replace(/_/g, ' ')}
                      </td>
                      <td className="font-mono text-xs text-zinc-300 text-right p-2">
                        {formatCurrency(cost.revised_budget || cost.original_budget, currency)}
                      </td>
                      <td className="font-mono text-xs text-right p-2">
                        <input
                          type="number"
                          defaultValue={cost.actual_costs || 0}
                          onBlur={(e) => handleRecordActual(cost.id, e.target.value)}
                          className="w-24 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-right text-green-400 font-mono text-xs"
                        />
                      </td>
                      <td className={cn(
                        "font-mono text-xs text-right p-2",
                        costVariance >= 0 ? "text-green-400" : "text-red-400"
                      )}>
                        {costVariance >= 0 ? '+' : ''}{formatCurrency(costVariance, currency)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-6 border border-dashed border-zinc-800 rounded">
            <DollarSign className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
            <p className="font-mono text-xs text-zinc-500 mb-2">No cost items yet</p>
            <p className="font-mono text-[10px] text-zinc-600 mb-3">
              Add cost line items to track budgets and record actual expenses
            </p>
            <Button
              size="sm"
              className="font-mono text-xs bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => setShowAddCostDialog(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add First Cost Item
            </Button>
          </div>
        )}
      </div>

      {/* Category Breakdown */}
      {budget?.by_category && budget.by_category.length > 0 && (
        <div className="space-y-2">
          <div className="font-mono text-[10px] text-zinc-500">BY CATEGORY</div>
          {budget.by_category.slice(0, 5).map((cat) => {
            const spent = cat.actual || 0
            const catBudget = cat.revised_budget || 0
            const pct = catBudget > 0 ? (spent / catBudget) * 100 : 0

            return (
              <div key={cat.category} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-zinc-400 capitalize">
                    {(cat.category || 'unknown').replace(/_/g, ' ')}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">
                    {formatCurrency(spent, currency)} / {formatCurrency(catBudget, currency)}
                  </span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all",
                      pct > 100 ? "bg-red-500" : pct > 80 ? "bg-yellow-500" : "bg-green-500"
                    )}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Cost Dialog */}
      <Dialog open={showAddCostDialog} onOpenChange={setShowAddCostDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono">Add Cost Item</DialogTitle>
            <DialogDescription className="font-mono text-xs text-zinc-400">
              Add a budget line item and optionally record actual expenses
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label className="font-mono text-xs">Description *</Label>
              <Input
                value={costForm.description}
                onChange={(e) => setCostForm({ ...costForm, description: e.target.value })}
                placeholder="e.g., Foundation Works"
                className="bg-zinc-800 border-zinc-700 font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-mono text-xs">Category</Label>
              <Select
                value={costForm.category}
                onValueChange={(v) => setCostForm({ ...costForm, category: v })}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="land_acquisition">Land Acquisition</SelectItem>
                  <SelectItem value="permits_approvals">Permits & Approvals</SelectItem>
                  <SelectItem value="design_engineering">Design & Engineering</SelectItem>
                  <SelectItem value="site_preparation">Site Preparation</SelectItem>
                  <SelectItem value="foundation">Foundation</SelectItem>
                  <SelectItem value="structural">Structural</SelectItem>
                  <SelectItem value="roofing">Roofing</SelectItem>
                  <SelectItem value="mep">MEP (Mechanical/Electrical/Plumbing)</SelectItem>
                  <SelectItem value="exterior_finishing">Exterior Finishing</SelectItem>
                  <SelectItem value="interior_finishing">Interior Finishing</SelectItem>
                  <SelectItem value="landscaping">Landscaping</SelectItem>
                  <SelectItem value="amenities">Amenities</SelectItem>
                  <SelectItem value="professional_fees">Professional Fees</SelectItem>
                  <SelectItem value="contingency">Contingency</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-mono text-xs">Budgeted Amount (GHS) *</Label>
                <Input
                  type="number"
                  value={costForm.original_budget}
                  onChange={(e) => setCostForm({ ...costForm, original_budget: e.target.value })}
                  placeholder="e.g., 50000"
                  className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-xs">Committed/Actual (GHS)</Label>
                <Input
                  type="number"
                  value={costForm.committed_costs}
                  onChange={(e) => setCostForm({ ...costForm, committed_costs: e.target.value })}
                  placeholder="e.g., 45000"
                  className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddCostDialog(false)}
              className="font-mono text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddCost}
              disabled={isAdding || !costForm.description || !costForm.original_budget}
              className="bg-amber-600 hover:bg-amber-700 text-white font-mono text-xs"
            >
              {isAdding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add Cost Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// =====================================================
// CONTRACTOR LIST
// =====================================================
function ContractorList({ assignments }: { assignments: ContractorAssignment[] }) {
  if (assignments.length === 0) {
    return (
      <div className="text-center py-4">
        <HardHat className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
        <p className="font-mono text-[10px] text-zinc-500">No contractors assigned</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {assignments.map((assignment) => (
        <div
          key={assignment.id}
          className="p-2 bg-zinc-800/30 border border-zinc-800"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-xs text-white">
              {assignment.contractor?.company_name || 'Unknown'}
            </span>
            <span className="font-mono text-[10px] text-zinc-500">
              {assignment.contractor?.trade}
            </span>
          </div>
          <div className="font-mono text-[10px] text-zinc-400 line-clamp-1 mb-2">
            {assignment.scope_of_work}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500"
                  style={{ width: `${assignment.progress_percentage}%` }}
                />
              </div>
              <span className="font-mono text-[10px] text-zinc-500">{assignment.progress_percentage}%</span>
            </div>
            <span className="font-mono text-[10px] text-green-400">
              {formatCurrency(assignment.paid_amount, 'GHS')} / {formatCurrency(assignment.contract_amount, 'GHS')}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// =====================================================
// ROLE DISPLAY HELPERS
// =====================================================
const roleDisplayNames: Record<string, string> = {
  project_manager: 'Project Manager',
  site_manager: 'Site Manager',
  project_engineer: 'Project Engineer',
  quantity_surveyor: 'Quantity Surveyor',
  site_supervisor: 'Site Supervisor',
  foreman: 'Foreman',
  architect: 'Architect',
  structural_engineer: 'Structural Engineer',
  mep_engineer: 'MEP Engineer',
  civil_engineer: 'Civil Engineer',
  geotechnical_engineer: 'Geotech Engineer',
  environmental_consultant: 'Environmental',
  land_surveyor: 'Land Surveyor',
  interior_designer: 'Interior Designer',
  landscape_architect: 'Landscape Architect',
  cost_consultant: 'Cost Consultant',
  construction_manager: 'Construction Manager',
  health_safety_officer: 'H&S Officer',
  quality_control_inspector: 'QC Inspector',
  client_representative: 'Client Rep',
  legal_counsel: 'Legal Counsel',
  accountant: 'Accountant',
  procurement_officer: 'Procurement',
  admin: 'Admin',
}

function formatRole(role: string): string {
  return roleDisplayNames[role] || role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const roleCategoryColors: Record<string, string> = {
  professional: 'text-blue-400',
  construction: 'text-amber-400',
  government: 'text-purple-400',
  stakeholder: 'text-emerald-400',
  internal: 'text-zinc-400',
}

// =====================================================
// TEAM ROSTER (replaces ContractorList in sidebar)
// =====================================================
function TeamRoster({ teamMembers, projectManager, assignments }: {
  teamMembers: TeamMember[];
  projectManager: TeamMember | null;
  assignments: ContractorAssignment[];
}) {
  const activeMembers = teamMembers.filter(m => m.isActive)
  const hasAnyMembers = activeMembers.length > 0 || projectManager || assignments.length > 0

  if (!hasAnyMembers) {
    return (
      <div className="text-center py-4">
        <Users className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
        <p className="font-mono text-[10px] text-zinc-500">No team members assigned</p>
      </div>
    )
  }

  // Deduplicate PM from team members list
  const pmUserId = projectManager?.userId
  const otherMembers = activeMembers.filter(m => m.userId !== pmUserId)

  return (
    <div className="space-y-3">
      {/* Project Manager (highlighted) */}
      {projectManager && (
        <div className="p-2 bg-amber-900/15 border border-amber-800/50">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 flex items-center justify-center bg-amber-900/50 text-amber-500 font-mono text-[10px] font-bold flex-shrink-0">
              PM
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs text-white line-clamp-1">
                {projectManager.fullName || projectManager.userName || projectManager.userEmail || projectManager.contactEmail || 'Assigned PM'}
              </div>
              <div className="font-mono text-[10px] text-amber-500">Project Manager</div>
            </div>
          </div>
        </div>
      )}

      {/* Team members */}
      {otherMembers.length > 0 && (
        <div className="space-y-1.5">
          {otherMembers.slice(0, 8).map((member) => (
            <div key={member.id} className="flex items-center gap-2.5 p-1.5 bg-zinc-800/30 border border-zinc-800">
              <div className="w-6 h-6 flex items-center justify-center bg-zinc-800 text-zinc-400 font-mono text-[9px] font-bold flex-shrink-0 uppercase">
                {(member.fullName || member.userName || member.userEmail || '??').substring(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs text-white line-clamp-1">
                  {member.fullName || member.userName || member.userEmail || member.contactEmail || 'Unknown'}
                </div>
              </div>
              <span className={cn(
                "font-mono text-[9px] flex-shrink-0",
                roleCategoryColors[member.roleCategory] || 'text-zinc-500'
              )}>
                {formatRole(member.role)}
              </span>
            </div>
          ))}
          {otherMembers.length > 8 && (
            <div className="font-mono text-[10px] text-zinc-500 text-center py-1">
              +{otherMembers.length - 8} more members
            </div>
          )}
        </div>
      )}

      {/* Active contractors */}
      {assignments.length > 0 && (
        <>
          <div className="border-t border-zinc-800 pt-2">
            <div className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider mb-1.5">Contractors</div>
          </div>
          {assignments.slice(0, 4).map((assignment) => (
            <div key={assignment.id} className="flex items-center gap-2.5 p-1.5 bg-zinc-800/30 border border-zinc-800">
              <div className="w-6 h-6 flex items-center justify-center bg-zinc-800 text-green-500 font-mono text-[9px] font-bold flex-shrink-0">
                <HardHat className="h-3 w-3" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs text-white line-clamp-1">
                  {assignment.contractor?.company_name || 'Unknown'}
                </div>
              </div>
              <span className="font-mono text-[9px] text-zinc-500 flex-shrink-0">
                {assignment.contractor?.trade}
              </span>
            </div>
          ))}
          {assignments.length > 4 && (
            <div className="font-mono text-[10px] text-zinc-500 text-center py-1">
              +{assignments.length - 4} more contractors
            </div>
          )}
        </>
      )}
    </div>
  )
}

// =====================================================
// MAIN PAGE COMPONENT
// =====================================================
export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = params.id as string

  const validTabs = ['overview', 'construction', 'phases', 'rfis', 'submittals', 'change-orders', 'milestones', 'budget', 'contractors', 'team', 'documents']
  const initialTab = validTabs.includes(searchParams.get('tab') || '') ? searchParams.get('tab')! : 'overview'

  const [project, setProject] = useState<DevelopmentProject | null>(null)
  const [phases, setPhases] = useState<ProjectPhase[]>([])
  const [budget, setBudget] = useState<BudgetSummary | null>(null)
  const [assignments, setAssignments] = useState<ContractorAssignment[]>([])
  const [projectManager, setProjectManager] = useState<TeamMember | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [rfiStats, setRfiStats] = useState<RfiStats | null>(null)
  const [submittalStats, setSubmittalStats] = useState<SubmittalStats | null>(null)
  const [coStats, setCoStats] = useState<ChangeOrderStats | null>(null)
  const [punchStats, setPunchStats] = useState<PunchListStats | null>(null)
  const [documents, setDocuments] = useState<any[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(initialTab)

  // Sync tab to URL search param
  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    const url = new URL(window.location.href)
    if (tab === 'overview') {
      url.searchParams.delete('tab')
    } else {
      url.searchParams.set('tab', tab)
    }
    window.history.replaceState({}, '', url.toString())
  }

  // Phase dialog state
  const [showAddPhaseDialog, setShowAddPhaseDialog] = useState(false)
  const [isAddingPhase, setIsAddingPhase] = useState(false)
  const [phaseForm, setPhaseForm] = useState({
    name: '',
    description: '',
    planned_start_date: '',
    planned_end_date: '',
  })

  const handleAddPhase = async () => {
    if (!project || !phaseForm.name) return
    try {
      setIsAddingPhase(true)
      await phasesApi.create(project.id, {
        name: phaseForm.name,
        description: phaseForm.description || undefined,
        planned_start_date: phaseForm.planned_start_date || undefined,
        planned_end_date: phaseForm.planned_end_date || undefined,
        status: 'not_started',
      })
      const updatedPhases = await phasesApi.getByProject(project.id)
      setPhases(Array.isArray(updatedPhases) ? updatedPhases : [])
      setPhaseForm({ name: '', description: '', planned_start_date: '', planned_end_date: '' })
      setShowAddPhaseDialog(false)
    } catch (err) {
      console.error('Failed to create phase:', err)
    } finally {
      setIsAddingPhase(false)
    }
  }

  // Dialog states
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  // Document form data
  const [documentForm, setDocumentForm] = useState({
    name: '',
    category: 'contract',
    file: null as File | null,
  })

  // Fetch documents for this project
  const fetchDocuments = async () => {
    try {
      const res = await authedFetch(`/api/projects/${projectId}/documents`)
      if (res.ok) {
        const data = await res.json()
        setDocuments(Array.isArray(data) ? data : [])
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err)
    }
  }

  // Fetch all data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const [projectRes, phasesRes, budgetRes, assignmentsRes, teamRes] = await Promise.all([
          projectsApi.getById(projectId),
          phasesApi.getByProject(projectId),
          costsApi.getBudgetSummary(projectId).catch(() => null),
          assignmentsApi.getByProject(projectId).catch(() => []),
          teamApi.getProjectTeam(projectId).catch(() => []),
        ])

        // Fetch PM data stats (non-blocking)
        const [rfiStatsRes, submittalStatsRes, coStatsRes, punchStatsRes] = await Promise.all([
          rfiApi.getStats(projectId).catch(() => null),
          submittalApi.getStats(projectId).catch(() => null),
          changeOrderApi.getStats(projectId).catch(() => null),
          punchListApi.getStats(projectId).catch(() => null),
        ])

        const teamMembers = Array.isArray(teamRes) ? teamRes : []
        const pmFromTeam = teamMembers.find((member: any) =>
          member?.roleType === 'project_manager' ||
          member?.role === 'project_manager' ||
          member?.role === 'Project Manager'
        )

        let resolvedPm = pmFromTeam || null

        if (!resolvedPm && projectRes?.project_manager_id && projectRes?.organization_id) {
          const orgMembers = await teamApi.getMembers({
            organizationId: projectRes.organization_id,
            role: 'project_manager',
            isActive: true,
            limit: 200,
          })
          resolvedPm = orgMembers.data.find((member) => member.userId === projectRes.project_manager_id) || null
        }

        setProject(projectRes)
        setPhases(phasesRes || [])
        setBudget(budgetRes)
        setAssignments(assignmentsRes || [])
        setProjectManager(resolvedPm)
        setTeamMembers(teamMembers)
        setRfiStats(rfiStatsRes)
        setSubmittalStats(submittalStatsRes)
        setCoStats(coStatsRes)
        setPunchStats(punchStatsRes)

        // Fetch documents (non-blocking)
        try {
          const docsRes = await authedFetch(`/api/projects/${projectId}/documents`)
          if (docsRes.ok) {
            const docsData = await docsRes.json()
            setDocuments(Array.isArray(docsData) ? docsData : [])
          }
        } catch (err) {
          console.error('Failed to fetch documents:', err)
        }
      } catch (err: any) {
        console.error('Failed to fetch project:', err)
        setError(err.message || 'Failed to load project')
      } finally {
        setIsLoading(false)
      }
    }

    if (projectId) {
      fetchData()
    }
  }, [projectId])

  // Handle document upload
  const handleUploadDocument = async () => {
    if (!documentForm.name || !documentForm.file) return

    try {
      setIsUploading(true)

      // Create form data
      const formData = new FormData()
      formData.append('file', documentForm.file)
      formData.append('name', documentForm.name)
      formData.append('document_type', documentForm.category)

      // Upload via API — uses /api proxy which rewrites to backend
      const res = await authedFetch(`/api/projects/${projectId}/documents`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error?.message || errData.message || `Upload failed (${res.status})`)
      }

      // Reset form and close
      setDocumentForm({ name: '', category: 'contract', file: null })
      setShowUploadDialog(false)
      // Refresh the documents list
      await fetchDocuments()
    } catch (err: any) {
      console.error('Failed to upload document:', err)
      alert(err.message || 'Failed to upload document')
    } finally {
      setIsUploading(false)
    }
  }

  // Handle document download
  const handleDownloadDocument = async (docId: string) => {
    try {
      const res = await authedFetch(`/api/projects/${projectId}/documents/${docId}/download`)
      if (!res.ok) throw new Error('Download failed')
      const data = await res.json()
      if (data.download_url) {
        window.open(data.download_url, '_blank')
      }
    } catch (err: any) {
      console.error('Failed to download document:', err)
      alert(err.message || 'Failed to download document')
    }
  }

  // Handle document delete
  const handleDeleteDocument = async (docId: string, docName: string) => {
    if (!confirm(`Delete "${docName}"? This action cannot be undone.`)) return
    try {
      const res = await authedFetch(`/api/projects/${projectId}/documents/${docId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Delete failed')
      await fetchDocuments()
    } catch (err: any) {
      console.error('Failed to delete document:', err)
      alert(err.message || 'Failed to delete document')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-zinc-950 p-6">
        <div className="border border-red-800 bg-red-900/20 p-6 text-center">
          <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="font-mono text-sm text-red-400">{error || 'Project not found'}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push('/dashboard/projects')}
          >
            Back to Projects
          </Button>
        </div>
      </div>
    )
  }

  const statusConfig = statusColors[project.status]

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <ProjectHeader
        project={project}
        isLoading={isLoading}
        projectManagerName={
          projectManager?.userName ||
          projectManager?.userEmail ||
          projectManager?.contactEmail ||
          null
        }
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <div className="border-b border-zinc-800">
          <TabsList className="bg-transparent p-0 h-auto gap-0 w-full justify-start">
            {[
              { value: 'overview', label: 'Overview', icon: BarChart3 },
              { value: 'construction', label: 'Site Ops', icon: ClipboardType },
              { value: 'phases', label: 'Phases', icon: Layers },
              { value: 'rfis', label: 'RFIs', icon: MessageSquare },
              { value: 'submittals', label: 'Submittals', icon: FileCheck2 },
              { value: 'change-orders', label: 'Change Orders', icon: FileEdit },
              { value: 'milestones', label: 'Milestones', icon: Flag },
              { value: 'budget', label: 'Budget', icon: DollarSign },
              { value: 'contractors', label: 'Contractors', icon: HardHat },
              { value: 'team', label: 'Team', icon: Users },
              { value: 'documents', label: 'Documents', icon: FileText },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={cn(
                  "font-mono text-xs px-4 py-2 rounded-none border-b-2 data-[state=active]:border-amber-500 data-[state=active]:text-amber-500",
                  "data-[state=inactive]:border-transparent data-[state=inactive]:text-zinc-500"
                )}
              >
                <tab.icon className="h-3 w-3 mr-1.5" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <ProjectMetrics
            project={project}
            phases={phases}
            budget={budget || undefined}
            currency={project.currency}
            rfiStats={rfiStats || undefined}
            coStats={coStats || undefined}
          />

          {/* Quick Stats Row — RFIs, Submittals, Change Orders, Punch Lists */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Open RFIs</span>
                <MessageSquare className="h-3.5 w-3.5 text-blue-400" />
              </div>
              <div className="font-mono text-lg text-white">{rfiStats ? (rfiStats.total - (rfiStats.by_status?.['closed'] || 0)) : 0}</div>
              {rfiStats && rfiStats.overdue > 0 && (
                <div className="font-mono text-[10px] text-red-400 mt-0.5">{rfiStats.overdue} overdue</div>
              )}
            </div>
            <div className="border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Submittals</span>
                <FileCheck2 className="h-3.5 w-3.5 text-purple-400" />
              </div>
              <div className="font-mono text-lg text-white">{submittalStats ? (submittalStats.total - (submittalStats.by_status?.['approved'] || 0) - (submittalStats.by_status?.['approved_as_noted'] || 0)) : 0}</div>
              {submittalStats && submittalStats.overdue > 0 && (
                <div className="font-mono text-[10px] text-red-400 mt-0.5">{submittalStats.overdue} overdue</div>
              )}
            </div>
            <div className="border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Change Orders</span>
                <FileEdit className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <div className="font-mono text-lg text-white">{coStats?.total_pending || 0}</div>
              {coStats && coStats.total_cost_impact !== 0 && (
                <div className={cn("font-mono text-[10px] mt-0.5", coStats.total_cost_impact > 0 ? 'text-red-400' : 'text-emerald-400')}>
                  {coStats.total_cost_impact > 0 ? '+' : ''}{formatCurrency(coStats.total_cost_impact, project.currency)} impact
                </div>
              )}
            </div>
            <div className="border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Punch List</span>
                <ClipboardType className="h-3.5 w-3.5 text-orange-400" />
              </div>
              <div className="font-mono text-lg text-white">{punchStats ? (punchStats.total - (punchStats.by_status?.['closed'] || 0) - (punchStats.by_status?.['completed'] || 0)) : 0}</div>
            </div>
            <div className="border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Schedule</span>
                <Calendar className="h-3.5 w-3.5 text-indigo-400" />
              </div>
              {project.planned_end_date ? (
                <>
                  <div className="font-mono text-xs text-white">{new Date(project.planned_end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  <div className="font-mono text-[10px] text-zinc-500 mt-0.5">Target completion</div>
                </>
              ) : (
                <div className="font-mono text-xs text-zinc-500">Not set</div>
              )}
            </div>
            <div className="border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Team</span>
                <Users className="h-3.5 w-3.5 text-green-400" />
              </div>
              <div className="font-mono text-lg text-white">{teamMembers.filter(m => m.isActive).length + assignments.filter(a => a.is_active).length}</div>
              <div className="font-mono text-[10px] text-zinc-500 mt-0.5">{teamMembers.filter(m => m.isActive).length} members · {assignments.filter(a => a.is_active).length} contractors</div>
            </div>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Timeline */}
            <div className="lg:col-span-2 space-y-6">
              <Panel title="PROJECT TIMELINE">
                {phases.length > 0 ? (
                  <GanttChart
                    phases={phases}
                    projectStart={project.planned_start_date}
                    projectEnd={project.planned_end_date}
                  />
                ) : (
                  <div className="text-center py-8">
                    <Clock className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                    <p className="font-mono text-[10px] text-zinc-500">No phases defined yet</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 font-mono text-xs"
                      onClick={() => handleTabChange('phases')}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Phases
                    </Button>
                  </div>
                )}
              </Panel>
            </div>

            {/* Right Column - Sidebar */}
            <div className="space-y-6">
              {/* Budget Summary */}
              {budget && (
                <Panel title="BUDGET SUMMARY">
                  <BudgetOverview
                    budget={budget}
                    projectId={projectId}
                    projectBudget={project.total_budget}
                    currency={project.display_currency || 'GHS'}
                  />
                </Panel>
              )}

              {/* Active Team */}
              <Panel
                title="ACTIVE TEAM"
                action={
                  <Button variant="ghost" size="sm" className="h-5 font-mono text-[10px] text-zinc-500 hover:text-amber-500" onClick={() => handleTabChange('team')}>
                    Manage
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                }
              >
                <TeamRoster
                  teamMembers={teamMembers}
                  projectManager={projectManager}
                  assignments={assignments.filter(a => a.is_active)}
                />
              </Panel>

              {/* Upcoming Milestones */}
              {phases.length > 0 && (
                <Panel title="UPCOMING MILESTONES">
                  {(() => {
                    const allMilestones = phases.flatMap(p =>
                      (p.milestones || []).map(m => ({ ...m, phase_name: p.phase_name }))
                    )
                    const upcoming = allMilestones
                      .filter(m => !m.is_completed && m.target_date)
                      .sort((a, b) => new Date(a.target_date!).getTime() - new Date(b.target_date!).getTime())
                      .slice(0, 5)

                    if (upcoming.length === 0) return (
                      <div className="text-center py-4">
                        <Flag className="h-6 w-6 text-zinc-700 mx-auto mb-2" />
                        <p className="font-mono text-[10px] text-zinc-500">No upcoming milestones</p>
                      </div>
                    )

                    return (
                      <div className="space-y-2">
                        {upcoming.map((m, i) => {
                          const daysUntil = m.target_date ? Math.ceil((new Date(m.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0
                          const isOverdue = daysUntil < 0
                          return (
                            <div key={m.id || i} className="flex items-start gap-2 p-2 bg-zinc-800/30 border border-zinc-800">
                              <div className={cn(
                                "w-2 h-2 mt-1.5 rotate-45 flex-shrink-0",
                                isOverdue ? "bg-red-500" : daysUntil <= 7 ? "bg-amber-500" : "bg-zinc-600"
                              )} />
                              <div className="flex-1 min-w-0">
                                <div className="font-mono text-xs text-white line-clamp-1">{m.name}</div>
                                <div className="font-mono text-[10px] text-zinc-500">{m.phase_name}</div>
                              </div>
                              <div className={cn(
                                "font-mono text-[10px] flex-shrink-0",
                                isOverdue ? "text-red-400" : daysUntil <= 7 ? "text-amber-400" : "text-zinc-500"
                              )}>
                                {isOverdue ? `${Math.abs(daysUntil)}d late` : daysUntil === 0 ? 'Today' : `${daysUntil}d`}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </Panel>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Construction / Site Ops */}
        <TabsContent value="construction" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <SiteDiaryLog projectId={projectId} />
            <PettyCashLedger projectId={projectId} currency={project.currency} />
            <MaterialPriceTracker defaultRegion={project.region || 'Greater Accra'} />
          </div>
        </TabsContent>

        {/* Phases Tab */}
        <TabsContent value="phases" className="mt-0">
          <div className="space-y-6">
            {/* Enhanced Gantt Chart */}
            <ProjectGantt
              projectId={project.id}
              onPhaseEdit={(phase) => console.log('Edit phase:', phase)}
              onMilestoneEdit={(milestone) => console.log('Edit milestone:', milestone)}
            />

            {/* Phase List */}
            <Panel
              title="PHASE DETAILS"
              action={
                <Button size="sm" onClick={() => setShowAddPhaseDialog(true)} className="h-6 font-mono text-[10px] bg-amber-600 hover:bg-amber-700 text-white">
                  <Plus className="h-3 w-3 mr-1" />
                  Add Phase
                </Button>
              }
            >
              {phases.length > 0 ? (
                <PhaseHierarchy
                  projectId={project.id}
                  phases={phases}
                  onPhasesRefresh={async () => {
                    try {
                      const res = await phasesApi.getByProject(project.id)
                      setPhases(Array.isArray(res) ? res : [])
                    } catch (e) {
                      console.error('Failed to refresh phases:', e)
                    }
                  }}
                />
              ) : (
                <div className="text-center py-12">
                  <Layers className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
                  <h3 className="font-mono text-sm text-white mb-2">No phases defined</h3>
                  <p className="font-mono text-[10px] text-zinc-500 mb-4">
                    Add phases to track construction progress and milestones
                  </p>
                  <Button onClick={() => setShowAddPhaseDialog(true)} className="bg-amber-600 hover:bg-amber-700 text-white font-mono text-xs">
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Phase
                  </Button>
                </div>
              )}
            </Panel>
          </div>
        </TabsContent>

        {/* RFIs Tab - Client views and responds to PM RFIs */}
        <TabsContent value="rfis" className="mt-0">
          <Panel title="REQUESTS FOR INFORMATION (RFIs)">
            <RFIsTab
              projectId={projectId}
              organizationId={project.organization_id}
            />
          </Panel>
        </TabsContent>

        {/* Submittals Tab - Client reviews PM submittals */}
        <TabsContent value="submittals" className="mt-0">
          <Panel title="SUBMITTALS">
            <SubmittalsTab
              projectId={projectId}
              organizationId={project.organization_id}
            />
          </Panel>
        </TabsContent>

        {/* Change Orders Tab - Client approves/rejects PM change orders */}
        <TabsContent value="change-orders" className="mt-0">
          <Panel title="CHANGE ORDERS">
            <ChangeOrdersTab
              projectId={projectId}
              organizationId={project.organization_id}
              currency={project.currency}
            />
          </Panel>
        </TabsContent>

        {/* Milestones Tab - PM creates, client approves */}
        <TabsContent value="milestones" className="mt-0">
          <Panel title="PROJECT MILESTONES">
            <MilestonesTab
              projectId={projectId}
              organizationId={project.organization_id}
              frameworkId={project.milestone_framework_id}
              canManage={true}
            />
          </Panel>
        </TabsContent>

        {/* Budget Tab */}
        <TabsContent value="budget" className="mt-0">
          {(budget || project.total_budget) ? (
            <div className="space-y-6">
              <Panel title="BUDGET OVERVIEW">
                <BudgetOverview
                  budget={budget || {
                    project_id: projectId,
                    total_original_budget: 0,
                    total_revised_budget: 0,
                    total_committed: 0,
                    total_pending: 0,
                    total_projected: 0,
                    total_actual: 0,
                    total_variance: 0,
                    by_category: [],
                    health: 'on_budget'
                  }}
                  projectId={projectId}
                  projectBudget={project.total_budget}
                  onBudgetUpdate={async () => {
                    // Refresh budget and project data
                    const [newBudget, newProject] = await Promise.all([
                      costsApi.getBudgetSummary(projectId).catch(() => null),
                      projectsApi.getById(projectId),
                    ])
                    setBudget(newBudget)
                    setProject(newProject)
                  }}
                />
              </Panel>
            </div>
          ) : (
            <Panel title="BUDGET">
              <div className="text-center py-12">
                <DollarSign className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
                <h3 className="font-mono text-sm text-white mb-2">No budget defined</h3>
                <p className="font-mono text-[10px] text-zinc-500 mb-4">
                  Set up cost codes to track project budget
                </p>
                <Button className="bg-amber-600 hover:bg-amber-700 text-white font-mono text-xs">
                  <Plus className="h-4 w-4 mr-2" />
                  Setup Budget
                </Button>
              </div>
            </Panel>
          )}
        </TabsContent>

        {/* Contractors Tab */}
        <TabsContent value="contractors" className="mt-0">
          <Panel
            title="CONTRACTORS"
            action={
              <Button size="sm" className="h-6 font-mono text-[10px] bg-amber-600 hover:bg-amber-700 text-white">
                <Plus className="h-3 w-3 mr-1" />
                Assign Contractor
              </Button>
            }
          >
            <ContractorList assignments={assignments} />
          </Panel>
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team" className="mt-0">
          <Panel
            title="PROJECT TEAM"
            action={
              <Link href={`/dashboard/projects/${projectId}/team`}>
                <Button size="sm" className="h-6 font-mono text-[10px] bg-amber-600 hover:bg-amber-700 text-white">
                  Manage Team
                </Button>
              </Link>
            }
          >
            <div className="space-y-4">
              {/* Project Manager */}
              {projectManager ? (
                <div className="flex items-center gap-3 p-3 bg-zinc-800/50 border border-zinc-700 rounded">
                  <div className="h-10 w-10 bg-amber-600 rounded-full flex items-center justify-center">
                    <span className="font-mono text-sm text-white font-bold">
                      {(projectManager.fullName || projectManager.userName || 'PM')
                        .split(' ')
                        .map(n => n[0])
                        .join('')
                        .slice(0, 2)}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="font-mono text-sm text-white">
                      {projectManager.fullName || projectManager.userName || projectManager.email || projectManager.userEmail || projectManager.contactEmail || 'Project Manager'}
                    </p>
                    <p className="font-mono text-[10px] text-amber-500">Project Manager</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
                  <p className="font-mono text-xs text-zinc-400 mb-2">No project manager assigned</p>
                  <Link href={`/dashboard/projects/${projectId}/team`}>
                    <Button size="sm" className="font-mono text-xs bg-amber-600 hover:bg-amber-700 text-white">
                      <Plus className="h-3 w-3 mr-1" />
                      Assign PM
                    </Button>
                  </Link>
                </div>
              )}

              {/* View Full Team Link */}
              <div className="pt-3 border-t border-zinc-800 text-center">
                <Link
                  href={`/dashboard/projects/${projectId}/team`}
                  className="font-mono text-xs text-amber-500 hover:text-amber-400"
                >
                  View & Manage Full Team →
                </Link>
              </div>
            </div>
          </Panel>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-0">
          <Panel
            title="DOCUMENTS"
            action={
              <Button
                size="sm"
                className="h-6 font-mono text-[10px] bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => setShowUploadDialog(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Upload
              </Button>
            }
          >
            {documents.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
                <h3 className="font-mono text-sm text-white mb-2">No documents yet</h3>
                <p className="font-mono text-[10px] text-zinc-500 mb-4">
                  Upload project documents, contracts, and permits
                </p>
                <Button
                  className="bg-amber-600 hover:bg-amber-700 text-white font-mono text-xs"
                  onClick={() => setShowUploadDialog(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Upload Document
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc: any) => {
                  const ext = (doc.original_filename || doc.name || '').split('.').pop()?.toLowerCase() || ''
                  const sizeKb = doc.file_size ? (doc.file_size / 1024).toFixed(0) : null
                  const sizeMb = doc.file_size && doc.file_size > 1024 * 1024 ? (doc.file_size / (1024 * 1024)).toFixed(1) : null
                  const sizeLabel = sizeMb ? `${sizeMb} MB` : sizeKb ? `${sizeKb} KB` : ''
                  const date = doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-GB') : ''
                  const docType = doc.document_type?.replace(/_/g, ' ') || doc.category || 'Uncategorized'
                  const uploader = doc.uploaded_by_name || '—'

                  return (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 p-3 bg-zinc-800/50 border border-zinc-700 rounded hover:border-zinc-600 transition-colors group"
                    >
                      {/* File icon */}
                      <div className="flex-shrink-0 h-9 w-9 bg-amber-900/40 border border-amber-700/50 rounded flex items-center justify-center">
                        <span className="font-mono text-[9px] text-amber-400 uppercase">{ext || 'DOC'}</span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <button
                          className="font-mono text-xs text-white truncate block hover:text-amber-500 transition-colors cursor-pointer text-left max-w-full"
                          onClick={() => handleDownloadDocument(doc.id)}
                          title="Click to open document"
                        >
                          {doc.name}
                        </button>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-[10px] text-amber-500/80 capitalize">{docType}</span>
                          <span className="text-zinc-600">·</span>
                          <span className="font-mono text-[10px] text-zinc-500">{sizeLabel || '—'}</span>
                          <span className="text-zinc-600">·</span>
                          <span className="font-mono text-[10px] text-zinc-500">{date}</span>
                          <span className="text-zinc-600">·</span>
                          <span className="font-mono text-[10px] text-zinc-400">by {uploader}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex-shrink-0 flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 font-mono text-[10px] text-zinc-300 border-zinc-700 hover:border-amber-600 hover:text-amber-500 bg-transparent"
                          onClick={() => handleDownloadDocument(doc.id)}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 font-mono text-[10px] text-zinc-400 border-zinc-700 hover:border-red-600 hover:text-red-500 bg-transparent"
                          onClick={() => handleDeleteDocument(doc.id, doc.name)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      {/* Upload Document Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono">Upload Document</DialogTitle>
            <DialogDescription className="font-mono text-xs text-zinc-400">
              Upload a document to this project
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label className="font-mono text-xs text-zinc-300">Document Name *</Label>
              <Input
                value={documentForm.name}
                onChange={(e) => setDocumentForm({ ...documentForm, name: e.target.value })}
                placeholder="e.g., Building Permit"
                className="bg-zinc-800 border-zinc-700 font-mono text-sm text-white placeholder:text-zinc-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-mono text-xs text-zinc-300">Document Type *</Label>
              <Select
                value={documentForm.category}
                onValueChange={(v) => setDocumentForm({ ...documentForm, category: v })}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 font-mono text-sm text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="permit">Permit</SelectItem>
                  <SelectItem value="drawing">Design / Drawing</SelectItem>
                  <SelectItem value="submittal">Submittal</SelectItem>
                  <SelectItem value="rfi">RFI</SelectItem>
                  <SelectItem value="report">Report</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="photo">Photo</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="font-mono text-xs text-zinc-300">File *</Label>
              <div className="border-2 border-dashed border-zinc-700 rounded-lg p-6 text-center hover:border-amber-600/50 transition-colors">
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setDocumentForm({ ...documentForm, file, name: documentForm.name || file.name })
                    }
                  }}
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  {documentForm.file ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="h-6 w-6 text-amber-500" />
                      <span className="font-mono text-xs text-white">{documentForm.file.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.preventDefault()
                          setDocumentForm({ ...documentForm, file: null })
                        }}
                      >
                        <X className="h-4 w-4 text-zinc-400" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                      <p className="font-mono text-xs text-zinc-400">Click to upload or drag and drop</p>
                      <p className="font-mono text-[10px] text-zinc-600 mt-1">PDF, DOC, XLS, JPG up to 10MB</p>
                    </>
                  )}
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowUploadDialog(false)}
              className="font-mono text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUploadDocument}
              disabled={isUploading || !documentForm.name || !documentForm.file}
              className="bg-amber-600 hover:bg-amber-700 text-white font-mono text-xs"
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Phase Dialog */}
      <Dialog open={showAddPhaseDialog} onOpenChange={setShowAddPhaseDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono">Add Phase</DialogTitle>
            <DialogDescription className="font-mono text-xs text-zinc-400">
              Create a new construction phase for this project
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label className="font-mono text-xs text-zinc-300">Phase Name *</Label>
              <Input
                value={phaseForm.name}
                onChange={(e) => setPhaseForm({ ...phaseForm, name: e.target.value })}
                placeholder="e.g., Foundation, Structure, Finishing"
                className="bg-zinc-800 border-zinc-700 font-mono text-sm text-white placeholder:text-zinc-500"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-xs text-zinc-300">Description</Label>
              <Input
                value={phaseForm.description}
                onChange={(e) => setPhaseForm({ ...phaseForm, description: e.target.value })}
                placeholder="Optional description"
                className="bg-zinc-800 border-zinc-700 font-mono text-sm text-white placeholder:text-zinc-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="font-mono text-xs text-zinc-300">Start Date</Label>
                <Input
                  type="date"
                  value={phaseForm.planned_start_date}
                  onChange={(e) => setPhaseForm({ ...phaseForm, planned_start_date: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 font-mono text-sm text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-xs text-zinc-300">End Date</Label>
                <Input
                  type="date"
                  value={phaseForm.planned_end_date}
                  onChange={(e) => setPhaseForm({ ...phaseForm, planned_end_date: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 font-mono text-sm text-white"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPhaseDialog(false)} className="font-mono text-xs">
              Cancel
            </Button>
            <Button
              onClick={handleAddPhase}
              disabled={isAddingPhase || !phaseForm.name}
              className="bg-amber-600 hover:bg-amber-700 text-white font-mono text-xs"
            >
              {isAddingPhase ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Create Phase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Workspace Collaboration Widget */}
      {project && (
        <WorkspaceWidget
          entityType="project"
          entityId={project.id}
          entityName={project.project_name || project.name}
          currentUserId={null /* TODO: inject from auth context */}
          token={null}
        />
      )}
    </div>
  )
}
