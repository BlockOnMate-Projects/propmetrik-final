'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { 
  ArrowLeft, 
  MapPin,
  Calendar,
  Building2,
  Wallet,
  TrendingUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import ProjectSubnav from '@/components/pm-portal/ProjectSubnav';

// Components
import { MaterialPriceTracker } from '@/components/projects/construction/MaterialPriceTracker';
import { ProjectGantt } from '@/components/projects/gantt/ProjectGantt';
import { MilestonesWidget } from '@/components/projects/dashboard/MilestonesWidget';

// API
import { projectsApi, milestonesApi } from '@/lib/projects-api';
import { DevelopmentProject } from '@/types/projects';

export default function ProjectDashboard() {
  const { id } = useParams() as { id: string };
  const [project, setProject] = useState<DevelopmentProject | null>(null);
  const [milestones, setMilestones] = useState<any[]>([]); // Using any for flexibility with widget types
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        setLoading(true);
        setError(null);
        setMilestoneError(null);
        const data = await projectsApi.getById(id);
        setProject(data);
      } catch (error) {
        console.warn('Failed to load project', error);
        setProject(null);
        setError('Unable to load project details. Please check the API connection.');
      } finally {
        setLoading(false);
      }
    };

    const fetchMilestones = async () => {
      try {
        const activeMilestones = await milestonesApi.getByProject(id, 'pending');
        setMilestones(activeMilestones);
      } catch (error) {
        console.warn('Failed to load milestones', error);
        setMilestones([]);
        setMilestoneError('Milestones are unavailable right now.');
      }
    };

    fetchProject().then(() => {
      fetchMilestones();
    });
  }, [id]);

  const formatCurrency = (value?: number, currency?: string) => {
    if (value === undefined || value === null) return '—';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `${value}`;
    }
  };

  const formatDate = (value?: string) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString();
  };

  const summaryItems = useMemo(() => {
    if (!project) return [];
    return [
      {
        label: 'Budget',
        value: formatCurrency(project.total_budget, project.currency),
        icon: Wallet,
      },
      {
        label: 'Progress',
        value: project.overall_progress !== undefined ? `${Math.round(project.overall_progress)}%` : '—',
        icon: TrendingUp,
      },
      {
        label: 'Start',
        value: formatDate(project.planned_start_date),
        icon: Calendar,
      },
      {
        label: 'Target Finish',
        value: formatDate(project.planned_end_date || project.planned_completion_date),
        icon: Calendar,
      },
    ];
  }, [project]);

  if (loading) {
    return <div className="text-white p-8">Loading project context...</div>;
  }

  if (error) {
    return <div className="text-red-400 p-8">{error}</div>;
  }

  if (!project) {
    return <div className="text-white p-8">Project not found.</div>;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-zinc-800 pb-6">
        <div>
           <Link href="/pm-portal/dashboard" className="text-zinc-500 hover:text-zinc-300 flex items-center gap-1 text-sm mb-2">
             <ArrowLeft className="h-3 w-3" /> Back to Dashboard
           </Link>
           <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">{project.project_name || project.name}</h1>
           <div className="flex items-center gap-3 mt-2 text-sm text-zinc-400">
             <div className="flex items-center gap-1">
               <MapPin className="h-3 w-3" /> {project.city}, {project.region}
             </div>
             <div className="h-1 w-1 rounded-full bg-zinc-700"></div>
             <Badge variant="outline" className="text-amber-500 border-amber-500/30 capitalize">
               {project.status?.replace('_', ' ')}
             </Badge>
             {project.project_number && (
               <>
                 <div className="h-1 w-1 rounded-full bg-zinc-700"></div>
                 <span>#{project.project_number}</span>
               </>
             )}
           </div>
           {project.description && (
             <p className="text-zinc-500 mt-3 max-w-2xl text-sm">
               {project.description}
             </p>
           )}
        </div>
        <div className="flex gap-2">
           <Button variant="outline" className="border-zinc-700 text-zinc-300">Detailed Schedule</Button>
           <Button className="bg-white text-black hover:bg-zinc-200">View Files</Button>
        </div>
      </div>

      <ProjectSubnav projectId={project.id} />

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {summaryItems.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="bg-zinc-900 border-zinc-800">
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-zinc-500">{item.label}</p>
                    <p className="text-xl font-semibold text-white mt-1">{item.value}</p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-amber-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Overview Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-zinc-900 border-zinc-800 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-zinc-300">Project Timeline</CardTitle>
            <CardDescription>Critical path & upcoming phases</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 relative overflow-hidden rounded-md border border-zinc-800/50">
              <ProjectGantt projectId={project.id} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-zinc-300 text-base">Next Milestone</CardTitle>
              <Button variant="ghost" size="sm" className="h-6 text-xs text-amber-500 hover:text-amber-400">
                + Add
              </Button>
            </CardHeader>
            <CardContent>
              {milestoneError && (
                <div className="text-xs text-amber-400 mb-3">{milestoneError}</div>
              )}
              <MilestonesWidget 
                milestones={milestones} 
                maxVisible={3}
                isLoading={loading}
                onMilestoneClick={(m) => console.log('Milestone clicked:', m)}
              />
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-zinc-300 text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-amber-500" /> Project Details
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-zinc-400 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Type</span>
                <span className="text-zinc-200">{project.project_type?.replace('_', ' ') || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Units</span>
                <span className="text-zinc-200">{project.total_units ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Manager</span>
                <span className="text-zinc-200">{project.project_manager_name || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Region</span>
                <span className="text-zinc-200">{project.region || '—'}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <MaterialPriceTracker defaultRegion={project.region || 'Greater Accra'} />
        </div>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-300">Project BOM Status</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-zinc-500 text-sm">Bill of Materials connection pending.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
