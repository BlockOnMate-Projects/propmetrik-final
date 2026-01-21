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
import { projectsApi, phasesApi, unitsApi, costsApi, assignmentsApi } from '@/lib/projects-api'
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
                            href={`/dashboard/deals/projects/units/${unit.id}`}
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
// BUDGET OVERVIEW
// =====================================================
function BudgetOverview({ budget }: { budget: BudgetSummary }) {
  const healthColors = {
    on_budget: 'text-green-400',
    under_budget: 'text-blue-400',
    at_risk: 'text-yellow-400',
    over_budget: 'text-red-400',
  }
  
  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-zinc-800/50 p-2 border border-zinc-700">
          <div className="font-mono text-[9px] text-zinc-500">ORIGINAL</div>
          <div className="font-mono text-sm text-white">{formatCurrency(budget.total_original_budget, 'GHS')}</div>
        </div>
        <div className="bg-zinc-800/50 p-2 border border-zinc-700">
          <div className="font-mono text-[9px] text-zinc-500">REVISED</div>
          <div className="font-mono text-sm text-white">{formatCurrency(budget.total_revised_budget, 'GHS')}</div>
        </div>
        <div className="bg-zinc-800/50 p-2 border border-zinc-700">
          <div className="font-mono text-[9px] text-zinc-500">ACTUAL</div>
          <div className="font-mono text-sm text-green-400">{formatCurrency(budget.total_actual, 'GHS')}</div>
        </div>
        <div className="bg-zinc-800/50 p-2 border border-zinc-700">
          <div className="font-mono text-[9px] text-zinc-500">VARIANCE</div>
          <div className={cn(
            "font-mono text-sm",
            budget.total_variance >= 0 ? "text-green-400" : "text-red-400"
          )}>
            {budget.total_variance >= 0 ? '+' : ''}{formatCurrency(budget.total_variance, 'GHS')}
          </div>
        </div>
      </div>
      
      {/* Budget Health */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-zinc-500">BUDGET HEALTH:</span>
        <span className={cn("font-mono text-xs uppercase", healthColors[budget.health])}>
          {budget.health.replace('_', ' ')}
        </span>
      </div>
      
      {/* Category Breakdown */}
      <div className="space-y-2">
        <div className="font-mono text-[10px] text-zinc-500">BY CATEGORY</div>
        {budget.by_category.slice(0, 5).map((cat) => {
          const spent = cat.actual
          const budget = cat.revised_budget
          const pct = budget > 0 ? (spent / budget) * 100 : 0
          
          return (
            <div key={cat.category} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-zinc-400 capitalize">
                  {cat.category.replace(/_/g, ' ')}
                </span>
                <span className="font-mono text-[10px] text-zinc-500">
                  {formatCurrency(spent, 'GHS')} / {formatCurrency(budget, 'GHS')}
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
  
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')
  
  // Fetch all data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        const [projectRes, phasesRes, unitsRes, budgetRes, assignmentsRes, statsRes] = await Promise.all([
          projectsApi.getById(projectId),
          phasesApi.getByProject(projectId),
          unitsApi.getByProject(projectId, { limit: 200 }),
          costsApi.getBudgetSummary(projectId).catch(() => null),
          assignmentsApi.getByProject(projectId).catch(() => []),
          unitsApi.getStats(projectId).catch(() => null),
        ])
        
        setProject(projectRes)
        setPhases(phasesRes || [])
        setUnits(unitsRes?.data || [])
        setBudget(budgetRes)
        setAssignments(assignmentsRes || [])
        setUnitStats(statsRes)
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
            onClick={() => router.push('/dashboard/deals/projects')}
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
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="p-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-4">
            <Link href="/dashboard/deals/projects" className="font-mono text-[10px] text-zinc-500 hover:text-amber-500">
              Projects
            </Link>
            <ChevronRight className="h-3 w-3 text-zinc-600" />
            <span className="font-mono text-[10px] text-amber-500">{project.project_number}</span>
          </div>
          
          {/* Title Row */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="font-mono text-xl text-white">{project.project_name}</h1>
                <span className={cn("font-mono text-[10px] px-2 py-0.5", statusConfig.bg, statusConfig.text)}>
                  {statusConfig.label.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-4 font-mono text-[10px] text-zinc-500">
                {(project.city || project.region) && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {[project.city, project.region].filter(Boolean).join(', ')}
                  </span>
                )}
                {project.project_manager_name && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    PM: {project.project_manager_name}
                  </span>
                )}
                {project.planned_end_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Est. Completion: {new Date(project.planned_end_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Link href={`/dashboard/deals/projects/${project.id}/edit`}>
                <Button variant="outline" size="sm" className="font-mono text-xs">
                  <Edit className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>Add Phase</DropdownMenuItem>
                  <DropdownMenuItem>Add Units</DropdownMenuItem>
                  <DropdownMenuItem>Add Cost Item</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Export Report</DropdownMenuItem>
                  <DropdownMenuItem className="text-red-400">Archive Project</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4">
          <TabsList className="bg-transparent border-b-0 p-0 h-auto gap-0">
            {[
              { value: 'overview', label: 'Overview', icon: BarChart3 },
              { value: 'phases', label: 'Phases', icon: Layers },
              { value: 'units', label: 'Units', icon: Grid3X3 },
              { value: 'budget', label: 'Budget', icon: DollarSign },
              { value: 'contractors', label: 'Contractors', icon: HardHat },
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
        </Tabs>
      </div>
      
      {/* Content */}
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-0 space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <StatCard 
                label="Construction"
                value={`${project.construction_progress || 0}%`}
                icon={HardHat}
                color="amber"
              />
              <StatCard 
                label="Sales"
                value={`${salesProgress}%`}
                subValue={`${project.units_sold || 0}/${project.total_units || 0} units`}
                icon={TrendingUp}
                color="green"
              />
              <StatCard 
                label="Total Budget"
                value={formatCurrency(project.total_budget || 0, project.currency)}
                icon={DollarSign}
              />
              <StatCard 
                label="Spent"
                value={formatCurrency(project.total_spent || 0, project.currency)}
                subValue={project.total_budget ? `${Math.round((project.total_spent || 0) / project.total_budget * 100)}%` : undefined}
                icon={DollarSign}
                color="blue"
              />
              <StatCard 
                label="Phases"
                value={phases.length}
                subValue={`${phases.filter(p => p.status === 'completed').length} completed`}
                icon={Layers}
              />
              <StatCard 
                label="Contractors"
                value={assignments.length}
                icon={HardHat}
              />
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
                      <Link href={`/dashboard/deals/projects/${project.id}/units`}>
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
                    <BudgetOverview budget={budget} />
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
          
          {/* Phases Tab */}
          <TabsContent value="phases" className="mt-0">
            <Panel 
              title="PROJECT PHASES" 
              action={
                <Button size="sm" className="h-6 font-mono text-[10px] bg-amber-600 hover:bg-amber-700 text-black">
                  <Plus className="h-3 w-3 mr-1" />
                  Add Phase
                </Button>
              }
            >
              {phases.length > 0 ? (
                <div className="space-y-4">
                  <GanttChart 
                    phases={phases} 
                    projectStart={project.planned_start_date}
                    projectEnd={project.planned_end_date}
                  />
                  <div className="border-t border-zinc-800 pt-4">
                    <PhaseList phases={phases} />
                  </div>
                </div>
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
          </TabsContent>
          
          {/* Units Tab */}
          <TabsContent value="units" className="mt-0">
            <Panel 
              title={`UNITS (${units.length})`}
              action={
                <Button size="sm" className="h-6 font-mono text-[10px] bg-amber-600 hover:bg-amber-700 text-black">
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
                  <Button className="bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Units
                  </Button>
                </div>
              )}
            </Panel>
          </TabsContent>
          
          {/* Budget Tab */}
          <TabsContent value="budget" className="mt-0">
            {budget ? (
              <div className="space-y-6">
                <Panel title="BUDGET OVERVIEW">
                  <BudgetOverview budget={budget} />
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
          
          {/* Documents Tab */}
          <TabsContent value="documents" className="mt-0">
            <Panel title="DOCUMENTS">
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
                <h3 className="font-mono text-sm text-white mb-2">No documents yet</h3>
                <p className="font-mono text-[10px] text-zinc-500 mb-4">
                  Upload project documents, contracts, and permits
                </p>
                <Button className="bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs">
                  <Plus className="h-4 w-4 mr-2" />
                  Upload Document
                </Button>
              </div>
            </Panel>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
