'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  FileText,
  Plus,
  Search,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  Loader2,
  ArrowLeft,
  RefreshCw,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Calendar,
  Users,
  Clock,
  CloudSun,
  Wind
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import ProjectSubnav from '@/components/pm-portal/ProjectSubnav';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Default headers for API requests
const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'x-user-id': 'ed4a50d7-a1b2-4c3d-8e5f-6a7b8c9d0e1f',
  'x-organization-id': '00000000-0000-0000-0000-000000000001',
};

type WeatherCondition = 'sunny' | 'partly_cloudy' | 'cloudy' | 'rainy' | 'stormy' | 'windy' | 'snowy';

interface SiteDiary {
  id: string;
  projectId: string;
  projectName?: string;
  date: string;
  weatherCondition: WeatherCondition;
  temperatureHigh?: number;
  temperatureLow?: number;
  workforceCount?: number;
  workPerformed?: string;
  materialsReceived?: string;
  equipmentUsed?: string;
  safetyIncidents?: string;
  delaysIssues?: string;
  notes?: string;
  createdByName?: string;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  address?: string;
}

const weatherIcons: Record<WeatherCondition, React.ReactNode> = {
  sunny: <Sun className="h-4 w-4 text-yellow-400" />,
  partly_cloudy: <CloudSun className="h-4 w-4 text-blue-300" />,
  cloudy: <Cloud className="h-4 w-4 text-zinc-400" />,
  rainy: <CloudRain className="h-4 w-4 text-blue-400" />,
  stormy: <CloudRain className="h-4 w-4 text-purple-400" />,
  windy: <Wind className="h-4 w-4 text-teal-400" />,
  snowy: <CloudSnow className="h-4 w-4 text-blue-200" />
};

const weatherLabels: Record<WeatherCondition, string> = {
  sunny: 'Sunny',
  partly_cloudy: 'Partly Cloudy',
  cloudy: 'Cloudy',
  rainy: 'Rainy',
  stormy: 'Stormy',
  windy: 'Windy',
  snowy: 'Snowy'
};

