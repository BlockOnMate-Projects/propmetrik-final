'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  Plus,
  LayoutGrid,
  List,
  Search,
  Loader2,
  Building2,
  MapPin,
  Calendar,
  Users,
  TrendingUp,
  ChevronRight,
  Filter,
  Home,
  Landmark,
  Layers,
  HardHat,
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
import { projectsApi } from '@/lib/projects-api'
import type { DevelopmentProject, ProjectStats, ProjectStatus, ProjectType } from '@/types/projects'
import { formatCurrency } from '@/lib/utils'

// =====================================================
// STATUS BADGE COMPONENT
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

const typeIcons: Record<ProjectType, React.ElementType> = {
  residential: Home,
  commercial: Landmark,
  mixed_use: Layers,
  land_development: MapPin,
  renovation: HardHat,
  infrastructure: Building2,
  other: Building2,
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  const config = statusColors[status] || statusColors.planning
  return (
    <span className={cn('font-mono text-[9px] px-1.5 py-0.5', config.bg, config.text)}>
      {config.label.toUpperCase()}
    </span>
  )
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
// STATS CARD COMPONENT
// =====================================================
function StatCard({ label, value, subValue, icon: Icon, trend }: {
  label: string;
  value: string | number;
  subValue?: string;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
        <Icon className="h-4 w-4 text-zinc-600" />
      </div>
      <div className="font-mono text-xl text-white">{value}</div>
      {subValue && (
        <div className={cn(
          "font-mono text-[10px] mt-1",
          trend === 'up' && "text-green-400",
          trend === 'down' && "text-red-400",
          (!trend || trend === 'neutral') && "text-zinc-500"
        )}>
          {subValue}
        </div>
      )}
    </div>
  )
}

// =====================================================
// PROJECT CARD COMPONENT
// =====================================================
function ProjectCard({ project }: { project: DevelopmentProject }) {
  const TypeIcon = typeIcons[project.project_type] || Building2
  const salesProgress = project.total_units 
    ? Math.round(((project.units_sold || 0) / project.total_units) * 100)
    : 0

  return (
    <Link href={`/dashboard/deals/projects/${project.id}`}>
      <div className="bg-zinc-800/50 border border-zinc-700 hover:border-amber-500/50 transition-colors cursor-pointer group h-full">
        {/* Hero Image or Placeholder */}
        <div className="h-32 bg-zinc-800 relative overflow-hidden">
          {project.hero_image_url ? (
            <img 
              src={project.hero_image_url} 
              alt={project.project_name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <TypeIcon className="h-12 w-12 text-zinc-700" />
            </div>
          )}
          <div className="absolute top-2 left-2">
            <StatusBadge status={project.status} />
          </div>
          <div className="absolute top-2 right-2 font-mono text-[10px] text-amber-500 bg-zinc-900/80 px-1.5 py-0.5">
            {project.project_number}
          </div>
        </div>

        <div className="p-3">
          {/* Title & Type */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-mono text-sm text-white group-hover:text-amber-500 transition-colors line-clamp-1">
              {project.project_name}
            </h3>
            <TypeIcon className="h-4 w-4 text-zinc-500 flex-shrink-0" />
          </div>

          {/* Location */}
          {(project.city || project.region) && (
            <div className="flex items-center gap-1.5 mb-3">
              <MapPin className="h-3 w-3 text-zinc-500" />
              <span className="font-mono text-[10px] text-zinc-400">
                {[project.city, project.region].filter(Boolean).join(', ')}
              </span>
            </div>
          )}

          {/* Progress Bars */}
          <div className="space-y-2 mb-3">
            {/* Construction Progress */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[9px] text-zinc-500">CONSTRUCTION</span>
                <span className="font-mono text-[9px] text-zinc-400">{project.construction_progress || 0}%</span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${project.construction_progress || 0}%` }}
                />
              </div>
            </div>

            {/* Sales Progress */}
            {project.total_units && project.total_units > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[9px] text-zinc-500">SALES</span>
                  <span className="font-mono text-[9px] text-zinc-400">
                    {project.units_sold || 0}/{project.total_units} ({salesProgress}%)
                  </span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 transition-all duration-300"
                    style={{ width: `${salesProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer Stats */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-700/50">
            <div>
              {project.total_budget && (
                <span className="font-mono text-xs text-green-400">
                  {formatCurrency(project.total_budget, project.currency || 'GHS')}
                </span>
              )}
            </div>
            {project.planned_end_date && (
              <span className="font-mono text-[10px] text-zinc-500 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(project.planned_end_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

// =====================================================
// PROJECT TABLE ROW
// =====================================================
function ProjectTableRow({ project }: { project: DevelopmentProject }) {
  const TypeIcon = typeIcons[project.project_type] || Building2
  const salesProgress = project.total_units 
    ? Math.round(((project.units_sold || 0) / project.total_units) * 100)
    : 0

  return (
    <tr 
      className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer"
      onClick={() => window.location.href = `/dashboard/deals/projects/${project.id}`}
    >
      <td className="py-3 text-amber-500 font-mono text-xs">{project.project_number}</td>
      <td className="py-3">
        <div className="flex items-center gap-2">
          <TypeIcon className="h-4 w-4 text-zinc-500" />
          <span className="font-mono text-xs text-white">{project.project_name}</span>
        </div>
      </td>
      <td className="py-3 font-mono text-[10px] text-zinc-400">
        {[project.city, project.region].filter(Boolean).join(', ') || '—'}
      </td>
      <td className="py-3">
        <StatusBadge status={project.status} />
      </td>
      <td className="py-3">
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-amber-500"
              style={{ width: `${project.construction_progress || 0}%` }}
            />
          </div>
          <span className="font-mono text-[10px] text-zinc-400">{project.construction_progress || 0}%</span>
        </div>
      </td>
      <td className="py-3">
        {project.total_units ? (
          <span className="font-mono text-xs text-zinc-300">
            {project.units_sold || 0}/{project.total_units}
            <span className="text-zinc-500 ml-1">({salesProgress}%)</span>
          </span>
        ) : '—'}
      </td>
      <td className="py-3 text-right font-mono text-xs text-green-400">
        {project.total_budget ? formatCurrency(project.total_budget, project.currency || 'GHS') : '—'}
      </td>
      <td className="py-3 text-right font-mono text-[10px] text-zinc-500">
        {project.planned_end_date 
          ? new Date(project.planned_end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
          : '—'
        }
      </td>
    </tr>
  )
}

// =====================================================
// MAIN PAGE COMPONENT
// =====================================================
export default function ProjectsPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [projects, setProjects] = useState<DevelopmentProject[]>([])
  const [stats, setStats] = useState<ProjectStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const filters: any = {}
        if (statusFilter && statusFilter !== 'all') filters.status = statusFilter
        if (typeFilter && typeFilter !== 'all') filters.type = typeFilter
        if (search) filters.search = search

        const [projectsRes, statsRes] = await Promise.all([
          projectsApi.getAll(filters),
          projectsApi.getStats()
        ])

        setProjects(projectsRes.data || [])
        setStats(statsRes)
      } catch (err: any) {
        console.error('Failed to fetch projects:', err)
        setError(err.message || 'Failed to load projects')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [search, statusFilter, typeFilter])

  // Filter projects locally for search (debounce not implemented for simplicity)
  const filteredProjects = projects

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-mono text-xl tracking-tight">DEVELOPMENT PROJECTS</h1>
          <p className="font-mono text-[10px] text-zinc-500 mt-1">
            Manage development projects, track construction progress, and monitor sales
          </p>
        </div>
        <Link href="/dashboard/deals/projects/new">
          <Button className="bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs">
            <Plus className="h-4 w-4 mr-2" />
            NEW PROJECT
          </Button>
        </Link>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          <StatCard 
            label="Total Projects"
            value={stats.total_projects}
            icon={Building2}
          />
          <StatCard 
            label="Under Construction"
            value={stats.by_status?.under_construction || 0}
            icon={HardHat}
          />
          <StatCard 
            label="Total Units"
            value={stats.total_units}
            subValue={`${stats.units_sold} sold`}
            icon={Home}
            trend="up"
          />
          <StatCard 
            label="Total Budget"
            value={formatCurrency(stats.total_budget, 'GHS')}
            icon={TrendingUp}
          />
          <StatCard 
            label="Total Spent"
            value={formatCurrency(stats.total_spent, 'GHS')}
            subValue={`${Math.round((stats.total_spent / stats.total_budget) * 100)}% utilized`}
            icon={TrendingUp}
            trend="neutral"
          />
          <StatCard 
            label="Avg Progress"
            value={`${Math.round(stats.avg_progress)}%`}
            icon={TrendingUp}
          />
        </div>
      )}

      {/* Filters & View Toggle */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-zinc-900 border-zinc-800 font-mono text-xs h-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] bg-zinc-900 border-zinc-800 font-mono text-xs h-9">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="planning">Planning</SelectItem>
            <SelectItem value="pre_sales">Pre-Sales</SelectItem>
            <SelectItem value="under_construction">Under Construction</SelectItem>
            <SelectItem value="nearing_completion">Near Completion</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="sold_out">Sold Out</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px] bg-zinc-900 border-zinc-800 font-mono text-xs h-9">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="residential">Residential</SelectItem>
            <SelectItem value="commercial">Commercial</SelectItem>
            <SelectItem value="mixed_use">Mixed Use</SelectItem>
            <SelectItem value="land_development">Land Development</SelectItem>
            <SelectItem value="renovation">Renovation</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex border border-zinc-800 rounded">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'p-2 transition-colors',
              viewMode === 'grid' ? 'bg-zinc-800 text-amber-500' : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'p-2 transition-colors',
              viewMode === 'list' ? 'bg-zinc-800 text-amber-500' : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="border border-red-800 bg-red-900/20 p-4 mb-6">
          <p className="font-mono text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredProjects.length === 0 && (
        <div className="border border-zinc-800 bg-zinc-900/50 p-12 text-center">
          <Building2 className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
          <h3 className="font-mono text-sm text-white mb-2">No projects found</h3>
          <p className="font-mono text-[10px] text-zinc-500 mb-4">
            {search || statusFilter !== 'all' || typeFilter !== 'all' 
              ? 'Try adjusting your filters'
              : 'Create your first development project to get started'
            }
          </p>
          {!search && statusFilter === 'all' && typeFilter === 'all' && (
            <Link href="/dashboard/deals/projects/new">
              <Button className="bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs">
                <Plus className="h-4 w-4 mr-2" />
                CREATE PROJECT
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* Grid View */}
      {!isLoading && !error && viewMode === 'grid' && filteredProjects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      {/* List View */}
      {!isLoading && !error && viewMode === 'list' && filteredProjects.length > 0 && (
        <Panel title="PROJECTS">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                  <th className="text-left pb-2 w-28">PROJECT #</th>
                  <th className="text-left pb-2">NAME</th>
                  <th className="text-left pb-2 w-40">LOCATION</th>
                  <th className="text-left pb-2 w-32">STATUS</th>
                  <th className="text-left pb-2 w-32">PROGRESS</th>
                  <th className="text-left pb-2 w-28">UNITS</th>
                  <th className="text-right pb-2 w-32">BUDGET</th>
                  <th className="text-right pb-2 w-28">COMPLETION</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project) => (
                  <ProjectTableRow key={project.id} project={project} />
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  )
}
