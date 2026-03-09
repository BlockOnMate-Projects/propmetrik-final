'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ProjectSubnav from '@/components/dashboard/projects/ProjectSubnav';
import { ProjectGantt } from '@/components/projects/gantt/ProjectGantt';

export default function ProjectSchedulePage() {
  const { id } = useParams() as { id: string };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Schedule</h1>
        <p className="text-zinc-400 text-sm mt-1">Project master schedule and critical path.</p>
      </div>

      <ProjectSubnav projectId={id} />

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Master Schedule</CardTitle>
          <CardDescription className="text-zinc-400">
            Interactive Gantt chart for this project.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[600px]">
          <ProjectGantt projectId={id} />
        </CardContent>
      </Card>
    </div>
  );
}
