'use client'

import { useState, useEffect } from 'react'
import { 
  Building2, TrendingUp, TrendingDown, DollarSign, Clock, CheckCircle2, 
  AlertTriangle, AlertCircle, BarChart3, PieChart, Calendar, Activity,
  ChevronRight, Search, Filter, MapPin, Layers, ArrowUpRight, ArrowDownRight
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
import Link from 'next/link'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

// Types
interface PortfolioSummary {
  total_projects: number;
  active_projects: number;
  completed_projects: number;
  on_hold_projects: number;
  total_budget: number;
  total_spent: number;
  budget_remaining: number;
  overall_progress: number;
  projects_on_track: number;
  projects_at_risk: number;
  projects_behind: number;
}

interface ProjectOverview {
  id: string;
  name: string;
  status: string;
  phase: string;
  location: string;
  region: string;
  start_date: string;
  target_completion: string;
  budget: number;
  spent: number;
  progress: number;
  health_status: 'on_track' | 'at_risk' | 'behind';
  open_rfis: number;
  pending_cos: number;
  pending_submittals: number;
  days_remaining: number | null;
  currency: string;
}

interface PortfolioMetrics {
  budget_by_status: { status: string; total: number }[];
  projects_by_region: { region: string; count: number }[];
  projects_by_phase: { phase: string; count: number }[];
}

interface ActivityItem {
  type: string;
  id: string;
  project_name: string;
  title: string;
  status: string;
  timestamp: string;
}

interface Deadline {
  type: string;
  id: string;
  project_name: string;
  title: string;
  deadline: string;
  priority: string;
}

// Helpers
const formatCurrency = (amount: number, currency = 'GHS') => {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const formatCompactNumber = (num: number) => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return num.toString();
}

const healthColors = {
  on_track: 'bg-green-500',
  at_risk: 'bg-yellow-500',
  behind: 'bg-red-500',
};

const healthLabels = {
  on_track: 'On Track',
  at_risk: 'At Risk',
  behind: 'Behind',
};

export default function PortfolioPage() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [projects, setProjects] = useState<ProjectOverview[]>([])
  const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [healthFilter, setHealthFilter] = useState('all')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [summaryRes, projectsRes, metricsRes, activityRes, deadlinesRes] = await Promise.all([
        fetch(`${API_BASE}/api/portfolio/summary`),
        fetch(`${API_BASE}/api/portfolio/projects`),
        fetch(`${API_BASE}/api/portfolio/metrics`),
        fetch(`${API_BASE}/api/portfolio/activity?limit=10`),
        fetch(`${API_BASE}/api/portfolio/deadlines?days=14`)
      ]);

      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (projectsRes.ok) setProjects(await projectsRes.json());
      if (metricsRes.ok) setMetrics(await metricsRes.json());
      if (activityRes.ok) setActivity(await activityRes.json());
      if (deadlinesRes.ok) setDeadlines(await deadlinesRes.json());
    } catch (error) {
      console.error('Error fetching portfolio data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter(p => {
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (healthFilter !== 'all' && p.health_status !== healthFilter) return false;
    return true;
  });

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-zinc-500">Loading portfolio data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Portfolio Overview</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Cross-project insights and performance metrics
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-zinc-700 text-zinc-300">
            <Filter className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Projects"
          value={summary?.total_projects || 0}
          subValue={`${summary?.active_projects || 0} active`}
          icon={Building2}
          color="text-blue-500"
        />
        <SummaryCard
          label="Total Budget"
          value={formatCompactNumber(summary?.total_budget || 0)}
          subValue={`${formatCompactNumber(summary?.total_spent || 0)} spent`}
          icon={DollarSign}
          color="text-green-500"
          prefix="₵"
        />
        <SummaryCard
          label="Avg Progress"
          value={`${Math.round(summary?.overall_progress || 0)}%`}
          subValue={`${summary?.completed_projects || 0} completed`}
          icon={TrendingUp}
          color="text-amber-500"
        />
        <SummaryCard
          label="On Hold"
          value={summary?.on_hold_projects || 0}
          subValue="Projects paused"
          icon={Clock}
          color="text-zinc-500"
        />
      </div>

      {/* Health Status */}
      <div className="grid grid-cols-3 gap-4">
        <HealthCard
          label="On Track"
          count={summary?.projects_on_track || 0}
          total={summary?.active_projects || 0}
          color="bg-green-500"
          icon={CheckCircle2}
        />
        <HealthCard
          label="At Risk"
          count={summary?.projects_at_risk || 0}
          total={summary?.active_projects || 0}
          color="bg-yellow-500"
          icon={AlertTriangle}
        />
        <HealthCard
          label="Behind"
          count={summary?.projects_behind || 0}
          total={summary?.active_projects || 0}
          color="bg-red-500"
          icon={AlertCircle}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Projects List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-zinc-900 border-zinc-800"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 bg-zinc-900 border-zinc-800">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
              </SelectContent>
            </Select>
            <Select value={healthFilter} onValueChange={setHealthFilter}>
              <SelectTrigger className="w-36 bg-zinc-900 border-zinc-800">
                <SelectValue placeholder="Health" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="all">All Health</SelectItem>
                <SelectItem value="on_track">On Track</SelectItem>
                <SelectItem value="at_risk">At Risk</SelectItem>
                <SelectItem value="behind">Behind</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {filteredProjects.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No projects found</p>
              </div>
            ) : (
              filteredProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Upcoming Deadlines */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Calendar className="h-4 w-4 text-amber-500" />
                Upcoming Deadlines
              </h3>
              <span className="text-xs text-zinc-500">Next 14 days</span>
            </div>
            <div className="space-y-3">
              {deadlines.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-4">No upcoming deadlines</p>
              ) : (
                deadlines.slice(0, 5).map((deadline) => (
                  <div key={deadline.id} className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-2 ${
                      deadline.priority === 'critical' ? 'bg-red-500' :
                      deadline.priority === 'high' ? 'bg-orange-500' :
                      'bg-zinc-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{deadline.title}</p>
                      <p className="text-xs text-zinc-500">{deadline.project_name}</p>
                    </div>
                    <span className="text-xs text-zinc-400 whitespace-nowrap">
                      {formatDate(deadline.deadline)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" />
                Recent Activity
              </h3>
            </div>
            <div className="space-y-3">
              {activity.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-4">No recent activity</p>
              ) : (
                activity.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-start gap-3">
                    <div className={`w-6 h-6 rounded flex items-center justify-center text-xs ${
                      item.type === 'rfi' ? 'bg-blue-500/20 text-blue-500' :
                      item.type === 'change_order' ? 'bg-amber-500/20 text-amber-500' :
                      'bg-purple-500/20 text-purple-500'
                    }`}>
                      {item.type === 'rfi' ? 'R' : item.type === 'change_order' ? 'CO' : 'S'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{item.title}</p>
                      <p className="text-xs text-zinc-500">{item.project_name}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Distribution Charts */}
          {metrics && metrics.projects_by_region.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h3 className="font-semibold text-white flex items-center gap-2 mb-4">
                <PieChart className="h-4 w-4 text-green-500" />
                By Region
              </h3>
              <div className="space-y-2">
                {metrics.projects_by_region.slice(0, 5).map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">{item.region}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500 rounded-full"
                          style={{ 
                            width: `${(item.count / Math.max(...metrics.projects_by_region.map(r => r.count))) * 100}%` 
                          }}
                        />
                      </div>
                      <span className="text-sm text-white w-6 text-right">{item.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Summary Card Component
function SummaryCard({ 
  label, 
  value, 
  subValue, 
  icon: Icon, 
  color,
  prefix = ''
}: { 
  label: string; 
  value: string | number; 
  subValue: string;
  icon: any;
  color: string;
  prefix?: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">
        {prefix}{value}
      </div>
      <div className="text-xs text-zinc-500 mt-1">{subValue}</div>
    </div>
  )
}

// Health Card Component
function HealthCard({ 
  label, 
  count, 
  total, 
  color, 
  icon: Icon 
}: { 
  label: string; 
  count: number; 
  total: number; 
  color: string;
  icon: any;
}) {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
  
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${color}`} />
          <span className="text-sm text-zinc-400">{label}</span>
        </div>
        <Icon className={`h-4 w-4 ${color.replace('bg-', 'text-')}`} />
      </div>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-bold text-white">{count}</span>
        <span className="text-sm text-zinc-500">{percentage}%</span>
      </div>
      <div className="w-full h-1.5 bg-zinc-800 rounded-full mt-2 overflow-hidden">
        <div 
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

// Project Card Component
function ProjectCard({ project }: { project: ProjectOverview }) {
  const budgetUsage = project.budget > 0 ? (project.spent / project.budget) * 100 : 0;
  
  return (
    <Link href={`/pm-portal/projects/${project.id}`}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors cursor-pointer">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-white truncate">{project.name}</h3>
              <div className={`w-2 h-2 rounded-full ${healthColors[project.health_status]}`} />
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              {project.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {project.location}
                </span>
              )}
              {project.phase && (
                <span className="flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  {project.phase}
                </span>
              )}
            </div>
          </div>
          <Badge 
            variant="outline" 
            className={`border-zinc-700 text-xs capitalize ${
              project.status === 'active' || project.status === 'in_progress' 
                ? 'text-green-400' 
                : project.status === 'on_hold' 
                  ? 'text-yellow-400' 
                  : 'text-zinc-400'
            }`}
          >
            {project.status?.replace('_', ' ')}
          </Badge>
        </div>

        {/* Progress & Budget */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-zinc-500">Progress</span>
              <span className="text-white">{Math.round(project.progress)}%</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-500 rounded-full"
                style={{ width: `${Math.min(100, project.progress)}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-zinc-500">Budget</span>
              <span className={budgetUsage > 90 ? 'text-red-400' : 'text-white'}>
                {Math.round(budgetUsage)}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${budgetUsage > 90 ? 'bg-red-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min(100, budgetUsage)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-zinc-800">
          {project.open_rfis > 0 && (
            <span className="text-xs text-blue-400">
              {project.open_rfis} RFI{project.open_rfis > 1 ? 's' : ''}
            </span>
          )}
          {project.pending_cos > 0 && (
            <span className="text-xs text-amber-400">
              {project.pending_cos} CO{project.pending_cos > 1 ? 's' : ''}
            </span>
          )}
          {project.pending_submittals > 0 && (
            <span className="text-xs text-purple-400">
              {project.pending_submittals} Submittal{project.pending_submittals > 1 ? 's' : ''}
            </span>
          )}
          {project.days_remaining !== null && project.days_remaining > 0 && (
            <span className="text-xs text-zinc-500 ml-auto">
              {project.days_remaining}d remaining
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
