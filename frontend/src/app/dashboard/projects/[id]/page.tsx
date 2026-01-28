'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
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
  Home,
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
  Grid3X3,
  Upload,
  Pencil,
  X,
  Check,
  ClipboardType,
  MessageSquare,
  FileCheck2,
  FileEdit,
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
import { projectsApi, phasesApi, unitsApi, costsApi, assignmentsApi } from '@/lib/projects-api'
import { teamApi, TeamMember } from '@/lib/team-api'
import { ProjectGantt } from '@/components/projects/gantt'
import { SiteDiaryLog } from '@/components/projects/construction/SiteDiaryLog'
import { PettyCashLedger } from '@/components/projects/construction/PettyCashLedger'
import { MaterialPriceTracker } from '@/components/projects/construction/MaterialPriceTracker'
import { RFIsTab, SubmittalsTab, ChangeOrdersTab, MilestonesTab } from '@/components/projects/pm-data'
import type { 
  DevelopmentProject, 
  ProjectPhase, 
  ProjectUnit, 
  ProjectCost, 
  BudgetSummary,
  ContractorAssignment,
  GanttData,
  UnitStats,
  ProjectStatus,
  PhaseStatus,
  UnitStatus,
} from '@/types/projects'
import { formatCurrency } from '@/lib/utils'

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

const unitStatusColors: Record<UnitStatus, { bg: string; text: string; label: string }> = {
  available: { bg: 'bg-green-900/50', text: 'text-green-400', label: 'Available' },
  reserved: { bg: 'bg-yellow-900/50', text: 'text-yellow-400', label: 'Reserved' },
  under_contract: { bg: 'bg-blue-900/50', text: 'text-blue-400', label: 'Contract' },
  sold: { bg: 'bg-purple-900/50', text: 'text-purple-400', label: 'Sold' },
  under_construction: { bg: 'bg-amber-900/50', text: 'text-amber-400', label: 'Building' },
  completed: { bg: 'bg-teal-900/50', text: 'text-teal-400', label: 'Ready' },
  handed_over: { bg: 'bg-emerald-900/50', text: 'text-emerald-400', label: 'Handed Over' },
  not_for_sale: { bg: 'bg-zinc-800/50', text: 'text-zinc-500', label: 'N/A' },
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
// UNIT GRID
// =====================================================
function UnitGrid({ units }: { units: ProjectUnit[] }) {
  // Group by building and floor
  const grouped = useMemo(() => {
    const byBuilding: Record<string, Record<number, ProjectUnit[]>> = {}
    
    units.forEach(unit => {
      const building = unit.building || 'Main'
      const floor = unit.floor || 0
      
      if (!byBuilding[building]) byBuilding[building] = {}
      if (!byBuilding[building][floor]) byBuilding[building][floor] = []
      byBuilding[building][floor].push(unit)
    })
    
    return byBuilding
  }, [units])
  
  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([building, floors]) => (
        <div key={building}>
          <h4 className="font-mono text-[10px] text-zinc-500 mb-2 uppercase">{building}</h4>
          <div className="space-y-1">
            {Object.entries(floors)
              .sort(([a], [b]) => Number(b) - Number(a))
              .map(([floor, floorUnits]) => (
                <div key={floor} className="flex items-center gap-1">
                  <span className="w-8 font-mono text-[10px] text-zinc-600">F{floor}</span>
                  <div className="flex gap-1 flex-wrap">
                    {floorUnits
                      .sort((a, b) => a.unit_number.localeCompare(b.unit_number))
                      .map(unit => {
                        const config = unitStatusColors[unit.status]
                        return (
                          <Link 
                            key={unit.id}
                            href={`/dashboard/projects/units/${unit.id}`}
                            className={cn(
                              "w-10 h-8 flex items-center justify-center border transition-all hover:scale-105",
                              config.bg,
                              "border-zinc-700 hover:border-amber-500/50"
                            )}
                            title={`${unit.unit_number} - ${config.label} - ${unit.final_price ? formatCurrency(unit.final_price, unit.currency) : 'TBD'}`}
                          >
                            <span className={cn("font-mono text-[9px]", config.text)}>
                              {unit.unit_number.replace(/^[A-Z]+-/, '')}
                            </span>
                          </Link>
                        )
                      })}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
      
      {/* Legend */}
      <div className="flex flex-wrap gap-3 pt-3 border-t border-zinc-800">
        {Object.entries(unitStatusColors).map(([status, config]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={cn("w-3 h-3", config.bg, "border border-zinc-700")} />
            <span className="font-mono text-[9px] text-zinc-500">{config.label}</span>
          </div>
        ))}
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
            className="h-6 font-mono text-[10px] bg-amber-600 hover:bg-amber-700 text-black"
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
              className="font-mono text-xs bg-amber-600 hover:bg-amber-700 text-black"
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
              className="bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs"
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
// PHASE LIST
// =====================================================
function PhaseList({ phases }: { phases: ProjectPhase[] }) {
  return (
    <div className="space-y-2">
      {phases
        .sort((a, b) => a.phase_number - b.phase_number)
        .map((phase) => {
          const config = phaseStatusColors[phase.status]
          return (
            <div 
              key={phase.id}
              className="flex items-center gap-3 p-2 bg-zinc-800/30 border border-zinc-800 hover:border-zinc-700 cursor-pointer"
            >
              <div className="w-6 h-6 flex items-center justify-center bg-zinc-800 font-mono text-[10px] text-amber-500">
                {phase.phase_number}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs text-white line-clamp-1">{phase.phase_name}</div>
                <div className="font-mono text-[10px] text-zinc-500">
                  {phase.milestones?.length || 0} milestones
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-500"
                    style={{ width: `${phase.progress_percentage}%` }}
                  />
                </div>
                <span className={cn("font-mono text-[10px] px-1.5 py-0.5", config.bg, config.text)}>
                  {phase.status.replace('_', ' ').toUpperCase()}
                </span>
              </div>
            </div>
          )
        })}
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
// MAIN PAGE COMPONENT
// =====================================================
export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  
  const [project, setProject] = useState<DevelopmentProject | null>(null)
  const [phases, setPhases] = useState<ProjectPhase[]>([])
  const [units, setUnits] = useState<ProjectUnit[]>([])
  const [budget, setBudget] = useState<BudgetSummary | null>(null)
  const [assignments, setAssignments] = useState<ContractorAssignment[]>([])
  const [unitStats, setUnitStats] = useState<UnitStats | null>(null)
  const [projectManager, setProjectManager] = useState<TeamMember | null>(null)
  
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')
  
  // Dialog states
  const [showAddUnitDialog, setShowAddUnitDialog] = useState(false)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [isAddingUnit, setIsAddingUnit] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  
  // Unit form data
  const [unitForm, setUnitForm] = useState({
    unit_number: '',
    unit_type: 'apartment',
    floor: '1',
    bedrooms: '1',
    bathrooms: '1',
    internal_area_sqm: '',
    base_price: '',
    status: 'available',
  })
  
  // Document form data
  const [documentForm, setDocumentForm] = useState({
    name: '',
    category: 'contracts',
    file: null as File | null,
  })
  
  // Fetch all data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        const [projectRes, phasesRes, unitsRes, budgetRes, assignmentsRes, statsRes, teamRes] = await Promise.all([
          projectsApi.getById(projectId),
          phasesApi.getByProject(projectId),
          unitsApi.getByProject(projectId, { limit: 200 }),
          costsApi.getBudgetSummary(projectId).catch(() => null),
          assignmentsApi.getByProject(projectId).catch(() => []),
          unitsApi.getStats(projectId).catch(() => null),
          teamApi.getProjectTeam(projectId).catch(() => []),
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
        setUnits(unitsRes?.data || [])
        setBudget(budgetRes)
        setAssignments(assignmentsRes || [])
        setUnitStats(statsRes)
        setProjectManager(resolvedPm)
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
  
  // Handle add unit
  const handleAddUnit = async () => {
    if (!unitForm.unit_number || !unitForm.base_price) return
    
    try {
      setIsAddingUnit(true)
      await unitsApi.create(projectId, {
        unit_number: unitForm.unit_number,
        unit_type: unitForm.unit_type as any,
        floor: parseInt(unitForm.floor) || 1,
        bedrooms: parseInt(unitForm.bedrooms) || 1,
        bathrooms: parseInt(unitForm.bathrooms) || 1,
        internal_area_sqm: parseFloat(unitForm.internal_area_sqm) || undefined,
        base_price: parseFloat(unitForm.base_price),
        status: unitForm.status as any,
      })
      
      // Refresh units
      const [unitsRes, statsRes] = await Promise.all([
        unitsApi.getByProject(projectId, { limit: 200 }),
        unitsApi.getStats(projectId).catch(() => null),
      ])
      setUnits(unitsRes?.data || [])
      setUnitStats(statsRes)
      
      // Reset form and close
      setUnitForm({
        unit_number: '',
        unit_type: 'apartment',
        floor: '1',
        bedrooms: '1',
        bathrooms: '1',
        internal_area_sqm: '',
        base_price: '',
        status: 'available',
      })
      setShowAddUnitDialog(false)
    } catch (err) {
      console.error('Failed to add unit:', err)
    } finally {
      setIsAddingUnit(false)
    }
  }
  
  // Handle document upload
  const handleUploadDocument = async () => {
    if (!documentForm.name || !documentForm.file) return
    
    try {
      setIsUploading(true)
      
      // Create form data
      const formData = new FormData()
      formData.append('file', documentForm.file)
      formData.append('name', documentForm.name)
      formData.append('category', documentForm.category)
      
      // Upload via API (adjust endpoint as needed)
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'}/projects/${projectId}/documents`, {
        method: 'POST',
        body: formData,
      })
      
      // Reset form and close
      setDocumentForm({ name: '', category: 'contracts', file: null })
      setShowUploadDialog(false)
    } catch (err) {
      console.error('Failed to upload document:', err)
    } finally {
      setIsUploading(false)
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
  const salesProgress = project.total_units 
    ? Math.round(((project.units_sold || 0) / project.total_units) * 100)
    : 0
  
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
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="border-b border-zinc-800">
          <TabsList className="bg-transparent p-0 h-auto gap-0 w-full justify-start">
            {[
              { value: 'overview', label: 'Overview', icon: BarChart3 },
              { value: 'construction', label: 'Site Ops', icon:  ClipboardType },
              { value: 'phases', label: 'Phases', icon: Layers },
              { value: 'units', label: 'Units', icon: Grid3X3 },
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
                budget={budget || undefined} 
                units={unitStats || undefined} 
                currency={project.currency}
            />
            
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
                      <Button variant="outline" size="sm" className="mt-2 font-mono text-xs">
                        <Plus className="h-3 w-3 mr-1" />
                        Add Phases
                      </Button>
                    </div>
                  )}
                </Panel>
                
                {/* Unit Availability Grid */}
                {units.length > 0 && (
                  <Panel 
                    title="UNIT AVAILABILITY" 
                    action={
                      <Link href={`/dashboard/projects/${project.id}/units`}>
                        <Button variant="ghost" size="sm" className="h-5 font-mono text-[10px] text-zinc-500 hover:text-amber-500">
                          View All
                          <ChevronRight className="h-3 w-3 ml-1" />
                        </Button>
                      </Link>
                    }
                  >
                    <UnitGrid units={units.slice(0, 50)} />
                  </Panel>
                )}
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
                
                {/* Phases Quick View */}
                <Panel 
                  title="PHASES"
                  action={
                    <Button variant="ghost" size="sm" className="h-5 font-mono text-[10px] text-zinc-500 hover:text-amber-500">
                      <Plus className="h-3 w-3" />
                    </Button>
                  }
                >
                  {phases.length > 0 ? (
                    <PhaseList phases={phases} />
                  ) : (
                    <div className="text-center py-4">
                      <Layers className="h-6 w-6 text-zinc-700 mx-auto mb-2" />
                      <p className="font-mono text-[10px] text-zinc-500">No phases yet</p>
                    </div>
                  )}
                </Panel>
                
                {/* Contractors */}
                <Panel title="ACTIVE CONTRACTORS">
                  <ContractorList assignments={assignments.filter(a => a.is_active)} />
                </Panel>
              </div>
            </div>
          </TabsContent>
          
          {/* Construction Ops (Gaps) */}
          <TabsContent value="construction" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
               <SiteDiaryLog projectId={projectId} />
               <div className="space-y-6">
                  <PettyCashLedger projectId={projectId} currency={project.currency} />
                  <MaterialPriceTracker defaultRegion={project.region || 'Greater Accra'} />
               </div>
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
                  <Button size="sm" className="h-6 font-mono text-[10px] bg-amber-600 hover:bg-amber-700 text-black">
                    <Plus className="h-3 w-3 mr-1" />
                    Add Phase
                  </Button>
                }
              >
                {phases.length > 0 ? (
                  <PhaseList phases={phases} />
                ) : (
                  <div className="text-center py-12">
                    <Layers className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
                    <h3 className="font-mono text-sm text-white mb-2">No phases defined</h3>
                    <p className="font-mono text-[10px] text-zinc-500 mb-4">
                      Add phases to track construction progress and milestones
                    </p>
                    <Button className="bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs">
                      <Plus className="h-4 w-4 mr-2" />
                      Add First Phase
                    </Button>
                  </div>
                )}
              </Panel>
            </div>
          </TabsContent>
          
          {/* Units Tab */}
          <TabsContent value="units" className="mt-0">
            <Panel 
              title={`UNITS (${units.length})`}
              action={
                <Button 
                  size="sm" 
                  className="h-6 font-mono text-[10px] bg-amber-600 hover:bg-amber-700 text-black"
                  onClick={() => setShowAddUnitDialog(true)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Units
                </Button>
              }
            >
              {units.length > 0 ? (
                <div className="space-y-4">
                  {/* Stats */}
                  {unitStats && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
                      <div className="bg-green-900/30 border border-green-800/50 p-2">
                        <div className="font-mono text-[9px] text-green-500">AVAILABLE</div>
                        <div className="font-mono text-lg text-green-400">{unitStats.by_status?.available || 0}</div>
                      </div>
                      <div className="bg-yellow-900/30 border border-yellow-800/50 p-2">
                        <div className="font-mono text-[9px] text-yellow-500">RESERVED</div>
                        <div className="font-mono text-lg text-yellow-400">{unitStats.by_status?.reserved || 0}</div>
                      </div>
                      <div className="bg-blue-900/30 border border-blue-800/50 p-2">
                        <div className="font-mono text-[9px] text-blue-500">CONTRACT</div>
                        <div className="font-mono text-lg text-blue-400">{unitStats.by_status?.under_contract || 0}</div>
                      </div>
                      <div className="bg-purple-900/30 border border-purple-800/50 p-2">
                        <div className="font-mono text-[9px] text-purple-500">SOLD</div>
                        <div className="font-mono text-lg text-purple-400">{unitStats.by_status?.sold || 0}</div>
                      </div>
                      <div className="bg-emerald-900/30 border border-emerald-800/50 p-2">
                        <div className="font-mono text-[9px] text-emerald-500">HANDED OVER</div>
                        <div className="font-mono text-lg text-emerald-400">{unitStats.by_status?.handed_over || 0}</div>
                      </div>
                    </div>
                  )}
                  
                  <UnitGrid units={units} />
                </div>
              ) : (
                <div className="text-center py-12">
                  <Home className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
                  <h3 className="font-mono text-sm text-white mb-2">No units defined</h3>
                  <p className="font-mono text-[10px] text-zinc-500 mb-4">
                    Add units to track sales and handovers
                  </p>
                  <Button 
                    className="bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs"
                    onClick={() => setShowAddUnitDialog(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Units
                  </Button>
                </div>
              )}
            </Panel>
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
          
          {/* Milestones Tab - Client views and approves milestones */}
          <TabsContent value="milestones" className="mt-0">
            <Panel title="PROJECT MILESTONES">
              <MilestonesTab 
                projectId={projectId}
                organizationId={project.organization_id}
                frameworkId={project.milestone_framework_id}
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
                  <Button className="bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs">
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
                <Button size="sm" className="h-6 font-mono text-[10px] bg-amber-600 hover:bg-amber-700 text-black">
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
                  <Button size="sm" className="h-6 font-mono text-[10px] bg-amber-600 hover:bg-amber-700 text-black">
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
                      <span className="font-mono text-sm text-black font-bold">
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
                      <Button size="sm" className="font-mono text-xs bg-amber-600 hover:bg-amber-700 text-black">
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
            <Panel title="DOCUMENTS">
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
                <h3 className="font-mono text-sm text-white mb-2">No documents yet</h3>
                <p className="font-mono text-[10px] text-zinc-500 mb-4">
                  Upload project documents, contracts, and permits
                </p>
                <Button 
                  className="bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs"
                  onClick={() => setShowUploadDialog(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Upload Document
                </Button>
              </div>
            </Panel>
          </TabsContent>
        </Tabs>
        
        {/* Add Unit Dialog */}
        <Dialog open={showAddUnitDialog} onOpenChange={setShowAddUnitDialog}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
            <DialogHeader>
              <DialogTitle className="font-mono">Add Unit</DialogTitle>
              <DialogDescription className="font-mono text-xs text-zinc-400">
                Add a new unit to this project
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-mono text-xs">Unit Number *</Label>
                  <Input
                    value={unitForm.unit_number}
                    onChange={(e) => setUnitForm({ ...unitForm, unit_number: e.target.value })}
                    placeholder="e.g., A101"
                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-mono text-xs">Unit Type</Label>
                  <Select
                    value={unitForm.unit_type}
                    onValueChange={(v) => setUnitForm({ ...unitForm, unit_type: v })}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 font-mono text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="apartment">Apartment</SelectItem>
                      <SelectItem value="townhouse">Townhouse</SelectItem>
                      <SelectItem value="penthouse">Penthouse</SelectItem>
                      <SelectItem value="studio">Studio</SelectItem>
                      <SelectItem value="duplex">Duplex</SelectItem>
                      <SelectItem value="villa">Villa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="font-mono text-xs">Floor</Label>
                  <Input
                    type="number"
                    value={unitForm.floor}
                    onChange={(e) => setUnitForm({ ...unitForm, floor: e.target.value })}
                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-mono text-xs">Bedrooms</Label>
                  <Input
                    type="number"
                    value={unitForm.bedrooms}
                    onChange={(e) => setUnitForm({ ...unitForm, bedrooms: e.target.value })}
                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-mono text-xs">Bathrooms</Label>
                  <Input
                    type="number"
                    value={unitForm.bathrooms}
                    onChange={(e) => setUnitForm({ ...unitForm, bathrooms: e.target.value })}
                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-mono text-xs">Area (sqm)</Label>
                  <Input
                    type="number"
                    value={unitForm.internal_area_sqm}
                    onChange={(e) => setUnitForm({ ...unitForm, internal_area_sqm: e.target.value })}
                    placeholder="e.g., 85"
                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-mono text-xs">Base Price (GHS) *</Label>
                  <Input
                    type="number"
                    value={unitForm.base_price}
                    onChange={(e) => setUnitForm({ ...unitForm, base_price: e.target.value })}
                    placeholder="e.g., 500000"
                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="font-mono text-xs">Status</Label>
                <Select
                  value={unitForm.status}
                  onValueChange={(v) => setUnitForm({ ...unitForm, status: v })}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 font-mono text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="reserved">Reserved</SelectItem>
                    <SelectItem value="under_construction">Under Construction</SelectItem>
                    <SelectItem value="not_for_sale">Not For Sale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setShowAddUnitDialog(false)}
                className="font-mono text-xs"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleAddUnit}
                disabled={isAddingUnit || !unitForm.unit_number || !unitForm.base_price}
                className="bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs"
              >
                {isAddingUnit ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Add Unit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
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
                <Label className="font-mono text-xs">Document Name *</Label>
                <Input
                  value={documentForm.name}
                  onChange={(e) => setDocumentForm({ ...documentForm, name: e.target.value })}
                  placeholder="e.g., Building Permit"
                  className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="font-mono text-xs">Category</Label>
                <Select
                  value={documentForm.category}
                  onValueChange={(v) => setDocumentForm({ ...documentForm, category: v })}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 font-mono text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contracts">Contracts</SelectItem>
                    <SelectItem value="permits">Permits</SelectItem>
                    <SelectItem value="drawings">Drawings</SelectItem>
                    <SelectItem value="reports">Reports</SelectItem>
                    <SelectItem value="invoices">Invoices</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="font-mono text-xs">File *</Label>
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
                className="bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs"
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                Upload
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  )
}
