'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import {
  Search,
  Filter,
  SortAsc,
  SortDesc,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  Percent,
  Edit,
  Eye,
  Trash2,
  Download,
  Loader2,
  ArrowUpDown,
  X,
  SlidersHorizontal,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import type { DevelopmentProject, ProjectSummary, ProjectStatus } from '@/types/projects'
import { Skeleton } from '@/components/ui/skeleton'
import { format } from 'date-fns'
import { fetchApi } from '@/lib/api'

// =====================================================
// TYPES
// =====================================================
export interface Project {
  id: string
  name: string
  property_type: string
  status: string
  region?: string
  district?: string
  total_budget?: number
  actual_spend?: number
  progress?: number
  start_date?: string
  end_date?: string
  hero_image_url?: string
  created_at: string
  updated_at: string
}

interface ProjectsTableProps {
  onProjectClick?: (project: Project) => void
  onProjectEdit?: (project: Project) => void
  onProjectDelete?: (project: Project) => void
  className?: string
}

type SortField = 'name' | 'status' | 'total_budget' | 'progress' | 'created_at'
type SortOrder = 'asc' | 'desc'

interface FilterState {
  search: string
  status: string[]
  propertyType: string[]
  region: string[]
  budgetMin?: number
  budgetMax?: number
}

// =====================================================
// CONSTANTS
// =====================================================
const STATUS_CONFIG: Record<string, { label: string; color: string; border: string }> = {
  draft: { label: 'Draft', color: 'bg-zinc-800 text-zinc-400', border: 'border-zinc-700' },
  pending: { label: 'Pending', color: 'bg-amber-500/10 text-amber-500', border: 'border-amber-500/20' },
  active: { label: 'Active', color: 'bg-blue-500/10 text-blue-400', border: 'border-blue-500/20' },
  in_progress: { label: 'In Progress', color: 'bg-blue-500/10 text-blue-400', border: 'border-blue-500/20' },
  on_hold: { label: 'On Hold', color: 'bg-orange-500/10 text-orange-400', border: 'border-orange-500/20' },
  completed: { label: 'Completed', color: 'bg-emerald-500/10 text-emerald-500', border: 'border-emerald-500/20' },
  cancelled: { label: 'Cancelled', color: 'bg-red-500/10 text-red-500', border: 'border-red-500/20' },
}

const PROPERTY_TYPES = [
  'residential_single',
  'residential_multi',
  'commercial',
  'mixed_use',
  'industrial',
  'land_development',
  'renovation',
]

const GHANA_REGIONS = [
  'Greater Accra',
  'Ashanti',
  'Western',
  'Central',
  'Eastern',
  'Northern',
  'Volta',
  'Bono',
  'Upper East',
  'Upper West',
]

const PAGE_SIZES = [10, 25, 50, 100]

