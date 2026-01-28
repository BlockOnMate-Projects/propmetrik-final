
'use client';

import React, { useEffect, useMemo, useState } from 'react'
import { MaterialPriceTracker } from '@/components/projects/construction/MaterialPriceTracker'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ArrowRight, Calendar, Hammer, Building2, MapPin } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { projectsApi } from '@/lib/projects-api'
import { useAuth } from '@/lib/auth-context'
import { DevelopmentProject } from '@/types/projects'

export default function PMDashboardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<DevelopmentProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProjects = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await projectsApi.getAll({ limit: 6 });
        const assigned = response.data.filter((project) => project.project_manager_id === user.id || project.project_manager_name === user.name);
        setProjects(assigned.length ? assigned : response.data);
      } catch (error) {
        console.warn('Failed to fetch projects', error);
        setProjects([]);
        setError('Unable to load projects. Please check the API connection.');
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [user?.id, user?.name]);

  const activeProjects = useMemo(() => projects, [projects]);

  return (
    <div className="space-y-8">
      {/* Hero / Welcome */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Dashboard</h2>
          <p className="text-zinc-400 mt-2">Welcome back. Here is the latest from the field and market.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:text-white">
            <Calendar className="mr-2 h-4 w-4" />
            Schedule
          </Button>
          <Button className="bg-amber-600 hover:bg-amber-700 text-white border-0">
            <Hammer className="mr-2 h-4 w-4" />
            New Site Log
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Feed / Tasks (Placeholder) */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Active Projects</CardTitle>
              <CardDescription className="text-zinc-500">Your assigned development projects.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-20 rounded-lg border border-zinc-800 bg-zinc-950/50 animate-pulse" />
                  ))}
                </div>
              ) : error ? (
                <div className="text-sm text-red-400 text-center py-6">{error}</div>
              ) : activeProjects.length === 0 ? (
                <div className="text-sm text-zinc-500 text-center py-6">No active projects assigned.</div>
              ) : (
                <div className="space-y-4">
                  {activeProjects.map((project) => (
                    <Link key={project.id} href={`/pm-portal/projects/${project.id}`}>
                      <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-800 bg-zinc-950/50 hover:border-zinc-700 transition-colors cursor-pointer group">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded bg-zinc-800 flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-zinc-500 group-hover:text-amber-500 transition-colors" />
                          </div>
                          <div>
                            <h4 className="text-zinc-200 font-medium group-hover:text-amber-500 transition-colors">
                              {project.project_name || project.name}
                            </h4>
                            <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {project.city || 'Unknown location'}
                              </span>
                              <span className="h-1 w-1 rounded-full bg-zinc-700"></span>
                              <span>Phase: {project.status?.replace('_', ' ') || 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                        <ArrowRight className="h-5 w-5 text-zinc-700 group-hover:text-amber-500" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
             <CardHeader>
                <CardTitle className="text-white">Recent Activity</CardTitle>
             </CardHeader>
             <CardContent>
                <div className="text-sm text-zinc-500 text-center py-8">
                   No recent notifications.
                </div>
             </CardContent>
          </Card>
        </div>

        {/* Sidebar Widgets */}
        <div className="space-y-6">
          {/* Reusing the Material Price Tracker! */}
          <MaterialPriceTracker defaultRegion="Greater Accra" />
          
          <Card className="bg-gradient-to-br from-amber-950/20 to-zinc-900 border-amber-900/30 border">
            <CardHeader>
              <CardTitle className="text-amber-500 text-base">Safety Tip</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-amber-200/60 leading-relaxed">
                Ensure all informal laborers on site today have been briefed on the heavy machinery exclusion zones. Weather forecast indicates rain in the afternoon.
              </p>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
