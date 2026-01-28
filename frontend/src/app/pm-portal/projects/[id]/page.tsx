'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  MapPin,
  Calendar,
  Wallet,
  TrendingUp,
  FileText,
  ClipboardList,
  AlertCircle,
  CheckCircle2,
  Clock,
  Users,
  Camera,
  Hammer,
  RefreshCw,
  Loader2,
  ChevronRight,
  Building2,
  Flag,
  BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { 
  projectsApi, 
  rfisApi, 
  submittalsApi, 
  changeOrdersApi,
  punchListsApi,
  Project,
  Milestone,
  RfiStats,
  SubmittalStats,
  ChangeOrderStats,
  PunchListStats
} from '@/lib/pm-portal-api';
import { format, formatDistanceToNow } from 'date-fns';

// Status badge configuration
const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  planning: { label: 'Planning', bg: 'bg-blue-500/20', text: 'text-blue-400' },
  pre_sales: { label: 'Pre-Sales', bg: 'bg-purple-500/20', text: 'text-purple-400' },
  under_construction: { label: 'Under Construction', bg: 'bg-amber-500/20', text: 'text-amber-400' },
  nearing_completion: { label: 'Near Completion', bg: 'bg-orange-500/20', text: 'text-orange-400' },
  completed: { label: 'Completed', bg: 'bg-green-500/20', text: 'text-green-400' },
  sold_out: { label: 'Sold Out', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  on_hold: { label: 'On Hold', bg: 'bg-zinc-500/20', text: 'text-zinc-400' },
  cancelled: { label: 'Cancelled', bg: 'bg-red-500/20', text: 'text-red-400' },
  archived: { label: 'Archived', bg: 'bg-zinc-600/20', text: 'text-zinc-500' },
};

interface QuickStat {
  label: string;
  value: string | number;
  subValue?: string;
  icon: React.ElementType;
  href: string;
  trend?: 'up' | 'down' | 'neutral';
  alert?: boolean;
}

export default function ProjectDashboard() {
  const { id: projectId } = useParams() as { id: string };
  
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [rfiStats, setRfiStats] = useState<RfiStats | null>(null);
  const [submittalStats, setSubmittalStats] = useState<SubmittalStats | null>(null);
  const [changeOrderStats, setChangeOrderStats] = useState<ChangeOrderStats | null>(null);
  const [punchStats, setPunchStats] = useState<PunchListStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch project first
      const projectData = await projectsApi.getById(projectId);
      setProject(projectData);

      // Fetch supplementary data in parallel - don't fail if these fail
      const [milestonesData, rfiData, submittalData, coData, punchData] = await Promise.allSettled([
        projectsApi.getMilestones(projectId, 'pending'),
        rfisApi.getStats(projectId),
        submittalsApi.getStats(projectId),
        changeOrdersApi.getStats(projectId),
        punchListsApi.getStats(projectId),
      ]);

      if (milestonesData.status === 'fulfilled') setMilestones(milestonesData.value);
      if (rfiData.status === 'fulfilled') setRfiStats(rfiData.value);
      if (submittalData.status === 'fulfilled') setSubmittalStats(submittalData.value);
      if (coData.status === 'fulfilled') setChangeOrderStats(coData.value);
      if (punchData.status === 'fulfilled') setPunchStats(punchData.value);
    } catch (err) {
      console.error('Failed to fetch project:', err);
      setError('Unable to load project. Please check the connection.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatCurrency = (value?: number, currency = 'USD') => {
    if (value === undefined || value === null) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return '—';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <p className="text-zinc-400 text-sm">Loading project...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="bg-zinc-900 border-zinc-800 max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Unable to Load Project</h3>
            <p className="text-zinc-400 text-sm mb-4">{error || 'Project not found'}</p>
            <Button onClick={fetchData} variant="outline" className="border-zinc-700">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const status = statusConfig[project.status] || statusConfig.planning;
  const progress = project.overall_progress ?? 0;

  // Build quick stats for the dashboard
  const quickStats: QuickStat[] = [
    {
      label: 'Open RFIs',
      value: (rfiStats?.by_status?.open || 0) + (rfiStats?.by_status?.pending_response || 0),
      subValue: rfiStats?.overdue ? `${rfiStats.overdue} overdue` : undefined,
      icon: FileText,
      href: `/pm-portal/projects/${projectId}/rfis`,
      alert: (rfiStats?.overdue || 0) > 0,
    },
    {
      label: 'Pending Submittals',
      value: submittalStats?.pending_review || 0,
      subValue: submittalStats?.overdue ? `${submittalStats.overdue} overdue` : undefined,
      icon: ClipboardList,
      href: `/pm-portal/projects/${projectId}/submittals`,
      alert: (submittalStats?.overdue || 0) > 0,
    },
    {
      label: 'Change Orders',
      value: changeOrderStats?.by_status?.pending_approval || 0,
      subValue: changeOrderStats?.total_pending_amount ? formatCurrency(changeOrderStats.total_pending_amount, project.currency) : undefined,
      icon: AlertCircle,
      href: `/pm-portal/projects/${projectId}/change-orders`,
    },
    {
      label: 'Punch Items',
      value: (punchStats?.by_status?.open || 0) + (punchStats?.by_status?.in_progress || 0),
      subValue: punchStats?.overdue ? `${punchStats.overdue} overdue` : undefined,
      icon: CheckCircle2,
      href: `/pm-portal/projects/${projectId}/punch-lists`,
      alert: (punchStats?.overdue || 0) > 0,
    },
  ];

  // Navigation items
  const navItems = [
    { label: 'Overview', href: `/pm-portal/projects/${projectId}`, icon: BarChart3 },
    { label: 'Milestones', href: `/pm-portal/projects/${projectId}/milestones`, icon: Flag },
    { label: 'RFIs', href: `/pm-portal/projects/${projectId}/rfis`, icon: FileText },
    { label: 'Submittals', href: `/pm-portal/projects/${projectId}/submittals`, icon: ClipboardList },
    { label: 'Change Orders', href: `/pm-portal/projects/${projectId}/change-orders`, icon: AlertCircle },
    { label: 'Photos', href: `/pm-portal/projects/${projectId}/photos`, icon: Camera },
    { label: 'Site Logs', href: `/pm-portal/projects/${projectId}/site-logs`, icon: Hammer },
    { label: 'Punch Lists', href: `/pm-portal/projects/${projectId}/punch-lists`, icon: CheckCircle2 },
    { label: 'Budget/Cost', href: `/pm-portal/projects/${projectId}/budget-cost`, icon: Wallet },
    { label: 'Draws', href: `/pm-portal/projects/${projectId}/draws-pay-apps`, icon: TrendingUp },
    { label: 'Procurement', href: `/pm-portal/projects/${projectId}/procurement`, icon: Building2 },
    { label: 'Checklists', href: `/pm-portal/projects/${projectId}/checklists`, icon: ClipboardList },
    { label: 'Issues/Risks', href: `/pm-portal/projects/${projectId}/issues-risks`, icon: Flag },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex-1">
          <Link 
            href="/pm-portal/projects" 
            className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-300 text-sm mb-3 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Projects
          </Link>
          
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight mb-2">
            {project.project_name || project.name}
          </h1>
          
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {(project.city || project.region) && (
              <div className="flex items-center gap-1 text-zinc-400">
                <MapPin className="h-3.5 w-3.5" />
                <span>{[project.city, project.region].filter(Boolean).join(', ')}</span>
              </div>
            )}
            
            <Badge className={`${status.bg} ${status.text} border-0`}>
              {status.label}
            </Badge>
            
            {project.project_number && (
              <span className="text-zinc-500 font-mono text-xs">#{project.project_number}</span>
            )}
          </div>
          
          {project.description && (
            <p className="text-zinc-500 mt-3 text-sm max-w-2xl line-clamp-2">
              {project.description}
            </p>
          )}
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Project Navigation */}
      <div className="border-b border-zinc-800 -mx-6 px-6 overflow-x-auto">
        <nav className="flex gap-1 min-w-max pb-px">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === `/pm-portal/projects/${projectId}`;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive 
                    ? 'border-amber-500 text-amber-500' 
                    : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider text-zinc-500">Budget</span>
              <Wallet className="h-5 w-5 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-white">
              {formatCurrency(project.total_budget, project.currency)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider text-zinc-500">Progress</span>
              <TrendingUp className="h-5 w-5 text-amber-500" />
            </div>
            <div className="flex items-end gap-2">
              <p className="text-2xl font-bold text-white">{Math.round(progress)}%</p>
              <Progress value={progress} className="h-2 flex-1 mb-2" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider text-zinc-500">Start Date</span>
              <Calendar className="h-5 w-5 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-white">
              {formatDate(project.actual_start_date || project.planned_start_date)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider text-zinc-500">Target End</span>
              <Calendar className="h-5 w-5 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-white">
              {formatDate(project.planned_end_date || project.planned_completion_date)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {quickStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href}>
              <Card className={`bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer group ${stat.alert ? 'border-l-2 border-l-red-500' : ''}`}>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">{stat.label}</p>
                      <p className="text-xl font-bold text-white">{stat.value}</p>
                      {stat.subValue && (
                        <p className={`text-xs mt-1 ${stat.alert ? 'text-red-400' : 'text-zinc-500'}`}>
                          {stat.subValue}
                        </p>
                      )}
                    </div>
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${stat.alert ? 'bg-red-500/10' : 'bg-zinc-800'} group-hover:bg-amber-500/10 transition-colors`}>
                      <Icon className={`h-5 w-5 ${stat.alert ? 'text-red-400' : 'text-zinc-400'} group-hover:text-amber-500 transition-colors`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Milestones */}
        <Card className="bg-zinc-900 border-zinc-800 lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-lg">Upcoming Milestones</CardTitle>
              <Link href={`/pm-portal/projects/${projectId}/milestones`}>
                <Button variant="ghost" size="sm" className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10">
                  View All <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {milestones.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-500 text-sm">No upcoming milestones</p>
              </div>
            ) : (
              <div className="space-y-3">
                {milestones.slice(0, 5).map((milestone) => (
                  <div 
                    key={milestone.id} 
                    className="flex items-center gap-4 p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                  >
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      milestone.is_overdue ? 'bg-red-500/10' : 'bg-amber-500/10'
                    }`}>
                      <Flag className={`h-5 w-5 ${milestone.is_overdue ? 'text-red-400' : 'text-amber-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{milestone.name}</p>
                      <p className="text-xs text-zinc-500">
                        {milestone.phase_name && `${milestone.phase_name} • `}
                        {milestone.due_date ? formatDate(milestone.due_date) : 'No due date'}
                      </p>
                    </div>
                    {milestone.is_overdue && (
                      <Badge className="bg-red-500/20 text-red-400 border-0 text-xs">Overdue</Badge>
                    )}
                    {milestone.progress !== undefined && (
                      <span className="text-sm font-medium text-zinc-400">{milestone.progress}%</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Project Details */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-amber-500" />
              Project Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { label: 'Type', value: project.project_type?.replace('_', ' ') },
                { label: 'Region', value: project.region },
                { label: 'Address', value: project.address },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                  <span className="text-sm text-zinc-500">{item.label}</span>
                  <span className="text-sm text-zinc-200 capitalize">{item.value || '—'}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { label: 'New RFI', href: `/pm-portal/projects/${projectId}/rfis?new=true`, icon: FileText },
              { label: 'Add Photo', href: `/pm-portal/projects/${projectId}/photos?upload=true`, icon: Camera },
              { label: 'Site Log', href: `/pm-portal/projects/${projectId}/site-logs?new=true`, icon: Hammer },
              { label: 'Punch Item', href: `/pm-portal/projects/${projectId}/punch-lists?new=true`, icon: CheckCircle2 },
              { label: 'Submittal', href: `/pm-portal/projects/${projectId}/submittals?new=true`, icon: ClipboardList },
              { label: 'Change Order', href: `/pm-portal/projects/${projectId}/change-orders?new=true`, icon: AlertCircle },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.label} href={action.href}>
                  <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-500/30 transition-all cursor-pointer group">
                    <div className="h-10 w-10 rounded-lg bg-zinc-800 group-hover:bg-amber-500/10 flex items-center justify-center transition-colors">
                      <Icon className="h-5 w-5 text-zinc-400 group-hover:text-amber-500 transition-colors" />
                    </div>
                    <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">{action.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