// =====================================================
// FILTER PANEL COMPONENT
// =====================================================
function FilterPanel({
  filters,
  onFiltersChange,
  onClear,
}: {
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
  onClear: () => void
}) {
  const hasActiveFilters =
    filters.status.length > 0 ||
    filters.propertyType?.length > 0 ||
    filters.region.length > 0 ||
    filters.budgetMin !== undefined ||
    filters.budgetMax !== undefined

  const toggleArrayFilter = (
    key: 'status' | 'propertyType' | 'region',
    value: string
  ) => {
    const current = filters[key]
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value]
    onFiltersChange({ ...filters, [key]: updated })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {hasActiveFilters && (
            <Badge className="ml-1 h-4 w-4 p-0 flex items-center justify-center bg-amber-500 text-white text-[10px]">
              {(filters.status?.length || 0) + (filters.propertyType?.length || 0) + (filters.region?.length || 0)}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 bg-zinc-900 border-zinc-700 p-4" align="start">
        <div className="space-y-4">
          {/* Status filter */}
          <div>
            <label className="font-mono text-xs text-zinc-400 block mb-2">Status</label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                <Badge
                  key={key}
                  className={cn(
                    "cursor-pointer transition-all border font-medium px-2 py-0.5",
                    (filters.status || []).includes(key as ProjectStatus)
                      ? `${config.color} ${config.border}`
                      : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600"
                  )}
                  onClick={() => toggleArrayFilter('status', key)}
                >
                  {config.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Property Type filter */}
          <div>
            <label className="font-mono text-xs text-zinc-400 block mb-2">Property Type</label>
            <div className="flex flex-wrap gap-1.5">
              {PROPERTY_TYPES.map(type => (
                <Badge
                  key={type}
                  className={cn(
                    "cursor-pointer transition-all",
                    (filters.propertyType || []).includes(type)
                      ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700"
                  )}
                  onClick={() => toggleArrayFilter('propertyType', type)}
                >
                  {type.replace('_', ' ')}
                </Badge>
              ))}
            </div>
          </div>

          {/* Region filter */}
          <div>
            <label className="font-mono text-xs text-zinc-400 block mb-2">Region</label>
            <div className="flex flex-wrap gap-1.5">
              {GHANA_REGIONS.slice(0, 6).map(region => (
                <Badge
                  key={region}
                  className={cn(
                    "cursor-pointer transition-all",
                    filters.region.includes(region)
                      ? "bg-green-500 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  )}
                  onClick={() => toggleArrayFilter('region', region)}
                >
                  {region}
                </Badge>
              ))}
            </div>
          </div>

          {/* Budget range */}
          <div>
            <label className="font-mono text-xs text-zinc-400 block mb-2">Budget Range (GHS)</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Min"
                className="h-8 text-xs bg-zinc-800 border-zinc-700"
                value={filters.budgetMin || ''}
                onChange={e => onFiltersChange({
                  ...filters,
                  budgetMin: e.target.value ? Number(e.target.value) : undefined,
                })}
              />
              <span className="text-zinc-600">–</span>
              <Input
                type="number"
                placeholder="Max"
                className="h-8 text-xs bg-zinc-800 border-zinc-700"
                value={filters.budgetMax || ''}
                onChange={e => onFiltersChange({
                  ...filters,
                  budgetMax: e.target.value ? Number(e.target.value) : undefined,
                })}
              />
            </div>
          </div>

          {/* Clear filters */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-red-400 hover:text-red-300"
              onClick={onClear}
            >
              <X className="h-3 w-3 mr-1" />
              Clear All Filters
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// =====================================================
// TABLE ROW COMPONENT
// =====================================================
function ProjectRow({
  project,
  onView,
  onEdit,
  onDelete,
}: {
  project: Project
  onView?: () => void
  onEdit?: () => void
  onDelete?: () => void
}) {
  const status = STATUS_CONFIG[project.status] || STATUS_CONFIG.draft
  const budgetUtilization = project.total_budget && project.actual_spend
    ? Math.round((project.actual_spend / project.total_budget) * 100)
    : 0

  return (
    <tr className="border-b border-zinc-800/50 hover:bg-zinc-800/50 transition-all cursor-pointer group">
      {/* Project Info */}
      <td className="py-4 px-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-zinc-800/50 overflow-hidden shrink-0 border border-zinc-700 group-hover:border-zinc-500 transition-colors">
            {project.hero_image_url ? (
              <img
                src={project.hero_image_url}
                alt={project.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Building2 className="h-4 w-4 text-zinc-500" />
              </div>
            )}
          </div>
          <div>
            <span className="font-sans text-sm font-medium text-zinc-100 block group-hover:text-blue-400 transition-colors">
              {project.name}
            </span>
            <span className="font-mono text-[10px] text-zinc-500 tracking-wider capitalize">
              {project.property_type?.replace('_', ' ')}
            </span>
          </div>
        </div>
      </td>

      {/* Location */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5 text-zinc-400">
          <MapPin className="h-3 w-3" />
          <span className="font-mono text-xs">
            {project.district || project.region || '—'}
          </span>
        </div>
      </td>

      {/* Status */}
      <td className="py-4 px-4">
        <Badge className={cn("text-[10px] uppercase tracking-wider font-semibold border px-2 py-0.5", status.color, status.border)}>
          {status.label}
        </Badge>
      </td>

      {/* Budget */}
      <td className="py-3 px-4">
        {project.total_budget ? (
          <div className="space-y-1">
            <span className="font-mono text-xs text-zinc-300">
              GHS {(project.total_budget / 1000000).toFixed(1)}M
            </span>
            <div className="flex items-center gap-1.5">
              <div className="w-16 h-1 bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    budgetUtilization > 100 ? "bg-red-500" :
                      budgetUtilization > 80 ? "bg-amber-500" : "bg-green-500"
                  )}
                  style={{ width: `${Math.min(budgetUtilization, 100)}%` }}
                />
              </div>
              <span className="font-mono text-[10px] text-zinc-500">
                {budgetUtilization}%
              </span>
            </div>
          </div>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>

      {/* Progress */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${project.progress || 0}%` }}
            />
          </div>
          <span className="font-mono text-xs text-zinc-400">
            {project.progress || 0}%
          </span>
        </div>
      </td>

      {/* Timeline */}
      <td className="py-3 px-4">
        {project.start_date ? (
          <span className="font-mono text-xs text-zinc-400">
            {format(new Date(project.start_date), 'MMM yyyy')}
            {project.end_date && ` - ${format(new Date(project.end_date), 'MMM yyyy')}`}
          </span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>

      {/* Actions */}
      <td className="py-4 px-4 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-zinc-900 border-zinc-800 shadow-xl" align="end">
            <DropdownMenuItem onClick={onView} className="text-xs hover:bg-zinc-800 focus:bg-zinc-800 cursor-pointer">
              <Eye className="h-3.5 w-3.5 mr-2" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit} className="text-xs hover:bg-zinc-800 focus:bg-zinc-800 cursor-pointer">
              <Edit className="h-3.5 w-3.5 mr-2" />
              Edit Project
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs hover:bg-zinc-800 focus:bg-zinc-800 cursor-pointer">
              <Download className="h-3.5 w-3.5 mr-2" />
              Export
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-zinc-800" />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-xs text-red-500 hover:bg-red-500/10 focus:bg-red-500/10 cursor-pointer focus:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  )
}

// =====================================================
// LOADING SKELETON
// =====================================================
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-zinc-800">
          <td className="py-3 px-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </td>
          <td className="py-3 px-4"><Skeleton className="h-4 w-24" /></td>
          <td className="py-3 px-4"><Skeleton className="h-5 w-16 rounded-full" /></td>
          <td className="py-3 px-4"><Skeleton className="h-4 w-20" /></td>
          <td className="py-3 px-4"><Skeleton className="h-4 w-16" /></td>
          <td className="py-3 px-4"><Skeleton className="h-4 w-24" /></td>
          <td className="py-3 px-4"><Skeleton className="h-7 w-7 rounded" /></td>
        </tr>
      ))}
    </>
  )
}

// =====================================================
// MAIN PROJECTS TABLE COMPONENT
// =====================================================
export function ProjectsTable({
  onProjectClick,
  onProjectEdit,
  onProjectDelete,
  className,
}: ProjectsTableProps) {
  // State
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: [],
    propertyType: [],
    region: [],
  })

  // Build query params
  const queryParams = useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', page.toString())
    params.set('limit', pageSize.toString())
    params.set('sortBy', sortField)
    params.set('sortOrder', sortOrder)

    if (filters.search) params.set('search', filters.search)
    if (filters.status.length) params.set('status', filters.status.join(','))
    if (filters.propertyType.length) params.set('propertyType', filters.propertyType.join(','))
    if (filters.region.length) params.set('region', filters.region.join(','))
    if (filters.budgetMin) params.set('budgetMin', filters.budgetMin.toString())
    if (filters.budgetMax) params.set('budgetMax', filters.budgetMax.toString())

    return params.toString()
  }, [page, pageSize, sortField, sortOrder, filters])

  // Fetch projects
  interface ProjectsResponse {
    data?: Project[]
    projects?: Project[]
    total?: number
    pagination?: { total: number }
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['projects', queryParams],
    queryFn: async (): Promise<ProjectsResponse> => {
      const response = await fetchApi(`/projects?${queryParams}`)
      return response as ProjectsResponse
    },
    staleTime: 30000,
  })

  const projects: Project[] = data?.data || data?.projects || []
  const totalCount = data?.total || data?.pagination?.total || projects.length
  const totalPages = Math.ceil(totalCount / pageSize)

  // Handlers
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
    setPage(1)
  }

  const handleClearFilters = () => {
    setFilters({
      search: '',
      status: [],
      propertyType: [],
      region: [],
    })
    setPage(1)
  }

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      className="flex items-center gap-1 hover:text-zinc-200 transition-colors"
      onClick={() => handleSort(field)}
    >
      {children}
      {sortField === field ? (
        sortOrder === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-30" />
      )}
    </button>
  )

  return (
    <div className={cn("border border-zinc-800 bg-zinc-950/50 shadow-2xl rounded-xl overflow-hidden backdrop-blur-sm", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/30">
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              placeholder="Search projects by name, number..."
              className="h-9 w-72 pl-9 text-sm bg-zinc-900/50 border-zinc-800 rounded-lg shadow-inner focus:ring-1 focus:ring-blue-500/50 transition-shadow"
              value={filters.search}
              onChange={e => {
                setFilters({ ...filters, search: e.target.value })
                setPage(1)
              }}
            />
          </div>

          <div className="h-6 w-px bg-zinc-800"></div>

          {/* Filters */}
          <FilterPanel
            filters={filters}
            onFiltersChange={(f) => {
              setFilters(f)
              setPage(1)
            }}
            onClear={handleClearFilters}
          />
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="outline" className="font-mono text-xs border-zinc-800 text-zinc-400 bg-zinc-900/50">
            {totalCount} Total Projects
          </Badge>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/40">
              <th className="py-3 px-4 text-left font-sans text-[11px] uppercase tracking-wider text-zinc-500 font-medium">
                <SortButton field="name">Project</SortButton>
              </th>
              <th className="py-3 px-4 text-left font-sans text-[11px] uppercase tracking-wider text-zinc-500 font-medium">
                Location
              </th>
              <th className="py-3 px-4 text-left font-sans text-[11px] uppercase tracking-wider text-zinc-500 font-medium">
                <SortButton field="status">Status</SortButton>
              </th>
              <th className="py-3 px-4 text-left font-sans text-[11px] uppercase tracking-wider text-zinc-500 font-medium">
                <SortButton field="total_budget">Budget</SortButton>
              </th>
              <th className="py-3 px-4 text-left font-sans text-[11px] uppercase tracking-wider text-zinc-500 font-medium">
                <SortButton field="progress">Progress</SortButton>
              </th>
              <th className="py-3 px-4 text-left font-sans text-[11px] uppercase tracking-wider text-zinc-500 font-medium">
                Timeline
              </th>
              <th className="py-3 px-4 text-right font-sans text-[11px] uppercase tracking-wider text-zinc-500 font-medium w-16">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <TableSkeleton rows={pageSize} />
            ) : projects.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-zinc-500">
                    <Building2 className="h-8 w-8 opacity-50" />
                    <span className="font-mono text-sm">No projects found</span>
                    {(filters.search || filters.status.length > 0) && (
                      <Button
                        variant="link"
                        size="sm"
                        className="text-xs text-amber-500"
                        onClick={handleClearFilters}
                      >
                        Clear filters
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              projects.map(project => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  onView={() => onProjectClick?.(project)}
                  onEdit={() => onProjectEdit?.(project)}
                  onDelete={() => onProjectDelete?.(project)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-zinc-500">Rows per page:</span>
          <Select
            value={pageSize.toString()}
            onValueChange={v => {
              setPageSize(Number(v))
              setPage(1)
            }}
          >
            <SelectTrigger className="h-7 w-16 text-xs bg-zinc-800 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              {PAGE_SIZES.map(size => (
                <SelectItem key={size} value={size.toString()} className="text-xs">
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-zinc-500">
            Page {page} of {totalPages || 1}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProjectsTable
