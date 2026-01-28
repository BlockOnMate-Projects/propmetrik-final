'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Building2, 
  ClipboardList,
  FileStack,
  Camera,
  BookOpen,
  ClipboardCheck,
  MessageSquare,
  HardHat,
  Loader2,
  Plus,
  TrendingUp,
  AlertTriangle,
  Calendar,
  DollarSign,
  CheckCircle2,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { 
  projectsApi,
  rfisApi,
  submittalsApi,
  changeOrdersApi,
  punchListsApi,
  Project
} from '@/lib/pm-portal-api';

interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  openRfis: number;
  pendingSubmittals: number;
  pendingChangeOrders: number;
  openPunchItems: number;
}

export default function PMPortalDashboard() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalProjects: 0,
    activeProjects: 0,
    openRfis: 0,
    pendingSubmittals: 0,
    pendingChangeOrders: 0,
    openPunchItems: 0,
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [projectsRes, rfisRes, submittalsRes, changeOrdersRes, punchRes] = await Promise.allSettled([
        projectsApi.getAll(),
        rfisApi.getAll({}),
        submittalsApi.getAll({}),
        changeOrdersApi.getAll({}),
        punchListsApi.getAll({}),
      ]);

      // Projects
      if (projectsRes.status === 'fulfilled') {
        const projectsList = projectsRes.value.data || [];
        setProjects(projectsList.slice(0, 5));
        setStats(prev => ({
          ...prev,
          totalProjects: projectsList.length,
          activeProjects: projectsList.filter((p: Project) => p.status === 'under_construction' || p.status === 'nearing_completion').length,
        }));
      }

      // RFIs
      if (rfisRes.status === 'fulfilled') {
        const rfisList = rfisRes.value.data || [];
        setStats(prev => ({
          ...prev,
          openRfis: rfisList.filter((r: any) => r.status === 'open' || r.status === 'draft').length,
        }));
      }

      // Submittals
      if (submittalsRes.status === 'fulfilled') {
        const submittalsList = submittalsRes.value.data || [];
        setStats(prev => ({
          ...prev,
          pendingSubmittals: submittalsList.filter((s: any) => s.status === 'submitted' || s.status === 'under_review').length,
        }));
      }

      // Change Orders
      if (changeOrdersRes.status === 'fulfilled') {
        const coList = changeOrdersRes.value.data || [];
        setStats(prev => ({
          ...prev,
          pendingChangeOrders: coList.filter((c: any) => c.status === 'pending_approval').length,
        }));
      }

      // Punch Items
      if (punchRes.status === 'fulfilled') {
        const punchList = punchRes.value.data || [];
        setStats(prev => ({
          ...prev,
          openPunchItems: punchList.filter((p: any) => p.status === 'open' || p.status === 'in_progress').length,
        }));
      }

    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const quickLinks = [
    { href: '/pm-portal/rfis?new=true', icon: MessageSquare, label: 'Create RFI', color: 'text-amber-500 bg-amber-500/10' },
    { href: '/pm-portal/submittals?new=true', icon: ClipboardList, label: 'New Submittal', color: 'text-blue-500 bg-blue-500/10' },
    { href: '/pm-portal/change-orders?new=true', icon: FileStack, label: 'Change Order', color: 'text-purple-500 bg-purple-500/10' },
    { href: '/pm-portal/daily-logs?new=true', icon: BookOpen, label: 'Daily Log', color: 'text-emerald-500 bg-emerald-500/10' },
    { href: '/pm-portal/photos', icon: Camera, label: 'Upload Photos', color: 'text-cyan-500 bg-cyan-500/10' },
    { href: '/pm-portal/punch-list?new=true', icon: ClipboardCheck, label: 'Punch Item', color: 'text-rose-500 bg-rose-500/10' },
  ];

  const modules = [
    { href: '/pm-portal/rfis', icon: MessageSquare, label: 'RFIs', count: stats.openRfis, countLabel: 'Open', color: 'amber' },
    { href: '/pm-portal/submittals', icon: ClipboardList, label: 'Submittals', count: stats.pendingSubmittals, countLabel: 'Pending', color: 'blue' },
    { href: '/pm-portal/change-orders', icon: FileStack, label: 'Change Orders', count: stats.pendingChangeOrders, countLabel: 'Pending', color: 'purple' },
    { href: '/pm-portal/daily-logs', icon: BookOpen, label: 'Daily Logs', count: null, countLabel: '', color: 'emerald' },
    { href: '/pm-portal/photos', icon: Camera, label: 'Photos', count: null, countLabel: '', color: 'cyan' },
    { href: '/pm-portal/punch-list', icon: ClipboardCheck, label: 'Punch List', count: stats.openPunchItems, countLabel: 'Open', color: 'rose' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-amber-500 mx-auto mb-4" />
          <p className="text-zinc-400">Loading PM Portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <HardHat className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Project Management Portal</h1>
            <p className="text-zinc-400">Track construction projects, RFIs, submittals, and more</p>
          </div>
        </div>
        <Link href="/pm-portal/projects/new">
          <Button className="bg-amber-600 hover:bg-amber-700">
            <Plus className="h-4 w-4 mr-2" />New Project
          </Button>
        </Link>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-zinc-500" />
              <div>
                <p className="text-2xl font-bold text-white">{stats.activeProjects}</p>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Active Projects</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`bg-zinc-900 border-zinc-800 ${stats.openRfis > 0 ? 'border-amber-500/30' : ''}`}>
          <CardContent className="pt-6 pb-4">
            <div className="flex items-center gap-3">
              <MessageSquare className={`h-5 w-5 ${stats.openRfis > 0 ? 'text-amber-500' : 'text-zinc-500'}`} />
              <div>
                <p className={`text-2xl font-bold ${stats.openRfis > 0 ? 'text-amber-400' : 'text-white'}`}>{stats.openRfis}</p>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Open RFIs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`bg-zinc-900 border-zinc-800 ${stats.pendingSubmittals > 0 ? 'border-blue-500/30' : ''}`}>
          <CardContent className="pt-6 pb-4">
            <div className="flex items-center gap-3">
              <ClipboardList className={`h-5 w-5 ${stats.pendingSubmittals > 0 ? 'text-blue-500' : 'text-zinc-500'}`} />
              <div>
                <p className={`text-2xl font-bold ${stats.pendingSubmittals > 0 ? 'text-blue-400' : 'text-white'}`}>{stats.pendingSubmittals}</p>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Pending Submittals</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`bg-zinc-900 border-zinc-800 ${stats.pendingChangeOrders > 0 ? 'border-purple-500/30' : ''}`}>
          <CardContent className="pt-6 pb-4">
            <div className="flex items-center gap-3">
              <FileStack className={`h-5 w-5 ${stats.pendingChangeOrders > 0 ? 'text-purple-500' : 'text-zinc-500'}`} />
              <div>
                <p className={`text-2xl font-bold ${stats.pendingChangeOrders > 0 ? 'text-purple-400' : 'text-white'}`}>{stats.pendingChangeOrders}</p>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Pending COs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`bg-zinc-900 border-zinc-800 ${stats.openPunchItems > 0 ? 'border-rose-500/30' : ''}`}>
          <CardContent className="pt-6 pb-4">
            <div className="flex items-center gap-3">
              <ClipboardCheck className={`h-5 w-5 ${stats.openPunchItems > 0 ? 'text-rose-500' : 'text-zinc-500'}`} />
              <div>
                <p className={`text-2xl font-bold ${stats.openPunchItems > 0 ? 'text-rose-400' : 'text-white'}`}>{stats.openPunchItems}</p>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Open Punch Items</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-zinc-500" />
              <div>
                <p className="text-2xl font-bold text-white">{format(new Date(), 'MMM d')}</p>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-4">
          <CardTitle className="text-white text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {quickLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-zinc-800/50 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 transition-all cursor-pointer text-center group">
                  <div className={`h-10 w-10 rounded-lg ${link.color} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <link.icon className="h-5 w-5" />
                  </div>
                  <span className="text-sm text-zinc-300">{link.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Projects */}
        <Card className="bg-zinc-900 border-zinc-800 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-white text-lg">Recent Projects</CardTitle>
            <Link href="/pm-portal/projects">
              <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white">
                View All <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {projects.length === 0 ? (
              <div className="py-12 text-center">
                <Building2 className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400 text-sm">No projects yet</p>
                <Link href="/pm-portal/projects/new">
                  <Button className="mt-3 bg-amber-600 hover:bg-amber-700" size="sm">
                    <Plus className="h-4 w-4 mr-1" />Create Project
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {projects.map((project) => (
                  <Link key={project.id} href={`/pm-portal/projects/${project.id}`}>
                    <div className="flex items-center gap-4 p-4 hover:bg-zinc-800/50 transition-colors">
                      <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="h-5 w-5 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate">{project.name}</p>
                        <p className="text-zinc-500 text-sm truncate">{project.address || project.client_name || 'No address'}</p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-white font-medium">{project.progress || 0}%</p>
                          <Progress value={project.progress || 0} className="h-1 w-16" />
                        </div>
                        <Badge className={`${project.status === 'under_construction' || project.status === 'nearing_completion' ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700 text-zinc-400'} border-0`}>
                          {project.status?.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modules Quick Access */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-4">
            <CardTitle className="text-white text-lg">PM Modules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {modules.map((module) => {
              const colorClasses = {
                amber: 'text-amber-500 bg-amber-500/10',
                blue: 'text-blue-500 bg-blue-500/10',
                purple: 'text-purple-500 bg-purple-500/10',
                emerald: 'text-emerald-500 bg-emerald-500/10',
                cyan: 'text-cyan-500 bg-cyan-500/10',
                rose: 'text-rose-500 bg-rose-500/10',
              }[module.color] || 'text-zinc-500 bg-zinc-500/10';
              
              return (
                <Link key={module.href} href={module.href}>
                  <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800/50 transition-colors group">
                    <div className={`h-9 w-9 rounded-lg ${colorClasses} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                      <module.icon className="h-4 w-4" />
                    </div>
                    <span className="text-zinc-300 flex-1">{module.label}</span>
                    {module.count !== null && module.count > 0 && (
                      <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">
                        {module.count} {module.countLabel}
                      </Badge>
                    )}
                    <ArrowRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Attention Required Section */}
      {(stats.openRfis > 5 || stats.openPunchItems > 10 || stats.pendingChangeOrders > 3) && (
        <Card className="bg-orange-500/10 border-orange-500/30">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-400" />
              <div className="flex-1">
                <p className="text-orange-400 font-medium">Items Requiring Attention</p>
                <p className="text-zinc-400 text-sm">
                  {stats.openRfis > 5 && `${stats.openRfis} open RFIs. `}
                  {stats.openPunchItems > 10 && `${stats.openPunchItems} open punch items. `}
                  {stats.pendingChangeOrders > 3 && `${stats.pendingChangeOrders} pending change orders.`}
                </p>
              </div>
              <Link href="/pm-portal/rfis">
                <Button size="sm" className="bg-orange-600 hover:bg-orange-700">Review</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
