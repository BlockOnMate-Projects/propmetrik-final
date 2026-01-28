'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { 
  Building2, 
  Plus, 
  Search, 
  Filter,
  Grid,
  List,
  Loader2,
  RefreshCw,
  MapPin,
  Calendar,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  MoreVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { projectsApi, Project, ProjectStatus } from '@/lib/pm-portal-api';

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  planning: { label: 'Planning', bg: 'bg-blue-500/20', text: 'text-blue-400' },
  pre_sales: { label: 'Pre-Sales', bg: 'bg-purple-500/20', text: 'text-purple-400' },
  under_construction: { label: 'Under Construction', bg: 'bg-green-500/20', text: 'text-green-400' },
  nearing_completion: { label: 'Nearing Completion', bg: 'bg-amber-500/20', text: 'text-amber-400' },
  completed: { label: 'Completed', bg: 'bg-zinc-500/20', text: 'text-zinc-400' },
  sold_out: { label: 'Sold Out', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  on_hold: { label: 'On Hold', bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  cancelled: { label: 'Cancelled', bg: 'bg-red-500/20', text: 'text-red-400' },
  archived: { label: 'Archived', bg: 'bg-zinc-600/20', text: 'text-zinc-500' },
  // Legacy status values for backwards compatibility
  active: { label: 'Active', bg: 'bg-green-500/20', text: 'text-green-400' },
  in_progress: { label: 'In Progress', bg: 'bg-green-500/20', text: 'text-green-400' },
};

export default function ProjectsPage() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const response = await projectsApi.getAll({
        status: statusFilter !== 'all' ? (statusFilter as ProjectStatus) : undefined,
        search: searchQuery || undefined,
      });
      setProjects(response.data);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      toast.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return '—';
    }
  };

  const formatCurrency = (amount?: number) => {
    if (amount === undefined || amount === null) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(amount);
  };

  const filteredProjects = projects;
  const activeCount = projects.filter(p => p.status === 'under_construction' || p.status === 'nearing_completion').length;
  const totalBudget = projects.reduce((sum, p) => sum + (p.budget || p.total_budget || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Projects</h1>
            <p className="text-zinc-400 text-sm">Manage all construction projects</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={fetchProjects}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Link href="/pm-portal/projects/new">
            <Button className="bg-amber-600 hover:bg-amber-700">
              <Plus className="h-4 w-4 mr-2" />New Project
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Total Projects</p>
            <p className="text-2xl font-bold text-white mt-1">{projects.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Active</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{activeCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Total Budget</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{formatCurrency(totalBudget)}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Avg Progress</p>
            <p className="text-2xl font-bold text-white mt-1">
              {projects.length > 0 ? Math.round(projects.reduce((sum, p) => sum + (p.progress || p.overall_progress || 0), 0) / projects.length) : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input placeholder="Search projects..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500" />
          </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
          <SelectTrigger className="w-[180px] bg-zinc-900 border-zinc-800"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="planning">Planning</SelectItem>
            <SelectItem value="pre_sales">Pre-Sales</SelectItem>
            <SelectItem value="under_construction">Under Construction</SelectItem>
            <SelectItem value="nearing_completion">Nearing Completion</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-zinc-800">
          <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('grid')}><Grid className="h-4 w-4" /></Button>
          <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('list')}><List className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Projects Display */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></div>
      ) : filteredProjects.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No Projects Found</h3>
            <p className="text-zinc-400 text-sm mb-4">Create your first project to get started</p>
            <Link href="/pm-portal/projects/new">
              <Button className="bg-amber-600 hover:bg-amber-700"><Plus className="h-4 w-4 mr-2" />New Project</Button>
            </Link>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project) => {
            const status = statusConfig[project.status as ProjectStatus] || statusConfig.active;
            return (
              <Link key={project.id} href={`/pm-portal/projects/${project.id}`}>
                <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer group h-full">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Building2 className="h-5 w-5 text-amber-500" />
                      </div>
                      <Badge className={`${status.bg} ${status.text} border-0`}>{status.label}</Badge>
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-1 truncate">{project.name}</h3>
                    {project.address && (
                      <p className="text-zinc-400 text-sm flex items-center gap-1 mb-3 truncate">
                        <MapPin className="h-3 w-3 flex-shrink-0" />{project.address}
                      </p>
                    )}
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-zinc-500">Progress</span>
                          <span className="text-white font-medium">{project.progress || 0}%</span>
                        </div>
                        <Progress value={project.progress || 0} className="h-2" />
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-zinc-500 text-xs">Budget</p>
                          <p className="text-white font-medium">{formatCurrency(project.budget)}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500 text-xs">Target End</p>
                          <p className="text-white font-medium">{formatDate(project.target_end_date)}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0 divide-y divide-zinc-800">
            {filteredProjects.map((project) => {
              const status = statusConfig[project.status as ProjectStatus] || statusConfig.active;
              return (
                <Link key={project.id} href={`/pm-portal/projects/${project.id}`}>
                  <div className="flex items-center gap-4 p-4 hover:bg-zinc-800/50 transition-colors">
                    <div className="h-12 w-12 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-6 w-6 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{project.name}</p>
                      <div className="flex items-center gap-3 mt-1 text-sm text-zinc-400">
                        {project.address && <span className="flex items-center gap-1 truncate max-w-[200px]"><MapPin className="h-3 w-3" />{project.address}</span>}
                        {project.client_name && <span className="hidden sm:block">{project.client_name}</span>}
                      </div>
                    </div>
                    <div className="hidden md:flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-zinc-500 text-xs">Budget</p>
                        <p className="text-white font-medium">{formatCurrency(project.budget)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-zinc-500 text-xs">Progress</p>
                        <div className="flex items-center gap-2">
                          <Progress value={project.progress || 0} className="h-2 w-20" />
                          <span className="text-white font-medium text-sm">{project.progress || 0}%</span>
                        </div>
                      </div>
                    </div>
                    <Badge className={`${status.bg} ${status.text} border-0`}>{status.label}</Badge>
                    <ArrowUpRight className="h-4 w-4 text-zinc-600" />
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
