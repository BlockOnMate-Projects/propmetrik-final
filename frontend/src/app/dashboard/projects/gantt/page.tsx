'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, GanttChartSquare } from 'lucide-react';
import { ProjectGantt } from '@/components/projects/gantt/ProjectGantt';
import { projectsApi } from '@/lib/projects-api';

export default function PMGanttPage() {
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await projectsApi.getAll({ limit: 200 });
        const list = (res.data || []).map((p: any) => ({
          id: p.id,
          name: p.name || p.project_name || p.project_number || 'Untitled project',
        }));
        setProjects(list);
        const fromQuery = searchParams?.get('projectId');
        setSelected(fromQuery && list.some((p) => p.id === fromQuery) ? fromQuery : list[0]?.id || '');
      } catch {
        setProjects([]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Gantt Schedule</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Interactive timeline — drag phase bars to reschedule, with critical path and milestones.
          </p>
        </div>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-72 bg-zinc-900 border-zinc-700 text-zinc-200 font-mono text-xs">
            <SelectValue placeholder="Select a project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Master Schedule</CardTitle>
          <CardDescription className="text-zinc-400">
            {selected ? 'Drag bars to reschedule phases — changes save automatically.' : 'Pick a project to view its Gantt.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-[600px]">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
          ) : !selected ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <GanttChartSquare className="h-10 w-10 text-zinc-600 mb-3" />
              <p className="text-zinc-400 text-sm">No projects found. Create a project to build its schedule.</p>
            </div>
          ) : (
            <ProjectGantt key={selected} projectId={selected} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