export default function ProjectSiteLogsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [diaries, setDiaries] = useState<SiteDiary[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [selectedDiary, setSelectedDiary] = useState<SiteDiary | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    weatherCondition: 'sunny' as WeatherCondition,
    temperatureHigh: '',
    temperatureLow: '',
    workforceCount: '',
    workPerformed: '',
    materialsReceived: '',
    equipmentUsed: '',
    safetyIncidents: '',
    delaysIssues: '',
    notes: ''
  });
  
  const { toast } = useToast();

  // Stats
  const stats = {
    total: diaries.length,
    thisWeek: diaries.filter(d => {
      const date = new Date(d.date);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return date >= weekAgo;
    }).length,
    avgWorkforce: diaries.length > 0 
      ? Math.round(diaries.reduce((sum, d) => sum + (d.workforceCount || 0), 0) / diaries.length)
      : 0
  };

  // Fetch project
  const fetchProject = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}`);
      const result = await response.json();
      if (result.success) {
        setProject(result.data);
      }
    } catch (error) {
      console.error('Error fetching project:', error);
    }
  }, [projectId]);

  // Fetch diaries
  const fetchDiaries = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/v1/site-diaries?projectId=${projectId}&pageSize=100`, {
        headers: DEFAULT_HEADERS,
      });
      const result = await response.json();
      
      if (result.success) {
        setDiaries(result.data || []);
      } else {
        throw new Error(result.error || 'Failed to fetch site logs');
      }
    } catch (error: any) {
      console.error('Error fetching site logs:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch site logs',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchProject();
    fetchDiaries();
  }, [fetchProject, fetchDiaries]);

  // Reset form
  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      weatherCondition: 'sunny',
      temperatureHigh: '',
      temperatureLow: '',
      workforceCount: '',
      workPerformed: '',
      materialsReceived: '',
      equipmentUsed: '',
      safetyIncidents: '',
      delaysIssues: '',
      notes: ''
    });
  };

  // Handle create
  const handleCreate = async () => {
    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/api/v1/site-diaries`, {
        method: 'POST',
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({
          projectId,
          reportDate: formData.date,
          weatherCondition: formData.weatherCondition,
          temperatureCelsius: formData.temperatureHigh ? parseFloat(formData.temperatureHigh) : null,
          informalLaborCount: formData.workforceCount ? parseInt(formData.workforceCount) : 0,
          workPerformed: formData.workPerformed || null,
          incidentsOrDelays: formData.delaysIssues || null,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: 'Success', description: 'Site log created' });
        setShowCreateDialog(false);
        resetForm();
        fetchDiaries();
      } else {
        throw new Error(result.error?.message || result.error || 'Failed to create site log');
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle update
  const handleUpdate = async () => {
    if (!selectedDiary) return;

    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/api/v1/site-diaries/${selectedDiary.id}`, {
        method: 'PUT',
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({
          weatherCondition: formData.weatherCondition,
          temperatureCelsius: formData.temperatureHigh ? parseFloat(formData.temperatureHigh) : null,
          informalLaborCount: formData.workforceCount ? parseInt(formData.workforceCount) : null,
          workPerformed: formData.workPerformed || null,
          incidentsOrDelays: formData.delaysIssues || null
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: 'Success', description: 'Site log updated' });
        setShowEditDialog(false);
        setSelectedDiary(null);
        fetchDiaries();
      } else {
        throw new Error(result.error || 'Failed to update site log');
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!selectedDiary) return;

    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/api/v1/site-diaries/${selectedDiary.id}`, {
        method: 'DELETE',
        headers: DEFAULT_HEADERS,
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: 'Success', description: 'Site log deleted' });
        setShowDeleteDialog(false);
        setSelectedDiary(null);
        fetchDiaries();
      } else {
        throw new Error(result.error || 'Failed to delete site log');
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // Open edit dialog
  const openEditDialog = (diary: SiteDiary) => {
    setSelectedDiary(diary);
    setFormData({
      date: diary.date,
      weatherCondition: diary.weatherCondition,
      temperatureHigh: diary.temperatureHigh?.toString() || '',
      temperatureLow: diary.temperatureLow?.toString() || '',
      workforceCount: diary.workforceCount?.toString() || '',
      workPerformed: diary.workPerformed || '',
      materialsReceived: diary.materialsReceived || '',
      equipmentUsed: diary.equipmentUsed || '',
      safetyIncidents: diary.safetyIncidents || '',
      delaysIssues: diary.delaysIssues || '',
      notes: diary.notes || ''
    });
    setShowEditDialog(true);
  };

  // Open view sheet
  const openViewSheet = (diary: SiteDiary) => {
    setSelectedDiary(diary);
    setShowDetailSheet(true);
  };

  // Open delete dialog
  const openDeleteDialog = (diary: SiteDiary) => {
    setSelectedDiary(diary);
    setShowDeleteDialog(true);
  };

  const filteredDiaries = diaries.filter(diary =>
    diary.workPerformed?.toLowerCase().includes(search.toLowerCase()) ||
    diary.notes?.toLowerCase().includes(search.toLowerCase())
  );

  const DiaryForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-zinc-400">Date *</Label>
          <Input
            type="date"
            className="bg-zinc-800 border-zinc-700 mt-1"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-zinc-400">Weather</Label>
          <select
            className="w-full h-10 px-3 rounded-md bg-zinc-800 border border-zinc-700 text-white mt-1"
            value={formData.weatherCondition}
            onChange={(e) => setFormData({ ...formData, weatherCondition: e.target.value as WeatherCondition })}
          >
            {Object.entries(weatherLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label className="text-zinc-400">High Temp (°C)</Label>
          <Input
            type="number"
            className="bg-zinc-800 border-zinc-700 mt-1"
            placeholder="32"
            value={formData.temperatureHigh}
            onChange={(e) => setFormData({ ...formData, temperatureHigh: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-zinc-400">Low Temp (°C)</Label>
          <Input
            type="number"
            className="bg-zinc-800 border-zinc-700 mt-1"
            placeholder="24"
            value={formData.temperatureLow}
            onChange={(e) => setFormData({ ...formData, temperatureLow: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-zinc-400">Workforce</Label>
          <Input
            type="number"
            className="bg-zinc-800 border-zinc-700 mt-1"
            placeholder="25"
            value={formData.workforceCount}
            onChange={(e) => setFormData({ ...formData, workforceCount: e.target.value })}
          />
        </div>
      </div>
      <div>
        <Label className="text-zinc-400">Work Performed</Label>
        <Textarea
          className="bg-zinc-800 border-zinc-700 mt-1"
          rows={3}
          placeholder="Describe work completed today..."
          value={formData.workPerformed}
          onChange={(e) => setFormData({ ...formData, workPerformed: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-zinc-400">Materials Received</Label>
        <Textarea
          className="bg-zinc-800 border-zinc-700 mt-1"
          rows={2}
          placeholder="List materials delivered..."
          value={formData.materialsReceived}
          onChange={(e) => setFormData({ ...formData, materialsReceived: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-zinc-400">Delays/Issues</Label>
        <Textarea
          className="bg-zinc-800 border-zinc-700 mt-1"
          rows={2}
          placeholder="Note any delays or issues..."
          value={formData.delaysIssues}
          onChange={(e) => setFormData({ ...formData, delaysIssues: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-zinc-400">Notes</Label>
        <Textarea
          className="bg-zinc-800 border-zinc-700 mt-1"
          rows={2}
          placeholder="Additional notes..."
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Site Logs</h1>
            {project && (
              <p className="text-zinc-400 text-sm mt-1">{project.name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="border-zinc-700" onClick={fetchDiaries}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button 
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => { resetForm(); setShowCreateDialog(true); }}
          >
            <Plus className="h-4 w-4 mr-2" /> New Site Log
          </Button>
        </div>
      </div>

      <ProjectSubnav projectId={projectId} />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Total Logs</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.total}</p>
              </div>
              <FileText className="h-5 w-5 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">This Week</p>
                <p className="text-2xl font-bold text-blue-400 mt-1">{stats.thisWeek}</p>
              </div>
              <Calendar className="h-5 w-5 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Avg Workforce</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{stats.avgWorkforce}</p>
              </div>
              <Users className="h-5 w-5 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
        <Input
          placeholder="Search site logs..."
          className="pl-9 bg-zinc-900 border-zinc-800"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      ) : filteredDiaries.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-zinc-700 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Site Logs</h3>
            <p className="text-zinc-400 mb-4">Start documenting your project progress</p>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => { resetForm(); setShowCreateDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" /> New Site Log
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredDiaries.map((diary) => (
            <Card key={diary.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                      {weatherIcons[diary.weatherCondition] || <Cloud className="h-4 w-4 text-zinc-500" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-white">
                          {new Date(diary.date).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </h3>
                        <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                          {weatherLabels[diary.weatherCondition]}
                        </Badge>
                      </div>
                      {diary.workPerformed && (
                        <p className="text-sm text-zinc-400 mt-1 line-clamp-2">{diary.workPerformed}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                        {diary.workforceCount && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" /> {diary.workforceCount} workers
                          </span>
                        )}
                        {diary.temperatureHigh && (
                          <span>
                            {diary.temperatureLow}°-{diary.temperatureHigh}°C
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                      <DropdownMenuItem onClick={() => openViewSheet(diary)}>
                        <Eye className="h-4 w-4 mr-2" /> View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEditDialog(diary)}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-zinc-800" />
                      <DropdownMenuItem className="text-red-400" onClick={() => openDeleteDialog(diary)}>
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">New Site Log</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Record daily site activities and conditions.
            </DialogDescription>
          </DialogHeader>
          <DiaryForm />
          <DialogFooter className="mt-4">
            <Button variant="outline" className="border-zinc-700" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={handleCreate} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Log
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Site Log</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Update the site log details.
            </DialogDescription>
          </DialogHeader>
          <DiaryForm />
          <DialogFooter className="mt-4">
            <Button variant="outline" className="border-zinc-700" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={handleUpdate} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white">Delete Site Log</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Are you sure you want to delete this site log? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" className="border-zinc-700" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Sheet */}
      <Sheet open={showDetailSheet} onOpenChange={setShowDetailSheet}>
        <SheetContent className="bg-zinc-900 border-zinc-800 w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-white">Site Log Details</SheetTitle>
            <SheetDescription className="text-zinc-400">
              {selectedDiary && new Date(selectedDiary.date).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </SheetDescription>
          </SheetHeader>
          {selectedDiary && (
            <div className="mt-6 space-y-6">
              <div className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg">
                {weatherIcons[selectedDiary.weatherCondition]}
                <div>
                  <p className="text-white font-medium">{weatherLabels[selectedDiary.weatherCondition]}</p>
                  {selectedDiary.temperatureHigh && (
                    <p className="text-zinc-400 text-sm">
                      {selectedDiary.temperatureLow}° - {selectedDiary.temperatureHigh}°C
                    </p>
                  )}
                </div>
              </div>

              {selectedDiary.workforceCount && (
                <div>
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Workforce</h4>
                  <p className="text-white">{selectedDiary.workforceCount} workers on site</p>
                </div>
              )}

              {selectedDiary.workPerformed && (
                <div>
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Work Performed</h4>
                  <p className="text-zinc-300 whitespace-pre-wrap">{selectedDiary.workPerformed}</p>
                </div>
              )}

              {selectedDiary.materialsReceived && (
                <div>
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Materials Received</h4>
                  <p className="text-zinc-300 whitespace-pre-wrap">{selectedDiary.materialsReceived}</p>
                </div>
              )}

              {selectedDiary.equipmentUsed && (
                <div>
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Equipment Used</h4>
                  <p className="text-zinc-300 whitespace-pre-wrap">{selectedDiary.equipmentUsed}</p>
                </div>
              )}

              {selectedDiary.delaysIssues && (
                <div>
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Delays/Issues</h4>
                  <p className="text-zinc-300 whitespace-pre-wrap">{selectedDiary.delaysIssues}</p>
                </div>
              )}

              {selectedDiary.notes && (
                <div>
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Notes</h4>
                  <p className="text-zinc-300 whitespace-pre-wrap">{selectedDiary.notes}</p>
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t border-zinc-800">
                <Button className="flex-1 bg-amber-600 hover:bg-amber-700" onClick={() => {
                  setShowDetailSheet(false);
                  openEditDialog(selectedDiary);
                }}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </Button>
                <Button variant="outline" className="flex-1 border-zinc-700 text-red-400 hover:text-red-300" onClick={() => {
                  setShowDetailSheet(false);
                  openDeleteDialog(selectedDiary);
                }}>
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
