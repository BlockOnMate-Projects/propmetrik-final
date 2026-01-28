'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  Building2, 
  MapPin, 
  Calendar, 
  ArrowRight, 
  Plus, 
  Search 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { projectsApi } from '@/lib/projects-api';
import { useAuth } from '@/lib/auth-context';
import { DevelopmentProject } from '@/types/projects';

export default function MyProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<DevelopmentProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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
        const response = await projectsApi.getAll({ limit: 20 });
        const assigned = response.data.filter((project) => project.project_manager_id === user.id || project.project_manager_name === user.name);
        setProjects(assigned.length ? assigned : response.data);
      } catch (error) {
        console.warn("Failed to fetch projects", error);
        setProjects([]);
        setError('Unable to load projects. Please check the API connection.');
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [user?.id, user?.name]);

  const filteredProjects = projects.filter(p => 
    p.project_name?.toLowerCase().includes(search.toLowerCase()) || 
    p.city?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">My Projects</h1>
          <p className="text-zinc-400 text-sm mt-1">Manage construction sites and operations.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
           <div className="relative flex-1 md:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Search projects..."
                className="pl-9 bg-zinc-900 border-zinc-800"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
           </div>
           <Button className="bg-amber-600 hover:bg-amber-700 text-white">
             <Plus className="h-4 w-4 mr-2" /> New Project
           </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
             [1,2,3].map(i => (
                 <Card key={i} className="bg-zinc-900/50 border-zinc-800 animate-pulse h-48">
                    <CardContent></CardContent>
                 </Card>
             ))
        ) : error ? (
          <div className="col-span-full text-center py-12 text-red-400">
            {error}
          </div>
        ) : filteredProjects.length === 0 ? (
            <div className="col-span-full text-center py-12 text-zinc-500">
                No projects found.
            </div>
        ) : (
            filteredProjects.map((project) => (
                <Link key={project.id} href={`/pm-portal/projects/${project.id}`}>
                    <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors h-full group">
                        <CardContent className="p-6 flex flex-col h-full">
                            <div className="flex justify-between items-start mb-4">
                                <div className="h-10 w-10 rounded bg-zinc-800 flex items-center justify-center">
                                    <Building2 className="h-5 w-5 text-zinc-400 group-hover:text-amber-500 transition-colors" />
                                </div>
                                <Badge variant="outline" className="text-amber-500 border-amber-500/30 capitalize">
                                    {(project.status || 'Unknown').replace('_', ' ')}
                                </Badge>
                            </div>
                            
                            <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-amber-500 transition-colors">
                                {project.project_name || project.name}
                            </h3>
                            
                            <p className="text-sm text-zinc-500 line-clamp-2 mb-4 flex-1">
                                {project.description}
                            </p>
                            
                            <div className="flex items-center gap-4 text-xs text-zinc-400 border-t border-zinc-800 pt-4 mt-auto">
                                <div className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {project.city || 'Unknown Loc'}
                                </div>
                                <div className="flex items-center gap-1 ml-auto group-hover:translate-x-1 transition-transform">
                                    Manage <ArrowRight className="h-3 w-3" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </Link>
            ))
        )}
      </div>
    </div>
  );
}
